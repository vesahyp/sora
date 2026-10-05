import type { Car, SimState } from './state';
import type { CarInput, Surface } from './types';
import { BOOST, DAMAGE, DAMAGE_PACE, OIL, SPIN_TIME, nitroFill, nitroTank } from './content/weapons';
import { enginePace } from './content/drivers';
import { SURFACES, type SurfaceDef } from './content/surfaces';
import { clamp, hurt, ram } from './harm';
import { steeringLock, wheelbase, yawMax } from './sim';
import { LANE_VERGE } from './track';

/**
 * The car model. docs/adr/0003-rigid-body-cars.md has the why.
 *
 * Each car is a rigid box with a mass and a yaw inertia, on two axles
 * (the bicycle model). Each frame is cut into SUB substeps; in each one
 * every car moves, then every pair of cars that overlap is pushed apart
 * with an impulse at the point they touch, then every car that has put a
 * corner into the trees is pushed back the same way. An impulse at a
 * corner turns the car as well as slowing it, so a glancing hit slides
 * the car along what it hit and a hit behind the axle swings the tail.
 *
 * A tyre's force rises with its slip angle to a peak and falls smoothly
 * to a share of it past the peak (the surface's `slide`): grip lets go
 * progressively, into a slide that holds. Each axle has one budget for
 * driving, braking and cornering (the friction circle). Braking moves
 * load to the front. The pedal at speed brakes and locks the rear, which
 * then skids and has little left to hold the tail: the handbrake turn.
 *
 * Each axle reads the surface under it, so a car with two wheels on the
 * grass has a front and a rear that grip differently. A car has a height:
 * a ramp throws it, in the air it has no grip and no steering, and it
 * lands with a bounce that costs it the speed it carried sideways.
 */

/** substeps per frame: 180 Hz, so the tyres stay stable at walking pace and contacts stay shallow */
const SUB = 3;
const G = 9.81;
/** m/s backwards, held pedal at a standstill */
const REVERSE_TOP = 5;
/** the rear tyres against the front: a touch under 1 so the car rotates at the limit instead of plowing */
const REAR_GRIP = 0.92;
/** how quickly the drive fades as the rear slides past its peak, per peak */
const TRACTION = 1.0;
/**
 * The safety net under every hand: past COUNTER_FROM peaks of rear slip the wheel is turned into
 * the slide by COUNTER of the excess. A pedal slide held at an angle sits under two peaks and is
 * left alone; a tail going past that toward a spin is caught, for the thumb as for the bot.
 */
const COUNTER_FROM = 2;
const COUNTER = 0.8;
/** how far a free wheel follows the front axle's direction of travel, past CASTER_FROM peaks of it */
const CASTER = 0.8;
const CASTER_FROM = 0.2;
/** slip, in peaks, past which a sliding tyre bites again */
const GUARD = 1.5;
/** per second: how hard a sliding car's rotation is damped once the tail is well past its peak */
const SPIN_DAMP = 2;
/** how much a far-out tail gains back, at least: above its peak, so a slide always ends */
const GUARD_GAIN = 0.2;
/** the front tyres keep this much more of their grip past the peak than the surface's slide: a car past the limit rotates rather than plows */
const FRONT_HOLD = 0.3;
/** centre of gravity height over the wheelbase: how much braking unloads the rear */
const CG_OVER_L = 0.16;
/** the most load the pitch moves off an axle, as a share of the car's weight */
const SHIFT_MAX = 0.15;
/** seconds over which the load follows the acceleration: the body's pitch */
const PITCH_LAG = 0.12;
/** the pedal at speed locks the rear: this share of its side grip is gone while it is held */
const HANDBRAKE = 0.7;
/** below this the slip-angle formula is fed this speed, so rest is not a singularity */
const V_FLOOR = 3;
/** car against car: how much of the closing speed comes back, and the scrape between the bodies */
const CAR_BOUNCE = 0.2;
const CAR_FRICTION = 0.25;
/** in a hit the tyres resist the turn: the yaw inertia a contact sees, over the body's own */
const HIT_INERTIA = 1.5;
/** a car against the trees: the bounce and the scrape. Low friction so a glancing car slides along */
const TREE_BOUNCE = 0.2;
const TREE_FRICTION = 0.12;
/** two cars further apart than this in height pass over each other */
const CLEAR_HEIGHT = 0.9;
/** a landing harder than this, m/s down, bounces; harder than LAND_HURT it costs damage */
const LAND_BOUNCE = 2.5;
/** the bounce: the share of the impact that comes back, and the most it can be, m/s. A landing on a bank's slope would otherwise throw the car into a second jump */
const LAND_REBOUND = 0.25;
const LAND_REBOUND_MAX = 1.5;
const LAND_HURT = 7;

