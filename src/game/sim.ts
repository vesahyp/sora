import type { Car, SimState } from './state';
import type { CarInput } from './types';
import { DAMAGE, DAMAGE_PACE, MISSILE_LIFE, MISSILE_SPEED, SLICK_LIFE, SLICK_TIME, SPIN_TIME } from './content/weapons';

export const DT = 1 / 60;

/** Grass: the top speed the surface allows and the extra drag it adds. */
const GRASS_TOP = 16;
const GRASS_DRAG = 2.2;
/** m/s backwards, held brake at a standstill */
const REVERSE_TOP = 5;
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

  for (let i = 0; i < s.cars.length; i++) {
    const input = inputs[i] ?? { steer: 0, throttle: 0, brake: 1, fire: false, drop: false };
    weapons(s, s.cars[i], i, input);
    moveCar(s, s.cars[i], input, dt);
  }
  collide(s);
  for (const c of s.cars) settle(s, c, c === s.cars[0]);
  flyMissiles(s, dt);
  for (let i = s.slicks.length - 1; i >= 0; i--) {
    s.slicks[i].age += dt;
    if (s.slicks[i].age > SLICK_LIFE) s.slicks.splice(i, 1);
  }
  for (let i = s.fx.length - 1; i >= 0; i--) {
    s.fx[i].age += dt;
    if (s.fx[i].age > 1) s.fx.splice(i, 1);
  }
}

/** Fire and drop are edges from the input; the car must be upright and racing. */
function weapons(s: SimState, c: Car, i: number, input: CarInput): void {
  if (c.fireWait > 0) c.fireWait -= DT;
  if (c.dropWait > 0) c.dropWait -= DT;
  if (c.finishedAt >= 0 || c.spin > 0 || s.hold > 0) return;
  if (input.fire && c.missiles > 0 && c.fireWait <= 0 && s.missiles.length < 24) {
    c.missiles--;
    c.shots++;
    c.fireWait = 0.9;
    const nose = c.def.length * 0.6;
    s.missiles.push({ x: c.x + Math.cos(c.heading) * nose, y: c.y + Math.sin(c.heading) * nose, heading: c.heading, speed: Math.max(0, c.speed) + MISSILE_SPEED, age: 0, owner: i });
    s.sounds.push(i === 0 ? 'fire' : 'fire-far');
  }
  if (input.drop && c.oil > 0 && c.dropWait <= 0 && s.slicks.length < 40) {
    c.oil--;
    c.shots++;
    c.dropWait = 1.5;
    const tail = -c.def.length * 0.7;
    s.slicks.push({ x: c.x + Math.cos(c.heading) * tail, y: c.y + Math.sin(c.heading) * tail, r: 2.2, age: 0 });
    if (i === 0) s.sounds.push('splash');
  }
}

/** A missile flies on, bends toward the nearest car ahead, and goes off on a car or a tree. */
function flyMissiles(s: SimState, dt: number): void {
  const t = s.track;
  for (let i = s.missiles.length - 1; i >= 0; i--) {
    const m = s.missiles[i];
    m.age += dt;
    // homing: the nearest car within 40 m and 50 degrees of the nose
    let best: Car | null = null;
    let bestD = 40;
    for (let k = 0; k < s.cars.length; k++) {
      if (k === m.owner) continue;
      const c = s.cars[k];
      const dx = c.x - m.x;
      const dy = c.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d >= bestD) continue;
      let a = Math.atan2(dy, dx) - m.heading;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      if (Math.abs(a) < 0.87) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      let a = Math.atan2(best.y - m.y, best.x - m.x) - m.heading;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      m.heading += clamp(a, -3.5 * dt, 3.5 * dt);
    } else {
      // no target: follow the road, so a missile down a straight stays a threat
      const loc = t.locate(m.x, m.y);
      const ahead = t.at(loc.s + 12);
      let a = Math.atan2(ahead.y - m.y, ahead.x - m.x) - m.heading;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      m.heading += clamp(a, -1.5 * dt, 1.5 * dt);
    }
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    let gone = m.age > MISSILE_LIFE;
    const loc = t.locate(m.x, m.y);
    if (Math.abs(loc.d) > t.width / 2 + t.verge) {
      gone = true;
      s.fx.push({ kind: 'puff', x: m.x, y: m.y, age: 0 });
    }
    for (let k = 0; k < s.cars.length && !gone; k++) {
      if (k === m.owner) continue;
      const c = s.cars[k];
      if (Math.hypot(c.x - m.x, c.y - m.y) < 2.2) {
        gone = true;
        hit(s, c, DAMAGE.missile, 'boom');
        // the blast shoves the car along the missile's line
        c.vx += Math.cos(m.heading) * 4;
        c.vy += Math.sin(m.heading) * 4;
        s.fx.push({ kind: 'boom', x: c.x, y: c.y, age: 0 });
        s.sounds.push('boom');
      }
    }
    if (gone) s.missiles.splice(i, 1);
  }
}

