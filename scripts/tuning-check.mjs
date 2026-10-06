// The tuning mode on an emulated iPhone in landscape, by touch: switch it on in the title screen,
// start the first folk race, open the panel with TUNE, move the mass and the game pace, and assert
// the running car took them; copy the set as JSON, reset to the defaults, drive on. Shots of the
// title and the panel into shots/tuning/. `make tuning-check`.
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
const dir = 'shots/tuning';
mkdirSync(dir, { recursive: true });
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
/** a slider moved to a value, the way a thumb leaves it: the input's own value and its event */
const slide = (name, value) =>
  page.evaluate(
    ([name, value]) => {
      const label = [...document.querySelectorAll('.tuning label')].find((l) => l.querySelector('.name')?.textContent === name);
      const input = label.querySelector('input');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return label.querySelector('.val').textContent;
    },
    [name, value],
  );
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  await page.getByRole('button', { name: /Tuning mode: off/ }).tap();
  await page.getByRole('button', { name: /Physics readout: off/ }).tap();
  await page.screenshot({ path: `${dir}/01-title.png` });
  check((await page.getByRole('button', { name: /Tuning mode: on/ }).count()) === 1, 'the title screen switches the tuning mode on, next to the physics readout');
  await page.getByRole('button', { name: /Drive|Continue/ }).tap();
  await page.getByRole('button', { name: 'Races', exact: true }).tap();
  await page.locator('.card.event').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.time > 4, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'TUNE' }).tap();
  const t0 = await page.evaluate(() => window.__sim.time);
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.__sim.time)) === t0, 'the race holds while the panel is open');
  const groups = await page.locator('.tuning legend').allTextContents();
  const sliders = await page.locator('.tuning input[type=range]').count();
  check(groups.length >= 8 && sliders >= 30, `the panel has the systems and their sliders (${groups.join(', ')}: ${sliders} sliders)`);
  const shown = await slide('Mass', 2000);
  const mass = await page.evaluate(() => window.__sim.world.bodies[0].rig.mass);
  check(Math.abs(mass - 2000) < 20 && /kg/.test(shown), `the mass slider reaches the running car (${mass.toFixed(0)} kg, shown ${shown})`);
  await slide('Game pace', 1.5);
  await slide('Max steer angle', 0.6);
  await page.screenshot({ path: `${dir}/02-panel.png` });
  await page.getByRole('button', { name: 'Copy JSON' }).tap();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  let parsed = null;
  try {
    parsed = JSON.parse(clip);
  } catch {}
  check(parsed && Math.abs(parsed.changed?.mass - 2000) < 20 && parsed.pace === 1.5 && Math.abs(parsed.rig?.maxSteer - 0.6) < 0.011, `Copy JSON puts the changed set on the clipboard (${clip.slice(0, 80).replace(/\s+/g, ' ')}...)`);
  await page.getByRole('button', { name: 'Drive' }).tap();
  await page.waitForTimeout(600);
  check((await page.evaluate(() => window.__pace)) === 1.5 && (await page.evaluate(() => window.__sim.time)) > t0, 'Drive closes the panel and the race runs on at the new pace');
  await page.getByRole('button', { name: 'TUNE' }).tap();
  await page.getByRole('button', { name: 'Reset to defaults' }).tap();
  const back = await page.evaluate(() => [window.__sim.world.bodies[0].rig.mass, window.__sim.world.bodies[0].rig.maxSteer]);
  check(Math.abs(back[0] - 1250) < 1 && Math.abs(back[1] - 0.527) < 0.01, `Reset puts the defaults back on the running car (${back[0].toFixed(0)} kg, ${back[1].toFixed(3)} rad)`);
  await page.getByRole('button', { name: 'Drive' }).tap();
} finally {
  await browser.close();
  server.kill();
}
check(errors.length === 0, `no page errors (${errors.slice(0, 2).join('; ') || 'none'})`);
console.log(failed ? 'tuning-check failed' : 'tuning-check ok');
if (failed) process.exitCode = 1;
