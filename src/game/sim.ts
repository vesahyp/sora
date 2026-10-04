import type { Car, SimState } from './state';
import type { CarInput } from './types';
import { BOOST, nitroFill, DAMAGE, FUMBLE, GUN, MINE, MISSILE, OIL, OIL_CREDIT, RESPAWN_DAMAGE, WRECK_BOUNTY, WRECK_TIME } from './content/weapons';
import { PICKUPS, PICKUP_REACH, PICKUP_RESPAWN } from './content/pickups';
import { CLASS_RANK } from './types';
import { GRUDGE, hostility, leaderOf } from './content/drivers';
import { anger, boom, clamp, hurt, spin, wrap } from './harm';
import { LANE_VERGE } from './track';
import { advanceOld } from './physics-old';
import { advance } from './physics';

export const DT = 1 / 60;

/** steering lock at rest, radians per unit of turnRate, and the speed that halves it: 50 until the
 * cars got a fifth faster (2026-10-04), raised with them so a car still turns at its new speeds */
const LOCK = 0.17;
const LOCK_FADE = 60;
/** how much more yaw than the grip can hold a hand may ask for at speed: room to provoke a slide */
const YAW_ROOM = 1.35;
/**
 * One fixed step. The car model moves the cars (physics.ts: the tyres,
 * the contacts between cars and with the trees, height; physics-old.ts
 * at ?physics=old). Around it the race runs: the countdown, a tap of
 * nitro from a tank that drifting, ramming and wrecking fill, guns that
 * fire themselves, bullets, missiles, mines, oil slicks and pickups,
 * and the laps.
 * At 100 damage a car is a wreck for a few seconds, then it is back on
 * the centreline.
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
  const held = s.cars.map((c, i) => rescue(s, c, inputs[i] ?? { steer: 0, throttle: 0, brake: 1, boost: false }, dt));
  if (s.physics === 'old') advanceOld(s, held, dt);
  else advance(s, held, dt);
  for (let i = 0; i < s.cars.length; i++) {
    const c = s.cars[i];
    if (c.wreck > 0) burn(s, c, dt);
    else guns(s, c, i, dt);
  }
  for (const c of s.cars) if (c.wreck <= 0) settle(s, c, c === s.cars[0]);
  flyBullets(s, dt);
  flyMissiles(s, dt);
  mines(s, dt);
  oils(s, dt);
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

/** Target, machine gun, missile lock, mine drop, oil leak: all automatic. */
function guns(s: SimState, c: Car, i: number, dt: number): void {
  const g = c.def.gun;
  if (c.missileWait > 0) c.missileWait -= dt;
  if (c.mineWait > 0) c.mineWait -= dt;
  if (c.oilWait > 0) c.oilWait -= dt;
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

  // the machine gun, if the car has one: the part's first level is the gun
  const firing = canFire && g > 0 && target >= 0 && !c.overheated;
  if (firing) {
    c.heat += dt / GUN.heat;
    if (c.heat >= 1) c.overheated = true;
    const rate = GUN.rate * (1 + 0.25 * (g - 1));
    c.gunWait -= dt;
    if (c.gunWait <= 0) {
      c.gunWait += 1 / rate;
      // a poor driver sprays: the spread widens by SPRAY x (1 - skill)
      const spread = (Math.sin(s.time * 97 + i * 13) * 0.5 + Math.sin(s.time * 41) * 0.5) * 0.06 * (1 + GUN.spray * (1 - c.driver.skill));
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

  // a mine, or a can of oil, for a car right behind, on this line
  const behind = (reach: number) => {
    for (let k = 0; k < s.cars.length; k++) {
      if (k === i) continue;
      const o = s.cars[k];
      if (o.wreck > 0) continue;
      let gap = o.s - c.s;
      if (gap < -s.track.length / 2) gap += s.track.length;
      if (gap > s.track.length / 2) gap -= s.track.length;
      if (gap < -3 && gap > -reach && Math.abs(o.d - c.d) < 2.6) return true;
    }
    return false;
  };
  const tail = -c.def.length * 0.7;
  // a poor driver fumbles: the can or the mine goes down only after a car has sat on its tail
  // for FUMBLE x (1 - skill) seconds, so a slow field is passed before it lays much
  const mineBehind = behind(MINE.behind);
  const oilBehind = behind(OIL.behind);
  c.tailed = mineBehind || oilBehind ? c.tailed + dt : 0;
  const ready = c.tailed >= FUMBLE * (1 - c.driver.skill);
  if (canFire && ready && c.mines > 0 && c.mineWait <= 0 && Math.abs(c.speed) > 5 && mineBehind) {
    c.mines--;
    c.mineWait = MINE.every;
    s.mines.push({ x: c.x + Math.cos(c.heading) * tail, y: c.y + Math.sin(c.heading) * tail, age: 0, owner: i });
    if (i === 0) s.sounds.push('mine');
  }
  if (canFire && ready && c.oil > 0 && c.oilWait <= 0 && Math.abs(c.speed) > 5 && oilBehind) {
    c.oil--;
    c.oilWait = OIL.every;
    s.oils.push({ x: c.x + Math.cos(c.heading) * tail, y: c.y + Math.sin(c.heading) * tail, age: 0, owner: i });
    if (i === 0) s.sounds.push('oil');
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
        hurt(s, c, DAMAGE.bullet * (1 + 0.3 * (shooter.def.gun - 1)), b.owner);
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

/**
 * Oil on the road: a car that crosses a slick keeps little grip for a
 * moment (physics.ts reads `slick`). The slick stays; the one who laid it
 * is spared it for a moment. A car that goes sideways on it has been spun,
 * and the one who laid the oil is paid, as a ram that spins someone is.
 */
function oils(s: SimState, dt: number): void {
  for (let i = s.oils.length - 1; i >= 0; i--) {
    const o = s.oils[i];
    o.age += dt;
    if (o.age > OIL.life) {
      s.oils.splice(i, 1);
      continue;
    }
    for (let k = 0; k < s.cars.length; k++) {
      const c = s.cars[k];
      if (c.wreck > 0 || c.air || (k === o.owner && o.age < 1.5)) continue;
      if (Math.hypot(c.x - o.x, c.y - o.y) < OIL.r + 0.6) {
        if (c.slick <= 0) {
          // the tail goes the way it was already leaning, or either way on a straight car
          c.slickPaid = false;
          const lean = Math.abs(c.slipAngle) > 0.02 ? Math.sign(c.slipAngle) : Math.sin(s.time * 13 + c.x) >= 0 ? 1 : -1;
          c.yaw += lean * OIL.kick * Math.min(1, Math.abs(c.speed) / 15);
          if (k === 0) {
            s.sounds.push('slick');
            s.shake = Math.max(s.shake, 0.2);
          }
        }
        c.slick = OIL.slick;
        if (k !== o.owner) c.slickBy = o.owner;
      }
    }
  }
  for (let k = 0; k < s.cars.length; k++) {
    const c = s.cars[k];
    if (c.slick <= 0 || c.slickPaid || c.slickBy < 0 || c.wreck > 0) continue;
    if (Math.abs(c.slipAngle) > 0.45 && Math.abs(c.speed) > 5) {
      c.slickPaid = true;
      const by = s.cars[c.slickBy];
      anger(s, c, c.slickBy, GRUDGE.spin);
      const credit = OIL_CREDIT * (CLASS_RANK[c.def.cls] + 1);
      by.ramCash += credit;
      if (by === s.cars[0]) s.toasts.push({ text: { fi: `${c.driver.name.fi} liukastui! +${credit} cr`, en: `${c.driver.name.en} slid! +${credit} cr` }, colour: '#ffd870', age: 0 });
      else if (c === s.cars[0]) s.toasts.push({ text: { fi: `${by.driver.name.fi} öljysi sinut`, en: `${by.driver.name.en} oiled you` }, colour: '#ff8a3a', age: 0 });
    }
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
        case 'oil':
          c.oil = Math.min(9, c.oil + 1);
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
  // the old model stops a wreck dead; the new one lets it slide to a stop on locked wheels
  if (s.physics === 'old') c.vx = c.vy = c.yaw = 0;
  c.spin = 0;
  c.boosting = 0;
  boom(s, c.x, c.y, c === s.cars[0] ? 1 : 0.5);
  s.sounds.push('wreck');
  const by = c.lastHitBy >= 0 ? s.cars[c.lastHitBy] : null;
  if (by) {
    anger(s, c, c.lastHitBy, GRUDGE.wreck);
    by.wrecks++;
    by.boost = Math.min(1, by.boost + BOOST.perWreck * nitroFill(by.def));
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
  c.damage = RESPAWN_DAMAGE;
  onRoad(s, c);
}

/** Back on the centreline a little ahead, standing, the clocks reset: after a wreck, or a tow without the flash. */
function onRoad(s: SimState, c: Car, flash = true): void {
  const p = s.track.at(c.s + 3);
  c.x = p.x;
  c.y = p.y;
  c.heading = Math.atan2(p.ty, p.tx);
  c.vx = c.vy = c.yaw = 0;
  c.z = c.vz = 0;
  c.air = false;
  c.d = 0;
  c.stall = 0;
  c.stallX = c.x;
  c.stallY = c.y;
  c.slick = 0;
  c.stuck = 0;
  c.stuckS = c.s;
  c.backOut = 0;
  if (!flash) return;
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
  // going nowhere: a metre from the last place it was counts as moving, so a car rubbing a wall at
  // a crawl, or rocking against it, is as stalled as one standing still; so is any car under
  // walking pace, because a car bouncing off the wall with the throttle on can travel more
  // than a metre without going anywhere
  const slow = Math.hypot(c.vx, c.vy) < 1.5;
  if (s.hold <= 0 && c.finishedAt < 0 && (slow || Math.hypot(c.x - c.stallX, c.y - c.stallY) < 1.2)) c.stall += DT;
  else {
    c.stall = 0;
    c.stallX = c.x;
    c.stallY = c.y;
  }
  // off the road and getting nowhere along the lap: a bus shoved into a shortcut's mouth, a car the
  // back-out could not free, one rocking against the trees. The marshals tow it back, as a folk
  // race's tractor would, before the player has time to wonder what to do
  if (s.hold <= 0 && c.finishedAt < 0 && Math.abs(c.d) > t.width / 2) {
    // forward from the mark, never back: a car rocking to and fro over the mark is going nowhere
    let along = c.s - c.stuckS;
    if (along < -L / 2) along += L;
    if (along > L / 2) along -= L;
    if (along >= TOW_ALONG) {
      c.stuck = 0;
      c.stuckS = c.s;
    } else c.stuck += DT;
  } else {
    c.stuck = 0;
    c.stuckS = c.s;
  }
  if (c.stuck > TOW_AFTER && c.wreck <= 0) tow(s, c);
}

/**
 * seconds off the road without getting TOW_ALONG metres along the lap before the marshals tow a
 * car back on. Eight metres: a car crawling along the tree line at a metre a second made the
 * old three and sat there for seven seconds without a tow (2026-10-04); a car driving a shortcut
 * lane or the grass makes eight in well under four seconds
 */
export const TOW_AFTER = 4;
const TOW_ALONG = 8;
/** stalled this long, seconds, with the nose in the trees, a car reverses on its own for BACK_OUT seconds */
const BACK_AFTER = 1.5;
const BACK_OUT = 1.1;

/** The marshals' tractor: back on the road facing forward, a toast and a sound, no flash. */
function tow(s: SimState, c: Car): void {
  onRoad(s, c, false);
  if (c === s.cars[0]) {
    s.sounds.push('tow');
    s.toasts.push({ text: { fi: 'Hinaus', en: 'Towed' }, colour: '#e8c040', age: 0 });
  }
}

/**
 * A car wedged nose first in the trees backs out on its own: not a metre moved in BACK_AFTER
 * seconds with the nose at a wall and pointing off the road, and the sim takes the wheel for
 * BACK_OUT seconds, reversing with the wheel turned so the nose swings back to the road. It is
 * the bot's back-out given to every car: the one-thumb player has the throttle on all the time
 * and no reason to know the pedal reverses, so without it the car sits against the tree.
 */
function rescue(s: SimState, c: Car, input: CarInput, dt: number): CarInput {
  if (c.wreck > 0 || c.finishedAt >= 0 || s.hold > 0) {
    c.backOut = 0;
    return input;
  }
  if (c.backOut > 0) {
    c.backOut -= dt;
    return { steer: c.backSteer, throttle: 0, brake: 1, boost: false };
  }
  if (c.stall < BACK_AFTER) return input;
  const steer = backOutSteer(s, c);
  if (steer === 0) return input;
  c.backOut = BACK_OUT;
  c.backSteer = steer;
  if (c === s.cars[0]) s.toasts.push({ text: { fi: 'Peruuta', en: 'Backing out' }, colour: '#e6dfcc', age: 0 });
  return { steer, throttle: 0, brake: 1, boost: false };
}

/**
 * The wheel that backs a car's nose out of the trees, or 0 when the nose is not at a wall or
 * already points along the way out. The way out is the road's direction, or a shortcut's when
 * the nose is in a lane. Reversing swings the nose against the wheel, so the wheel goes the
 * other way from where that direction lies.
 */
function backOutSteer(s: SimState, c: Car): number {
  const t = s.track;
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  const nx = c.x + fx * c.def.length * 0.5;
  const ny = c.y + fy * c.def.length * 0.5;
  const loc = t.locate(nx, ny);
  const roadRoom = t.width / 2 + t.verge - Math.abs(loc.d);
  let room = roadRoom;
  let dir = t.at(loc.s);
  const l = t.laneAt(nx, ny);
  if (l) {
    const laneRoom = l.lane.width / 2 + LANE_VERGE - l.dist;
    if (laneRoom > roadRoom) {
      room = laneRoom;
      dir = l.lane.at(l.u);
    }
  }
  if (room > 0.8) return 0;
  const ang = Math.atan2(fx * dir.ty - fy * dir.tx, fx * dir.tx + fy * dir.ty);
  if (Math.abs(ang) < 0.4) return 0;
  return ang > 0 ? -1 : 1;
}

export function wheelbase(def: Car['def']): number {
  return def.length * 0.62;
}

/** Radians of wheel angle at full lock, at this speed: the lock shrinks as the car goes faster. */
/** The rack's lock at this speed: full at rest, fading with speed, as on a real wheel. */
export function steeringLock(def: Car['def'], v: number): number {
  return (def.turnRate * LOCK) / (1 + Math.abs(v) / LOCK_FADE);
}

/**
 * The most yaw a car can ask for at this speed, rad/s. The input's steer is a share of this,
 * not of the rack: a hand asks the car to turn, and the car turns the wheel as far as the
 * tyres can use. At rest the rack is the limit; at speed the grip is, with YAW_ROOM over
 * it so a slide can still be provoked. Before this, at 100 km/h the rack offered four times
 * the angle the front could turn into force: a thumb at full stretch saturated the front,
 * then the rear, and the car slid like ice, while the bot, which already asked for yaw
 * rates, stayed on rails (tools/dbg/slip.ts, 2026-10-04). Every car, every hand.
 */
export function yawMax(def: Car['def'], v: number): number {
  const vv = Math.max(Math.abs(v), 3);
  const rack = (vv * Math.tan(steeringLock(def, v))) / wheelbase(def);
  const grip = (YAW_ROOM * def.grip) / vv;
  return Math.min(rack, grip);
}
