// The first hour of the career, played on a phone by a thumb that is not the bot: every folk
// race on both tracks, on an emulated iPhone in landscape, every input a real touch through the
// game's own controls (the drag that steers, the second finger on the pedal, the tap for nitro),
// a video of each race, parts bought between races the way a player buys them. The driver is the
// hand in tools/hand.ts, a model of a thumb, not the learnt bot: it looks down the road and
// pushes the thumb in proportion to how wrong the heading looks, a reaction late, the thumb at a
// thumb's speed, a little jitter, brakes for a bend when it looks too fast and now and then too
// late, and gets better race by race (SKILL). The bot in tools/autoplayer.ts asks the car for yaw
// rates and knows the tyres' limit; this one does not, which is the point: it is the thumb the
// game has to be fun for. The hand is built here from tools/hand.ts and injected into the page,
// so the thumb on the video is the same thumb sim-check and make balance read the folk laps off;
// this script only turns its thumb and pedal into touches and keeps the tally.
//
// `make playthrough` (PORT=5187 when another repo's dev server holds the default; RACES=jm-kiviaho,
// jm-hirvisuo to play a subset). Needs `make shots-setup`. Writes shots/playthrough/: a .webm per
// attempt, the result sheet of each, frame sheets to read the race at a glance (every second of
// it, six by six), and summary.json and summary.md with the places, the laps, the time off the
// road, the tows and the money. Exits non-zero when the hour is not fun by the rules at the end:
// a race not finished, the first two folk races not won in three tries, the final not a fight.
import { GPU } from './gpu.mjs';
import { chromium, devices } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// a free port of its own: 5197 is often another repo's dev server, and a race on höyry's title
// screen is a thirty-second wait for a button that is not there
import { createServer } from 'node:net';
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); }); });
const port = Number(process.env.PORT) || (await freePort());
// a production build, served still: the dev server hot-reloads the game when a source file is
// saved, and a run of twenty minutes with the editor open was wrecked that way (2026-10-04)
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { stdio: 'inherit' });
// the hand, built for the page: tools/hand.ts bundled with the bit of the game it reads, its
// exports hung on window
execFileSync('npx', ['vite', 'build', '--ssr', 'tools/hand.ts', '--outDir', '.hand-check', '--logLevel', 'error'], { stdio: 'inherit' });
const HAND_JS = readFileSync('.hand-check/hand.js', 'utf8').replace(/export\s*\{[^}]*\};?/g, '') + '\nwindow.__Hand = Hand;';
const OUT = 'shots/playthrough';
const JM = ['jm-kiviaho', 'jm-hirvisuo', 'jm-kiviaho-4', 'jm-hirvisuo-4', 'jm-final'];
const RACES = process.env.RACES ? process.env.RACES.split(',') : JM;
/** the sim's speed, ?speed=: under 1 is slow motion, for a loaded machine (the nightly sweep ran the page at
 *  10 frames a second, 2026-10-06, and a thumb that lands a touch a frame is drunk at that rate). The hand's
 *  clock runs in sim time, so its thumb and reactions are the same thumb; the video is slow motion */
const SPEED = Number(process.env.SPEED || 1);
/** the hand's skill per race of the hour, 0..1: the first race is a stranger to the car, the final has learnt it (sim-check's first-races check uses the same ladder) */
const SKILL = [0.5, 0.6, 0.7, 0.8, 0.85];
/** tries at a race before the hour moves on: a human retries the one that pays the next part */
const TRIES = 3;
/** the parts a folk racer buys, in the order the money allows (docs/progression.md) */
const WANT = ['Ram bar', 'Tyres', 'Engine', 'Nitro', 'Ram bar', 'Tyres', 'Engine', 'Armour'];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
// wait for the server to answer, not a fixed pause: on a busy machine it took longer than the
// pause and the first race opened on a refused connection (2026-10-06)
for (let i = 0; ; i++) {
  const up = await fetch(`http://localhost:${port}/sora/`).then((r) => r.ok, () => false);
  if (up) break;
  if (i > 120) throw new Error(`no preview server on port ${port} after 60 s`);
  await new Promise((r) => setTimeout(r, 500));
}
// a fresh browser per attempt: in one browser the GPU process gave out in the fifth race of the 3D
// view, closing the page mid-race (2026-10-06)
let browser = null;
const phone = devices['iPhone 15 landscape'];
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
/** the career between races: the save and the records, carried from one page to the next */
// the physics readout on: the video shows the speed, the yaw rate, the wheel and each tyre's slip
let stored = { 'sora.career': null, 'sora.records': null, 'sora.lang': 'en', 'sora.physics-readout': '1' };
const summary = [];

