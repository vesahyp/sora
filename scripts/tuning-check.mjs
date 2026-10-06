// The tuning mode on an emulated iPhone in landscape, by touch: switch it on in the title screen,
// start the first folk race, open the panel with TUNE, move the mass and the game pace, and assert
// the running car took them; copy the set as JSON, reset to the defaults, drive on. Shots of the
// title and the panel into shots/tuning/. `make tuning-check`.
import { GPU } from './gpu.mjs';
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
const browser = await chromium.launch(GPU);
const errors = [];
// the iPhone 15 in landscape, then an iPhone SE in landscape with Safari's bars showing (320 px of
// page): there the panel must scroll under a finger to reach the last tyre slider
const layouts = [
  { name: 'iPhone 15 landscape', opts: devices['iPhone 15 landscape'], mustScroll: false },
  { name: 'iPhone SE landscape, Safari bars showing', opts: { ...devices['iPhone SE landscape'], viewport: { width: 667, height: 320 } }, mustScroll: true },
];
let page;
for (const layout of layouts) {
console.log(`\n${layout.name}`);
const ctx = await browser.newContext({ ...layout.opts, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
/** one finger down at (x, y), moved to (x2, y2) in steps, lifted: a real touch through CDP, as a thumb drags */
const drag = async (x, y, x2, y2, steps = 12) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + ((x2 - x) * i) / steps, y: y + ((y2 - y) * i) / steps, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
};
const scrollTop = () => page.evaluate(() => document.querySelector('.tuning-groups').scrollTop);
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
  await page.screenshot({ path: `${dir}/01-title-${layout.mustScroll ? 'se' : '15'}.png` });
  check((await page.getByRole('button', { name: /Tuning mode: on/ }).count()) === 1, 'the title screen switches the tuning mode on, next to the physics readout');
  await page.getByRole('button', { name: /Drive|Continue/ }).tap();
  await page.getByRole('button', { name: 'Races', exact: true }).tap();
  await page.locator('.card.event').first().tap();
  await page.waitForFunction(() => window.__sim && window.__sim.time > 4, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'TUNE' }).tap();
  const t0 = await page.evaluate(() => window.__sim.time);
  await page.waitForTimeout(400);
  check((await page.evaluate(() => window.__sim.time)) === t0, 'the race holds while the panel is open');
  const groups = await page.locator('.tuning-tabs [role=tab]').allTextContents();
  check(groups.length >= 8, `the panel has a tab per system (${groups.join(', ')})`);
  // the panel scrolls under one finger: a system with more sliders than the screen holds, dragged up
  await page.getByRole('tab', { name: 'Suspension' }).tap();
  const box = await page.locator('.tuning-groups').boundingBox();
  const room = await page.evaluate(() => { const g = document.querySelector('.tuning-groups'); return g.scrollHeight - g.clientHeight; });
  const top0 = await scrollTop();
  // a finger on the gap between two sliders' rows, at the left edge of the list
  await drag(box.x + 20, box.y + box.height - 20, box.x + 20, box.y + 20);
  const top1 = await scrollTop();
  check(layout.mustScroll ? room > 0 && top1 - top0 >= Math.min(room, 20) - 1 : room <= 0 || top1 - top0 >= Math.min(room, 20) - 1, `a one-finger drag scrolls the panel (${room.toFixed(0)} px to scroll, moved ${(top1 - top0).toFixed(0)} px)`);
  check((await page.evaluate(() => window.__input.wheel.active)) === false, 'and the game does not take the drag for the wheel');
  // the tyres: their tab, scrolled by touch to the last slider, and that slider dragged by touch
  await page.getByRole('tab', { name: 'Tyres' }).tap();
  const last = page.locator('.tuning label', { hasText: 'Locked tyre friction' });
  const lastInput = last.locator('input');
  let lb = await lastInput.boundingBox();
  const gb = await page.locator('.tuning-groups').boundingBox();
  for (let k = 0; k < 4 && lb.y + lb.height > gb.y + gb.height; k++) {
    await drag(gb.x + 20, gb.y + gb.height - 20, gb.x + 20, gb.y + 30);
    lb = await lastInput.boundingBox();
  }
  check(lb.y >= gb.y && lb.y + lb.height <= gb.y + gb.height + 1, `the last tyre slider, Locked tyre friction, is on screen (y ${lb.y.toFixed(0)} to ${(lb.y + lb.height).toFixed(0)} in ${gb.y.toFixed(0)} to ${(gb.y + gb.height).toFixed(0)})`);
  const g0 = await page.evaluate(() => window.__sim.world.bodies[0].rig.lockedGrip);
  const v0 = Number(await lastInput.inputValue());
  // the thumb sits at the slider's value: from there, a drag to the left end
  const at = lb.x + 8 + ((v0 - 0.2) / (1 - 0.2)) * (lb.width - 16);
  await drag(at, lb.y + lb.height / 2, lb.x + 4, lb.y + lb.height / 2);
  const g1 = await page.evaluate(() => window.__sim.world.bodies[0].rig.lockedGrip);
  check(g1 < g0 - 0.2, `a touch drag on it moves it and the running car takes it (locked tyre friction ${g0.toFixed(2)} -> ${g1.toFixed(2)})`);
  await page.screenshot({ path: `${dir}/03-tyres-${layout.mustScroll ? 'se' : '15'}.png` });
  await page.getByRole('tab', { name: 'Body and weight' }).tap();
  const shown = await slide('Mass', 2000);
  const mass = await page.evaluate(() => window.__sim.world.bodies[0].rig.mass);
  check(Math.abs(mass - 2000) < 20 && /kg/.test(shown), `the mass slider reaches the running car (${mass.toFixed(0)} kg, shown ${shown})`);
  await page.getByRole('tab', { name: 'Game' }).tap();
  await slide('Game pace', 1.5);
  await page.getByRole('tab', { name: 'Steering' }).tap();
  await slide('Max steer angle', 0.6);
  await page.screenshot({ path: `${dir}/02-panel-${layout.mustScroll ? 'se' : '15'}.png` });
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
  const back = await page.evaluate(() => [window.__sim.world.bodies[0].rig.mass, window.__sim.world.bodies[0].rig.maxSteer, window.__sim.world.bodies[0].rig.lockedGrip]);
  check(Math.abs(back[0] - 1250) < 1 && Math.abs(back[1] - 0.527) < 0.01 && Math.abs(back[2] - 0.85) < 0.001, `Reset puts the defaults back on the running car (${back[0].toFixed(0)} kg, ${back[1].toFixed(3)} rad, locked friction ${back[2]})`);
  await page.getByRole('button', { name: 'Drive' }).tap();
} finally {
  await ctx.close();
}
}
await browser.close();
server.kill();
check(errors.length === 0, `no page errors (${errors.slice(0, 2).join('; ') || 'none'})`);
console.log(failed ? 'tuning-check failed' : 'tuning-check ok');
if (failed) process.exitCode = 1;
