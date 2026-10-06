// The physics readout on the phone: the first folk race on an emulated iPhone in landscape, the
// bot driving, the readout switched on in the title screen's settings, a shot every few seconds
// into shots/readout/. `make readout-shot`.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = await freePort();
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; ; i++) {
  if (await fetch(`http://localhost:${port}/`).then((r) => r.ok, () => false)) break;
  if (i > 120) throw new Error('no dev server');
  await new Promise((r) => setTimeout(r, 500));
}
const dir = 'shots/readout';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto(`http://localhost:${port}/?bot=1&lang=en`);
  await page.getByRole('button', { name: /Physics readout/ }).click();
  await page.screenshot({ path: `${dir}/01-title.png` });
  await page.getByRole('button', { name: /Drive|Continue/ }).click();
  await page.getByRole('button', { name: 'Races', exact: true }).click();
  await page.locator('.card.event').first().click();
  for (const t of [5, 9, 13]) {
    await page.waitForFunction((t) => window.__sim && window.__sim.time >= t, t, { timeout: 120000 });
    await page.screenshot({ path: `${dir}/race-${t}s.png` });
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`shots in ${dir}/`);
