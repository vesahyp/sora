// Drives a licence lap with touches on an emulated phone, the way a thumb does:
// a drag to the right must turn the car right, a drag to the left must
// turn it left, a second finger must slow it, and the pause menu must
// open and close by tap. Run with `make touch-check`; needs `make shots-setup`.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

// PORT=5187 when another repo's dev server holds the default
// a free port of its own: 5197 is often another repo's dev server, and the check then drove that repo's page
import { createServer } from 'node:net';
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = Number(process.env.PORT) || (await freePort());
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(GPU);
// the gas always on for the checks that drive at speed without a hand on the gas; the lever is checked below
const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('sora.gas', 'auto'));
const page = await ctx.newPage();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const sim = (expr) => page.evaluate(expr);
// put the car on the start straight at speed, pointing down the road, so a
// drag is measured from the same place every time: 45 m along, past the
// crest, where the front wheels are on the ground (on the brow at 50 km/h they
// are light and steer nothing since the cars run on Rapier, ADR 0005)
const place = () =>
  page.evaluate(() => {
    const s = window.__sim;
    const c = s.cars[0];
    const p = s.track.at(45);
    c.x = p.x;
    c.y = p.y;
    c.heading = Math.atan2(p.ty, p.tx);
    c.vx = p.tx * 14;
    c.vy = p.ty * 14;
    c.yaw = 0;
    c.spin = 0;
  });