/** One attempt at an event: a fresh page carrying the save, the garage, the race, the result. */
async function attempt(eventId, index, tries, skill) {
  browser = await chromium.launch(GPU);
  const context = await browser.newContext({ ...phone, hasTouch: true, recordVideo: { dir: join(OUT, 'tmp'), size: phone.viewport } });
  await context.addInitScript((kv) => {
    for (const [k, v] of Object.entries(kv)) if (v) localStorage.setItem(k, v);
  }, stored);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const name = `${String(index + 1).padStart(2, '0')}-${eventId}${tries > 1 ? `-try${tries}` : ''}`;
  let result = null;
  try {
    await page.goto(`http://localhost:${port}/sora/?lang=en${SPEED !== 1 ? `&speed=${SPEED}` : ''}`);
    if (!/sora/i.test(await page.title())) throw new Error(`not Sora on port ${port}: ${await page.title()}`);
    await page.addScriptTag({ content: HAND_JS });
    await page.locator('[data-track="title-drive"]').tap();
    await page.getByRole('button', { name: 'Races', exact: true }).waitFor();
    // the shop first: the best part the money buys, one or two a visit, as a player does between races
    const bought = await shop(page);
    await page.getByRole('button', { name: 'Races', exact: true }).tap();
    const card = page.locator(`.card.event`).filter({ hasText: eventName(eventId) });
    await card.first().tap();
    await page.waitForFunction(() => window.__sim && window.__input, null, { timeout: 20000 });
    const race = await drive(page, skill);
    // the result sheet: wait for it, keep it
    await page.locator('.screen.result').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${name}-result.png`) });
    const sheet = await page.evaluate(() => ({
      title: document.querySelector('.result h2')?.textContent,
      order: [...document.querySelectorAll('.order tbody tr')].map((r) => r.textContent.trim().replace(/\s+/g, ' ')),
      credits: document.querySelector('.top .credits')?.textContent,
    }));
    stored = await page.evaluate(() => ({ 'sora.career': localStorage.getItem('sora.career'), 'sora.records': localStorage.getItem('sora.records'), 'sora.lang': 'en', 'sora.physics-readout': '1' }));
    const save = JSON.parse(stored['sora.career']);
    result = { event: eventId, name, tries, skill, bought, ...race, sheet, credits: save.credits, parts: save.cars[0].parts, errors };
  } catch (e) {
    result = { event: eventId, name, tries, skill, error: String(e).split('\n')[0], errors };
    await page.screenshot({ path: join(OUT, `${name}-error.png`) }).catch(() => undefined);
  }
  const video = page.video();
  await context.close();
  const path = await video.path();
  await browser?.close();
  browser = null;
  renameSync(path, join(OUT, `${name}.webm`));
  result.video = `${name}.webm`;
  return result;
}

function eventName(id) {
  return { 'jm-kiviaho': 'Kiviaho Folk Race', 'jm-hirvisuo': 'Hirvisuo Folk Race', 'jm-kiviaho-4': 'Kiviaho Wade', 'jm-hirvisuo-4': 'Hirvisuo Long Folk Race', 'jm-final': 'Folk Race Final', 'c-kiviaho': 'Kiviaho Sprint' }[id] ?? id;
}

/** The parts shop: buy the first part in WANT the money allows, up to two, and a can of oil when the boot is short. */
async function shop(page) {
  const bought = [];
  await page.getByRole('button', { name: /Parts shop/ }).tap();
  await page.locator('.card.part').first().waitFor();
  for (let n = 0; n < 2; n++) {
    let got = null;
    for (const want of WANT) {
      const card = page.locator('.card.part:not(.locked):not(.done)').filter({ hasText: want });
      if ((await card.count()) === 0) continue;
      const lvl = (await card.first().locator('.ic').textContent()).trim()[0];
      await card.first().tap();
      await page.waitForTimeout(250);
      got = `${want} ${Number(lvl) + 1}`;
      break;
    }
    if (!got) break;
    bought.push(got);
  }
  await page.getByRole('button', { name: /Garage/ }).first().tap();
  await page.getByRole('button', { name: /Armoury/ }).tap();
  const oil = page.locator('.card').filter({ hasText: 'Oil can' });
  for (let n = 0; n < 3; n++) {
    const card = page.locator('.card:not(.locked):not(.done)').filter({ hasText: 'Oil can' });
    const have = Number(((await oil.first().textContent()) ?? '').match(/(\d+)\s*\/\s*9/)?.[1] ?? 9);
    if (have >= 3 || (await card.count()) === 0) break;
    await card.first().tap();
    await page.waitForTimeout(200);
    bought.push('Oil can');
  }
  await page.getByRole('button', { name: /Garage/ }).first().tap();
  await page.getByRole('button', { name: 'Races', exact: true }).waitFor();
  return bought;
}

/**
 * The hand on the race, from the lights to the flag. The hand (tools/hand.ts, on window.__Hand)
 * runs in the page once a frame, as a thumb does: each frame it sees where the car points and
 * where the road goes and moves its thumb and pedal; this turns them into TouchEvents on the
 * game's own element, the ones input.ts listens to, so the dead zone, the response curve, the
 * walking centre, the pedal circle and the tap all count. The script outside only waits for the
 * flag and reads the tally.
 */
async function drive(page, skill) {
  const W = phone.viewport.width;
  const H = phone.viewport.height;
  await page.evaluate(
    ({ skill, W, H, SPEED }) => {
      const root = document.querySelector('.game');
      const canvas = root.querySelector('canvas.view');
      const input = window.__input;
      const s = window.__sim;
      const hand = new window.__Hand(skill);
      // what the game read off the controls, for the trace
      const read = input.read.bind(input);
      input.read = () => (window.__lastInput = read());
      // the right thumb lands low on the right, clear of the pause and mute buttons at the top
      const land = { x: Math.round(W * 0.72), y: Math.round(H * 0.64) };
      const mk = (id, x, y) => new Touch({ identifier: id, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
      const fire = (type, changed, all) => canvas.dispatchEvent(new TouchEvent(type, { touches: all, changedTouches: changed, targetTouches: all, bubbles: true, cancelable: true }));
      const stats = { ticks: 0, offRoad: 0, sliding: 0, air: 0, slow: 0, tows: 0, backOuts: 0, wrecks: 0, rams: 0, rammed: 0, nitro: 0, fullLock: 0, steerSum: 0, brakeTicks: 0, place: 0, laps: [], finished: false, frames: 0, trace: [], lapDamage: [], fieldDamage: [], oiled: 0, oilPaid: 0 };
      window.__drive = stats;
      // kept apart from the stats the script polls twice a second: serialising a growing series
      // with them took the page to 7 frames a second by the final (2026-10-06)
      const series = (window.__series = []);
      let thumb = null; // { x } while down
      let pedal = null; // { x, y } while down
      let tap = null; // a nitro tap in progress: { phase, at }
      const seen = new WeakSet();
      let last = performance.now();
      const all = () => [thumb && mk(1, thumb.x, land.y), pedal && mk(2, pedal.x, pedal.y)].filter(Boolean);
      const thumbDown = (x) => {
        thumb = { x };
        fire('touchstart', [mk(1, x, land.y)], all());
      };
      const thumbUp = () => {
        const t = mk(1, thumb.x, land.y);
        thumb = null;
        fire('touchend', [t], all());
      };
      const tick = (now) => {
        requestAnimationFrame(tick);
        // the hand's clock in sim time: the page's own pace (the game pace times ?speed=)
        const dt = Math.min(0.1, (now - last) / 1000) * (window.__pace ?? SPEED);
        last = now;
        stats.frames++;
        const c = s.cars[0];
        if (s.finished) {
          stats.finished = true;
          stats.place = s.cars.filter((o) => o.progress > c.progress).length + 1;
          stats.laps = c.laps.slice();
          if (thumb) thumbUp();
          return;
        }
        if (s.hold <= 0) {
          stats.ticks++;
          if (!c.onRoad) stats.offRoad++;
          if (c.sliding) stats.sliding++;
          if (c.air) stats.air++;
          if (c.speed < 2 && c.wreck <= 0) stats.slow++;
          for (const x of s.toasts) {
            if (seen.has(x)) continue;
            seen.add(x);
            if (x.text.en === 'Towed') stats.tows++;
            if (x.text.en === 'Backing out') stats.backOuts++;
            if (/oiled you/.test(x.text.en)) stats.oiled++;
            if (/slid!/.test(x.text.en)) stats.oilPaid++;
          }
          if (c.laps.length > stats.lapDamage.length) stats.lapDamage.push(Math.round(c.damage));
          stats.fieldDamage = s.cars.map((o) => Math.round(o.damage));
          stats.wrecks = c.wrecked;
          stats.rams = c.rams;
          stats.rammed = c.rammed;
          // the speed profile of the best lap so far: the fastest the car went in each 10 m of the lap
          const bucket = Math.floor(c.s / 10);
          const row = stats.trace[bucket] ?? (stats.trace[bucket] = { v: 0, steer: 0, slide: 0, n: 0, ax: 0, brake: 0, grass: 0, air: 0, boost: 0, throttle: 0 });
          row.v = Math.max(row.v, c.speed);
          row.steer += Math.abs(c.steer);
          row.slide += Math.abs(c.slipAngle);
          row.ax += c.ax;
          row.brake += input.braking ? 1 : 0;
          row.grass += c.surface !== 'gravel' ? 1 : 0;
          row.air += c.air ? 1 : 0;
          row.boost += c.boosting > 0 ? 1 : 0;
          row.throttle += window.__lastInput?.throttle ?? -1;
          row.n++;
          // the thumb as the game read it, the yaw rate and the body's slip, in sim time: thumbFollow() reads the lag
          series.push([s.time, window.__lastInput?.steer ?? 0, c.yaw, c.slipAngle, c.slick > 0 || c.hit ? 1 : 0, c.speed, window.__lastInput?.brake ?? 0]);
          stats.steerSum += Math.abs(c.steer);
          if (Math.abs(c.steer) > 0.95) stats.fullLock++;
          if (pedal) stats.brakeTicks++;
        }
        // the hand looks, and REACT later its thumb and pedal have moved
        const want = hand.input(s, c, dt);
        if (s.hold > 0.3) {
          if (!thumb) thumbDown(land.x);
          return;
        }
        // a nitro tap: lift the thumb, tap beside it, land again
        if (tap) {
          if (tap.phase === 0) {
            fire('touchstart', [mk(1, land.x + 30, land.y - 20)], [...all(), mk(1, land.x + 30, land.y - 20)]);
            tap = { phase: 1, at: now + 70 };
          } else if (now >= tap.at) {
            fire('touchend', [mk(1, land.x + 30, land.y - 20)], all());
            thumbDown(land.x);
            stats.nitro++;
            tap = null;
          }
          return;
        }
        if (want.boost && thumb) {
          thumbUp();
          tap = { phase: 0, at: now };
          return;
        }
        if (!thumb) thumbDown(land.x);
        // the thumb's px off where it landed, as the hand holds it; the centre is where the game thinks the thumb landed
        thumb.x = input.wheel.x0 + hand.thumb;
        if (hand.pedal && !pedal) {
          pedal = { x: input.pedal.x, y: input.pedal.y };
          fire('touchstart', [mk(2, pedal.x, pedal.y)], all());
        } else if (!hand.pedal && pedal) {
          const pt = mk(2, pedal.x, pedal.y);
          pedal = null;
          fire('touchend', [pt], all());
        }
        fire('touchmove', [mk(1, thumb.x, land.y)], all());
      };
      requestAnimationFrame(tick);
    },
    { skill, W, H, SPEED },
  );
  const t0 = Date.now();
  let stats = null;
  while (Date.now() - t0 < 480000 / SPEED) {
    stats = await page.evaluate(() => window.__drive);
    if (stats.finished) break;
    if (Date.now() - t0 > 4000 && stats.frames === 0) throw new Error('the driver never ran a frame');
    await page.waitForTimeout(500);
  }
  stats.series = await page.evaluate(() => window.__series);
  stats.seconds = ((Date.now() - t0) / 1000) * (await page.evaluate(() => window.__pace ?? 1));
  stats.meanTick = stats.ticks ? (1000 * stats.seconds) / Math.max(1, stats.frames) : 0;
  return stats;
}

/**
 * How the car follows the thumb over a race, from the series the page kept: the delay, in sim
 * seconds, at which the yaw rate best matches the thumb's steer (the peak of their correlation,
 * 0 to 0.6 s), read only where the tyres grip (the body under 0.15 rad of slip, no slick, no
 * contact, over 5 m/s): a slide turns the car whatever the thumb does. And the moments the body
 * went more than 0.5 rad sideways above 5 m/s and not just out of a reverse, each counted once
 * however long it lasts: `spins` all of them, `pedalSpins` those that began within a second of
 * the pedal (it locks the rear at speed and swings the tail, by design), `snaps` those that began
 * with no pedal, no slick under the car and no contact in the second before: the steering alone.
 * ADR 0005: the yaw rate follows the wheel within a fifth of a second.
 */
function thumbFollow(series) {
  if (!series?.length) return { lag: NaN, corr: NaN, spins: 0, pedalSpins: 0, snaps: 0 };
  const t0 = series[0][0];
  const n = Math.floor((series[series.length - 1][0] - t0) * 60);
  const steer = new Float64Array(n);
  const yaw = new Float64Array(n);
  const grip = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    while (k < series.length - 1 && series[k + 1][0] - t0 <= i / 60) k++;
    const [, st, y, slip, touched, v] = series[k];
    steer[i] = st;
    yaw[i] = y;
    grip[i] = Math.abs(slip) < 0.15 && !touched && v > 5 ? 1 : 0;
  }
  let best = { lag: NaN, corr: -Infinity };
  for (let d = 0; d <= 36; d++) {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i + d < n; i++) {
      if (!grip[i] || !grip[i + d]) continue;
      sxy += steer[i] * yaw[i + d];
      sxx += steer[i] * steer[i];
      syy += yaw[i + d] * yaw[i + d];
    }
    const corr = sxy / Math.sqrt(sxx * syy || 1);
    if (corr > best.corr) best = { lag: d / 60, corr };
  }
  let spins = 0;
  let pedalSpins = 0;
  let snaps = 0;
  let out = false;
  let lastTouch = -9;
  let lastReverse = -9;
  let lastPedal = -9;
  for (const [t, , , slip, touched, v, pedal] of series) {
    if (touched) lastTouch = t;
    if (v < 0) lastReverse = t;
    if (pedal) lastPedal = t;
    const a = Math.abs(slip);
    // a car turning out of a back-out is sideways to its path for a moment, not spinning
    if (!out && a > 0.5 && v > 5 && t - lastReverse > 1.5) {
      spins++;
      if (t - lastPedal < 1) pedalSpins++;
      else if (t - lastTouch > 1) snaps++;
      out = true;
    } else if (out && a < 0.35) out = false;
  }
  return { ...best, spins, pedalSpins, snaps };
}

// the hour
try {
  for (let i = 0; i < RACES.length; i++) {
    const id = RACES[i];
    const skill = SKILL[Math.min(SKILL.length - 1, i)];
    for (let tries = 1; tries <= TRIES; tries++) {
      const r = await attempt(id, i, tries, skill);
      Object.assign(r, { follow: thumbFollow(r.series) });
      delete r.series;
      summary.push(r);
      const best = r.laps?.length ? Math.min(...r.laps) : null;
      console.log(`${r.name}: ${r.error ? `ERROR ${r.error}` : `P${r.place} laps ${r.laps.map((l) => l.toFixed(1)).join(' ')} best ${best?.toFixed(1)} off road ${((100 * r.offRoad) / Math.max(1, r.ticks)).toFixed(0)}% sliding ${((100 * r.sliding) / Math.max(1, r.ticks)).toFixed(0)}% tows ${r.tows} back-outs ${r.backOuts} wrecked ${r.wrecks} nitro ${r.nitro} credits ${r.credits} bought ${r.bought.join(', ') || '-'} damage/lap ${r.lapDamage.join('/')} field ${r.fieldDamage.join('/')} oiled ${r.oiled} oiled them ${r.oilPaid} brake ${((100 * r.brakeTicks) / Math.max(1, r.ticks)).toFixed(0)}% full lock ${((100 * r.fullLock) / Math.max(1, r.ticks)).toFixed(0)}% yaw follows the thumb ${r.follow.lag.toFixed(2)} s late (r ${r.follow.corr.toFixed(2)}) spins ${r.follow.spins}: the pedal ${r.follow.pedalSpins}, the steering alone ${r.follow.snaps} frame ${r.meanTick.toFixed(0)} ms`}`);
      if (r.error || r.place === 1 || (i >= 2 && r.place <= 2)) break;
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
rmSync(join(OUT, 'tmp'), { recursive: true, force: true });

// frame sheets: a frame a second of each video, six by six on a canvas, so a race is read at a
// glance. Playwright's own ffmpeg pulls the frames (it has no tile filter); a page lays them out
const ffmpegDir = readdirSync(join(homedir(), 'Library/Caches/ms-playwright')).find((d) => d.startsWith('ffmpeg-'));
const ffmpeg = ffmpegDir && join(homedir(), 'Library/Caches/ms-playwright', ffmpegDir, 'ffmpeg-mac');
if (ffmpeg && existsSync(ffmpeg)) {
  mkdirSync(join(OUT, 'sheets'), { recursive: true });
  const sheets = await chromium.launch(GPU);
  for (const r of summary) {
    const frames = join(OUT, 'tmp-frames');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    try {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(OUT, r.video), '-r', '1', '-s', '367x172', join(frames, '%03d.png')]);
      const files = readdirSync(frames).sort();
      const page = await sheets.newPage();
      for (let k = 0; k * 36 < files.length; k++) {
        const batch = files.slice(k * 36, k * 36 + 36).map((f) => `data:image/png;base64,${readFileSync(join(frames, f)).toString('base64')}`);
        await page.setContent(`<body style="margin:0;background:#111"><div style="display:grid;grid-template-columns:repeat(6,367px);gap:1px;width:${6 * 368}px">${batch.map((src, i) => `<div style="position:relative"><img src="${src}" style="display:block"><span style="position:absolute;left:4px;top:2px;color:#ffd870;font:bold 14px monospace;text-shadow:0 0 3px #000">${k * 36 + i}s</span></div>`).join('')}</div></body>`);
        await page.setViewportSize({ width: 6 * 368, height: Math.ceil(batch.length / 6) * 173 });
        await page.screenshot({ path: join(OUT, 'sheets', `${r.name}-${k + 1}.png`), fullPage: true });
      }
      await page.close();
    } catch (e) {
      console.log(`no sheet for ${r.name}: ${String(e).split('\n')[0]}`);
    }
    rmSync(frames, { recursive: true, force: true });
  }
  await sheets.close();
}

// the summary
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
const rows = summary.map((r) => {
  const best = r.laps?.length ? Math.min(...r.laps) : null;
  return `| ${r.name} | ${r.error ? 'error' : `P${r.place}`} | ${r.laps?.map((l) => l.toFixed(1)).join(' ') ?? ''} | ${best?.toFixed(1) ?? ''} | ${r.ticks ? ((100 * r.offRoad) / r.ticks).toFixed(0) : ''}% | ${r.tows ?? ''} | ${r.wrecks ?? ''} | ${r.credits ?? ''} | ${r.bought?.join(', ') ?? ''} | ${r.follow ? `${r.follow.lag.toFixed(2)} s` : ''} | ${r.follow ? `${r.follow.spins}: pedal ${r.follow.pedalSpins}, steering ${r.follow.snaps}` : ''} |`;
});
writeFileSync(join(OUT, 'summary.md'), `| race | place | laps | best | off road | tows | wrecked | credits after | bought before | yaw follows thumb | past 0.5 rad sideways |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);

// the rules of a fun hour
const byEvent = (id) => summary.filter((r) => r.event === id);
const won = (id) => byEvent(id).some((r) => r.place === 1);
check(summary.every((r) => !r.error && r.finished), 'every race is finished by the thumb');
check(summary.every((r) => !r.errors?.length), `no page errors (${summary.flatMap((r) => r.errors ?? []).slice(0, 3).join('; ') || 'none'})`);
for (const id of RACES.slice(0, 2)) if (byEvent(id).length) check(won(id), `${id}: won within ${TRIES} tries (${byEvent(id).map((r) => `P${r.place ?? '-'}`).join(' ')})`);
// the folk loops are about 400 m and the stock Tauno slow on purpose (2026-10-05): the headless hand
// at 0.5 laps Kiviahon lenkki in 25 s stock, the bot in 24
const laps = summary.flatMap((r) => (r.event.startsWith('jm-kiviaho') || r.event === 'jm-final') && r.laps ? r.laps : []);
if (laps.length) check(Math.min(...laps) < 27, `a thumb lap of Kiviahon lenkki in the Tauno comes in under 27 s (best ${Math.min(...laps).toFixed(1)})`);
// a built Tauno in the final runs 110 km/h on nitro and this hand overshoots an ess now and then: the final may run a third off
check(summary.every((r) => !r.ticks || r.offRoad / r.ticks < (r.event === 'jm-final' ? 0.33 : 0.2)), `the thumb keeps the car mostly on the road (under 20% off, a third in the final: ${summary.map((r) => (r.ticks ? ((100 * r.offRoad) / r.ticks).toFixed(0) + '%' : '-')).join(' ')})`);
check(summary.every((r) => (r.tows ?? 0) <= 2), 'no race needs more than two tows');
check(summary.every((r) => !r.follow || r.follow.lag <= 0.2), `the yaw rate follows the thumb within a fifth of a second (${summary.map((r) => r.follow?.lag.toFixed(2) ?? '-').join(' ')} s)`);
check(summary.every((r) => !r.follow || r.follow.snaps <= 1), `the steering alone puts the car past 0.5 rad sideways at most once a race: no snap (${summary.map((r) => r.follow?.snaps ?? '-').join(' ')}; the pedal's slides ${summary.map((r) => r.follow?.pedalSpins ?? '-').join(' ')})`);
const final = byEvent('jm-final');
if (final.length) check(final.some((r) => r.place <= 2), `the final is a fight: top two within ${TRIES} tries (${final.map((r) => `P${r.place ?? '-'}`).join(' ')})`);
console.log(failed ? 'playthrough failed' : 'playthrough ok');
process.exitCode = failed ? 1 : 0;
