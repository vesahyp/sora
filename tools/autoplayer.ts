import type { Car, SimState } from '../src/game/state';
import type { CarInput } from '../src/game/types';
import { steeringLock, wheelbase } from '../src/game/sim';
import { GRUDGE, PACING, catchUp, enginePace, hostility, leaderOf, paceToPlayer } from '../src/game/content/drivers';
import { SURFACES } from '../src/game/content/surfaces';
import { MINE, OIL } from '../src/game/content/weapons';
import { LANE_VERGE, type Lane } from '../src/game/track';
import { hash32 } from '../src/game/rng';

/**
 * The bot driver. It aims at a point on the centreline a little ahead,
 * further the faster it goes, and brakes when the road ahead turns more
 * than its speed allows; on gravel the brake swings the tail, which is
 * how it corners. It is a floor: a human who looks through the corner
 * and uses the whole road beats it. It is also the opponent AI: a
 * driver's `skill` scales how fast it takes a corner and how hard it
 * pushes, it leans on a car alongside, lights the nitro on a straight,
 * and when it is stuck against a tree it backs out. An opponent is paced
 * to the player (`PACING`): it eases off ahead of you and pushes behind. The guns fire
 * themselves, so it has nothing to decide there. It holds grudges (`GRUDGE`): a car that
 * hurt it, or the leader, gets leaned on harder, punted from behind instead of passed,
 * and blocked when it comes up behind, and a bot with it in for the player waits for
 * them; a driver's `aggression` scales it all. It knows the shortcuts: told to
 * (`shortcuts`), or as the best driver when it is well behind the player, it aims down
 * the lane from its mouth; and any bot that finds itself in a lane drives it to its end.
 * A low skill looks it: the hands wander (`WOBBLE`) and now and then it brakes too late
 * for a bend (`LATE`) and runs wide, both by (1 - skill) and seeded by the car and the
 * bend, so a check is the same race every run.
 */
export interface BotTuning {
  look: number;
  lookPerSpeed: number;
  gain: number;
  /** how much of the tyres' grip the bot dares to use in a bend, 0..1 */
  margin: number;
  /** how far toward the inside of a bend the bot aims, as a share of the road width */
  inside: number;
  /** past this share of the road width off the centreline and still drifting out, the bot brakes */
  wide: number;
  /** take every shortcut */
  shortcuts?: boolean;
}

// Tuned on the 6 m road: a short look and a firm hand keep it on a road three cars wide;
// the long look of a wide road cut the corners into the grass.
export const DEFAULT_BOT: BotTuning = { look: 6, lookPerSpeed: 0.4, gain: 5, margin: 0.7, inside: 0.15, wide: 0.25 };

/**
 * What a poor driver does wrong, at skill 0; it fades to nothing at skill 1.
 * `steer` is the wander on the wheel, a share of full lock, over two slow
 * waves (rad/s) so it never looks like a metronome. `chance` is the share
 * of bends a skill-0 driver brakes too late for, judged 40 m at a time,
 * and `over` how much faster than the bend allows it arrives.
 */
const WOBBLE = { steer: 0.25, w1: 1.1, w2: 2.7 };
const LATE = { chance: 0.6, over: 0.7, bend: 40 };

/** seconds a stuck bot reverses before it tries forward again; when each car's reversing ends */
const BACK_OUT = 1.2;
const backing = new WeakMap<Car, number>();

/** a hash as a fraction, 0 to 1 */
const frac = (n: number) => hash32(n) / 4294967296;

/** The lane this car is driving, or about to turn into, and how far along it the car is (negative before the mouth). */
function laneFor(s: SimState, c: Car, tune: BotTuning): { lane: Lane; u: number; inside: boolean } | null {
  const t = s.track;
  if (!t.lanes.length) return null;
  const wants = tune.shortcuts || (c !== s.cars[0] && c.driver.skill >= 0.95 && paceToPlayer(s, c) > 0.3);
  for (const lane of t.lanes) {
    const loc = lane.locate(c.x, c.y);
    if (loc.dist < lane.width / 2 + LANE_VERGE && loc.u < lane.length - 3 && loc.u > 3 && Math.abs(c.d) > t.width / 2 + 0.5) return { lane, u: loc.u, inside: true };
    if (!wants) continue;
    let toEntry = lane.entryS - c.s;
    if (toEntry < -t.length / 2) toEntry += t.length;
    if (toEntry > t.length / 2) toEntry -= t.length;
    // from 30 m before the mouth until the car is well into the lane, so a fast car is not let go of at the mouth
    if (toEntry > -14 && toEntry < 45 && Math.abs(c.d) < t.width) return { lane, u: -toEntry, inside: false };
  }
  return null;
}

