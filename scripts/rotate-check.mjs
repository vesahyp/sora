// Turning the phone must not break the view. On an emulated iPhone this
// rotates between portrait and landscape in the middle of a race and in the
// menus, both ways, and after each turn checks that the canvas matches the
// screen in CSS and device pixels, the camera's view has the screen's
// aspect, the dash stays inside the screen, the pedal is where the input
// thinks it is, and the menus do not overflow sideways. `make rotate-check`
// (PORT=5187 when another repo's dev server holds the default).
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
const port = Number(process.env.PORT) || 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const phone = devices['iPhone 15'];
const portrait = { width: phone.viewport.width, height: phone.viewport.height };
const landscape = { width: phone.viewport.height, height: phone.viewport.width };
const context = await browser.newContext({ ...phone, hasTouch: true });
const page = await context.newPage();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
// iOS Safari fires the resize while the canvas still measures the old layout, and
// sends nothing more once the layout has settled. The turn is played that way: the
// canvas keeps reporting its old size for 300 ms after the screen has changed
const stale = () =>
  page.evaluate(() => {
    const c = document.querySelector('.game canvas');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const old = { width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.x, y: r.y, toJSON() {} };
    const w = c.clientWidth;
    const h = c.clientHeight;
    Object.defineProperty(c, 'getBoundingClientRect', { configurable: true, value: () => old });
    Object.defineProperty(c, 'clientWidth', { configurable: true, get: () => w });
    Object.defineProperty(c, 'clientHeight', { configurable: true, get: () => h });
    setTimeout(() => {
      delete c.getBoundingClientRect;
      delete c.clientWidth;
      delete c.clientHeight;
    }, 300);
  });
const turn = async (to, label) => {
  await stale();
  await page.setViewportSize(to);
  // the layout settles, and then the game gets the time it would get on a phone
  await page.waitForTimeout(900);
  return label;
};
const raceState = () =>
  page.evaluate(() => {
    const c = document.querySelector('.game canvas');
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const view = window.__sim.view;
    const speedo = document.querySelector('.speedo')?.getBoundingClientRect();
    const pedal = document.querySelector('.pedal')?.getBoundingClientRect();
    const hud = document.querySelector('.hud, .dash, .gauges')?.getBoundingClientRect();
    return {
      iw: window.innerWidth, ih: window.innerHeight,
      cw: Math.round(r.width), ch: Math.round(r.height), bw: c.width, bh: c.height, dpr,
      viewAspect: view.w / view.h,
      speedo: speedo && { r: speedo.right, b: speedo.bottom },
      pedal: pedal && { x: pedal.left + pedal.width / 2, y: pedal.top + pedal.height / 2, w: pedal.width },
      pedalIn: window.__input ? { x: window.__input.pedal.x, y: window.__input.pedal.y } : null,
      scrollW: document.scrollingElement.scrollWidth,
    };
  });
const judge = (st, label) => {
  check(st.cw === st.iw && st.ch === st.ih, `${label}: the canvas fills the screen (${st.cw}x${st.ch} of ${st.iw}x${st.ih})`);
  check(st.bw === Math.round(st.cw * st.dpr) && st.bh === Math.round(st.ch * st.dpr), `${label}: the canvas has the screen's device pixels (${st.bw}x${st.bh} at ${st.dpr}x)`);
  check(Math.abs(st.viewAspect - st.iw / st.ih) < 0.02, `${label}: the camera's view has the screen's aspect (${st.viewAspect.toFixed(2)} vs ${(st.iw / st.ih).toFixed(2)})`);
  check(st.speedo && st.speedo.r <= st.iw + 1 && st.speedo.b <= st.ih + 1, `${label}: the speedo is on screen`);
  check(st.pedal && st.pedal.x < st.iw && st.pedal.y < st.ih, `${label}: the pedal is on screen`);
  if (st.pedalIn) check(Math.abs(st.pedal.x - st.pedalIn.x) < 2 && Math.abs(st.pedal.y - st.pedalIn.y) < 2, `${label}: the input's pedal is where the pedal is drawn`);
  check(st.scrollW <= st.iw, `${label}: nothing overflows sideways (${st.scrollW} of ${st.iw})`);
};
const menuState = () =>
  page.evaluate(() => ({ iw: window.innerWidth, ih: window.innerHeight, scrollW: document.scrollingElement.scrollWidth, btn: document.querySelector('button')?.getBoundingClientRect() }));
const judgeMenu = (st, label) => {
  check(st.scrollW <= st.iw, `${label}: the menu does not overflow sideways (${st.scrollW} of ${st.iw})`);
  check(st.btn && st.btn.right <= st.iw + 1 && st.btn.left >= -1, `${label}: the first button is inside the screen`);
};
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  judgeMenu(await menuState(), 'title, portrait');
  await turn(landscape, '');
  judgeMenu(await menuState(), 'title, turned to landscape');
  await page.getByRole('button', { name: 'Drive', exact: true }).tap();
  await page.waitForTimeout(200);
  judgeMenu(await menuState(), 'garage, landscape');
  await turn(portrait, '');
  judgeMenu(await menuState(), 'garage, turned to portrait');
  await page.getByRole('button', { name: /Licences/ }).tap();
  await page.locator('.card.licence').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.hold <= 0 && window.__sim.time > 4, null, { timeout: 20000 });
  judge(await raceState(), 'race, portrait');
  await turn(landscape, '');
  judge(await raceState(), 'race, turned to landscape');
  await page.screenshot({ path: 'shots/rotate-landscape.png' });
  await turn(portrait, '');
  judge(await raceState(), 'race, turned back to portrait');
  await page.screenshot({ path: 'shots/rotate-portrait.png' });
  await turn(landscape, '');
  await page.locator('.iconbtn.pause').tap();
  await page.waitForSelector('.overlay');
  await turn(portrait, '');
  judgeMenu(await menuState(), 'pause menu, turned to portrait');
} catch (e) {
  check(false, String(e).split('\n')[0]);
}
await browser.close();
server.kill();
console.log(failed ? 'rotate-check failed' : 'rotate-check ok');
process.exitCode = failed ? 1 : 0;
