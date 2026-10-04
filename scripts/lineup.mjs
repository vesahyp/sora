// Every vehicle in the game on one dark canvas, to the same scale, names
// under them: one row per class, the player's cars first (the class car,
// then the dealer's wild buys) and the rivals' vehicles beside them, each
// in a column as wide as it is long, so the bus takes the room it takes, so each row reads a size up from the one above;
// then the player's cars fully built, then the Tauno at five levels of
// damage so the stages sit side by side, then the Tauno with each part at
// stock and levels 1, 2, 3 (a row a part: each level must read apart from
// the last), with what the armoury loads on it, and in every paint. `make lineup` writes shots/lineup.png.
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
    const { carPicture, carShadow, damageSprite, damageStage, SPRITE_PX } = await import('/src/render/sprites.ts');
    const { CARS } = await import('/src/game/content/cars.ts');
    const { RIVAL_CARS, vehicleDef } = await import('/src/game/content/rivals.ts');
    const { OPPONENTS } = await import('/src/game/content/drivers.ts');
    const { tuned, fullFor, PARTS, STOCK } = await import('/src/game/content/parts.ts');
    const { PAINTS, LIVERIES, painted } = await import('/src/game/content/paint.ts');
    const { CLASSES } = await import('/src/game/types.ts');
    const PPM = 44;
    // a column per vehicle: its length and room for the plough's blade, the wing and the names
    const colOf = (def) => Math.max(5.6, def.length + 1.8) * PPM;
    const ROW = 4.3 * PPM;
    const stock = { ...STOCK };
    const tauno = CARS[0];
    const loads = [
      ['tyhjä', { missiles: 0, mines: 0, oil: 0 }],
      ['1 ohjus', { missiles: 1, mines: 0, oil: 0 }],
      ['3 ohjusta', { missiles: 3, mines: 0, oil: 0 }],
      ['3 miinaa', { missiles: 0, mines: 3, oil: 0 }],
      ['öljyä', { missiles: 0, mines: 0, oil: 3 }],
      ['3 + 3 + öljy', { missiles: 3, mines: 3, oil: 3 }],
      ['täysi: teline', { missiles: 9, mines: 9, oil: 9 }],
    ];
    const rows = [
      ...CLASSES.map((cls) => {
        const mine = CARS.filter((c) => c.cls === cls);
        return {
          title: `Luokka ${cls}`,
          cars: [...mine.map((def, k) => ({ def, who: k ? 'sinä, kaupasta' : 'sinä', faded: false })), ...OPPONENTS.map((d) => ({ def: vehicleDef(RIVAL_CARS[d.id][cls], cls, stock), who: d.name.fi, faded: true }))],
        };
      }),
      { title: 'Sinun autosi, täysin rakennettuina', cars: CARS.map((c) => ({ def: tuned(c, fullFor(c.cls)), who: `${c.cls}, kaikki osat`, faded: false })) },
      ...PARTS.map((p) => ({ title: `Osa: ${p.name.fi}, tasot 0-3`, cars: [0, 1, 2, 3].map((l) => ({ def: tuned(tauno, { ...stock, [p.kind]: l }), who: l ? `${p.name.fi} ${l}: ${p.levels[l - 1].fi}` : 'vakio', faded: false })) })),
      { title: 'Asevarasto: ohjukset, miinat, öljy', cars: loads.map(([who, load]) => ({ def: tauno, who, faded: false, load })) },
      { title: 'Maalaamo: värit ja kuviot', cars: PAINTS.map((p, i) => { const lv = i ? LIVERIES[(i - 1) % LIVERIES.length] : null; return { def: painted(tauno, p.id, lv?.kind), who: `${p.name.fi}${lv ? `, ${lv.name.fi}` : ''}`, faded: false }; }) },
      { title: 'Vauriot: Tauno 0, 20, 45, 70, 95', cars: [0, 20, 45, 70, 95].map((d) => ({ def: CARS[0], who: `vauriot ${d} · vaihe ${damageStage(d)}`, faded: false, damage: d })) },
    ];
    const W = Math.round(Math.max(...rows.map((r) => r.cars.reduce((a, v) => a + colOf(v.def), 0))) + 80);
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
      let x = 40;
      row.cars.forEach((v) => {
        const col = colOf(v.def);
        const cx = x + col / 2;
        x += col;
        const cy = y0 + ROW * 0.46;
        // the shadow, then the car, facing right, the same metres for every vehicle
        const sh = carShadow(v.def, 0);
        g.globalAlpha = 0.55;
        g.drawImage(sh.img, cx + sh.x * PPM, cy + sh.y * PPM, sh.w * PPM, sh.h * PPM);
        g.globalAlpha = 1;
        const spr = carPicture(v.def, { faded: v.faded, heading: 0, load: v.load });
        const w = (spr.width / SPRITE_PX) * PPM;
        const h = (spr.height / SPRITE_PX) * PPM;
        g.drawImage(spr, cx - w / 2, cy - h / 2, w, h);
        const dmg = v.damage ? damageSprite(v.def, damageStage(v.damage)) : null;
        if (dmg) g.drawImage(dmg, cx - w / 2, cy - h / 2, w, h);
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