/** the air and the rolling tyres: a pull on the forward speed, per second */
let DRAG = 0.12;
/** for the sweeps in tools/dbg */
export function setDrag(d: number): void {
  DRAG = d;
}

const bitten = new Map<string, SurfaceDef>();

/**
 * A surface under tyres that bite off the road (CarDef.offroad): grass, mud and water give back
 * that share of the grip, the top speed and the drag they take. Gravel, tarmac and ice are as
 * they are: a lug does nothing on ice. Memoised, since it is asked three times a substep.
 */
function bite(surface: Surface, offroad = 0): SurfaceDef {
  const sd = SURFACES[surface];
  if (offroad <= 0 || (sd.drag <= 0 && sd.top >= 1)) return sd;
  const key = `${surface}:${offroad}`;
  let out = bitten.get(key);
  if (!out) {
    const k = offroad;
    out = { ...sd, grip: sd.grip + (1 - sd.grip) * k, top: sd.top + (1 - sd.top) * k, drag: sd.drag * (1 - k) };
    bitten.set(key, out);
  }
  return out;
}

/** What the driver and the race ask of a car this frame, read once and held through the substeps. */
interface Ask {
  throttle: number;
  pedal: number;
  top: number;
  pull: number;
  spinning: boolean;
}

export function advance(s: SimState, inputs: CarInput[], dt: number): void {
  const asks = s.cars.map((c, i) => ask(s, c, inputs[i], dt));
  const h = dt / SUB;
  for (const c of s.cars) c.hit = 0;
  for (let k = 0; k < SUB; k++) {
    for (let i = 0; i < s.cars.length; i++) integrate(s, s.cars[i], asks[i], h, k === SUB - 1);
    for (let it = 0; it < 2; it++) carContacts(s, it === 0);
    for (const c of s.cars) treeContacts(s, c);
  }
  for (const c of s.cars) {
    if (c.wreck > 0) continue;
    // drifting fills the tank
    const fwd = c.vx * Math.cos(c.heading) + c.vy * Math.sin(c.heading);
    if (Math.abs(c.slipAngle) > 0.2 && Math.abs(fwd) > 9 && c.spin <= 0 && !c.air) c.boost = Math.min(1, c.boost + BOOST.perDriftSecond * nitroFill(c.def) * dt);
  }
}

/** The once-a-frame part: the wheel, the nitro, the engine's pace, the countdown of a spin. */
function ask(s: SimState, c: Car, input: CarInput, dt: number): Ask {
  if (c.wreck > 0) return { throttle: 0, pedal: 1, top: 0, pull: 0, spinning: false };
  const def = c.def;
  const done = c.finishedAt >= 0;
  // the wheel follows the thumb, quickly; in the air it turns but steers nothing
  const want = clamp(input.steer, -1, 1);
  const rate = 9 * dt;
  c.steer += clamp(want - c.steer, -rate, rate);
  // damage costs pull and top speed; an opponent's engine is also paced to the player (PACING)
  const pace = (1 - DAMAGE_PACE * (c.damage / 100)) * enginePace(s, c);
  if (c.spin > 0) c.spin -= dt;
  if (c.slick > 0) c.slick -= dt;
  const spinning = c.spin > 0;
  if (input.boost && !done && !spinning && c.boost > 0.05 && c.boosting <= 0) {
    const tank = nitroTank(def);
    c.boosting = Math.min(tank * BOOST.burst, c.boost * tank);
    if (c === s.cars[0]) s.sounds.push('nitro');
  }
  const boosting = c.boosting > 0;
  if (boosting) {
    c.boosting -= dt;
    c.boost = Math.max(0, c.boost - dt / nitroTank(def));
  }
  return {
    throttle: done || spinning ? 0 : clamp(input.throttle, 0, 1),
    pedal: done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1),
    top: def.topSpeed * pace * (boosting ? BOOST.top : 1),
    pull: def.accel * pace * (boosting ? BOOST.accel : 1),
    spinning,
  };
}

