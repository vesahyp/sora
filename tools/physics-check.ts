/**
 * npm run physics-check: the car model's promises, each one a set piece
 * on a test track with numbers to meet. Run by `make check`. The set
 * pieces are the ones `make drive-log` drives by touch on a phone; this
 * is the same thing headless, fast, and asserted.
 *
 * Every piece runs on the new model. The old one (?physics=old) is only
 * checked to still drive, for the one release it is kept.
 */
import { createState, type Car, type SimState } from '../src/game/state';
import { step, DT } from '../src/game/sim';
import { overlap } from '../src/game/physics';
import { CARS } from '../src/game/content/cars';
import type { CarInput, TrackDef } from '../src/game/types';

declare const process: { exitCode?: number };

let failed = false;
const assert = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const f = (x: number, n = 1) => x.toFixed(n);

/** an oval: two straights of 400 m and two wide bends, so a set piece has room */
function oval(width: number, extra: Partial<TrackDef> = {}): TrackDef {
  const pts: [number, number][] = [];
  for (let x = 0; x < 400; x += 50) pts.push([x, 0]);
  for (let k = 0; k <= 6; k++) pts.push([400 + 120 * Math.sin((k / 6) * Math.PI), 120 - 120 * Math.cos((k / 6) * Math.PI)]);
  for (let x = 350; x > 0; x -= 50) pts.push([x, 240]);
  for (let k = 1; k < 6; k++) pts.push([-120 * Math.sin((k / 6) * Math.PI), 120 + 120 * Math.cos((k / 6) * Math.PI)]);
  return { id: 'test', name: { fi: 'testi', en: 'test' }, width, surface: 'gravel', points: pts, ...extra };
}

const kortteli = CARS[0];

/** a state with the player only, lights already out, the car at s on the lap at speed, angled `off` from the road */
function setup(track: TrackDef, at: { s: number; v: number; d?: number; off?: number }, car = kortteli, rivals = 0): SimState {
  const opp = Array.from({ length: rivals }, () => ({ driver: { name: { fi: 'R', en: 'R' }, skill: 1, aggression: 1, colour: '#888' }, car }));
  const s = createState(track, car, 99, opp);
  s.hold = -10;
  place(s, s.cars[0], at);
  for (const o of s.cars.slice(1)) place(s, o, { s: at.s + 300, v: 0 });
  return s;
}

function place(s: SimState, c: Car, at: { s: number; v: number; d?: number; off?: number }): void {
  const p = s.track.at(at.s);
  const d = at.d ?? 0;
  const h = Math.atan2(p.ty, p.tx) + (at.off ?? 0);
  Object.assign(c, { x: p.x - p.ty * d, y: p.y + p.tx * d, heading: h, vx: Math.cos(h) * at.v, vy: Math.sin(h) * at.v, yaw: 0, steer: 0, s: at.s, d });
}

const go = (steer = 0, throttle = 1, brake = 0): CarInput => ({ steer, throttle, brake, boost: false });
const speed = (c: Car) => Math.hypot(c.vx, c.vy);
const run = (s: SimState, seconds: number, inputs: (t: number) => CarInput[], each?: (t: number) => void) => {
  const t0 = s.time;
  while (s.time - t0 < seconds - 1e-9) {
    step(s, inputs(s.time - t0), DT);
    each?.(s.time - t0);
  }
};

// 1. hands off: a straight line holds
{
  const s = setup(oval(40), { s: 60, v: 25 });
  const c = s.cars[0];
  const h0 = c.heading;
  const [x0, y0] = [c.x, c.y];
  let maxYaw = 0;
  run(s, 4, () => [go()], () => (maxYaw = Math.max(maxYaw, Math.abs(c.yaw))));
  // sideways from the line the car started on
  const drift = (c.x - x0) * -Math.sin(h0) + (c.y - y0) * Math.cos(h0);
  assert(maxYaw < 0.005 && Math.abs(c.heading - h0) < 0.005 && Math.abs(drift) < 0.05, `hands off at 90 km/h the car holds a straight line (yaw ${f(maxYaw, 4)} rad/s, heading ${f(c.heading - h0, 4)} rad, drift ${f(drift, 3)} m over ${f(Math.hypot(c.x - x0, c.y - y0), 0)} m)`);
}

