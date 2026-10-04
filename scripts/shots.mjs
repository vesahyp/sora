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
  await page.waitForTimeout(300);
  await shot('02-garage');
  await page.getByRole('button', { name: say('Osakauppa', 'Parts shop') }).click();
  await page.waitForTimeout(300);
  await shot('02b-shop');
  await page.getByRole('button', { name: say('Talli', 'Garage') }).click();
  await page.getByRole('button', { name: say('Maalaamo', 'Paint shop') }).click();
  await page.waitForTimeout(300);
  await shot('02e-paint');
  await page.getByRole('button', { name: say('Talli', 'Garage') }).click();
  await page.getByRole('button', { name: say('Autokauppa', 'Dealer') }).click();
  await page.waitForTimeout(300);
  await shot('02d-dealer');
  await page.getByRole('button', { name: say('Talli', 'Garage') }).click();
  await page.getByRole('button', { name: say('Kisat', 'Races'), exact: true }).click();
  await page.waitForTimeout(300);
  await shot('02c-events');
  await page.locator('.card.event').first().click();
  await page.waitForTimeout(400);
  await shot('02-start');
  const at = async (sec, name) => {
    await page.waitForFunction((t) => window.__sim && (window.__sim.time >= t || window.__sim.finished), sec, { timeout: 300000 });
    await shot(name);
  };
  await at(6, '03-straight');
  // Kiviaho's river from the near bank: the lip, the water and the far bank must all be on screen
  // before the car leaves the ground. At triple speed the car covers metres while the shot is
  // taken, so the field is held where it is for it
  await page.waitForFunction(() => {
    const s = window.__sim;
    const c = s && s.cars[0];
    const r = s && s.track.def.rivers?.[0];
    const there = s && (s.finished || !r || (c.lap === 1 && c.s > r.s - 9 && c.s < r.s - 3));
    if (there && !s.finished && r) window.__hold = s.cars.map((o) => ({ x: o.x, y: o.y, vx: o.vx, vy: o.vy }));
    return there;
  }, null, { timeout: 300000, polling: 'raf' });
  await page.evaluate(() => {
    const s = window.__sim;
    const held = window.__hold;
    if (!held) return;
    const pin = () => {
      s.cars.forEach((o, i) => Object.assign(o, held[i]));
      if (window.__hold) requestAnimationFrame(pin);
    };
    pin();
  });
  await page.waitForTimeout(120);
  await shot('03c-river');
  await page.evaluate(() => (window.__hold = null));
  await at(14, '04-corner');
  // the approach to Kiviaho's hairpin (it starts at about 362 m): the camera must show the whole
  // bend before the car turns in, and the co-driver's arrow must already be up
  await page.waitForFunction(() => {
    const s = window.__sim;
    const c = s && s.cars[0];
    return s && (s.finished || (c.lap === 1 && c.s > 354 && c.s < 366));
  }, null, { timeout: 300000, polling: 'raf' });
  await shot('03b-approach');
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
  await page.getByRole('button', { name: say('Jatka', 'Continue'), exact: true }).click();
  await page.getByRole('button', { name: say('Kisat', 'Races'), exact: true }).click();
  await page.locator('.card.event').first().click();
  await page.waitForFunction(() => window.__sim && window.__sim.time >= 12, null, { timeout: 300000 });
  await shot('08-landscape');
  // A C-class grid: the bot can buy nothing, so the career is seeded straight into storage with the
  // red Valmet tractor out of the garage, and the first C race started
  await page.setViewportSize(devices['iPhone 15'].viewport);
  await page.evaluate(() => {
    const parts = { ram: 0, armour: 0, engine: 0, tyres: 0, weight: 0, brakes: 0, gun: 0 };
    const save = { v: 2, credits: 5000, cars: [{ carId: 'tauno', parts }, { carId: 'valmet', parts }], current: 1, licences: [], races: 5, wins: 5, results: {}, missiles: 0, mines: 2, oil: 3 };
    localStorage.setItem('sora.career', JSON.stringify(save));
  });
  await page.goto(`http://localhost:${port}/?bot=1&speed=3&lang=${lang}`);
  await page.getByRole('button', { name: say('Jatka', 'Continue'), exact: true }).click();
  await page.getByRole('button', { name: say('Kisat', 'Races'), exact: true }).click();
  await page.locator('.card.event', { hasText: say('Kiviahon sprintti', 'Kiviaho Sprint') }).click();
  await page.waitForTimeout(400);
  await shot('02-start-c');
  const perf = await page.evaluate(() => window.__perf);
  console.log(`frames ${perf.frames}, avg ${(perf.ms / perf.frames).toFixed(2)} ms, worst ${perf.worst.toFixed(1)} ms (sim+render, headless)`);
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
