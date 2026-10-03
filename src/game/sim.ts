import type { SimState } from './state';
import type { CarInput } from './types';

export const DT = 1 / 60;

/** Grass: the top speed the surface allows and the extra drag it adds. */
const GRASS_TOP = 16;
const GRASS_DRAG = 2.2;

/**
 * One fixed step. Arcade car: the car has a heading and a velocity; the
 * engine pushes along the heading, the sideways part of the velocity dies
 * at the surface's grip rate, and steering turns the heading at a rate
 * that needs some speed to bite and softens at the top end. Off the road
 * is grass, slow and loose; past the verge are trees, which stop the car.
 */
export function step(s: SimState, input: CarInput, dt: number): void {
  s.time += dt;
  const c = s.car;
  const def = c.def;
  const t = s.track;
  if (s.hold > 0) {
    s.hold -= dt;
    if (s.hold <= 0) s.sounds.push('go');
    return;
  }
  // keeps counting a little past zero, so the HUD can show GO for a moment
  if (s.hold > -2) s.hold -= dt;

  // the wheel follows the thumb, quickly
  const want = clamp(input.steer, -1, 1);
  const rate = 9 * dt;
  c.steer += clamp(want - c.steer, -rate, rate);

  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  const rx = -fy;
  const ry = fx;
  let vf = c.vx * fx + c.vy * fy;
  let vl = c.vx * rx + c.vy * ry;

  const onRoad = Math.abs(c.d) <= t.width / 2;
  const top = onRoad ? def.topSpeed : GRASS_TOP;
  const grip = onRoad ? def.grip : def.grip * 0.6;

  const throttle = s.finished ? 0 : clamp(input.throttle, 0, 1);
  const brake = s.finished ? 1 : clamp(input.brake, 0, 1);
  // engine: full push at rest, none at the top speed of the surface
  if (vf < top) vf += def.accel * throttle * Math.max(0, 1 - vf / top) * dt;
  else vf -= (vf - top) * 2 * dt;
  if (!onRoad) vf -= vf * GRASS_DRAG * dt * 0.5;
  // rolling drag
  vf -= vf * 0.12 * dt;
  // brake toward zero, never through it
  if (brake > 0) vf = vf > 0 ? Math.max(0, vf - def.brake * brake * dt) : Math.min(0, vf + def.brake * brake * dt);
  // the slide dies at the grip rate
  vl *= Math.exp(-grip * dt);

  // steering: nothing at rest, full at 8 m/s, fading toward the top end
  const bite = clamp(vf / 8, -1, 1) * (1 - 0.45 * Math.min(1, Math.abs(vf) / def.topSpeed));
  // sliding adds yaw of its own, so a gravel corner rotates the car
  const omega = c.steer * def.turnRate * bite + vl * 0.03;
  c.heading += omega * dt;
  // turning throws speed sideways: the slide the grip has to catch
  const thrown = omega * vf * 0.35 * dt;
  vl += thrown;
  vf -= Math.abs(thrown) * 0.6;

  const nfx = Math.cos(c.heading);
  const nfy = Math.sin(c.heading);
  c.vx = vf * nfx + vl * -nfy;
  c.vy = vf * nfy + vl * nfx;
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  // where on the lap, and the trees
  const loc = t.locate(c.x, c.y);
  const limit = t.width / 2 + t.verge;
  c.hit = 0;
  if (Math.abs(loc.d) > limit) {
    // push back to the tree line, kill the outward velocity, lose speed
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
    if (Math.hypot(c.vx, c.vy) > 3) s.sounds.push('hit');
    loc.d = limit * side;
  }
  const prevS = c.s;
  c.s = loc.s;
  c.d = loc.d;
  c.onRoad = onRoad;
  c.speed = c.vx * nfx + c.vy * nfy;
  c.slip = c.vx * -nfy + c.vy * nfx;

  // lap counting: cross the start line forward, having been round the far side
  const L = t.length;
  if (c.s > L * 0.4 && c.s < L * 0.6) c.half = true;
  const crossed = prevS > L * 0.8 && c.s < L * 0.2;
  if (crossed && c.half && !s.finished) {
    const lapTime = s.time - s.lapStart;
    s.laps.push(lapTime);
    s.lapStart = s.time;
    c.half = false;
    s.sounds.push('lap');
    if (s.laps.length >= s.totalLaps) {
      s.finished = true;
      s.sounds.push('finish');
    } else s.lap++;
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
