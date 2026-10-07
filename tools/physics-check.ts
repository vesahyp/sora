/**
 * npm run physics-check: the car model's promises, each one a set piece
 * on a test track with numbers to meet. Run by `make check`. The set
 * pieces are the ones `make drive-log` drives by touch on a phone; this
 * is the same thing headless, fast, and asserted.
 *
 * The model is Rapier's raycast vehicle (ADR 0005); the promises are in
 * its terms: yaw rate, slip angle, speed kept.
 */
import { createState, type Car, type SimState } from '../src/game/state';
import { step, DT } from '../src/game/sim';
import { initPhysics, overlap } from '../src/game/physics';
import { CARS, CAR_BY_ID } from '../src/game/content/cars';
import type { CarInput, TrackDef } from '../src/game/types';

declare const process: { exitCode?: number };

await initPhysics();

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

const kortteli = CAR_BY_ID.kortteli;

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

const responses: number[] = [];
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

// 2. full lock at speed: a held turn, not a spin, and let go it recovers: the lock falls with speed
// (rig.ts, lockAt) and the rear tyres are stiffer than the front, so the car is stable at the limit
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
  assert(turned > 0.3 && maxSlip < 0.6, `${car.id}: a second of full lock at 90 km/h turns the car, not a spin (turned ${f(turned, 2)} rad, body slip up to ${f(maxSlip, 2)} rad)`);
  assert(settled >= 0 && settled < 2, `${car.id}: let go, the slide recovers by itself (straight in ${f(settled, 2)} s, at ${f(speed(c) * 3.6, 0)} km/h)`);
  assert(Math.abs(c.heading - h0) < Math.PI / 2, `${car.id}: and it does not spin (${f(c.heading - h0, 2)} rad after letting go)`);
}

// 2b. the wheel answers the thumb: a swing of the thumb at 70 km/h, and the yaw rate follows the
// wheel within a fifth of a second, and a bigger swing turns harder. At the tyres' limit (a big
// swing) the turn-in peaks a third over what the car then holds as the front saturates, with the
// body barely sliding: a turn-in, not a snap. The owner's complaint of 2026-10-06 was a car that
// did nothing, then snapped
for (const share of [0.15, 0.3, 0.6]) {
  const s = setup(oval(160), { s: 20, v: 70 / 3.6, d: -15 }, CAR_BY_ID.tauno);
  const c = s.cars[0];
  const yaws: number[] = [];
  let body = 0;
  run(s, 1.2, () => [go(share)], () => {
    yaws.push(Math.abs(c.yaw));
    body = Math.max(body, Math.abs(c.slipAngle));
  });
  const settled = yaws[yaws.length - 1];
  const reach = yaws.findIndex((y) => y >= settled * 0.63) * DT;
  const peak = Math.max(...yaws);
  responses.push(settled);
  assert(reach <= 0.2 && peak <= settled * 1.35 && body < 0.1, `the Tauno at 70 km/h, a ${share * 100}% swing: the yaw rate reaches 63% of its ${f(settled, 2)} rad/s in ${f(reach, 2)} s, peaks at ${f(peak / settled, 2)} of it, the body slides ${f(body, 2)} rad`);
}
assert(responses[0] < responses[1] && responses[1] < responses[2], `a bigger swing turns harder (${responses.map((y) => f(y, 2)).join(', ')} rad/s)`);

// 3. a pedal stab at half lock in the Tauno at 80 km/h swings the tail, and let go the car comes back
{
  const s = setup(oval(160), { s: 20, v: 22, d: -15 }, CAR_BY_ID.tauno);
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
  assert(maxSlip > 0.1, `the pedal at half lock brakes the rear hard and swings the tail (body slip up to ${f(maxSlip, 2)} rad)`);
  // let go, the rear tyres bring the tail back: a stab turns a kink's worth and comes back; the
  // hairpin's worth is the thumb held through the slide, 3b below
  assert(turned > 0.3 && turned < 2.4, `and turns the car, not a spin (${f(turned, 2)} rad)`);
  assert(settled >= 0 && settled < 2.5 && speed(c) > 8, `and let go it straightens itself (in ${f(settled, 2)} s, at ${f(speed(c) * 3.6, 0)} km/h)`);
}

