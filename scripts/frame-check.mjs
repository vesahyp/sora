// The 3D view's frame rate on the phone layout: the first folk race in the chase view on an
// emulated iPhone 15 in landscape, the bot driving, the CPU slowed through DevTools (THROTTLE, 2x by
// default: a mid-range phone; an iPhone 15's single core is about this Mac's), and the time between
// frames read for 20 s of racing. Asserts the median frame at 60 a second and the 95th percentile
// under 33 ms. Prints the game's own work a frame, the drawing's share of it. `make frame-check`.
// At 4x (an old phone) on 2026-10-06: 55 frames a second, one frame in fifteen two refreshes long.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = await freePort();
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; ; i++) {
  if (await fetch(`http://localhost:${port}/sora/`).then((r) => r.ok, () => false)) break;
  if (i > 120) throw new Error('no preview server');
  await new Promise((r) => setTimeout(r, 500));
}
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const THROTTLE = Number(process.env.THROTTLE || 2);
const browser = await chromium.launch(GPU);
const page = await (await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto(`http://localhost:${port}/sora/?bot=1&lang=en`);
  await page.getByRole('button', { name: /Drive|Continue/ }).tap();
  await page.getByRole('button', { name: 'Races', exact: true }).tap();
  await page.locator('.card.event').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.hold < -1, null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const gaps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          out.push(now - last);
          last = now;
          if (now - t0 < 20000) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  const sorted = gaps.slice(1).sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const view = await page.evaluate(() => window.__view);
  const js = await page.evaluate(() => ({ loop: window.__perf.ms / window.__perf.frames, draw: window.__renderer.stats.avg }));
  console.log(`the game's own work a frame: ${js.loop.toFixed(1)} ms; the drawing, smoothed: ${js.draw.toFixed(1)} ms`);
  console.log(`${view} view, CPU ${THROTTLE}x slower: ${sorted.length} frames in 20 s, median ${at(0.5).toFixed(1)} ms, 95th ${at(0.95).toFixed(1)} ms, worst ${sorted[sorted.length - 1].toFixed(0)} ms`);
  check(view === 'chase', 'the race is in the chase view');
  check(at(0.5) <= 17.5, `the median frame is a 60th of a second (${at(0.5).toFixed(1)} ms)`);
  check(at(0.95) <= 33, `95 frames in 100 come under 33 ms (${at(0.95).toFixed(1)} ms)`);
} finally {
  await browser.close();
  server.kill();
}
check(errors.length === 0, `no page errors (${errors.slice(0, 2).join('; ') || 'none'})`);
console.log(failed ? 'frame-check failed' : 'frame-check ok');
if (failed) process.exitCode = 1;