/**
 * The tyre's lateral force as a share of its grip, for a slip of x peaks:
 * up to 1 at x = 1, then down smoothly to `slide`. On the rear, past
 * `guard` peaks it climbs back toward 1: a tail far out bites again,
 * which is what holds a slide at an angle instead of letting it become
 * a spin (the arcade spin guard).
 */
function tyre(x: number, slide: number, guard: number): number {
  const a = Math.abs(x);
  let f = a <= 1 ? (2 * a) / (1 + a * a) : slide + (1 - slide) / (1 + 0.6 * (a - 1) * (a - 1));
  if (a > guard) f += Math.max(1 - slide, GUARD_GAIN) * Math.min(1, (a - guard) / guard);
  return Math.sign(x) * f;
}

/** One axle's force in its own frame (x along the wheel), capped together by the friction circle. */
function axle(demandX: number, alpha: number, surf: SurfaceDef, cap: number, vAxleY: number, h: number, guard = Infinity): [number, number] {
  let fy = -cap * tyre(alpha / surf.peak, surf.slide, guard);
  // the tyre cannot more than stop its own sideways motion in a substep: no chatter at rest
  const stop = Math.abs(vAxleY) / h;
  if (Math.abs(fy) > stop) fy = Math.sign(fy) * stop;
  let fx = demandX;
  const total = Math.hypot(fx, fy);
  if (total > cap) {
    fx *= cap / total;
    fy *= cap / total;
  }
  return [fx, fy];
}

