// Every vehicle in the game on one dark canvas, to the same scale, names
// under them: the player's four cars stock and fully built, then every
// rival's vehicle class by class. `make lineup` writes shots/lineup.png.
// If two vehicles in it could be confused at a glance, the look is not
// done. Starts its own dev server on port 5198 and draws with the race's
// own sprites, so what it shows is what the race shows.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = 5198;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto(`http://localhost:${port}/?lang=fi`);
  const size = await page.evaluate(async () => {
    const { carPicture, carShadow, SPRITE_PX } = await import('/src/render/sprites.ts');
    const { CARS } = await import('/src/game/content/cars.ts');
    const { RIVAL_CARS, vehicleDef } = await import('/src/game/content/rivals.ts');
    const { OPPONENTS } = await import('/src/game/content/drivers.ts');
    const { tuned, fullFor } = await import('/src/game/content/parts.ts');
    const { CLASSES } = await import('/src/game/types.ts');
    const PPM = 44;
    const COL = 6.4 * PPM;
    const ROW = 4.3 * PPM;
    const rows = [
      { title: 'Sinun autosi, vakiona', cars: CARS.map((c) => ({ def: c, who: `${c.cls}`, faded: false })) },
      { title: 'Sinun autosi, täysin rakennettuina', cars: CARS.map((c) => ({ def: tuned(c, fullFor(c.cls)), who: `${c.cls}, kaikki osat`, faded: false })) },
      ...CLASSES.map((cls) => ({
        title: `Luokka ${cls}: kilpailijat`,
        cars: OPPONENTS.map((d) => ({ def: vehicleDef(RIVAL_CARS[d.id][cls], cls, { ram: 0, armour: 0, engine: 0, tyres: 0, weight: 0, brakes: 0, gun: 0 }), who: d.name.fi, faded: true })),
      })),
    ];
    const W = Math.round(COL * 4 + 80);
    const H = Math.round(ROW * rows.length + 40);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.id = 'lineup';
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.appendChild(c);
    const g = c.getContext('2d');
    // the ground: dusty dark gravel, so the worn palette reads as it does in the race
    g.fillStyle = '#1b1814';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = i % 3 ? 'rgba(120,104,80,0.08)' : 'rgba(0,0,0,0.18)';
      g.fillRect(Math.random() * W, Math.random() * H, 2, 1.5);
    }
    rows.forEach((row, r) => {
      const y0 = 20 + r * ROW;
      g.fillStyle = '#b8a77e';
      g.font = '600 15px "Big Shoulders Text", "Arial Narrow", Arial, sans-serif';
      g.textAlign = 'left';
      g.fillText(row.title.toUpperCase(), 40, y0 + 18);
      row.cars.forEach((v, k) => {
        const cx = 40 + COL * k + COL / 2;
        const cy = y0 + ROW * 0.46;
        // the shadow, then the car, facing right, the same metres for every vehicle
        const sh = carShadow(v.def, 0);
        g.globalAlpha = 0.55;
        g.drawImage(sh.img, cx + sh.x * PPM, cy + sh.y * PPM, sh.w * PPM, sh.h * PPM);
        g.globalAlpha = 1;
        const spr = carPicture(v.def, { faded: v.faded, heading: 0 });
        const w = (spr.width / SPRITE_PX) * PPM;
        const h = (spr.height / SPRITE_PX) * PPM;
        g.drawImage(spr, cx - w / 2, cy - h / 2, w, h);
        g.textAlign = 'center';
        g.fillStyle = '#e8dfc8';
        g.font = '700 17px "Big Shoulders Text", "Arial Narrow", Arial, sans-serif';
        g.fillText(`${v.def.name.fi}  #${v.def.number}`, cx, y0 + ROW * 0.84);
        g.fillStyle = '#8f8670';
        g.font = '500 13px "Arial Narrow", Arial, sans-serif';
        g.fillText(`${v.who} · ${v.def.shape} · ${v.def.length} × ${v.def.width} m`, cx, y0 + ROW * 0.84 + 17);
      });
    });
    return { W, H };
  });
  await page.setViewportSize({ width: size.W, height: size.H });
  await page.locator('#lineup').screenshot({ path: 'shots/lineup.png' });
  console.log(`shots/lineup.png ${size.W}x${size.H}`);
  if (errors.length) {
    console.log('page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.kill();
}
