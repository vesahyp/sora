// Every player car from the race camera, on the iPhone landscape layout, the bot driving: a crop
// around the car a few seconds into its class's first Kiviaho race, at the phone's own pixel
// density, into shots/cars/<car>.png, and the same with the works tyres on the Tauno. Look at them
// after touching the renderer's car drawing or sprites.ts: four wheels on every car, the front
// pair turned with the wheel. `make car-shots`. Needs `make shots-setup`. Starts its own dev server.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = Number(process.env.PORT) || (await freePort());
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const OUT = 'shots/cars';
mkdirSync(OUT, { recursive: true });

/** the cars, their class, and the race each is shot in */
const CARS = [
  ['tauno', 'JM'], ['kortteli', 'C'], ['sorsa', 'B'], ['kiila', 'A'],
  ['niva', 'C'], ['valmet', 'C'], ['monsteri', 'B'], ['ruumis', 'A'],
];
const RACE = { JM: 'Kiviaho Folk Race', C: 'Kiviaho Sprint', B: 'Kiviaho B Sprint', A: 'Kiviaho A Sprint' };
const STOCK = { ram: 0, armour: 0, engine: 0, tyres: 0, nitro: 0, weight: 0, brakes: 0, gun: 0 };
/** what to shoot: the car id, its parts, and the file name */
const SHOTS = [...CARS.map(([id, cls]) => ({ id, cls, parts: STOCK, name: id })), { id: 'tauno', cls: 'JM', parts: { ...STOCK, tyres: 3, brakes: 0 }, name: 'tauno-works-tyres' }];

const browser = await chromium.launch(GPU);
const phone = devices['iPhone 15 landscape'];
const errors = [];
try {
  for (const shot of SHOTS) {
    const context = await browser.newContext({ ...phone, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${shot.name}: ${e}`));
    await context.addInitScript(({ shot, STOCK }) => {
      // the whole garage owned and every licence held, the car under test out of the garage
      const cars = ['tauno', 'kortteli', 'sorsa', 'kiila', 'niva', 'valmet', 'monsteri', 'ruumis'].map((carId) => ({ carId, parts: carId === shot.id ? shot.parts : STOCK }));
      const save = { v: 2, credits: 99000, cars, current: cars.findIndex((c) => c.carId === shot.id), licences: ['C', 'B', 'A'], races: 9, wins: 9, results: {}, missiles: 0, mines: 0, oil: 3 };
      localStorage.setItem('sora.career', JSON.stringify(save));
      localStorage.setItem('sora.lang', 'en');
    }, { shot, STOCK });
    // the top view: this crops the 2D renderer's sprites (the chase view has its own cars, render3d.ts)
    await page.goto(`http://localhost:${port}/?bot=1&lang=en&view=top`);
    await page.getByRole('button', { name: 'Continue', exact: true }).tap();
    await page.getByRole('button', { name: 'Races', exact: true }).tap();
    await page.locator('.card.event').filter({ hasText: RACE[shot.cls] }).first().tap();
    // under way and turning, the bot's wheel visibly off centre, so the front pair reads as steered
    await page.waitForFunction(() => window.__sim && window.__sim.hold <= 0 && window.__sim.cars[0].speed > 6 && Math.abs(window.__sim.cars[0].steer) > 0.2, null, { timeout: 60000, polling: 'raf' }).catch(() => undefined);
    const at = await page.evaluate(() => {
      const c = window.__sim.cars[0];
      const p = window.__renderer.toScreen(c.x, c.y);
      return { x: p.x, y: p.y, steer: c.steer, speed: c.speed, heading: c.heading };
    });
    const r = 72; // css px: the biggest car is 5.2 m at about 24 px/m in landscape, with room for the turned wheels
    const clip = { x: Math.max(0, at.x - r), y: Math.max(0, at.y - r), width: 2 * r, height: 2 * r };
    await page.screenshot({ path: `${OUT}/${shot.name}.png`, clip });
    await page.screenshot({ path: `${OUT}/${shot.name}-frame.png` });
    console.log(`${shot.name.padEnd(18)} at ${at.x.toFixed(0)},${at.y.toFixed(0)} steer ${at.steer.toFixed(2)} ${(at.speed * 3.6).toFixed(0)} km/h`);
    await context.close();
  }
  // one sheet of every crop, three times life size, to read at a glance
  const page = await browser.newPage();
  const { readFileSync } = await import('node:fs');
  const tiles = SHOTS.map((shot) => `<figure style="margin:0;text-align:center;color:#e8dcc0;font:14px monospace"><img src="data:image/png;base64,${readFileSync(`${OUT}/${shot.name}.png`).toString('base64')}" style="display:block;width:288px;height:288px;image-rendering:auto"><figcaption>${shot.name}</figcaption></figure>`);
  await page.setContent(`<body style="margin:0;background:#1a1612;padding:8px"><div style="display:grid;grid-template-columns:repeat(3,288px);gap:8px">${tiles.join('')}</div></body>`);
  await page.setViewportSize({ width: 3 * 288 + 32, height: Math.ceil(SHOTS.length / 3) * 312 + 16 });
  await page.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
  await page.close();
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
process.exitCode = errors.length ? 1 : 0;