// 2. full lock at speed: the car slides, and let go it recovers
for (const car of CARS) {
  const s = setup(oval(160), { s: 20, v: 25, d: -15 }, car);
  const c = s.cars[0];
  let maxSlip = 0;
  let h0 = c.heading;
  run(s, 1, () => [go(1)], () => (maxSlip = Math.max(maxSlip, Math.abs(c.slipAngle))));
  const turned = c.heading - h0;
  h0 = c.heading;
  let settled = -1;
  run(s, 3, () => [go(0)], (t) => {
    if (settled < 0 && Math.abs(c.yaw) < 0.1 && Math.abs(c.slipAngle) < 0.05) settled = t;
  });
  assert(maxSlip > 0.1, `${car.id}: a second of full lock at 90 km/h slides the car (body slip up to ${f(maxSlip, 2)} rad, turned ${f(turned, 2)} rad)`);
  assert(settled >= 0 && settled < 2, `${car.id}: let go, the slide recovers by itself (straight in ${f(settled, 2)} s, at ${f(speed(c) * 3.6, 0)} km/h)`);
  assert(Math.abs(c.heading - h0) < Math.PI / 2, `${car.id}: and it does not spin (${f(c.heading - h0, 2)} rad after letting go)`);
}

// 3. a pedal stab at half lock swings the tail, and let go the car comes back
{
  const s = setup(oval(160), { s: 20, v: 22, d: -15 });
  const c = s.cars[0];
  let maxSlip = 0;
  const h0 = c.heading;
  run(s, 0.35, () => [go(0.5, 0, 1)], () => (maxSlip = Math.max(maxSlip, Math.abs(c.slipAngle))));
  let settled = -1;
  run(s, 3, () => [go(0)], (t) => {
    maxSlip = Math.max(maxSlip, Math.abs(c.slipAngle));
    if (settled < 0 && Math.abs(c.yaw) < 0.1 && Math.abs(c.slipAngle) < 0.05) settled = t;
  });
  const turned = c.heading - h0;
  assert(maxSlip > 0.3, `the pedal at half lock throws the tail out (body slip up to ${f(maxSlip, 2)} rad)`);
  assert(turned > 0.5 && turned < 2.4, `and turns the car a corner's worth, not a spin (${f(turned, 2)} rad)`);
  assert(settled >= 0 && settled < 2.5 && speed(c) > 8, `and let go it straightens itself (in ${f(settled, 2)} s, at ${f(speed(c) * 3.6, 0)} km/h)`);
}

// 3b. the same stab with the thumb still held through the slide: a handbrake corner, not a spin
{
  const s = setup(oval(160), { s: 20, v: 22, d: -15 });
  const c = s.cars[0];
  const h0 = c.heading;
  run(s, 0.35, () => [go(0.35, 0, 1)]);
  run(s, 0.6, () => [go(0.35)]);
  let settled = -1;
  run(s, 3, () => [go(0)], (t) => {
    if (settled < 0 && Math.abs(c.yaw) < 0.1 && Math.abs(c.slipAngle) < 0.05) settled = t;
  });
  const turned = c.heading - h0;
  assert(turned > 0.9 && turned < 2.2 && settled >= 0 && settled < 2, `the pedal with the thumb held through the slide turns a hairpin's worth and stops there (${f(turned, 2)} rad, straight ${f(settled, 2)} s after letting go, at ${f(speed(c) * 3.6, 0)} km/h)`);
}

// 4. walls: a glancing hit slides along; a steep one bounces off; neither stops the car dead
for (const [deg, keep] of [[15, 0.8], [40, 0.4]] as const) {
  const s = setup(oval(6), { s: 100, v: 25, d: 7, off: (deg * Math.PI) / 180 });
  const c = s.cars[0];
  let before = speed(c);
  let at = -1;
  let after = -1;
  let deepest = 0;
  // coasting, so the engine does not hide what the hit took
  run(s, 2, () => [go(0, 0)], (t) => {
    if (c.hit && at < 0) at = t;
    if (at < 0) before = speed(c);
    // half a second after the hit
    if (at >= 0 && after < 0 && t - at >= 0.5) after = speed(c);
    const limit = s.track.width / 2 + s.track.verge;
    deepest = Math.max(deepest, Math.abs(c.d) - limit);
  });
  const p = s.track.at(c.s);
  const angle = Math.abs(Math.atan2(Math.sin(c.heading - Math.atan2(p.ty, p.tx)), Math.cos(c.heading - Math.atan2(p.ty, p.tx))));
  assert(at >= 0 && after > before * keep, `a ${deg} degree hit on the trees at 90 km/h keeps ${f((after / before) * 100, 0)}% of the speed (needs ${keep * 100}%), the car ${f((angle * 180) / Math.PI, 0)} degrees off the road's line`);
  assert(deepest < 0.05, `and the car never goes into the trees (centre at most ${f(deepest, 3)} m past the line)`);
}

