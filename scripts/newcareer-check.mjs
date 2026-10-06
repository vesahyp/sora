// A new career, on an emulated iPhone in landscape: the title offers "New career" once the
// save has moved, the dialog names what is lost and defaults to No, No keeps the save, Yes
// wipes only the career key (language and records stay) and lands in the garage with the Tauno
// and the starting credits. `make newcareer-check` (PORT=5187 when another repo holds the default).
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT) || 5197;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 15 landscape'], hasTouch: true });
const page = await context.newPage();
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const stored = (k) => page.evaluate((key) => localStorage.getItem(key), k);
try {
  await page.goto(`http://localhost:${port}/?lang=en`);
  const btn = page.getByRole('button', { name: 'New career', exact: true });
  check((await btn.count()) === 0, 'a fresh career has no New career button');
  // a career well under way: two cars, money, a licence, results
  await page.evaluate(() => {
    localStorage.setItem(
      'sora.career',
      JSON.stringify({ v: 2, credits: 4200, cars: [{ carId: 'tauno', parts: {} }, { carId: 'kortteli', parts: {} }], current: 1, licences: ['B'], races: 9, wins: 4, results: { 'jm-kiviaho': 1 }, missiles: 1, mines: 1, oil: 2 }),
    );
    localStorage.setItem('sora.records', JSON.stringify({ bestLap: { x: 31.2 }, bestRace: { x: 93.6 } }));
    localStorage.setItem('sora.lang', 'en');
  });
  await page.reload();
  check(await btn.isVisible(), 'the title offers New career');
  const box = await btn.boundingBox();
  const vp = page.viewportSize();
  check(box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width, 'the button is inside the landscape screen');
  await btn.tap();
  const dlg = page.getByRole('alertdialog');
  check(await dlg.isVisible(), 'a confirmation opens');
  const text = (await dlg.innerText()).toLowerCase();
  check(['2 cars', '4 200', 'parts', 'licences', '9 races'].every((w) => text.replace(/\s/g, ' ').includes(w) || text.replace(/[\s  ]/g, '').includes(w.replace(/\s/g, ''))), 'it names the cars, credits, parts, licences and progress lost');
  check(await page.getByRole('button', { name: /^No/ }).evaluate((e) => e === document.activeElement), 'No has the focus');
  const db = await dlg.boundingBox();
  const yes = await page.getByRole('button', { name: /^Yes/ }).boundingBox();
  check(yes.y + yes.height <= vp.height && db.y >= 0, 'both answers fit in landscape');
  await page.getByRole('button', { name: /^No/ }).tap();
  check((await dlg.count()) === 0, 'No closes it');
  check(JSON.parse(await stored('sora.career')).credits === 4200, 'No keeps the career');
  await btn.tap();
  await page.getByRole('button', { name: /^Yes/ }).tap();
  // the garage, the Tauno, the start credits
  await page.waitForSelector('.screen.garage');
  const garage = await page.locator('.screen.garage').innerText();
  check(/tauno/i.test(garage), 'lands in the garage with the Tauno');
  const s = JSON.parse(await stored('sora.career'));
  check(s.credits === 150 && s.cars.length === 1 && s.cars[0].carId === 'tauno' && s.races === 0 && !s.licences.length, 'the career is the starting one');
  check((await stored('sora.lang')) === 'en' && !!(await stored('sora.records')), 'language and records stay');
  await page.reload();
  check(JSON.parse(await stored('sora.career')).credits === 150, 'it stays reset after a reload');
  check((await btn.count()) === 0, 'the button is gone again on the fresh career');
  await page.screenshot({ path: 'shots/newcareer-garage.png' });
} catch (e) {
  console.log(`FAIL  ${e.message}`);
  failed = true;
}
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
