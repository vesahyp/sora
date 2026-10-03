import type { Car, SimState } from './state';
import type { CarInput } from './types';
import { BOOST, DAMAGE, DAMAGE_PACE, GUN, MINE, MISSILE, RAM, RAM_CREDIT, RESPAWN_DAMAGE, SPIN_TIME, WRECK_BOUNTY, WRECK_TIME } from './content/weapons';
import { PICKUPS, PICKUP_REACH, PICKUP_RESPAWN } from './content/pickups';
import { CLASS_RANK } from './types';
import { GRUDGE, enginePace, hostility, leaderOf } from './content/drivers';

export const DT = 1 / 60;

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
/** steering lock at rest, radians per unit of turnRate, and the speed that halves it */
const LOCK = 0.17;
const LOCK_FADE = 50;

/**
 * One fixed step. The car is the bicycle model (Marco Monster, "Car
 * Physics for Games"): velocity in the car's frame, a slip angle for
 * each axle from the lateral velocity and the yaw rate, a cornering
 * force per axle that grows with the slip angle and saturates at the
 * tyre's grip times its load, and yaw from the torque the two axles
 * make about the centre of gravity. Braking moves load to the front,
 * so the rear lets go first: braking into a corner swings the tail.
 * The pedal brakes, and at speed also locks the rear; held at a
 * standstill it reverses. A tap of nitro is a burst from a tank that
 * drifting, ramming and wrecking fill. Guns fire themselves. Cars push
 * each other, and a shunt hurts the one that was hit. At 100 damage a
 * car is a wreck for a few seconds, then it is back on the centreline.
 */
export function step(s: SimState, inputs: CarInput[], dt: number): void {
  s.time += dt;
  if (s.hold > 0) {
    s.hold -= dt;
    if (s.hold <= 0) {
      s.sounds.push('go');
      for (const c of s.cars) c.lapStart = s.time;
    }
    return;
  }
  // keeps counting past zero: the HUD shows GO for a moment, and the guns stay quiet for a few seconds
  if (s.hold > -(GUN.holdOff + 1)) s.hold -= dt;

  // grudges fade, slowly
  for (const c of s.cars) for (let k = 0; k < c.grudge.length; k++) if (c.grudge[k] > 0) c.grudge[k] = Math.max(0, c.grudge[k] - GRUDGE.decay * dt);
  for (let i = 0; i < s.cars.length; i++) {
    const c = s.cars[i];
    const input = inputs[i] ?? { steer: 0, throttle: 0, brake: 1, boost: false };
    if (c.wreck > 0) {
      burn(s, c, dt);
      continue;
    }
    moveCar(s, c, input, dt);
    guns(s, c, i, dt);
  }
  collide(s);
  for (const c of s.cars) if (c.wreck <= 0) settle(s, c, c === s.cars[0]);
  flyBullets(s, dt);
  flyMissiles(s, dt);
  mines(s, dt);
  pickups(s, dt);
  for (const c of s.cars) if (c.damage >= 100 && c.wreck <= 0) wreck(s, c);
  for (let i = s.fx.length - 1; i >= 0; i--) {
    s.fx[i].age += dt;
    if (s.fx[i].age > 1) s.fx.splice(i, 1);
  }
  for (let i = s.toasts.length - 1; i >= 0; i--) {
    s.toasts[i].age += dt;
    if (s.toasts[i].age > 2.6) s.toasts.splice(i, 1);
  }
  s.shake = Math.max(0, s.shake - dt * 2.5);
}

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

