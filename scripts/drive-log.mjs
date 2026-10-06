// Drives the car by touch on an emulated phone through five set pieces and
// logs what the physics did, frame by frame: speed, yaw rate, body slip,
// the wheel, contacts with the trees and with another car, and how far two
// car bodies overlap. This is how a physics change is read before it is
// felt: `make drive-log` (PHYSICS=old for the previous model). Needs
// `make shots-setup`. Prints a summary per set piece; the frames go to
// shots/drive-log-<physics>.json.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// the car model's name, for the log file: Rapier since 2026-10-06 (ADR 0005)
const physics = 'rapier';
const port = 5198;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(GPU);
const page = await (await browser.newContext({ ...devices['iPhone 15'], hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// the sampler, in the page: one row a frame, the player and the nearest other car
const SAMPLER = () => {
  // separating axis on two rectangles: the depth of the overlap, 0 when apart
  const corners = (c) => {
    const f = [Math.cos(c.heading), Math.sin(c.heading)];
    const r = [-f[1], f[0]];
    const hl = c.def.length / 2;
    const hw = c.def.width / 2;
    return [
      [c.x + f[0] * hl + r[0] * hw, c.y + f[1] * hl + r[1] * hw],
      [c.x + f[0] * hl - r[0] * hw, c.y + f[1] * hl - r[1] * hw],
      [c.x - f[0] * hl - r[0] * hw, c.y - f[1] * hl - r[1] * hw],
      [c.x - f[0] * hl + r[0] * hw, c.y - f[1] * hl + r[1] * hw],
    ];
  };
  const overlap = (a, b) => {
    const A = corners(a);
    const B = corners(b);
    let depth = Infinity;
    for (const c of [a, b]) {
      for (const ax of [
        [Math.cos(c.heading), Math.sin(c.heading)],
        [-Math.sin(c.heading), Math.cos(c.heading)],
      ]) {
        const pa = A.map((p) => p[0] * ax[0] + p[1] * ax[1]);
        const pb = B.map((p) => p[0] * ax[0] + p[1] * ax[1]);
        const d = Math.min(Math.max(...pa) - Math.min(...pb), Math.max(...pb) - Math.min(...pa));
        if (d <= 0) return 0;
        depth = Math.min(depth, d);
      }
    }
    return depth;
  };
  window.__log = [];
  window.__mark = '';
  const tick = () => {
    const s = window.__sim;
    if (s) {
      const c = s.cars[0];
      let near = null;
      let nd = Infinity;
      for (const o of s.cars.slice(1)) {
        if (o.wreck > 0) continue;
        const d = Math.hypot(o.x - c.x, o.y - c.y);
        if (d < nd) {
          nd = d;
          near = o;
        }
      }
      window.__log.push({
        mark: window.__mark,
        t: s.time,
        x: c.x,
        y: c.y,
        h: c.heading,
        z: c.z,
        air: c.air,
        v: Math.hypot(c.vx, c.vy),
        fwd: c.speed,
        yaw: c.yaw,
        beta: c.slipAngle,
        steer: c.steer,
        d: c.d,
        hit: c.hit,
        onRoad: c.onRoad,
        sliding: c.sliding,
        near: near ? { dist: nd, v: Math.hypot(near.vx, near.vy), yaw: near.yaw, overlap: overlap(c, near), x: near.x, y: near.y } : null,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// a thumb held at an offset from where it landed, through CDP like a real touch
const cdp = await page.context().newCDPSession(page);
let held = null;
const thumb = async (dx) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600, id: 1 }] });
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + (dx * i) / 4, y: 600, id: 1 }] });
  held = { x: 200 + dx, y: 600, id: 1 };
};
const lift = async () => {
  held = null;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const pedal = async (on) => {
  const b = await page.locator('.pedal').boundingBox();
  const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 3 };
  if (on) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: held ? [held, pt] : [pt] });
  else {
    // a finger left out of a touchMove is not lifted for the page, so lift both and put the thumb back
    const dx = held ? held.x - 200 : 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (held) await thumb(dx);
  }
};