// a tap: down and straight up, through CDP like every other touch here,
// because Playwright's own tap after a raw CDP touch reads as a second finger
const tap = async (x, y) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 9 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};
// a thumb: down at (x, y), slide to x2 over a few events, hold
const touch = async (x, y, x2, hold) => {
  const cdp = await page.context().newCDPSession(page);
  const pt = (px) => [{ x: px, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x) });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + ((x2 - x) * i) / 5) });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  // a licence test: one car on the road, so nothing rams the car mid-check
  await page.getByRole('button', { name: 'Drive', exact: true }).tap();
  await page.getByRole('button', { name: /Licences/ }).tap();
  await page.locator('.card.licence').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.hold <= 0 && window.__sim.time > 4, null, { timeout: 20000 });
  // the brake first, on the start straight, while the car is still fast
  const cdp = await page.context().newCDPSession(page);
  const v0 = await sim('window.__sim.cars[0].speed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 500, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 500, id: 1 }, { x: 280, y: 500, id: 2 }] });
  await page.waitForTimeout(100);
  const read = await sim('window.__input.read()');
  await page.waitForTimeout(600);
  const v1 = await sim('window.__sim.cars[0].speed');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  check(v0 > 5 && v1 < v0 - 2, `a second finger brakes (${(v0 * 3.6).toFixed(0)} -> ${(v1 * 3.6).toFixed(0)} km/h, input ${JSON.stringify(read)})`);
  // the pedal: a tap on it brakes, held at a standstill it reverses
  const pedal = await page.locator('.pedal').boundingBox();
  const cdp2 = await page.context().newCDPSession(page);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pedal.x + pedal.width / 2, y: pedal.y + pedal.height / 2, id: 3 }] });
  await page.waitForTimeout(2500);
  const vr = await sim('window.__sim.cars[0].speed');
  const rev = await page.locator('.pedal.rev').count();
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp2.detach();
  check(vr < -1 && rev === 1, `holding the pedal at a standstill reverses (${(vr * 3.6).toFixed(0)} km/h, R shown)`);
  await page.waitForTimeout(1500);
  // a tap lights the nitro
  await page.waitForFunction(() => window.__sim.cars[0].speed > 8, null, { timeout: 10000 });
  const b0 = await sim('window.__sim.cars[0].boost');
  await tap(200, 400);
  await page.waitForTimeout(150);
  const burst = await sim('window.__sim.cars[0].boosting');
  check(burst > 0, `a tap lights the nitro (tank ${b0.toFixed(2)}, burst ${burst.toFixed(2)} s)`);
  await place();
  await page.waitForTimeout(100);
  const h0 = await sim('window.__sim.cars[0].heading');
  await touch(200, 600, 300, 250);
  const h1 = await sim('window.__sim.cars[0].heading');
  check(h1 > h0 + 0.2, `a drag to the right turns the car right (${(h1 - h0).toFixed(2)} rad)`);
  await place();
  await page.waitForTimeout(100);
  const h1b = await sim('window.__sim.cars[0].heading');
  await touch(200, 600, 100, 250);
  const h2 = await sim('window.__sim.cars[0].heading');
  check(h2 < h1b - 0.2, `a drag to the left turns the car left (${(h2 - h1b).toFixed(2)} rad)`);
  // the response curve: a nudge is a correction, not a turn
  await place();
  await page.waitForTimeout(100);
  const h2b = await sim('window.__sim.cars[0].heading');
  await touch(200, 600, 220, 250);
  const h3 = await sim('window.__sim.cars[0].heading');
  check(Math.abs(h3 - h2b) < 0.08, `a 20 px nudge is a small correction (${(h3 - h2b).toFixed(3)} rad)`);
  const steer = await sim('window.__sim.cars[0].steer');
  await page.waitForTimeout(300);
  const steer2 = await sim('window.__sim.cars[0].steer');
  check(Math.abs(steer2) < 0.05, `lifting the thumb centres the wheel (${steer.toFixed(2)} -> ${steer2.toFixed(2)})`);
  await page.locator('.iconbtn.pause').tap();
  await page.waitForSelector('.overlay');
  await page.getByRole('button', { name: 'Resume' }).tap();
  await page.waitForTimeout(300);
  check((await page.locator('.overlay').count()) === 0, 'a tap on Resume closes the pause menu');
  await page.locator('.iconbtn.pause').tap();
  await page.getByRole('button', { name: 'Quit' }).tap();
  await page.waitForSelector('.garage', { timeout: 5000 });
  check(true, 'a tap on Quit returns to the garage');
  await page.getByRole('button', { name: 'Parts shop' }).tap();
  await page.locator('.card.part').first().tap();
  await page.waitForTimeout(200);
  const lvl = await page.locator('.card.part').first().locator('.ic').innerText();
  check(lvl.startsWith('1'), `a tap in the shop buys the first part, the ram bar (level ${lvl.trim()})`);
  // the gas lever under the left thumb (the default): in landscape, as it is played
  const lctx = await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true });
  const lp = await lctx.newPage();
  await lp.goto(`http://localhost:${port}/?lang=en`);
  await lp.getByRole('button', { name: 'Drive', exact: true }).tap();
  await lp.getByRole('button', { name: /Licences/ }).tap();
  await lp.locator('.card.licence').first().tap();
  await lp.waitForFunction(() => window.__sim && window.__sim.hold <= 0, null, { timeout: 20000 });
  const lsim = (expr) => lp.evaluate(expr);
  const lever = await lp.locator('.pedal.lever').boundingBox();
  check(!!lever && lever.height > lever.width * 2, `the gas lever stands at the bottom left (${lever ? `${lever.width.toFixed(0)} x ${lever.height.toFixed(0)} px` : 'missing'})`);
  const at = (share) => ({ x: lever.x + lever.width / 2, y: lever.y + lever.height * (1 - share) });
  const lcdp = await lp.context().newCDPSession(lp);
  const hold = async (share, ms, extra = []) => {
    const p = at(share);
    await lcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }, ...extra] });
    await lp.waitForTimeout(ms / 2);
    const read = await lsim(() => window.__input.read());
    await lp.waitForTimeout(ms / 2);
    return read;
  };
  const lift = () => lcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await lp.waitForTimeout(800);
  const still = await lsim(() => [window.__sim.cars[0].speed, window.__input.read()]);
  check(Math.abs(still[0]) < 1 && still[1].throttle === 0, `with no thumb on the lever the car stands (${(still[0] * 3.6).toFixed(0)} km/h, gas ${still[1].throttle})`);
  const full = await hold(0.95, 2400);
  const vFull = await lsim(() => window.__sim.cars[0].speed);
  check(full.throttle > 0.95 && vFull * 3.6 > 30, `the thumb high on the lever is full gas, and the car goes (gas ${full.throttle.toFixed(2)}, ${(vFull * 3.6).toFixed(0)} km/h)`);
  await lift();
  const half = await hold(0.62, 300);
  check(half.throttle > 0.35 && half.throttle < 0.65, `halfway up the gas zone is half gas (${half.throttle.toFixed(2)})`);
  const coast = await hold(0.35, 300);
  check(coast.throttle === 0 && coast.brake === 0, `between the zones it coasts (gas ${coast.throttle}, brake ${coast.brake})`);
  await lift();
  const off = await lsim(() => window.__input.read());
  check(off.throttle === 0, `lifting the thumb coasts (gas ${off.throttle})`);
  const v0b = await lsim(() => window.__sim.cars[0].speed);
  const brk = await hold(0.05, 1000);
  const v1b = await lsim(() => window.__sim.cars[0].speed);
  check(brk.brake > 0.8 && v1b < v0b - 2, `low on the lever brakes (brake ${brk.brake.toFixed(2)}, ${(v0b * 3.6).toFixed(0)} -> ${(v1b * 3.6).toFixed(0)} km/h)`);
  await lp.waitForTimeout(3000);
  const vr2 = await lsim(() => window.__sim.cars[0].speed);
  check(vr2 < -1, `held low at a standstill it reverses (${(vr2 * 3.6).toFixed(0)} km/h)`);
  await lift();
  // both thumbs: gas on the left, a drag on the right turns the car
  await hold(0.95, 1500);
  const hA = await lsim(() => window.__sim.cars[0].heading);
  const vw = lp.viewportSize();
  const wx = vw.width * 0.72;
  const wy = vw.height * 0.6;
  for (let i = 0; i <= 6; i++) {
    await lcdp.send('Input.dispatchTouchEvent', { type: i ? 'touchMove' : 'touchStart', touchPoints: [{ ...at(0.95), id: 1 }, { x: wx + i * 12, y: wy, id: 2 }] });
    await lp.waitForTimeout(40);
  }
  await lp.waitForTimeout(500);
  const both = await lsim(() => window.__input.read());
  const hB = await lsim(() => window.__sim.cars[0].heading);
  await lift();
  check(both.throttle > 0.95 && both.steer > 0.3 && hB - hA > 0.2, `gas held on the left while the right thumb steers (gas ${both.throttle.toFixed(2)}, steer ${both.steer.toFixed(2)}, turned ${(hB - hA).toFixed(2)} rad)`);
  await lcdp.detach();
  await lp.screenshot({ path: 'shots/lever.png' });
} catch (e) {
  check(false, String(e));
} finally {
  await browser.close();
  server.kill();
}
process.exitCode = failed ? 1 : 0;