/** on grass the tyres have less than half; the bot slows for it */
function onRoadFactor(c: Car): number {
  return c.onRoad ? 1 : 0.7;
}

export function botInput(s: SimState, c: Car = s.cars[0], tune: BotTuning = DEFAULT_BOT): CarInput {
  const t = s.track;
  const skill = c.driver.skill;
  const speed = Math.max(0, c.speed);
  const look = tune.look + tune.lookPerSpeed * speed;
  const lane = laneFor(s, c, tune);
  const target = lane ? lane.lane.at(lane.u + look) : t.at(c.s + look);
  const turn = lane ? 0 : t.curvatureAhead(c.s, look + 20);
  let inside = Math.max(-1, Math.min(1, turn * 1.5)) * (t.width * tune.inside);
  let ramSteer = 0;
  // rubbing a car that is half a length ahead: neither gets by, so drop back a touch and go round
  let rubbing = false;
  // picking a fight takes skill: a poor driver drives its own race, a good one settles scores
  const aggression = c.driver.aggression * skill;
  const leader = leaderOf(s);
  const aheadOfPlayer = c !== s.cars[0] && c.progress > s.cars[0].progress;
  // the one car this bot blocks: the keenest of those close behind it
  let blockD = 0;
  let blockKeen = 0;
  for (let k = 0; k < s.cars.length; k++) {
    const o = s.cars[k];
    if (o === c || o.wreck > 0) continue;
    let gap = o.s - c.s;
    if (gap < -t.length / 2) gap += t.length;
    if (gap > t.length / 2) gap -= t.length;
    const keen = hostility(s, c, k, leader) * aggression;
    const side = Math.abs(o.d - c.d);
    // a car just ahead and on this line: move over to pass it, or, holding a grudge
    // against it or with it leading, aim at its bumper and shove
    if (gap > 0 && gap < 14 && side < 2.6) {
      // a punt is one shove: once bumper to bumper it goes round, or it pushes a slow car all lap
      const touching = gap < (c.def.length + o.def.length) / 2 + 0.6;
      if (keen > GRUDGE.punt && gap < 9 && !touching) inside = o.d;
      else {
        // a car's width and a bit beside it, on the side with road, the nearer one if both have
        const room = t.width / 2 - 0.9;
        const left = o.d - 2.6;
        const right = o.d + 2.6;
        const side = left < -room ? right : right > room ? left : Math.abs(left - c.d) < Math.abs(right - c.d) ? left : right;
        inside = Math.max(-room, Math.min(room, side));
      }
    }
    // a car alongside: lean on it, the keener the better the driver and the more it is owed
    // (alongside is overlapping, by the two bodies' lengths, and level or ahead: with its nose
    // behind their door it passes instead, or the two rub down the road pinned together)
    const reach = (c.def.length + o.def.length) * 0.4;
    if (gap > reach * 0.4 && gap < reach * 1.3 && side < (c.def.width + o.def.width) / 2 + 0.3) rubbing = true;
    if (gap > -reach && gap < reach * 0.4 && side < 4.5 && side > 1.2) ramSteer += (o.d > c.d ? 1 : -1) * 0.5 * skill * (0.6 + 0.4 * aggression) * (1 + GRUDGE.lean * keen);
    // a car close behind and near this line: get in front of it if this bot is ahead of the
    // player (the player has to fight through) or has it in for that car
    if (gap < -2 && gap > -GRUDGE.blockReach && side < 3.5) {
      const want = (aheadOfPlayer ? GRUDGE.blockAhead : 0) + keen;
      if (want > blockKeen) {
        blockKeen = want;
        blockD = o.d;
      }
    }
  }
  if (blockKeen > 0) {
    // blocking is a skill: a poor driver does not watch the mirror, so the field can be passed
    const w = Math.min(0.8, GRUDGE.block * blockKeen) * skill * skill;
    inside += (blockD - inside) * w;
  }
  // a slick or a mine on the line ahead: steer round it, the way a thumb does once it has
  // seen one. A poor driver does not see it in time and drives through
  if (!lane && skill > 0.5) {
    const room = t.width / 2 - 0.9;
    const hazards = [...s.oils.map((o) => ({ x: o.x, y: o.y, r: OIL.r })), ...s.mines.map((m) => ({ x: m.x, y: m.y, r: MINE.r }))];
    for (const h of hazards) {
      const at = t.locate(h.x, h.y);
      let gap = at.s - c.s;
      if (gap < -t.length / 2) gap += t.length;
      if (gap > t.length / 2) gap -= t.length;
      const clear = h.r + c.def.width / 2 + 0.3;
      if (gap < 2 || gap > look + 10 || Math.abs(at.d - inside) > clear) continue;
      const left = at.d - clear;
      const right = at.d + clear;
      inside = Math.max(-room, Math.min(room, left < -room ? right : right > room ? left : Math.abs(left - inside) < Math.abs(right - inside) ? left : right));
    }
  }
  // down a lane the line is the lane's middle: a car and a half between the trees
  if (lane) inside = 0;
  const tx = target.x + -target.ty * inside;
  const ty = target.y + target.tx * inside;
  const want = Math.atan2(ty - c.y, tx - c.x);
  let err = want - c.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  // the yaw rate that closes the heading error, turned into a wheel angle through the
  // wheelbase, so the bot asks the tyres for what they can give instead of full lock
  const yawWant = Math.max(-2.2, Math.min(2.2, err * tune.gain));
  let deltaWant = Math.atan((yawWant * wheelbase(c.def)) / Math.max(speed, 3));
  // the tail is out past the tyres' peak: steer into the slide, the way a hand does
  const alphaR = Math.atan2(c.slip - c.yaw * wheelbase(c.def) * 0.5, Math.max(Math.abs(c.speed), 3));
  const tailOut = Math.abs(alphaR) > 0.1 && speed > 6;
  if (tailOut) deltaWant += alphaR * 1.1;
  // the hands wander: a poor driver weaves down a straight and saws at the wheel in a bend
  const sloppy = 1 - skill;
  const who = s.cars.indexOf(c);
  const wobble = sloppy > 0 ? sloppy * WOBBLE.steer * (Math.sin(s.time * WOBBLE.w1 + who * 2.1) * 0.7 + Math.sin(s.time * WOBBLE.w2 + who * 4.3) * 0.3) : 0;
  let steer = Math.max(-1, Math.min(1, deltaWant / steeringLock(c.def, speed) + ramSteer + wobble));

  // how sharp is the road coming: the worst turn over the braking distance, at what the tyres can brake
  const stop = Math.min(c.def.brake, c.def.grip) * 0.7;
  const brakeDist = 8 + (speed * speed) / (2 * stop);
  let sharpest = 0;
  let span = 30;
  if (lane) {
    // the lane's bends, over a shorter span: it is narrow, and its mouth is a turn off the road
    span = 16;
    for (let a = 0; a <= brakeDist + 16; a += 4) {
      const k = Math.abs(lane.lane.curvatureAhead(lane.u + a, span));
      if (k > sharpest) sharpest = k;
    }
    if (!lane.inside) {
      // the turn off the road into the mouth, as a bend over the distance left to it
      const road = t.at(lane.lane.entryS);
      const m = lane.lane.at(0);
      const turnIn = Math.abs(Math.atan2(road.tx * m.ty - road.ty * m.tx, road.tx * m.tx + road.ty * m.ty));
      sharpest = Math.max(sharpest, (turnIn * span) / Math.max(10, -lane.u));
    }
  } else {
    for (let a = 5; a <= brakeDist + 30; a += 5) {
      const k = Math.abs(t.curvatureAhead(c.s + a, 30));
      if (k > sharpest) sharpest = k;
    }
  }
  // the speed the bend allows: v² / r at the tyres' limit, with a margin the driver's skill shrinks
  const radius = sharpest < 0.05 ? Infinity : span / sharpest;
  // paced to the player: the bot dares more or less in a bend, and its top speed is the one
  // the sim gives its paced engine
  const pace = paceToPlayer(s, c);
  const margin = tune.margin * (0.45 + 0.55 * skill) * (1 + pace * catchUp(c) * (pace > 0 ? PACING.corner.push : PACING.corner.ease));
  // now and then a poor driver misjudges the bend coming and arrives too fast: it runs wide
  // and the running-wide reflex below has to catch it
  const bend = Math.floor(c.s / LATE.bend) + c.laps.length * 1000 + who * 7919;
  const late = sloppy > 0 && frac(bend) < LATE.chance * sloppy ? 1 + LATE.over * sloppy : 1;
  // a grudge against the player, who is a little way behind: lift and let them come, the
  // settling of it is the point (Burnout's rivals turn on you)
  const me = s.cars[0];
  const lead = c.progress - me.progress;
  const owed = c === me ? 0 : c.grudge[0] * aggression;
  const wait = owed > 0 && lead > 0 && lead < GRUDGE.waitRange ? 1 - Math.min(GRUDGE.waitMax, GRUDGE.wait * owed) : 1;
  // in a lane, and turning into one, the surface is the lane's: grass is the road there, not a
  // mistake to slow for, but it holds less, so the mouth is taken at the grass's pace
  const gripHere = lane ? SURFACES[lane.lane.surface].grip : 1;
  // a poor driver is never flat out: it short-shifts and lifts, its foot the same share as its top speed
  const foot = 0.6 + 0.4 * skill;
  const allowed = (rubbing ? 0.9 : 1) * Math.min(Math.sqrt(c.def.grip * gripHere * margin * radius) * (lane?.inside ? 1 : onRoadFactor(c)) * late, c.def.topSpeed * foot * enginePace(s, c)) * wait;
  // nose in the trees: slow at the forest's edge and pointing away from the road. The tree
  // wall bounces the car, so the stall clock never runs long enough; back out on this instead
  const edge = t.width / 2 + t.verge - 1;
  const normal = Math.sign(c.d);
  const here0 = t.at(c.s);
  const noseOut = (Math.cos(c.heading) * -here0.ty + Math.sin(c.heading) * here0.tx) * normal;
  // in a lane the same, against the lane's trees: slow, at its wall, nose pointing off the lane
  let inTrees = !lane && Math.abs(c.d) > edge && noseOut > 0.3 && speed < 4;
  // backing out of a lane's wall, the wheel is turned so the nose swings back to the lane's middle
  let backSteer = 0;
  if (lane?.inside) {
    const l = lane.lane.locate(c.x, c.y);
    const dir = lane.lane.at(l.u);
    const off = Math.abs(Math.atan2(Math.cos(c.heading) * dir.ty - Math.sin(c.heading) * dir.tx, Math.cos(c.heading) * dir.tx + Math.sin(c.heading) * dir.ty));
    inTrees = l.dist > lane.lane.width / 2 + LANE_VERGE - 1.2 && off > 0.5 && speed < 4;
    // reversing swings the nose against the wheel: to bring it round to the lane's direction, the
    // wheel goes the other way from where that direction lies
    const ang = Math.atan2(Math.cos(c.heading) * dir.ty - Math.sin(c.heading) * dir.tx, Math.cos(c.heading) * dir.tx + Math.sin(c.heading) * dir.ty);
    backSteer = ang > 0 ? -1 : 1;
  }
  // once stuck it backs out for a while: backing a metre resets the stall clock, and a bot that
  // went forward again at once rocked against the same tree for twenty seconds
  if ((c.stall > 0.8 && c.stall < 2.0) || inTrees) backing.set(c, s.time + BACK_OUT);
  const stuck = (backing.get(c) ?? -9) > s.time;
  // brake to the limit, lift just under it, and lift when the front is washing out
  let brake = speed > allowed ? 1 : 0;
  let throttle = brake ? 0 : speed > allowed * 0.95 ? 0.2 : foot;
  if (c.sliding && Math.abs(err) > 0.2) throttle = Math.min(throttle, 0.2);
  // running wide: the car is past a third of the road and still moving outward, so brake
  const here = t.at(c.s);
  const outward = (c.vx * -here.ty + c.vy * here.tx) * Math.sign(c.d);
  if (!lane && Math.abs(c.d) > t.width * tune.wide && outward > 1.5 && speed > 8) {
    brake = 1;
    throttle = 0;
  }
  // with the tail out, braking would unload the rear further: hold a little throttle instead
  if (tailOut && !stuck) {
    brake = 0;
    throttle = Math.min(throttle, 0.35);
  }
  // stuck against something: back out for a moment, wheel the other way, then try again
  if (stuck) {
    brake = 1;
    throttle = 0;
    steer = backSteer || -steer;
  }
  // nitro on a straight with a full enough tank; a bot behind the player lights it sooner,
  // one well ahead keeps it
  const straight = !lane && Math.abs(t.curvatureAhead(c.s, 60)) < 0.25;
  const tank = pace > 0.3 ? 0.2 : 0.35;
  const boost = s.hold <= 0 && straight && pace > -0.5 && c.boost > tank && c.boosting <= 0 && c.spin <= 0 && speed > 8;
  return { steer, throttle, brake, boost };
}