// put the player on the lap at s, at speed, angled off the road's direction by `off` rad;
// every other car is parked in the burn so nothing else touches it, unless `rival` places one
const place = (at) =>
  page.evaluate((at) => {
    const s = window.__sim;
    const c = s.cars[0];
    const p = s.track.at(at.s);
    const h = Math.atan2(p.ty, p.tx) + (at.off ?? 0);
    const d = at.d ?? 0;
    Object.assign(c, { x: p.x - p.ty * d, y: p.y + p.tx * d, heading: h, vx: Math.cos(h) * at.v, vy: Math.sin(h) * at.v, yaw: 0, spin: 0, steer: 0, damage: 0 });
    s.cars.slice(1).forEach((o, k) => {
      const q = s.track.at(at.s + 200 + k * 30);
      Object.assign(o, { x: q.x, y: q.y, vx: 0, vy: 0, yaw: 0, wreck: 1e9 });
    });
    if (at.rival) {
      const o = s.cars[1];
      const q = s.track.at(at.s + at.rival.ahead);
      const rd = at.rival.d ?? 0;
      const rh = Math.atan2(q.ty, q.tx) + (at.rival.off ?? 0);
      Object.assign(o, { x: q.x - q.ty * rd, y: q.y + q.tx * rd, heading: rh, vx: Math.cos(rh) * at.rival.v, vy: Math.sin(rh) * at.rival.v, yaw: 0, spin: 0, wreck: 0, damage: 0, missiles: 0, mines: 0 });
    }
    window.__mark = at.name;
  }, at);

// the longest straight on the lap: where the set pieces are run
const straight = () =>
  page.evaluate(() => {
    const t = window.__sim.track;
    let best = { s: 0, len: 0 };
    let start = 0;
    for (let s = 0; s < t.length + 200; s += 2) {
      if (Math.abs(t.curvatureAhead(s % t.length, 10)) > 0.08) {
        if (s - start > best.len) best = { s: start % t.length, len: s - start };
        start = s + 2;
      }
    }
    return best;
  });