function integrate(s: SimState, c: Car, a: Ask, h: number, last: boolean): void {
  const def = c.def;
  const t = s.track;
  const loc = t.locate(c.x, c.y);
  const road = t.at(loc.s);
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  // velocity in the car's frame: x forward, y to the right
  let vx = c.vx * fx + c.vy * fy;
  let vy = c.vx * -fy + c.vy * fx;
  let w = c.yaw;

  const L = wheelbase(def);
  const b = L * 0.5; // CG to the front axle
  const cc = L - b; // CG to the rear axle
  const k2 = inertia(def);

  // the surface under each axle: the road's frame tells how far along and across each one sits
  const along = fx * road.tx + fy * road.ty;
  const across = fx * -road.ty + fy * road.tx;
  const sf = bite(t.surfaceAt(loc.s + b * along, loc.d + b * across, c.x + fx * b, c.y + fy * b), def.offroad);
  const sr = bite(t.surfaceAt(loc.s - cc * along, loc.d - cc * across, c.x - fx * cc, c.y - fy * cc), def.offroad);
  const here = t.surfaceAt(loc.s, loc.d, c.x, c.y);
  const sc = bite(here, def.offroad);

  // height: on the ground the car follows it; when the ground falls away faster than gravity can pull, it flies
  const ground = t.groundAt(loc.s, loc.d);
  const vAlong = c.vx * road.tx + c.vy * road.ty;
  const ahead = t.groundAt(loc.s + vAlong * h, loc.d);
  const vzGround = (ahead - ground) / h;
  if (!c.air) {
    if (vzGround < c.vz - G * h * 2 && c.vz > 0.5) {
      c.air = true;
      c.z = ground;
    } else {
      c.z = ground;
      c.vz = vzGround;
    }
  }
  if (c.air) {
    c.vz -= G * h;
    c.z += c.vz * h;
    if (c.z <= ground && c.vz < vzGround) land(s, c, vx, vy, ground, vzGround, sc.splash === true);
    vx = c.vx * fx + c.vy * fy;
    vy = c.vx * -fy + c.vy * fx;
  }

  let ax = 0;
  let ay = 0;
  let wdot = 0;
  if (!c.air) {
    // grip per axle: the car's tyres, the surface, the load moved by the pitch, and a spin that wears off
    const loose = a.spinning ? 1 - 0.65 * clamp(c.spin / SPIN_TIME, 0, 1) : 1;
    // braking loads the nose fully; the engine squats the tail only half as much, or the pedal-less
    // throttle the thumb gives would make every car push
    const shift = clamp((CG_OVER_L * (c.ax < 0 ? c.ax : c.ax * 0.5)) / G, -SHIFT_MAX, SHIFT_MAX);
    // oil under the tyres: little hold on the front, less on the rear, so the tail goes first
    const oiled = c.slick > 0;
    const capF = def.grip * sf.grip * (0.5 - shift) * loose * (oiled ? OIL.grip : 1);
    const capR = def.grip * sr.grip * REAR_GRIP * (0.5 + shift) * loose * (oiled ? OIL.rearGrip : 1);

    // drive: the engine's push fades toward the top speed the surface allows
    const top = a.top * Math.min(sf.top, sr.top);
    const front = def.frontDrive ?? 0;
    let drive = 0;
    if (a.throttle > 0 && vx < top) drive = a.pull * a.throttle * Math.max(0, 1 - vx / top);
    let brakeF = 0;
    let brakeR = 0;
    let handbrake = false;
    if (a.pedal > 0) {
      if (vx > 0.4) {
        // the brakes are biased to the nose; at speed the pedal also drags the rear to a share of its
        // grip, the handbrake: a dragged tyre has that much less to hold sideways, and the tail comes round
        brakeF = def.brake * a.pedal * 0.75;
        brakeR = def.brake * a.pedal * 0.25;
        if (vx > 6) {
          handbrake = true;
          brakeR = capR * 0.5 * a.pedal;
        }
      } else if (vx > -REVERSE_TOP) drive = -def.accel * 0.5 * a.pedal;
    } else if (vx < 0) {
      brakeF = brakeR = def.brake * 0.25;
    }
    c.handbrake = handbrake;
    // a brake never pushes the car backwards: it fades out as the wheel stops
    const roll = clamp(Math.abs(vx) / 0.5, 0, 1) * Math.sign(vx);

    const vxs = Math.max(Math.abs(vx), V_FLOOR);
    const vyF = vy + w * b;
    // caster: the part of the wheel the thumb leaves free swings to where the front axle is going,
    // as a released steering wheel does, so a slide let go of straightens itself
    const lock = steeringLock(def, vx);
    const free = (1 - Math.abs(c.steer)) * CASTER;
    const swing = steeringLock(def, 0);
    const vyR = vy - w * cc;
    const alphaR = Math.atan2(vyR, vxs);
    // the hand asks for yaw; the wheel turns as far as the tyres can use at this speed (yawMax).
    // A tail well past its peak is caught for the hand (COUNTER): the same car answers every hand
    // the same way
    const asked = Math.atan((c.steer * yawMax(def, vx) * L) / vxs);
    const past = Math.abs(alphaR) - sr.peak * COUNTER_FROM;
    const tailOut = past > 0 && Math.abs(vx) > 6 ? Math.sign(alphaR) * past * COUNTER : 0;
    // only the part of the front's travel beyond CASTER_FROM of the tyre's peak: in a steady turn at
    // speed the nose points a shade inside the path, and a caster that followed every degree of it
    // steered against the thumb, a quarter of the wheel gone at 80 km/h (tools/dbg/thumb.ts, 2026-10-05)
    const travelF = Math.atan2(vyF, vxs);
    const caster = Math.sign(travelF) * Math.max(0, Math.abs(travelF) - sf.peak * CASTER_FROM);
    const delta = clamp(asked + tailOut, -lock, lock) + free * clamp(caster, -swing, swing) * Math.sign(vx || 1);
    const alphaF = Math.atan2(vyF, vxs) - delta * Math.sign(vx || 1);
    // the thumb has no throttle to lift, so the car lifts for it: past the rear's peak the drive
    // fades, the way a driver feathers a slide instead of powering it into a spin
    if (drive > 0) drive *= clamp(1 - (Math.abs(alphaR) / sr.peak - 1) * TRACTION, 0.25, 1);
    const demandF = drive * front - brakeF * roll;
    const demandR = drive * (1 - front) - brakeR * roll;
    // the front's sideways speed in the wheel's own frame, for the at-rest cap
    const vyWheel = vyF * Math.cos(delta) - vx * Math.sin(delta);
    const [fxF, fyF] = axle(demandF, alphaF, { ...sf, slide: sf.slide + (1 - sf.slide) * FRONT_HOLD }, capF, vyWheel, h * 2);
    // a locked tyre slides where the car goes: the handbrake takes the rear's side grip away
    const [fxR, fyR] = axle(demandR, alphaR, sr, handbrake ? capR * (1 - HANDBRAKE * a.pedal) : capR, vyR, h * 2, GUARD);
    if (last) c.sliding = (Math.abs(alphaR) > sr.peak * 1.3 || Math.abs(alphaF) > sf.peak * 1.3) && Math.abs(vx) > 2;

    // the front wheel's force turned into the car's frame
    const cd = Math.cos(delta);
    const sd = Math.sin(delta);
    const carFx = fxF * cd - fyF * sd;
    const carFy = fxF * sd + fyF * cd;
    ax = carFx + fxR - vx * DRAG;
    ay = carFy + fyR;
    if (vx > top) ax -= (vx - top) * 2;
    wdot = (carFy * b - fyR * cc) / k2;
    // a saturated tyre no longer cares how fast the car turns, so nothing slows a spin but this:
    // the further the tail is past its peak, the more the rotation is damped (the spin guard)
    wdot -= w * SPIN_DAMP * clamp((Math.abs(alphaR) / sr.peak - 1) / 3, 0, 1);
    c.ax += (fxR + carFx - c.ax) * Math.min(1, h / PITCH_LAG);

    // at walking pace and rolling, the car turns like a bicycle on rails; a sideways slide keeps its own yaw
    const rolling = clamp(Math.abs(vx) / 4, 0, 1);
    const slidingSide = clamp(Math.abs(vy) / 2, 0, 1);
    const blend = Math.max(rolling, slidingSide);
    w += wdot * h;
    const wKin = (vx * Math.tan(delta)) / L;
    w = wKin + (w - wKin) * blend;
  } else {
    // in the air: a little drag, the spin carries on
    c.handbrake = false;
    c.sliding = false;
    w *= 1 - 0.3 * h;
  }

  // the surface's own drag on the whole car: water and mud pull it down
  const drag = c.air ? 0.02 : sc.drag;
  ax -= vx * drag;
  ay -= vy * drag;

  vx += (ax + vy * w) * h;
  vy += (ay - vx * w) * h;
  c.yaw = w;
  c.heading += w * h;
  const nfx = Math.cos(c.heading);
  const nfy = Math.sin(c.heading);
  c.vx = vx * nfx + vy * -nfy;
  c.vy = vx * nfy + vy * nfx;
  c.x += c.vx * h;
  c.y += c.vy * h;
  if (last) {
    c.onRoad = Math.abs(loc.d) <= t.width / 2;
    c.surface = here;
    c.slipAngle = Math.abs(vx) > 1 ? Math.atan2(vy, Math.abs(vx)) : 0;
    const v = Math.hypot(vx, vy);
    if (sc.splash && !c.air && v > 4 && s.time * 20 - Math.floor(s.time * 20) < 0.34) {
      s.fx.push({ kind: 'splash', x: c.x - nfx * def.length * 0.4, y: c.y - nfy * def.length * 0.4, age: 0 });
      if (c === s.cars[0] && v > 8 && Math.random() < 0.15) s.sounds.push('splash');
    }
  }
}