// 5. car against car: no overlap after the contact, no jumps, both cars pushed, momentum kept
const pieces: { name: string; me: { v: number; d?: number; off?: number }; it: { ahead: number; v: number; d?: number; off?: number }; steer?: number }[] = [
  { name: 'rear-end at 85 against 35 km/h', me: { v: 24 }, it: { ahead: 10, v: 10 } },
  { name: 'side swipe at 70 km/h', me: { v: 20, d: -1.1 }, it: { ahead: 0.3, v: 20, d: 1.1 }, steer: 0.5 },
  { name: 'T-bone at 70 km/h', me: { v: 20 }, it: { ahead: 9, v: 0, off: Math.PI / 2 } },
  { name: 'head-on at 50 km/h each', me: { v: 14 }, it: { ahead: 12, v: 14, off: Math.PI, d: 0.6 } },
];
for (const p of pieces) {
  const s = setup(oval(20), { s: 20, ...p.me }, kortteli, 1);
  const me = s.cars[0];
  const it = s.cars[1];
  place(s, it, { s: 20 + p.it.ahead, v: p.it.v, d: p.it.d, off: p.it.off });
  it.missiles = it.mines = 0;
  const mom0 = [me.vx * me.def.mass + it.vx * it.def.mass, me.vy * me.def.mass + it.vy * it.def.mass];
  let contact = -1;
  let worst = 0;
  let late = 0;
  let jumps = 0;
  let itYaw = 0;
  let prev = [me.x, me.y, it.x, it.y];
  let vPrev = [speed(me), speed(it)];
  let mom1 = mom0;
  run(s, 1.5, () => [go(p.steer ?? 0, 0), go(0, 0)], (t) => {
    const o = overlap(me, it);
    const depth = o ? o.depth : 0;
    if (o && contact < 0) {
      contact = t;
    }
    if (contact >= 0) {
      worst = Math.max(worst, depth);
      if (t - contact > 0.1) late = Math.max(late, depth);
      itYaw = Math.max(itYaw, Math.abs(it.yaw));
      if (t - contact < 0.05) mom1 = [me.vx * me.def.mass + it.vx * it.def.mass, me.vy * me.def.mass + it.vy * it.def.mass];
    }
    for (const [k, c] of [me, it].entries()) {
      const moved = Math.hypot(c.x - prev[k * 2], c.y - prev[k * 2 + 1]);
      if (moved > Math.max(speed(c), vPrev[k]) * DT + 0.05) jumps++;
    }
    prev = [me.x, me.y, it.x, it.y];
    vPrev = [speed(me), speed(it)];
  });
  // against the sum of both cars' momentum, so a head-on whose total is near zero is measured fairly
  const dMom = Math.hypot(mom1[0] - mom0[0], mom1[1] - mom0[1]) / (speed(me) * 0 + p.me.v * me.def.mass + p.it.v * it.def.mass);
  console.log(`  ${p.name}: contact at ${f(contact, 2)} s, deepest ${f(worst, 3)} m, after 0.1 s ${f(late, 3)} m, me ${f(speed(me) * 3.6, 0)} km/h, it ${f(speed(it) * 3.6, 0)} km/h spun to ${f(itYaw, 2)} rad/s`);
  assert(contact >= 0, `${p.name}: the cars meet`);
  assert(worst < 0.12 && late < 0.02, `${p.name}: the bodies never sink into each other (deepest ${f(worst, 3)} m, ${f(late, 3)} m after a tenth)`);
  assert(jumps === 0, `${p.name}: nothing jumps on contact (${jumps} jumps)`);
  assert(dMom < 0.12, `${p.name}: the hit keeps the pair's momentum (${f(dMom * 100, 0)}% change over the contact)`);
}
{
  const s = setup(oval(20), { s: 20, v: 20 }, kortteli, 1);
  const it = s.cars[1];
  place(s, it, { s: 29, v: 0, off: Math.PI / 2, d: 1.2 });
  let itYaw = 0;
  let itV = 0;
  run(s, 1, () => [go(), go(0, 0)], () => {
    itYaw = Math.max(itYaw, Math.abs(it.yaw));
    itV = Math.max(itV, speed(it));
  });
  assert(itV > 5 && itYaw > 1 && itYaw < 7, `a hit off the other car's middle shoves it and spins it (up to ${f(itV * 3.6, 0)} km/h and ${f(itYaw, 2)} rad/s)`);
}

