import type { Car, SimState } from './state';
import type { CarInput } from './types';
import { BOOST, DAMAGE, DAMAGE_PACE } from './content/weapons';
import { enginePace } from './content/drivers';
import { clamp, hurt, ram, spin } from './harm';
import { steeringLock, wheelbase } from './sim';

/**
 * The car model as it was until 2026-10-03, kept reachable for one
 * release at ?physics=old so the new one (physics.ts) can be compared
 * on a phone. Delete this file, the `physics` field on SimState and the
 * branch in step() with the release after.
 *
 * The bicycle model at one Euler step a frame, cars as circles pushed
 * apart with a share of the closing speed traded, and the tree line as a
 * clamp that keeps 60% of the speed every step the car touches it.
 */

/** Grass: the top speed the surface allows and how much of the grip is left on it. */
const GRASS_TOP = 30;
const GRASS_GRIP = 0.45;
/** m/s backwards, held pedal at a standstill */
const REVERSE_TOP = 5;
/** a car is a circle of this radius when two meet */
const CAR_R = 1.5;
const G = 9.81;
/** radians of slip at which a tyre gives all it has; past it the force is flat */
const ALPHA_PEAK = 0.12;
/** the rear tyres against the front: below 1 the rear lets go first, so the car rotates at the limit instead of plowing */
const REAR_GRIP = 0.9;
/** centre of gravity height over the wheelbase: how much braking unloads the rear */
const CG_OVER_L = 0.18;

function moveCar(s: SimState, c: Car, input: CarInput, dt: number): void {
  const def = c.def;
  const t = s.track;
  const done = c.finishedAt >= 0;

  // the wheel follows the thumb, quickly; the lock shrinks with speed, as on a real wheel at speed
  const want = clamp(input.steer, -1, 1);
  const rate = 9 * dt;
  c.steer += clamp(want - c.steer, -rate, rate);

  // velocity in the car's frame: x forward, y to the right
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  let vx = c.vx * fx + c.vy * fy;
  let vy = c.vx * -fy + c.vy * fx;
  let w = c.yaw;

  const onRoad = Math.abs(c.d) <= t.width / 2;
  // damage costs pull and top speed; an opponent's engine is also paced to the player (PACING)
  const pace = (1 - DAMAGE_PACE * (c.damage / 100)) * enginePace(s, c);
  if (c.spin > 0) c.spin -= dt;
  const spinning = c.spin > 0;

  // nitro: an edge lights a burst, the burst drains the tank
  if (input.boost && !done && !spinning && c.boost > 0.05 && c.boosting <= 0) {
    c.boosting = Math.min(BOOST.seconds * BOOST.burst, c.boost * BOOST.seconds);
    if (c === s.cars[0]) s.sounds.push('nitro');
  }
  const boosting = c.boosting > 0;
  if (boosting) {
    c.boosting -= dt;
    c.boost = Math.max(0, c.boost - dt / BOOST.seconds);
  }

  // the geometry: wheelbase, the centre of gravity in the middle, the yaw inertia of a box
  const L = wheelbase(def);
  const b = L * 0.5; // CG to the front axle
  const cc = L - b; // CG to the rear axle
  const k2 = ((def.length * def.length + def.width * def.width) / 12) * 0.75; // yaw inertia over mass, m²: a little under a box, for turn-in
  const delta = c.steer * steeringLock(def, vx);

  // the tyres' grip on this surface, as an acceleration
  let mu = def.grip * (onRoad ? 1 : GRASS_GRIP);
  if (spinning) mu *= 0.3;

  // longitudinal: the engine and the pedal, both capped by what the tyres can transmit
  const top = (onRoad ? def.topSpeed : GRASS_TOP) * pace * (boosting ? BOOST.top : 1);
  const throttle = done || spinning ? 0 : clamp(input.throttle, 0, 1);
  const pedal = done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1);
  let drive = 0;
  if (vx < top) drive = Math.min(def.accel * pace * (boosting ? BOOST.accel : 1) * throttle * Math.max(0, 1 - vx / top), mu * 1.15);
  let ax = drive - vx * 0.12;
  if (vx > top) ax -= (vx - top) * 2;
  let braking = 0;
  c.handbrake = false;
  if (pedal > 0) {
    if (vx > 0.4) {
      braking = Math.min(def.brake * pedal, mu * 1.05, vx / dt);
      c.handbrake = vx > 6;
    } else if (vx > -REVERSE_TOP) ax -= Math.min(def.accel * 0.5 * pedal, mu);
  } else if (vx < 0) ax += Math.min(def.brake * 0.5, -vx / dt);
  ax -= braking;

  // the friction circle: what the tyres spend lengthwise they do not have sideways.
  // The rear drives, so throttle loosens the rear; the brakes are mostly on the front.
  const usedR = clamp((drive * 0.8 + braking * 0.4) / mu, 0, 0.95);
  const usedF = clamp((braking * 0.6) / mu, 0, 0.95);
  const circleR = Math.sqrt(1 - usedR * usedR);
  const circleF = Math.sqrt(1 - usedF * usedF);

  // load per axle, shifted by the last step's longitudinal acceleration
  const shift = clamp((CG_OVER_L * c.ax) / G, -0.25, 0.25);
  const loadF = clamp(cc / L - shift, 0.15, 0.85);
  const loadR = clamp(b / L + shift, 0.15, 0.85);
  let muR = mu * REAR_GRIP;
  // braking hard: the rear tyres, lightened and part locked, have less left sideways
  if (c.handbrake) muR *= 0.8;
  const capF = mu * loadF * circleF;
  const capR = muR * loadR * circleR;
  // slip angles; the denominator floors at walking pace so rest is not a singularity
  const vxs = Math.max(Math.abs(vx), 3);
  const alphaF = Math.atan2(vy + w * b, vxs) - delta;
  const alphaR = Math.atan2(vy - w * cc, vxs);
  const ayF = capF * clamp(-alphaF / ALPHA_PEAK, -1, 1);
  const ayR = capR * clamp(-alphaR / ALPHA_PEAK, -1, 1);
  c.sliding = (Math.abs(alphaR) > ALPHA_PEAK * 1.3 || Math.abs(alphaF) > ALPHA_PEAK * 1.3) && Math.abs(vx) > 2;

  // the equations of motion in the car's frame
  const ay = ayR + ayF * Math.cos(delta) - vx * w;
  const axTotal = ax - ayF * Math.sin(delta) + vy * w;
  const wdot = (ayF * Math.cos(delta) * b - ayR * cc) / k2;
  // at walking pace the car steers like a bicycle rolling on rails
  const wKin = (vx * Math.tan(delta)) / L;
  const blend = clamp(Math.abs(vx) / 5, 0, 1);
  w += wdot * dt;
  w = wKin + (w - wKin) * blend;
  vx += axTotal * dt;
  vy += ay * dt;
  vy *= 1 - (1 - blend) * 0.5; // and the slide dies off at rest
  c.ax = ax;

  c.yaw = w;
  c.heading += w * dt;
  const nfx = Math.cos(c.heading);
  const nfy = Math.sin(c.heading);
  c.vx = vx * nfx + vy * -nfy;
  c.vy = vx * nfy + vy * nfx;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.hit = 0;
  c.onRoad = onRoad;
  c.slipAngle = Math.abs(vx) > 1 ? Math.atan2(vy, Math.abs(vx)) : 0;
  // drifting fills the tank
  if (Math.abs(c.slipAngle) > 0.2 && Math.abs(vx) > 9 && !spinning) c.boost = Math.min(1, c.boost + BOOST.perDriftSecond * dt);
}