/** Touching down: the tyres take the sideways speed the car came down with, and a hard landing bounces, but not in water. */
function land(s: SimState, c: Car, vx: number, vy: number, ground: number, vzGround: number, wet: boolean): void {
  const impact = c.vz - vzGround;
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  // crooked: the share of the speed that is sideways is scrubbed off, and a little of the rest
  const v = Math.hypot(vx, vy) || 1;
  const crooked = Math.abs(vy) / v;
  vx *= 1 - 0.04 - 0.25 * crooked;
  vy *= 0.35;
  c.yaw *= 0.5;
  c.vx = vx * fx + vy * -fy;
  c.vy = vx * fy + vy * fx;
  c.z = ground;
  // a car coming down onto a rising bank is caught by it and rides it up; water swallows the
  // landing in a sheet of spray; on the flat it bounces
  if (wet) {
    for (let k = 0; k < 4; k++) s.fx.push({ kind: 'splash', x: c.x + Math.cos(c.heading + k * 1.6) * 1.2, y: c.y + Math.sin(c.heading + k * 1.6) * 1.2, age: 0 });
    if (c === s.cars[0]) s.sounds.push('splash');
  }
  if (impact < -LAND_BOUNCE && vzGround < 0.5 && !wet) {
    c.vz = vzGround + Math.min(LAND_REBOUND_MAX, -impact * LAND_REBOUND);
    c.z = ground + 0.01;
  } else {
    c.vz = vzGround;
    c.air = false;
  }
  if (impact < -LAND_HURT) hurt(s, c, DAMAGE.tree * Math.min(1, (-impact - LAND_HURT) / 6), c.lastHitBy);
  if (c === s.cars[0] && impact < -2) {
    s.sounds.push('land');
    s.shake = Math.max(s.shake, Math.min(0.5, -impact / 18));
  }
}