/** Target, machine gun, missile lock, mine drop: all automatic. */
function guns(s: SimState, c: Car, i: number, dt: number): void {
  const g = c.def.gun;
  if (c.missileWait > 0) c.missileWait -= dt;
  if (c.mineWait > 0) c.mineWait -= dt;
  // the sights: the nearest living car in the cone ahead, a grudge or the lead making a car
  // look nearer than it is, so the guns go for whoever this car has it in for
  let target = -1;
  let targetD = GUN.range;
  let best = Infinity;
  const leader = leaderOf(s);
  for (let k = 0; k < s.cars.length; k++) {
    if (k === i) continue;
    const o = s.cars[k];
    if (o.wreck > 0) continue;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= GUN.range) continue;
    const a = wrap(Math.atan2(dy, dx) - c.heading);
    const score = d / (1 + GRUDGE.aim * hostility(s, c, k, leader));
    if (Math.abs(a) < GUN.cone && score < best) {
      target = k;
      targetD = d;
      best = score;
    }
  }
  c.lockTime = target >= 0 && target === c.target ? c.lockTime + dt : 0;
  c.target = target;
  const canFire = c.finishedAt < 0 && c.spin <= 0 && s.hold < -GUN.holdOff;

  // the machine gun
  const firing = canFire && target >= 0 && !c.overheated;
  if (firing) {
    c.heat += dt / GUN.heat;
    if (c.heat >= 1) c.overheated = true;
    const rate = GUN.rate * (1 + 0.25 * g);
    c.gunWait -= dt;
    if (c.gunWait <= 0) {
      c.gunWait += 1 / rate;
      const spread = (Math.sin(s.time * 97 + i * 13) * 0.5 + Math.sin(s.time * 41) * 0.5) * 0.06;
      const h = c.heading + spread;
      const nose = c.def.length * 0.55;
      const v = 70 + Math.max(0, c.speed);
      s.bullets.push({ x: c.x + Math.cos(h) * nose, y: c.y + Math.sin(h) * nose, vx: Math.cos(h) * v, vy: Math.sin(h) * v, age: 0, owner: i });
      c.shots++;
      if (i === 0 && c.shots % 2 === 0) s.sounds.push('gun');
    }
  } else {
    c.heat = Math.max(0, c.heat - dt / GUN.cool);
    if (c.overheated && c.heat < 0.15) c.overheated = false;
  }

  // a missile once the lock has held
  if (canFire && target >= 0 && c.missiles > 0 && c.missileWait <= 0 && c.lockTime >= MISSILE.lock && targetD < MISSILE.range) {
    c.missiles--;
    c.missileWait = MISSILE.every;
    const nose = c.def.length * 0.6;
    s.missiles.push({ x: c.x + Math.cos(c.heading) * nose, y: c.y + Math.sin(c.heading) * nose, heading: c.heading, speed: Math.max(0, c.speed) + MISSILE.speed, age: 0, owner: i, target });
    s.sounds.push(i === 0 ? 'missile' : 'missile-far');
  }

  // a mine for a car right behind, on this line
  if (canFire && c.mines > 0 && c.mineWait <= 0 && Math.abs(c.speed) > 5) {
    for (let k = 0; k < s.cars.length; k++) {
      if (k === i) continue;
      const o = s.cars[k];
      if (o.wreck > 0) continue;
      let gap = o.s - c.s;
      if (gap < -s.track.length / 2) gap += s.track.length;
      if (gap > s.track.length / 2) gap -= s.track.length;
      if (gap < -3 && gap > -MINE.behind && Math.abs(o.d - c.d) < 2.6) {
        c.mines--;
        c.mineWait = MINE.every;
        const tail = -c.def.length * 0.7;
        s.mines.push({ x: c.x + Math.cos(c.heading) * tail, y: c.y + Math.sin(c.heading) * tail, age: 0, owner: i });
        if (i === 0) s.sounds.push('mine');
        break;
      }
    }
  }
}

function flyBullets(s: SimState, dt: number): void {
  const t = s.track;
  for (let i = s.bullets.length - 1; i >= 0; i--) {
    const b = s.bullets[i];
    b.age += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let gone = b.age > 0.75;
    if (!gone) {
      const loc = t.locate(b.x, b.y);
      if (Math.abs(loc.d) > t.width / 2 + t.verge) {
        gone = true;
        s.fx.push({ kind: 'puff', x: b.x, y: b.y, age: 0.5 });
      }
    }
    for (let k = 0; k < s.cars.length && !gone; k++) {
      if (k === b.owner) continue;
      const c = s.cars[k];
      if (c.wreck > 0) continue;
      if (Math.hypot(c.x - b.x, c.y - b.y) < 1.7) {
        gone = true;
        const shooter = s.cars[b.owner];
        hurt(s, c, DAMAGE.bullet * (1 + 0.3 * shooter.def.gun), b.owner);
        anger(s, c, b.owner, GRUDGE.bullet);
        s.fx.push({ kind: 'spark', x: b.x, y: b.y, age: 0 });
        if (k === 0) s.shake = Math.max(s.shake, 0.15);
      }
    }
    if (gone) s.bullets.splice(i, 1);
  }
}

