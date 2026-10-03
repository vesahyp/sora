// Phone screenshots of the game, repeatable: title, the countdown, the race
// with the bot driving at a few points, and the result. Run
// `make shots-setup` once, then `make shots`. Starts its own dev server on
// port 5199. `node scripts/shots.mjs en` takes the English set into shots/en/.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5199;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const lang = process.argv[2] === 'en' ? 'en' : 'fi';
const dir = lang === 'en' ? 'shots/en' : 'shots';
const say = (fi, en) => (lang === 'en' ? en : fi);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15'], hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` });

try {
  await page.goto(`http://localhost:${port}/?bot=1&speed=3&lang=${lang}`);
  await shot('01-title');
  await page.getByRole('button', { name: say('Aja', 'Drive'), exact: true }).click();
  await page.waitForTimeout(400);
  await shot('02-start');
  const at = async (sec, name) => {
    await page.waitForFunction((t) => window.__sim && (window.__sim.time >= t || window.__sim.finished), sec, { timeout: 300000 });
    await shot(name);
  };
  await at(6, '03-straight');
  await at(14, '04-corner');
  await at(40, '05-later');
  await page.waitForFunction(() => window.__sim && window.__sim.finished, null, { timeout: 600000 });
  await page.waitForTimeout(200);
  await shot('06-finish');
  await page.waitForSelector('.result', { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot('07-result');
  // Landscape, the way a thumb and a phone sideways hold it.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`http://localhost:${port}/?bot=1&speed=3&lang=${lang}`);
  await page.getByRole('button', { name: say('Aja', 'Drive'), exact: true }).click();
  await page.waitForFunction(() => window.__sim && window.__sim.time >= 12, null, { timeout: 300000 });
  await shot('08-landscape');
  const perf = await page.evaluate(() => window.__perf);
  console.log(`frames ${perf.frames}, avg ${(perf.ms / perf.frames).toFixed(2)} ms, worst ${perf.worst.toFixed(1)} ms (sim+render, headless)`);
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
