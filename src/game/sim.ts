import type { Car, SimState } from './state';
import type { CarInput } from './types';
import { BOOST, DAMAGE, GUN, MINE, MISSILE, RESPAWN_DAMAGE, WRECK_BOUNTY, WRECK_TIME } from './content/weapons';
import { PICKUPS, PICKUP_REACH, PICKUP_RESPAWN } from './content/pickups';
import { CLASS_RANK } from './types';
import { GRUDGE, hostility, leaderOf } from './content/drivers';
import { anger, boom, clamp, hurt, spin, wrap } from './harm';
import { advanceOld } from './physics-old';

export const DT = 1 / 60;

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
  const held = s.cars.map((_, i) => inputs[i] ?? { steer: 0, throttle: 0, brake: 1, boost: false });
  advanceOld(s, held, dt);
  for (let i = 0; i < s.cars.length; i++) {
    const c = s.cars[i];
    if (c.wreck > 0) burn(s, c, dt);
    else guns(s, c, i, dt);
  }
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

/** The lap counter and the derived numbers, after everything has moved. */
function settle(s: SimState, c: Car, player: boolean): void {
  const t = s.track;
  const loc = t.locate(c.x, c.y);
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
