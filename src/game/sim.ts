import type { Car, SimState } from './state';
import type { CarInput } from './types';

export const DT = 1 / 60;

/** Grass: the top speed the surface allows and the extra drag it adds. */
const GRASS_TOP = 16;
const GRASS_DRAG = 2.2;
/** a car is a circle of this radius when two meet */
const CAR_R = 1.5;

/**
 * One fixed step. Arcade car: the car has a heading and a velocity; the
 * engine pushes along the heading, the sideways part of the velocity dies
 * at the surface's grip rate, and steering turns the heading at a rate
 * that needs some speed to bite and softens at the top end. Off the road
 * is grass, slow and loose; past the verge are trees, which stop the car.
 * Cars push each other apart. The race ends for the player at the flag;
 * the sim keeps stepping so the field finishes behind.
 */
export function step(s: SimState, inputs: CarInput[], dt: number): void {
  s.time += dt;
  if (s.hold > 0) {
    s.hold -= dt;
    if (s.hold <= 0) {
      s.sounds.push('go');
      // the clock starts at the lights, not at the countdown
      for (const c of s.cars) c.lapStart = s.time;
    }
    return;
  }
  // keeps counting a little past zero, so the HUD can show GO for a moment
  if (s.hold > -2) s.hold -= dt;

  for (let i = 0; i < s.cars.length; i++) moveCar(s, s.cars[i], inputs[i] ?? { steer: 0, throttle: 0, brake: 1 }, dt);
  collide(s);
  for (const c of s.cars) settle(s, c, c === s.cars[0]);
}

function moveCar(s: SimState, c: Car, input: CarInput, dt: number): void {
  const def = c.def;
  const t = s.track;
  const done = c.finishedAt >= 0;

  const want = clamp(input.steer, -1, 1);
  const rate = 9 * dt;
  c.steer += clamp(want - c.steer, -rate, rate);

  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  let vf = c.vx * fx + c.vy * fy;
  let vl = c.vx * -fy + c.vy * fx;

  const onRoad = Math.abs(c.d) <= t.width / 2;
  const top = onRoad ? def.topSpeed : GRASS_TOP;
  const grip = onRoad ? def.grip : def.grip * 0.6;

  const throttle = done ? 0 : clamp(input.throttle, 0, 1);
  const brake = done ? 1 : clamp(input.brake, 0, 1);
  if (vf < top) vf += def.accel * throttle * Math.max(0, 1 - vf / top) * dt;
  else vf -= (vf - top) * 2 * dt;
  if (!onRoad) vf -= vf * GRASS_DRAG * dt * 0.5;
  vf -= vf * 0.12 * dt;
  if (brake > 0) vf = vf > 0 ? Math.max(0, vf - def.brake * brake * dt) : Math.min(0, vf + def.brake * brake * dt);
  vl *= Math.exp(-grip * dt);

  const bite = clamp(vf / 8, -1, 1) * (1 - 0.45 * Math.min(1, Math.abs(vf) / def.topSpeed));
  const omega = c.steer * def.turnRate * bite + vl * 0.03;
  c.heading += omega * dt;
  const thrown = omega * vf * 0.35 * dt;
  vl += thrown;
  vf -= Math.abs(thrown) * 0.6;

  const nfx = Math.cos(c.heading);
  const nfy = Math.sin(c.heading);
  c.vx = vf * nfx + vl * -nfy;
  c.vy = vf * nfy + vl * nfx;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.hit = 0;
  c.onRoad = onRoad;
}

/** Cars as circles: push overlapping pairs apart and trade the closing speed. */
function collide(s: SimState): void {
  const cars = s.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR_R * 2;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        const k = closing * 0.6;
        a.vx -= nx * k;
        a.vy -= ny * k;
        b.vx += nx * k;
        b.vy += ny * k;
        a.hit = b.hit = 1;
        if ((i === 0 || j === 0) && closing > 3) s.sounds.push('bump');
      }
    }
  }
}

/** Trees, the lap counter and the derived numbers, after everything has moved. */
function settle(s: SimState, c: Car, player: boolean): void {
  const t = s.track;
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
    c.vx *= 0.6;
    c.vy *= 0.6;
    c.hit = 1;
    if (player && Math.hypot(c.vx, c.vy) > 3) s.sounds.push('hit');
    loc.d = limit * side;
  }
  const prevS = c.s;
  c.s = loc.s;
  c.d = loc.d;
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  c.speed = c.vx * fx + c.vy * fy;
  c.slip = c.vx * -fy + c.vy * fx;

  const L = t.length;
  if (c.s > L * 0.4 && c.s < L * 0.6) c.half = true;
  const crossed = prevS > L * 0.8 && c.s < L * 0.2;
  if (crossed && c.half && c.finishedAt < 0) {
    c.laps.push(s.time - c.lapStart);
    c.lapStart = s.time;
    c.half = false;
    if (c.laps.length >= s.totalLaps) {
      c.finishedAt = s.time;
      if (player) {
        s.finished = true;
        s.sounds.push('finish');
      }
    } else {
      c.lap++;
      if (player) s.sounds.push('lap');
    }
  }
  // distance covered, with the grid's negative start folded in
  const lapS = c.lap === 1 && !c.half && c.s > L * 0.8 ? c.s - L : c.s;
  c.progress = c.finishedAt >= 0 ? s.totalLaps * L + 1e6 - c.finishedAt : (c.lap - 1) * L + lapS;
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