// 3b. the same stab with the thumb still held through the slide: a handbrake corner, not a spin
{
  const s = setup(oval(160), { s: 20, v: 22, d: -15 }, CAR_BY_ID.tauno);
  const c = s.cars[0];
  const h0 = c.heading;
  run(s, 0.35, () => [go(0.5, 0, 1)]);
  run(s, 0.6, () => [go(0.5)]);
  let settled = -1;
  run(s, 3, () => [go(0)], (t) => {
    if (settled < 0 && Math.abs(c.yaw) < 0.1 && Math.abs(c.slipAngle) < 0.05) settled = t;
  });
  const turned = c.heading - h0;
  assert(turned > 0.6 && turned < 2.2 && settled >= 0 && settled < 2, `the pedal with the thumb held through the slide turns a sharp bend's worth and stops there (${f(turned, 2)} rad, straight ${f(settled, 2)} s after letting go, at ${f(speed(c) * 3.6, 0)} km/h)`);
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
  it.missiles = it.mines = it.oil = 0;
  const mom0 = [me.vx * me.def.mass + it.vx * it.def.mass, me.vy * me.def.mass + it.vy * it.def.mass];
  let contact = -1;
  let worst = 0;
  let late = 0;
  let jumps = 0;
  let itYaw = 0;
  let prev = [me.x, me.y, it.x, it.y];
  let vPrev = [speed(me), speed(it)];
  let mom1 = mom0;
  // the contact is the first step the boxes touch, within a few centimetres: the substeps can
  // resolve a hit before the step ends, so a bare overlap test misses it on some footprints
  const grown = { ...me, def: { ...me.def, length: me.def.length + 0.06, width: me.def.width + 0.06 } };
  run(s, 1.5, () => [go(p.steer ?? 0, 0), go(0, 0)], (t) => {
    const o = overlap(me, it);
    const depth = o ? o.depth : 0;
    if (contact < 0 && overlap(Object.assign(grown, { x: me.x, y: me.y, heading: me.heading }), it)) {
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
  // 3 cm after a tenth: Rapier keeps a skin of overlap while one car steers into the other, 2.3 cm in the swipe
  assert(worst < 0.12 && late < 0.03, `${p.name}: the bodies never sink into each other (deepest ${f(worst, 3)} m, ${f(late, 3)} m after a tenth)`);
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

// 7. a crest: fast over it the car flies, cannot steer, lands; a crooked landing costs more; slow it is only lifted
{
  const crest = { crests: [{ s: 60, len: 24, h: 0.9 }] };
  const fly = (v: number, yaw: number, throttle = 1) => {
    const s = setup(oval(10, crest), { s: 20, v });
    const c = s.cars[0];
    let air = 0;
    let top = 0;
    let steered = 0;
    let yaw0 = 0;
    run(s, 0.6, () => [go(0, throttle)]);
    const vBefore = speed(c);
    run(s, 2.5, () => [go(c.air ? 1 : 0, throttle)], () => {
      top = Math.max(top, c.z);
      if (c.air) {
        if (air === 0) {
          if (yaw) c.yaw = yaw;
          yaw0 = c.yaw;
        }
        // a whole step in the air: what the wheel turned of the yaw it took off with
        else steered = Math.max(steered, Math.abs(c.yaw - yaw0));
        air += DT;
      }
    });
    return { air, top, vBefore, v: speed(c), steered };
  };
  const straight = fly(32, 0);
  const crooked = fly(32, 1.2);
  const slow = fly(15, 0, 0);
  assert(straight.air > 0.5 && straight.top > 0.9, `a 0.9 m crest at ${f(32 * 3.6, 0)} km/h throws the car (${f(straight.air, 2)} s in the air, ${f(straight.top, 2)} m up)`);
  assert(slow.air === 0 && slow.top > 0.85, `the same crest at ${f(15 * 3.6, 0)} km/h only lifts it (${f(slow.air, 2)} s in the air, up to ${f(slow.top, 2)} m with the ground)`);
  assert(straight.steered < 0.05, `full lock in the air turns nothing (${f(straight.steered, 3)} rad/s of yaw from it)`);
  assert(straight.v > straight.vBefore * 0.85, `a straight landing keeps the speed (${f(straight.vBefore * 3.6, 0)} -> ${f(straight.v * 3.6, 0)} km/h)`);
  assert(crooked.v < straight.v - 2, `a crooked landing costs more (${f(crooked.v * 3.6, 0)} against ${f(straight.v * 3.6, 0)} km/h)`);
}

// 7b. a river: the Tauno flat out clears the folk loops' 8 m river and comes down on the road past
// it; at a crawl it drops in, splashes, and drives out up the far bank. (The Tauno is slow since
// 2026-10-05 and never races Kiviaho's 12 m river; sim-check jumps each river with the cars of
// the classes that race there)
{
  const tauno = CAR_BY_ID.tauno;
  const river = { s: 100, gap: 8, bank: 0.45 };
  // the throttle on from the start flat out; coasting to the lip at half speed, then on to drive out
  const jump = (v: number, from: number, coast = false) => {
    const s = setup(oval(6, { rivers: [river] }), { s: from, v }, tauno);
    const c = s.cars[0];
    let lip = -1;
    let down: { s: number; d: number; wet: boolean } | null = null;
    let wetAt = -1;
    let outAt = -1;
    let splashes = 0;
    let wasAir = false;
    run(s, 6, () => [go(0, coast && !wasAir ? 0 : 1)], (t) => {
      if (c.air && !wasAir && lip < 0) lip = speed(c);
      if (wasAir && !down && c.air && c.vz <= 0 && c.z <= s.track.groundAt(c.s, c.d) + 0.02) down = { s: c.s - river.s, d: c.d, wet: c.surface === 'water' };
      if (wasAir && !c.air && !down) down = { s: c.s - river.s, d: c.d, wet: c.surface === 'water' };
      wasAir = wasAir || c.air;
      if (!c.air && c.surface === 'water' && c.z < -0.2 && wetAt < 0) wetAt = t;
      if (wetAt >= 0 && outAt < 0 && !c.air && c.surface !== 'water') outAt = t;
      splashes += s.fx.filter((x) => x.kind === 'splash' && x.age <= DT + 1e-9).length;
    });
    return { lip, down: down as { s: number; d: number; wet: boolean } | null, wet: wetAt >= 0, out: outAt - wetAt, splashes };
  };
  const flat = jump(tauno.topSpeed, 20);
  const half = jump(11, 80, true);
  const fd = flat.down;
  const hd = half.down;
  assert(!!fd && !flat.wet && fd.s > river.gap && Math.abs(fd.d) < 3, `the Tauno flat out (${f(flat.lip * 3.6, 0)} km/h at the lip) clears a ${river.gap} m river and lands on the road (down at +${f(fd?.s ?? 0, 1)} m, d ${f(fd?.d ?? 0, 1)})`);
  assert(!!hd && hd.wet && half.splashes > 0, `at a crawl (${f(half.lip * 3.6, 0)} km/h at the lip) it drops into the water (down at +${f(hd?.s ?? 0, 1)} m) and splashes (${half.splashes})`);
  assert(half.out > 0 && half.out < 4, `and drives out up the far bank (${f(half.out, 2)} s in the water)`);
}

// 7c. a car on its roof scrapes to a stop on the gravel rather than sliding on as on ice, and the
// marshals put it back on its wheels within two seconds (Vesa, 2026-10-07: "just slides around like on ice")
{
  const s = setup(oval(20), { s: 60, v: 14 }, CAR_BY_ID.tauno);
  const c = s.cars[0];
  const b = s.world.bodies[0];
  // a step first: placing the car is a teleport the next step puts into the body, upright
  run(s, DT, () => [go(0, 0)]);
  const p = b.body.translation();
  // upside down: half a turn about the car's own length, the body a metre up
  const h = c.heading;
  const yawQ = { w: Math.cos(h / 2), z: Math.sin(h / 2) };
  b.body.setRotation({ w: 0, x: yawQ.w, y: yawQ.z, z: 0 }, true);
  b.body.setTranslation({ x: p.x, y: p.y, z: p.z + 1 }, true);
  let upMin = 1;
  let v05 = -1;
  let righted = -1;
  run(s, 3, () => [go(0, 0)], (t) => {
    upMin = Math.min(upMin, c.up);
    if (v05 < 0 && t >= 1.4) v05 = speed(c);
    if (righted < 0 && upMin < 0 && c.up > 0.9) righted = t;
  });
  assert(upMin < -0.5 && v05 >= 0 && v05 < 14 * 0.6, `a Tauno dropped on its roof at 50 km/h scrapes down to ${f(v05 * 3.6, 0)} km/h in 1.4 s, not sliding on as on ice (on its roof: up ${f(upMin, 2)})`);
  assert(righted > 0 && righted < 2.2, `and is back on its wheels in ${f(righted, 2)} s`);
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

console.log('');
if (failed) {
  console.log('physics-check failed');
  process.exitCode = 1;
} else console.log('physics-check ok');