const pieces = [];
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  await page.getByRole('button', { name: 'Drive', exact: true }).tap();
  await page.getByRole('button', { name: 'Races', exact: true }).tap();
  await page.locator('.card.event').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.hold <= 0, null, { timeout: 20000 });
  await page.evaluate(SAMPLER);
  const st = await straight();
  console.log(`physics=${physics}; the longest straight starts at s=${st.s.toFixed(0)} m, ${st.len.toFixed(0)} m long`);
  // a little way into the straight
  const S = st.s + 20;

  // 1. hands off: does a straight line hold
  await place({ name: 'hands off at 25 m/s', s: S, v: 25 });
  await page.waitForTimeout(1500);
  pieces.push('hands off at 25 m/s');

  // 2. a full-lock flick at speed, held, then let go: slide and recovery
  await place({ name: 'full lock at 25 m/s', s: S, v: 25, d: -2 });
  await thumb(130);
  await page.waitForTimeout(700);
  await lift();
  await page.waitForTimeout(1300);
  pieces.push('full lock at 25 m/s');

  // 3. half lock and a pedal stab, the handbrake turn
  await place({ name: 'half lock + pedal at 22 m/s', s: S, v: 22, d: -2 });
  await thumb(60);
  await pedal(true);
  await page.waitForTimeout(350);
  await pedal(false);
  await page.waitForTimeout(600);
  await lift();
  await page.waitForTimeout(800);
  pieces.push('half lock + pedal at 22 m/s');

  // 4. a glancing hit on the tree line at 25 m/s, 15 degrees in, hands off
  await place({ name: 'glancing tree hit, 15 deg', s: S, v: 25, d: 6, off: 0.26 });
  await page.waitForTimeout(1800);
  pieces.push('glancing tree hit, 15 deg');

  // 5. a steeper hit, 40 degrees in
  await place({ name: 'tree hit, 40 deg', s: S, v: 22, d: 6, off: 0.7 });
  await page.waitForTimeout(1500);
  pieces.push('tree hit, 40 deg');

  // 6. a rear-end shunt into a slower car
  await place({ name: 'rear-end at 24 vs 10 m/s', s: S, v: 24, rival: { ahead: 10, v: 10 } });
  await page.waitForTimeout(1500);
  pieces.push('rear-end at 24 vs 10 m/s');

  // 7. side by side, steering into the other car
  await place({ name: 'side swipe at 20 m/s', s: S, v: 20, d: -1.4, rival: { ahead: 0.5, v: 20, d: 1.4 } });
  await thumb(70);
  await page.waitForTimeout(600);
  await lift();
  await page.waitForTimeout(800);
  pieces.push('side swipe at 20 m/s');

  // 8. a T-bone: the rival across the road, the player into its door
  await place({ name: 'T-bone at 20 m/s', s: S, v: 20, rival: { ahead: 12, v: 2, off: 1.57 } });
  await page.waitForTimeout(1500);
  pieces.push('T-bone at 20 m/s');

  // 9. the first river at racing speed, hands off: the flight over the water and the landing
  const river = await page.evaluate(() => window.__sim.track.def.rivers?.[0]?.s ?? -1);
  if (river >= 0) {
    await place({ name: 'the river at 26 m/s', s: river - 40, v: 26 });
    await page.waitForTimeout(3000);
    pieces.push('the river at 26 m/s');
  }

  const log = await page.evaluate(() => window.__log);
  mkdirSync('shots', { recursive: true });
  writeFileSync(`shots/drive-log-${physics}.json`, JSON.stringify(log));
  const f = (x, n = 1) => (x >= 0 ? ' ' : '') + x.toFixed(n);
  for (const name of pieces) {
    const rows = log.filter((r) => r.mark === name);
    if (!rows.length) continue;
    console.log(`\n== ${name} (${rows.length} frames)`);
    const v0 = rows[2]?.v ?? rows[0].v;
    const firstHit = rows.findIndex((r) => r.hit);
    const contacts = rows.filter((r) => r.hit).length;
    const maxOverlap = Math.max(0, ...rows.map((r) => r.near?.overlap ?? 0));
    const vMin = Math.min(...rows.map((r) => r.v));
    const vEnd = rows[rows.length - 1].v;
    const maxYaw = Math.max(...rows.map((r) => Math.abs(r.yaw)));
    const maxBeta = Math.max(...rows.map((r) => Math.abs(r.beta)));
    let jumps = 0;
    for (let i = 1; i < rows.length; i++) {
      const dt = rows[i].t - rows[i - 1].t;
      const moved = Math.hypot(rows[i].x - rows[i - 1].x, rows[i].y - rows[i - 1].y);
      if (dt > 0 && moved > rows[i - 1].v * dt * 1.5 + 0.15) jumps++;
    }
    // yaw sign flips while sliding: grip switching on and off
    let flips = 0;
    for (let i = 1; i < rows.length; i++) if (Math.sign(rows[i].yaw) !== Math.sign(rows[i - 1].yaw) && Math.abs(rows[i].yaw) > 0.3 && Math.abs(rows[i - 1].yaw) > 0.3) flips++;
    console.log(`  speed ${f(v0)} -> min ${f(vMin)} -> end ${f(vEnd)} m/s; contact frames ${contacts}${firstHit >= 0 ? ` from t+${(rows[firstHit].t - rows[0].t).toFixed(2)} s` : ''}`);
    console.log(`  max yaw ${maxYaw.toFixed(2)} rad/s, max body slip ${maxBeta.toFixed(2)} rad, yaw sign flips at > 0.3 rad/s: ${flips}, position jumps: ${jumps}, worst body overlap ${maxOverlap.toFixed(2)} m`);
    const airRows = rows.filter((r) => r.air);
    if (airRows.length) {
      const lipRow = rows[rows.indexOf(airRows[0]) - 1] ?? airRows[0];
      const landRow = rows[rows.indexOf(airRows[airRows.length - 1]) + 1] ?? airRows[airRows.length - 1];
      console.log(`  flight: off the lip at ${(lipRow.v * 3.6).toFixed(0)} km/h, ${(landRow.t - lipRow.t).toFixed(2)} s in the air, ${Math.max(...airRows.map((r) => r.z)).toFixed(2)} m up, landed ${Math.abs(landRow.d).toFixed(1)} m off the centreline (${landRow.onRoad ? 'on the road' : 'OFF THE ROAD'}) at ${(landRow.v * 3.6).toFixed(0)} km/h`);
    }
    if (firstHit >= 0) {
      const a = Math.max(0, firstHit - 3);
      for (const r of rows.slice(a, firstHit + 12)) console.log(`   t ${r.t.toFixed(3)}  v ${f(r.v)}  fwd ${f(r.fwd)}  yaw ${f(r.yaw, 2)}  beta ${f(r.beta, 2)}  d ${f(r.d, 2)}  hit ${r.hit}${r.near ? `  other v ${f(r.near.v)} gap ${r.near.dist.toFixed(2)} overlap ${r.near.overlap.toFixed(2)}` : ''}`);
    } else {
      for (const r of rows.filter((_, i) => i % 6 === 0)) console.log(`   t ${r.t.toFixed(3)}  v ${f(r.v)}  yaw ${f(r.yaw, 2)}  beta ${f(r.beta, 2)}  steer ${f(r.steer, 2)}  d ${f(r.d, 2)}  slide ${r.sliding ? 1 : 0}  road ${r.onRoad ? 1 : 0}`);
    }
  }
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