/** yaw inertia over mass, m²: a box, a little under, for turn-in */
function inertia(def: Car['def']): number {
  return ((def.length * def.length + def.width * def.width) / 12) * 1.0;
}

/** the four corners of the car's body, front right first */
function corners(c: Car): [number, number][] {
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  const hl = c.def.length / 2;
  const hw = c.def.width / 2;
  return [
    [c.x + fx * hl - fy * hw, c.y + fy * hl + fx * hw],
    [c.x + fx * hl + fy * hw, c.y + fy * hl - fx * hw],
    [c.x - fx * hl + fy * hw, c.y - fy * hl - fx * hw],
    [c.x - fx * hl - fy * hw, c.y - fy * hl + fx * hw],
  ];
}

/**
 * Where two boxes overlap, by separating axes: the normal from a to b,
 * the depth, and the point of contact (the deepest corner, or the middle
 * of the two deepest when a face lies flat on a face). Null when apart.
 */
export function overlap(a: Car, b: Car): { nx: number; ny: number; depth: number; px: number; py: number } | null {
  const A = corners(a);
  const B = corners(b);
  let depth = Infinity;
  let nx = 0;
  let ny = 0;
  let fromA = true;
  for (const [car, isA] of [[a, true], [b, false]] as const) {
    for (const [ux, uy] of [
      [Math.cos(car.heading), Math.sin(car.heading)],
      [-Math.sin(car.heading), Math.cos(car.heading)],
    ]) {
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A) {
        const d = p[0] * ux + p[1] * uy;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }
      for (const p of B) {
        const d = p[0] * ux + p[1] * uy;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }
      const o = Math.min(maxA - minB, maxB - minA);
      if (o <= 0) return null;
      if (o < depth) {
        depth = o;
        // point the normal from a to b
        const sgn = (b.x - a.x) * ux + (b.y - a.y) * uy >= 0 ? 1 : -1;
        nx = ux * sgn;
        ny = uy * sgn;
        fromA = isA;
      }
    }
  }
  // the contact: on a's face, b's corners that reach furthest back along n; on b's face, a's that reach furthest forward
  const pts = fromA ? B : A;
  const sgn = fromA ? -1 : 1;
  let best = -Infinity;
  for (const p of pts) best = Math.max(best, sgn * (p[0] * nx + p[1] * ny));
  let px = 0;
  let py = 0;
  let n = 0;
  for (const p of pts) {
    if (sgn * (p[0] * nx + p[1] * ny) > best - 0.08) {
      px += p[0];
      py += p[1];
      n++;
    }
  }
  return { nx, ny, depth, px: px / n, py: py / n };
}

/**
 * An impulse between two bodies at a point, along n (from a to b), with
 * restitution and Coulomb friction. b may be the world (mass Infinity).
 * Returns the closing speed at the point before the impulse.
 */
function impulse(a: Car, b: Car | null, px: number, py: number, nx: number, ny: number, bounce: number, friction: number): number {
  const ma = a.def.mass;
  const ia = ma * inertia(a.def) * HIT_INERTIA;
  const rax = px - a.x;
  const ray = py - a.y;
  let vrx = -(a.vx - a.yaw * ray);
  let vry = -(a.vy + a.yaw * rax);
  let inv = 1 / ma + (rax * ny - ray * nx) ** 2 / ia;
  let mb = Infinity;
  let ib = Infinity;
  let rbx = 0;
  let rby = 0;
  if (b) {
    mb = b.def.mass;
    ib = mb * inertia(b.def) * HIT_INERTIA;
    rbx = px - b.x;
    rby = py - b.y;
    vrx += b.vx - b.yaw * rby;
    vry += b.vy + b.yaw * rbx;
    inv += 1 / mb + (rbx * ny - rby * nx) ** 2 / ib;
  }
  // vr is b's point velocity relative to a's; closing when it points back along n
  const vn = vrx * nx + vry * ny;
  if (vn >= 0) return 0;
  const j = (-(1 + bounce) * vn) / inv;
  // friction along the sliding direction at the point, capped by the normal impulse
  let tx = vrx - vn * nx;
  let ty = vry - vn * ny;
  const vt = Math.hypot(tx, ty);
  let jt = 0;
  if (vt > 1e-6) {
    tx /= vt;
    ty /= vt;
    let invT = 1 / ma + (rax * ty - ray * tx) ** 2 / ia;
    if (b) invT += 1 / mb + (rbx * ty - rby * tx) ** 2 / ib;
    jt = Math.min(vt / invT, friction * j);
  }
  // the impulse on b is +j n - jt t (friction opposes b's slide); a gets the opposite
  const jx = j * nx - jt * tx;
  const jy = j * ny - jt * ty;
  a.vx -= jx / ma;
  a.vy -= jy / ma;
  a.yaw -= (rax * jy - ray * jx) / ia;
  if (b) {
    b.vx += jx / mb;
    b.vy += jy / mb;
    b.yaw += (rbx * jy - rby * jx) / ib;
  }
  return -vn;
}

