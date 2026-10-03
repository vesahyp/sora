import type { Car, SimState } from '../src/game/state';
import type { CarInput } from '../src/game/types';
import { steeringLock, wheelbase } from '../src/game/sim';
import { PACING, enginePace, paceToPlayer } from '../src/game/content/drivers';

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
 * themselves, so it has nothing to decide there.
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
}

// Tuned on the 6 m road: a short look and a firm hand keep it on a road three cars wide;
// the long look of a wide road cut the corners into the grass.
export const DEFAULT_BOT: BotTuning = { look: 6, lookPerSpeed: 0.4, gain: 5, margin: 0.7, inside: 0.15, wide: 0.25 };

/** on grass the tyres have less than half; the bot slows for it */
function onRoadFactor(c: Car): number {
  return c.onRoad ? 1 : 0.7;
}

export function botInput(s: SimState, c: Car = s.cars[0], tune: BotTuning = DEFAULT_BOT): CarInput {
  const t = s.track;
  const skill = c.driver.skill;
  const speed = Math.max(0, c.speed);
  const look = tune.look + tune.lookPerSpeed * speed;
  const target = t.at(c.s + look);
  const turn = t.curvatureAhead(c.s, look + 20);
  let inside = Math.max(-1, Math.min(1, turn * 1.5)) * (t.width * tune.inside);
  let ramSteer = 0;
  for (const o of s.cars) {
    if (o === c || o.wreck > 0) continue;
    let gap = o.s - c.s;
    if (gap < -t.length / 2) gap += t.length;
    if (gap > t.length / 2) gap -= t.length;
    // a car just ahead and on this line: move over to pass it
    if (gap > 0 && gap < 14 && Math.abs(o.d - c.d) < 2.6) inside += (o.d >= c.d ? -1 : 1) * t.width * 0.3;
    // a car alongside: lean on it, the keener the better the driver
    if (Math.abs(gap) < 4 && Math.abs(o.d - c.d) < 4.5 && Math.abs(o.d - c.d) > 1.2) ramSteer += (o.d > c.d ? 1 : -1) * 0.5 * skill;
  }
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
  let steer = Math.max(-1, Math.min(1, deltaWant / steeringLock(c.def, speed) + ramSteer));

  // how sharp is the road coming: the worst turn over the braking distance, at what the tyres can brake
  const stop = Math.min(c.def.brake, c.def.grip) * 0.7;
  const brakeDist = 8 + (speed * speed) / (2 * stop);
  let sharpest = 0;
  for (let a = 5; a <= brakeDist + 30; a += 5) {
    const k = Math.abs(t.curvatureAhead(c.s + a, 30));
    if (k > sharpest) sharpest = k;
  }
  // the speed the bend allows: v² / r at the tyres' limit, with a margin the driver's skill shrinks
  const radius = sharpest < 0.05 ? Infinity : 30 / sharpest;
  // paced to the player: the bot dares more or less in a bend, and its top speed is the one
  // the sim gives its paced engine
  const pace = paceToPlayer(s, c);
  const margin = tune.margin * (0.75 + 0.25 * skill) * (1 + pace * (pace > 0 ? PACING.corner.push : PACING.corner.ease));
  const allowed = Math.min(Math.sqrt(c.def.grip * margin * radius) * (onRoadFactor(c)), c.def.topSpeed * (0.7 + 0.3 * skill) * enginePace(s, c));
  // nose in the trees: slow at the forest's edge and pointing away from the road. The tree
  // wall bounces the car, so the stall clock never runs long enough; back out on this instead
  const edge = t.width / 2 + t.verge - 1;
  const normal = Math.sign(c.d);
  const here0 = t.at(c.s);
  const noseOut = (Math.cos(c.heading) * -here0.ty + Math.sin(c.heading) * here0.tx) * normal;
  const inTrees = Math.abs(c.d) > edge && noseOut > 0.3 && speed < 4;
  const stuck = (c.stall > 0.8 && c.stall < 2.0) || inTrees;
  // brake to the limit, lift just under it, and lift when the front is washing out
  let brake = speed > allowed ? 1 : 0;
  let throttle = brake ? 0 : speed > allowed * 0.95 ? 0.2 : 1;
  if (c.sliding && Math.abs(err) > 0.2) throttle = Math.min(throttle, 0.2);
  // running wide: the car is past a third of the road and still moving outward, so brake
  const here = t.at(c.s);
  const outward = (c.vx * -here.ty + c.vy * here.tx) * Math.sign(c.d);
  if (Math.abs(c.d) > t.width * tune.wide && outward > 1.5 && speed > 8) {
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
    steer = -steer;
  }
  // nitro on a straight with a full enough tank; a bot behind the player lights it sooner,
  // one well ahead keeps it
  const straight = Math.abs(t.curvatureAhead(c.s, 60)) < 0.25;
  const tank = pace > 0.3 ? 0.2 : 0.35;
  const boost = s.hold <= 0 && straight && pace > -0.5 && c.boost > tank && c.boosting <= 0 && c.spin <= 0 && speed > 8;
  return { steer, throttle, brake, boost };
}