/** Cars as circles: push overlapping pairs apart, trade the closing speed, and hurt the one that was hit. */
function collide(s: SimState): void {
  const cars = s.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.wreck > 0 || b.wreck > 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR_R * 2;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const ma = a.def.mass;
      const mb = b.def.mass;
      const push = min - d;
      a.x -= nx * push * (mb / (ma + mb));
      a.y -= ny * push * (mb / (ma + mb));
      b.x += nx * push * (ma / (ma + mb));
      b.y += ny * push * (ma / (ma + mb));
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      // the heavier car keeps more of its speed
      const k = closing * 0.7;
      a.vx -= nx * k * (mb / (ma + mb)) * 2;
      a.vy -= ny * k * (mb / (ma + mb)) * 2;
      b.vx += nx * k * (ma / (ma + mb)) * 2;
      b.vy += ny * k * (ma / (ma + mb)) * 2;
      ram(s, i, j, closing, nx, ny, (a.x + b.x) / 2, (a.y + b.y) / 2, (victim) => spin(s, victim, 0.8));
    }
  }
}

/** The tree line: put the car back on it, bounce the normal speed, keep 60% of the rest. */
function trees(s: SimState, c: Car): void {
  const t = s.track;
  const player = c === s.cars[0];
  const loc = t.locate(c.x, c.y);
  const limit = t.width / 2 + t.verge;
  if (Math.abs(loc.d) > limit) {
    const p = t.at(loc.s);
    const side = Math.sign(loc.d);
    const nx = -p.ty * side;
    const ny = p.tx * side;
    c.x = p.x + nx * limit;
    c.y = p.y + ny * limit;
    const vn = c.vx * nx + c.vy * ny;
    if (vn > 0) {
      c.vx -= vn * nx * 1.2;
      c.vy -= vn * ny * 1.2;
    }
    const v = Math.hypot(c.vx, c.vy);
    c.vx *= 0.6;
    c.vy *= 0.6;
    c.yaw *= 0.3;
    c.hit = 1;
    if (v > 6) {
      hurt(s, c, DAMAGE.tree * Math.min(1, v / 20), c.lastHitBy);
      s.fx.push({ kind: 'spark', x: c.x, y: c.y, age: 0 });
    }
    if (player && v > 3) {
      s.sounds.push('hit');
      s.shake = Math.max(s.shake, Math.min(0.5, v / 30));
    }
  }
}

/** One frame of the old model: every car moves, then the pairs, then the trees. */
export function advanceOld(s: SimState, inputs: CarInput[], dt: number): void {
  for (let i = 0; i < s.cars.length; i++) {
    const c = s.cars[i];
    if (c.wreck > 0) continue;
    moveCar(s, c, inputs[i], dt);
  }
  collide(s);
  for (const c of s.cars) if (c.wreck <= 0) trees(s, c);
}
