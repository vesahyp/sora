// The owner got stuck at 0 km/h on open grass beside the road, on a phone in
// landscape (lap 1 of Kiviaho, the hairpin's inside). This drives that spot
// on the phone layout, with the one-thumb controls live: the car is put
// beside the road running wide into the invisible tree wall three ways
// (nose first, at an angle, side on), and for each the car must get going
// again by itself within 4 s. `make stuck-check` (PORT=5187 when another
// repo's dev server holds the default). Needs `make shots-setup`.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
// a free port of its own: 5197 is often another repo's dev server, and the check then drove that repo's page
import { createServer } from 'node:net';
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = Number(process.env.PORT) || (await freePort());
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(GPU);
const phone = devices['iPhone 15'];
const page = await (await browser.newContext({ ...phone, viewport: { width: phone.viewport.height, height: phone.viewport.width }, hasTouch: true })).newPage();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
// a thumb resting on the screen: the throttle is on, the wheel is where the thumb says
const thumb = async (dx) => {
  const cdp = await page.context().newCDPSession(page);
  const x = 500, y = 250;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 5, y, id: 1 }] });
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
};
// put the car at `s` metres along the lap, `d` metres off the centreline, pointed `angle`
// radians off the road's direction (positive is outward on the +d side), at `v` m/s
const place = (s, d, angle, v) =>
  page.evaluate(
    ([s, d, angle, v]) => {
      const st = window.__sim;
      const c = st.cars[0];
      const p = st.track.at(s);
      c.x = p.x - p.ty * d;
      c.y = p.y + p.tx * d;
      c.heading = Math.atan2(p.ty, p.tx) + angle * Math.sign(d || 1);
      c.vx = Math.cos(c.heading) * v;
      c.vy = Math.sin(c.heading) * v;
      c.yaw = 0;
      c.spin = 0;
      c.z = 0;
      c.vz = 0;
      c.stall = 0;
      c.stuck = 0;
      c.backOut = 0;
      st.toasts.length = 0;
    },
    [s, d, angle, v],
  );
const sample = () =>
  page.evaluate(() => {
    const c = window.__sim.cars[0];
    const loc = window.__sim.track.locate(c.x, c.y);
    const l = window.__sim.track.laneAt(c.x, c.y);
    const inLane = !!(l && l.dist < l.lane.width / 2 + 2);
    return { t: window.__sim.time, kmh: Math.hypot(c.vx, c.vy) * 3.6, s: loc.s, d: loc.d, inLane, stall: c.stall, stuck: c.stuck, backOut: c.backOut, toasts: window.__sim.toasts.map((x) => x.text.en).join(',') };
  });
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  // a licence lap: one car, nobody to ram the car mid-check
  await page.getByRole('button', { name: 'Drive', exact: true }).tap();
  await page.getByRole('button', { name: /Licences/ }).tap();
  await page.locator('.card.licence').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.hold <= 0 && window.__sim.time > 4, null, { timeout: 20000 });
  const cases = [
    ['nose first into the wall at the hairpin inside (the owner\'s spot)', 450, 8, 1.4, 6, 0],
    ['running wide at 45 degrees into the wall', 440, 6, 0.8, 12, 40],
    ['scraping along the wall side on, the wheel held into it', 430, 9.5, 0.15, 10, 60],
    ['nose first into the wall by the start straight', 20, -8, -1.4, 6, 0],
  ];
  for (const [name, s, d, angle, v, dx] of cases) {
    await place(s, d, angle, v);
    const up = await thumb(dx);
    let slow = 0, longest = 0, freed = false, rescued = '';
    const t0 = (await sample()).t;
    for (let i = 0; i < 32; i++) {
      await page.waitForTimeout(250);
      const x = await sample();
      if (x.kmh < 2) slow += 0.25; else { longest = Math.max(longest, slow); slow = 0; }
      if (x.backOut > 0 && !rescued) rescued = `back-out at ${(x.t - t0).toFixed(1)} s`;
      if (/Towed/.test(x.toasts) && !/tow/.test(rescued)) rescued += ` tow at ${(x.t - t0).toFixed(1)} s`;
      if (x.t - t0 > 5 && (Math.abs(x.d) < 3.5 || x.inLane) && x.kmh > 10) { freed = true; break; }
    }
    longest = Math.max(longest, slow);
    await up();
    const end = await sample();
    check(longest <= 4 && (freed || Math.abs(end.d) < 3.5 || end.inLane), `${name}: longest spell under 2 km/h ${longest.toFixed(2)} s, ${rescued || 'no rescue'}, ends at d ${end.d.toFixed(1)}${end.inLane ? ' in the shortcut' : ''} going ${end.kmh.toFixed(0)} km/h`);
  }
} catch (e) {
  check(false, String(e).split('\n')[0]);
}
await browser.close();
server.kill();
console.log(failed ? 'stuck-check failed' : 'stuck-check ok');
process.exitCode = failed ? 1 : 0;
