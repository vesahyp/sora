// Drives a licence lap with touches on an emulated phone, the way a thumb does:
// a drag to the right must turn the car right, a drag to the left must
// turn it left, a second finger must slow it, and the pause menu must
// open and close by tap. Run with `make touch-check`; needs `make shots-setup`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

// PORT=5187 when another repo's dev server holds the default
const port = Number(process.env.PORT) || 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 15'], hasTouch: true })).newPage();
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
} catch (e) {
  check(false, String(e));
} finally {
  await browser.close();
  server.kill();
}
process.exitCode = failed ? 1 : 0;
