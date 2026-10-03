import type { Car, SimState } from './state';
import { BOOST, DAMAGE, RAM, RAM_CREDIT, SPIN_TIME } from './content/weapons';
import { CLASS_RANK } from './types';
import { GRUDGE } from './content/drivers';

/**
 * What a hit does to the race, whichever car model moved the cars: damage
 * with armour, the grudge it leaves, a spin, an explosion, and the
 * consequences of a ram. The car models in physics.ts and physics-old.ts
 * decide when two cars or a car and a tree meet; this decides what it costs.
 */

/** Damage with armour, and who did it. */
export function hurt(s: SimState, c: Car, dmg: number, by: number): void {
  c.damage = Math.min(100, c.damage + dmg * (1 - 0.18 * c.def.armour));
  c.hit = 1;
  if (by >= 0 && by !== s.cars.indexOf(c)) c.lastHitBy = by;
}

/** The victim holds it against the one who did it, the more the hotter its driver. */
export function anger(s: SimState, c: Car, by: number, amount: number): void {
  if (by < 0 || s.cars[by] === c) return;
  c.grudge[by] = Math.min(GRUDGE.max, c.grudge[by] + amount * c.driver.aggression);
}

/** A blast: the car loses speed, takes a kick on the yaw, and its tyres have little grip for a moment. */
export function spin(s: SimState, c: Car, k: number): void {
  c.spin = SPIN_TIME;
  c.vx *= k;
  c.vy *= k;
  // the new model carries a spin on saturated tyres where the old one stopped it dead, so it is kicked
  // less: a blast costs about the same ground in both (tools/dbg/spin.ts measures it)
  const kick = s.physics === 'old' ? 5 : 3;
  c.yaw += (Math.sin(s.time * 13 + c.x) >= 0 ? 1 : -1) * kick;
  if (c === s.cars[0]) s.sounds.push('spin');
}

export function boom(s: SimState, x: number, y: number, shake: number): void {
  s.fx.push({ kind: 'boom', x, y, age: 0 });
  s.sounds.push('boom');
  s.shake = Math.max(s.shake, shake);
}

/**
 * Two cars met at `closing` m/s along the normal (nx, ny), pointing from
 * car i to car j. Below RAM.minClosing it is a touch; above it, the one
 * whose nose points along the contact rammed the other: damage both ways,
 * the heavier and better armoured doing more, a grudge, nitro for the
 * rammer, and past RAM.spinClosing the victim is thrown and the rammer
 * paid. `throwVictim` is how the car model throws a car: the old one
 * kicks the yaw; in the new one the impulse has turned it already, and
 * the throw only loosens its tyres for a moment.
 */
export function ram(s: SimState, i: number, j: number, closing: number, nx: number, ny: number, x: number, y: number, throwVictim: (victim: Car) => void): void {
  const a = s.cars[i];
  const b = s.cars[j];
  a.hit = b.hit = 1;
  if (closing < RAM.minClosing) return;
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
    throwVictim(victim);
    anger(s, victim, ri, GRUDGE.spin);
    // a shove that spins someone pays on the spot, the small change of a wreck's bounty
    const credit = RAM_CREDIT * (CLASS_RANK[victim.def.cls] + 1);
    rammer.ramCash += credit;
    if (rammer === s.cars[0]) s.toasts.push({ text: { fi: `${victim.driver.name.fi} pyörähti! +${credit} cr`, en: `${victim.driver.name.en} spun! +${credit} cr` }, colour: '#ffd870', age: 0 });
  }
  s.fx.push({ kind: 'spark', x, y, age: 0 });
  if (i === 0 || j === 0) {
    s.sounds.push(closing > RAM.spinClosing ? 'crunch' : 'bump');
    s.shake = Math.max(s.shake, Math.min(0.6, closing / 25));
  }
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