// 6. a pack: four cars driven into each other on a narrow road never overlap for long
{
  const s = setup(oval(6), { s: 20, v: 24, d: -1 }, kortteli, 3);
  place(s, s.cars[1], { s: 26, v: 14, d: 1 });
  place(s, s.cars[2], { s: 30, v: 12, d: -1.2 });
  place(s, s.cars[3], { s: 34, v: 10, d: 0.8 });
  let late = 0;
  let steps = 0;
  run(s, 3, () => s.cars.map((_, k) => go(k % 2 ? -0.3 : 0.3)), () => {
    steps++;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const o = overlap(s.cars[i], s.cars[j]);
      if (o) late = Math.max(late, o.depth);
    }
  });
  assert(late < 0.12, `a pack of four on a road three cars wide: bodies never more than ${f(late, 3)} m into each other`);
}

// 7. a jump: off the lip the car flies, cannot steer, lands; a crooked landing costs more
{
  const fly = (yaw: number) => {
    const s = setup(oval(10, { jumps: [{ s: 60, len: 8, h: 1.2 }] }), { s: 20, v: 30 });
    const c = s.cars[0];
    let air = 0;
    let top = 0;
    let steered = 0;
    let landed = -1;
    run(s, 1.2, () => [go()]);
    const vBefore = speed(c);
    run(s, 2.5, () => [go(c.air ? 1 : 0)], (t) => {
      if (c.air) {
        if (air === 0 && yaw) c.yaw = yaw;
        air += DT;
        top = Math.max(top, c.z);
        steered = Math.max(steered, Math.abs(c.yaw - yaw * Math.pow(1 - 0.3 / 180, (air / DT) * 3)));
      } else if (air > 0 && landed < 0) landed = t;
    });
    return { air, top, vBefore, v: speed(c), steered };
  };
  const straight = fly(0);
  const crooked = fly(1.2);
  assert(straight.air > 0.4 && straight.top > 1.5, `a 1.2 m kicker at 108 km/h throws the car (${f(straight.air, 2)} s in the air, ${f(straight.top, 2)} m up)`);
  assert(straight.steered < 0.05, `full lock in the air turns nothing (${f(straight.steered, 3)} rad/s of yaw from it)`);
  assert(straight.v > straight.vBefore * 0.85, `a straight landing keeps the speed (${f(straight.vBefore * 3.6, 0)} -> ${f(straight.v * 3.6, 0)} km/h)`);
  assert(crooked.v < straight.v - 2, `a crooked landing costs more (${f(crooked.v * 3.6, 0)} against ${f(straight.v * 3.6, 0)} km/h)`);
}

// 8. surfaces: water drags and splashes, ice slides further, the road's edge blends
{
  const s = setup(oval(10, { patches: [{ surface: 'water', s: 60, to: 80 }] }), { s: 20, v: 25 });
  const c = s.cars[0];
  let splashes = 0;
  let vIn = 0;
  run(s, 3, () => [go()], () => {
    if (c.surface === 'water' && !vIn) vIn = speed(c);
    splashes += s.fx.filter((x) => x.kind === 'splash' && x.age <= DT + 1e-9).length;
  });
  const dry = setup(oval(10), { s: 20, v: 25 });
  run(dry, 3, () => [go()]);
  assert(splashes > 3 && speed(c) < speed(dry.cars[0]) - 3, `a ford: the water throws spray (${splashes}) and costs speed (${f(speed(c) * 3.6, 0)} against ${f(speed(dry.cars[0]) * 3.6, 0)} km/h dry)`);
  const ice = setup(oval(160, { patches: [{ surface: 'ice', s: 0, to: 400 }] }), { s: 20, v: 20, d: -15 });
  const gravel = setup(oval(160), { s: 20, v: 20, d: -15 });
  const [hi, hg] = [ice.cars[0].heading, gravel.cars[0].heading];
  let slipIce = 0;
  let slipGravel = 0;
  run(ice, 1, () => [go(0.6)], () => (slipIce = Math.max(slipIce, Math.abs(ice.cars[0].slipAngle))));
  run(gravel, 1, () => [go(0.6)], () => (slipGravel = Math.max(slipGravel, Math.abs(gravel.cars[0].slipAngle))));
  const [ti, tg] = [ice.cars[0].heading - hi, gravel.cars[0].heading - hg];
  assert(slipIce > slipGravel && ti < tg * 0.8, `ice slides where gravel grips (body slip ${f(slipIce, 2)} against ${f(slipGravel, 2)} rad, turned ${f(ti, 2)} against ${f(tg, 2)} rad)`);
}

// 9. the old model still drives, for its one release
{
  const s = createState(oval(10), kortteli, 1, [], undefined, 'old');
  s.hold = -10;
  run(s, 2, () => [go()]);
  assert(speed(s.cars[0]) > 10, `?physics=old still drives (${f(speed(s.cars[0]) * 3.6, 0)} km/h after 2 s)`);
}

console.log('');
if (failed) {
  console.log('physics-check failed');
  process.exitCode = 1;
} else console.log('physics-check ok');