/** Damage and a spin: the car is a passenger for a moment and loses half its speed. */
function hit(s: SimState, c: Car, dmg: number, how: 'boom' | 'slick'): void {
  c.damage = Math.min(100, c.damage + dmg);
  c.spin = SPIN_TIME;
  c.hit = 1;
  const k = how === 'boom' ? 0.5 : 0.85;
  c.vx *= k;
  c.vy *= k;
  if (c === s.cars[0]) s.sounds.push('spin');
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
  const pace = 1 - DAMAGE_PACE * (c.damage / 100);
  const top = (onRoad ? def.topSpeed : GRASS_TOP) * pace;
  let grip = onRoad ? def.grip : def.grip * 0.6;
  // on oil there is no grip; in a spin there is no driver
  if (c.slick > 0) {
    c.slick -= dt;
    grip *= 0.08;
  }
  if (c.spin > 0) c.spin -= dt;
  const spinning = c.spin > 0;

  const throttle = done || spinning ? 0 : clamp(input.throttle, 0, 1);
  const brake = done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1);
  if (vf < top) vf += def.accel * pace * throttle * Math.max(0, 1 - vf / top) * dt;
  else vf -= (vf - top) * 2 * dt;
  if (!onRoad) vf -= vf * GRASS_DRAG * dt * 0.5;
  vf -= vf * 0.12 * dt;
  // the brake: stops the car, and held at a standstill backs it up, slowly
  if (brake > 0) {
    if (vf > 0.3) vf = Math.max(0, vf - def.brake * brake * dt);
    else if (vf > -REVERSE_TOP) vf -= def.accel * 0.5 * brake * dt;
  } else if (vf < 0) vf = Math.min(0, vf + def.brake * 0.5 * dt);
  vl *= Math.exp(-grip * dt);

  const bite = clamp(vf / 8, -1, 1) * (1 - 0.45 * Math.min(1, Math.abs(vf) / def.topSpeed));
  // a spinning car turns on its own, about two turns a second at first
  const omega = spinning ? 11 * (c.spin / SPIN_TIME) : c.steer * def.turnRate * bite + vl * 0.03 + (c.slick > 0 ? vl * 0.3 : 0);
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
        if (closing > 5) {
          a.damage = Math.min(100, a.damage + DAMAGE.car);
          b.damage = Math.min(100, b.damage + DAMAGE.car);
        }
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
    const v = Math.hypot(c.vx, c.vy);
    c.vx *= 0.6;
    c.vy *= 0.6;
    c.hit = 1;
    if (v > 6) c.damage = Math.min(100, c.damage + DAMAGE.tree * Math.min(1, v / 20));
    if (player && v > 3) s.sounds.push('hit');
    loc.d = limit * side;
  }
  // a slick under the wheels
  if (c.slick <= 0 && c.spin <= 0) {
    for (const k of s.slicks) {
      if (Math.hypot(c.x - k.x, c.y - k.y) < k.r + 0.8 && Math.abs(c.speed) > 4) {
        c.slick = SLICK_TIME;
        hit(s, c, DAMAGE.oil, 'slick');
        s.fx.push({ kind: 'splash', x: c.x, y: c.y, age: 0 });
        break;
      }
    }
  }
  // stalled: near standstill with the race on, so the bot knows to back out
  if (s.hold <= 0 && c.finishedAt < 0 && Math.abs(c.speed) < 0.8) c.stall += 1 / 60;
  else c.stall = 0;
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