/** A missile bends toward its target and goes off on a car or a tree. */
function flyMissiles(s: SimState, dt: number): void {
  const t = s.track;
  for (let i = s.missiles.length - 1; i >= 0; i--) {
    const m = s.missiles[i];
    m.age += dt;
    const tc = m.target >= 0 ? s.cars[m.target] : null;
    if (tc && tc.wreck <= 0) {
      const a = wrap(Math.atan2(tc.y - m.y, tc.x - m.x) - m.heading);
      m.heading += clamp(a, -MISSILE.turn * dt, MISSILE.turn * dt);
    }
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    let gone = m.age > MISSILE.life;
    const loc = t.locate(m.x, m.y);
    if (Math.abs(loc.d) > t.width / 2 + t.verge) {
      gone = true;
      s.fx.push({ kind: 'puff', x: m.x, y: m.y, age: 0 });
    }
    for (let k = 0; k < s.cars.length && !gone; k++) {
      if (k === m.owner) continue;
      const c = s.cars[k];
      if (c.wreck > 0) continue;
      if (Math.hypot(c.x - m.x, c.y - m.y) < 2.2) {
        gone = true;
        hurt(s, c, DAMAGE.missile, m.owner);
        anger(s, c, m.owner, GRUDGE.blast);
        spin(s, c, 0.5);
        c.vx += Math.cos(m.heading) * 4;
        c.vy += Math.sin(m.heading) * 4;
        boom(s, c.x, c.y, k === 0 ? 0.7 : 0.3);
      }
    }
    if (gone) s.missiles.splice(i, 1);
  }
}

function mines(s: SimState, dt: number): void {
  for (let i = s.mines.length - 1; i >= 0; i--) {
    const m = s.mines[i];
    m.age += dt;
    let gone = m.age > MINE.life;
    for (let k = 0; k < s.cars.length && !gone; k++) {
      const c = s.cars[k];
      if (c.wreck > 0 || (k === m.owner && m.age < 1.5)) continue;
      if (Math.hypot(c.x - m.x, c.y - m.y) < MINE.r + 0.9) {
        gone = true;
        hurt(s, c, DAMAGE.mine, m.owner);
        anger(s, c, m.owner, GRUDGE.blast);
        spin(s, c, 0.6);
        boom(s, m.x, m.y, k === 0 ? 0.7 : 0.3);
      }
    }
    if (gone) s.mines.splice(i, 1);
  }
}

function pickups(s: SimState, dt: number): void {
  for (const p of s.pickups) {
    if (p.gone > 0) {
      p.gone -= dt;
      continue;
    }
    for (let k = 0; k < s.cars.length; k++) {
      const c = s.cars[k];
      if (c.wreck > 0 || Math.hypot(c.x - p.x, c.y - p.y) > PICKUP_REACH) continue;
      const def = PICKUPS[p.kind];
      p.gone = PICKUP_RESPAWN;
      switch (p.kind) {
        case 'cash':
          c.cash += def.amount;
          break;
        case 'nitro':
          c.boost = Math.min(1, c.boost + def.amount);
          break;
        case 'wrench':
          c.damage = Math.max(0, c.damage - def.amount);
          break;
        case 'missile':
          c.missiles = Math.min(9, c.missiles + 1);
          break;
        case 'mine':
          c.mines = Math.min(9, c.mines + 1);
          break;
      }
      s.fx.push({ kind: p.kind === 'cash' ? 'cash' : 'flash', x: p.x, y: p.y, age: 0, colour: def.colour });
      if (k === 0) {
        s.sounds.push(p.kind === 'cash' ? 'cash' : 'pickup');
        s.toasts.push({ text: p.kind === 'cash' ? { fi: `+${def.amount} cr`, en: `+${def.amount} cr` } : def.name, colour: def.colour, age: 0 });
      }
      break;
    }
  }
}

/** Damage with armour, and who did it. */
function hurt(s: SimState, c: Car, dmg: number, by: number): void {
  c.damage = Math.min(100, c.damage + dmg * (1 - 0.18 * c.def.armour));
  c.hit = 1;
  if (by >= 0 && by !== s.cars.indexOf(c)) c.lastHitBy = by;
}

/** The victim holds it against the one who did it, the more the hotter its driver. */
function anger(s: SimState, c: Car, by: number, amount: number): void {
  if (by < 0 || s.cars[by] === c) return;
  c.grudge[by] = Math.min(GRUDGE.max, c.grudge[by] + amount * c.driver.aggression);
}

function spin(s: SimState, c: Car, k: number): void {
  c.spin = SPIN_TIME;
  c.vx *= k;
  c.vy *= k;
  // a kick on the yaw; the tyres have little grip for a moment, then catch it
  c.yaw += (Math.sin(s.time * 13 + c.x) >= 0 ? 1 : -1) * 5;
  if (c === s.cars[0]) s.sounds.push('spin');
}

function boom(s: SimState, x: number, y: number, shake: number): void {
  s.fx.push({ kind: 'boom', x, y, age: 0 });
  s.sounds.push('boom');
  s.shake = Math.max(s.shake, shake);
}