/** Every pair of cars that overlap: push them apart by mass and trade an impulse at the contact. */
function carContacts(s: SimState, report: boolean): void {
  const cars = s.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.wreck > 0 || b.wreck > 0) continue;
      if (Math.abs(a.z - b.z) > CLEAR_HEIGHT) continue;
      const far = (a.def.length + b.def.length) / 2 + 0.5;
      if (Math.abs(b.x - a.x) > far || Math.abs(b.y - a.y) > far) continue;
      const o = overlap(a, b);
      if (!o) continue;
      // centre speeds along the normal, before: what the race calls the hit's force
      const closing = (a.vx - b.vx) * o.nx + (a.vy - b.vy) * o.ny;
      const ia = 1 / a.def.mass;
      const ib = 1 / b.def.mass;
      const push = Math.max(0, o.depth - 0.01) * 0.8;
      a.x -= o.nx * push * (ia / (ia + ib));
      a.y -= o.ny * push * (ia / (ia + ib));
      b.x += o.nx * push * (ib / (ia + ib));
      b.y += o.ny * push * (ib / (ia + ib));
      const hit = impulse(a, b, o.px, o.py, o.nx, o.ny, CAR_BOUNCE, CAR_FRICTION);
      if (report && hit > 0) ram(s, i, j, Math.max(0, closing), o.nx, o.ny, o.px, o.py, (victim) => (victim.spin = Math.max(victim.spin, SPIN_TIME * 0.6)));
      else a.hit = b.hit = 1;
    }
  }
}

/**
 * A car that has put a corner into the trees is pushed back out with an
 * impulse at that corner. The trees are everything outside the road and
 * its verge, and outside every shortcut lane: a corner is in them when it
 * is beyond both, and is pushed back toward whichever it is nearer.
 */
function treeContacts(s: SimState, c: Car): void {
  const t = s.track;
  const loc = t.locate(c.x, c.y);
  const limit = t.width / 2 + t.verge;
  if (Math.abs(loc.d) < limit - c.def.length) return;
  const road = t.at(loc.s);
  const rx = -road.ty;
  const ry = road.tx;
  let deepest = 0;
  let cx = 0;
  let cy = 0;
  let nx = 0;
  let ny = 0;
  for (const p of corners(c)) {
    const d = loc.d + (p[0] - c.x) * rx + (p[1] - c.y) * ry;
    let pen = Math.abs(d) - limit;
    // the normal points back to the road
    let px = -rx * Math.sign(d);
    let py = -ry * Math.sign(d);
    if (pen > 0 && t.lanes.length) {
      const l = t.laneAt(p[0], p[1]);
      if (l && l.dist - (l.lane.width / 2 + LANE_VERGE) < pen) {
        pen = l.dist - (l.lane.width / 2 + LANE_VERGE);
        const len = l.dist || 1;
        px = (l.px - p[0]) / len;
        py = (l.py - p[1]) / len;
      }
    }
    if (pen > deepest) {
      deepest = pen;
      cx = p[0];
      cy = p[1];
      nx = px;
      ny = py;
    }
  }
  if (deepest <= 0) return;
  c.x += nx * deepest;
  c.y += ny * deepest;
  // the world is b: n must point from the car into the world
  const hit = impulse(c, null, cx, cy, -nx, -ny, TREE_BOUNCE, TREE_FRICTION);
  c.hit = 1;
  if (hit > 3) {
    hurt(s, c, DAMAGE.tree * Math.min(1, hit / 12), c.lastHitBy);
    s.fx.push({ kind: 'spark', x: cx, y: cy, age: 0 });
  }
  if (c === s.cars[0] && hit > 2) {
    s.sounds.push('hit');
    s.shake = Math.max(s.shake, Math.min(0.5, hit / 20));
  }
}