/** The car is a wreck: it stops and burns, the one who did it is paid. */
function wreck(s: SimState, c: Car): void {
  c.wreck = WRECK_TIME;
  c.wrecked++;
  c.vx = c.vy = c.yaw = 0;
  c.spin = 0;
  c.boosting = 0;
  boom(s, c.x, c.y, c === s.cars[0] ? 1 : 0.5);
  s.sounds.push('wreck');
  const by = c.lastHitBy >= 0 ? s.cars[c.lastHitBy] : null;
  if (by) {
    anger(s, c, c.lastHitBy, GRUDGE.wreck);
    by.wrecks++;
    by.boost = Math.min(1, by.boost + BOOST.perWreck);
    const bounty = WRECK_BOUNTY * (CLASS_RANK[c.def.cls] + 1);
    by.bounty += bounty;
    if (by === s.cars[0]) s.toasts.push({ text: { fi: `${c.driver.name.fi} romuna! +${bounty} cr`, en: `${c.driver.name.en} wrecked! +${bounty} cr` }, colour: '#ff8a3a', age: 0 });
    else if (c === s.cars[0]) s.toasts.push({ text: { fi: `${by.driver.name.fi} romutti sinut`, en: `${by.driver.name.en} wrecked you` }, colour: '#ff4a3a', age: 0 });
  } else if (c === s.cars[0]) s.toasts.push({ text: { fi: 'Romuna', en: 'Wrecked' }, colour: '#ff4a3a', age: 0 });
  c.lastHitBy = -1;
}

/** Burning: count down, then back on the centreline, patched up halfway. */
function burn(s: SimState, c: Car, dt: number): void {
  c.wreck -= dt;
  if (c.wreck > 0) return;
  const p = s.track.at(c.s + 3);
  c.x = p.x;
  c.y = p.y;
  c.heading = Math.atan2(p.ty, p.tx);
  c.vx = c.vy = c.yaw = 0;
  c.damage = RESPAWN_DAMAGE;
  c.d = 0;
  c.stall = 0;
  s.fx.push({ kind: 'flash', x: c.x, y: c.y, age: 0, colour: '#fff' });
  if (c === s.cars[0]) s.sounds.push('respawn');
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
      a.hit = b.hit = 1;
      if (closing < RAM.minClosing) continue;
      // who rammed whom: the one whose nose points along the contact
      const aFwd = Math.cos(a.heading) * nx + Math.sin(a.heading) * ny;
      const bFwd = -(Math.cos(b.heading) * nx + Math.sin(b.heading) * ny);
      const rammer = aFwd >= bFwd ? a : b;
      const victim = rammer === a ? b : a;
      const ri = rammer === a ? i : j;
      const vi = rammer === a ? j : i;
      const force = (closing - RAM.minClosing) * DAMAGE.ram;
      hurt(s, victim, force * (rammer.def.mass / victim.def.mass) * (1 + 0.35 * rammer.def.armour), ri);
      hurt(s, rammer, force * 0.35 * (victim.def.mass / rammer.def.mass), vi);
      rammer.rams++;
      victim.rammed++;
      anger(s, victim, ri, GRUDGE.ram);
      rammer.boost = Math.min(1, rammer.boost + BOOST.perRam);
      if (closing > RAM.spinClosing) {
        spin(s, victim, 0.8);
        anger(s, victim, ri, GRUDGE.spin);
        // a shove that spins someone pays on the spot, the small change of a wreck's bounty
        const credit = RAM_CREDIT * (CLASS_RANK[victim.def.cls] + 1);
        rammer.ramCash += credit;
        if (rammer === s.cars[0]) s.toasts.push({ text: { fi: `${victim.driver.name.fi} pyörähti! +${credit} cr`, en: `${victim.driver.name.en} spun! +${credit} cr` }, colour: '#ffd870', age: 0 });
      }
      s.fx.push({ kind: 'spark', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, age: 0 });
      if (i === 0 || j === 0) {
        s.sounds.push(closing > RAM.spinClosing ? 'crunch' : 'bump');
        s.shake = Math.max(s.shake, Math.min(0.6, closing / 25));
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
  const lapS = c.lap === 1 && !c.half && c.s > L * 0.8 ? c.s - L : c.s;
  c.progress = c.finishedAt >= 0 ? s.totalLaps * L + 1e6 - c.finishedAt : (c.lap - 1) * L + lapS;
  if (s.hold <= 0 && c.finishedAt < 0 && Math.abs(c.speed) < 0.8) c.stall += DT;
  else c.stall = 0;
}

export function wheelbase(def: Car['def']): number {
  return def.length * 0.62;
}

/** Radians of wheel angle at full lock, at this speed: the lock shrinks as the car goes faster. */
export function steeringLock(def: Car['def'], v: number): number {
  return (def.turnRate * LOCK) / (1 + Math.abs(v) / LOCK_FADE);
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
