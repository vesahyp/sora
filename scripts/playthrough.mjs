// The first hour of the career, played on a phone by a thumb that is not the bot: every folk
// race on both tracks, on an emulated iPhone in landscape, every input a real touch through the
// game's own controls (the drag that steers, the second finger on the pedal, the tap for nitro),
// a video of each race, parts bought between races the way a player buys them. The driver is a
// model of a hand, not the learnt bot: it looks down the road and pushes the thumb in proportion
// to how wrong the heading looks, a reaction late (REACT), the thumb at a thumb's speed, a little
// jitter, brakes for a bend when it looks too fast and now and then too late, and gets better race
// by race (SKILL). The bot in tools/autoplayer.ts asks the car for yaw rates and knows the tyres'
// limit; this one does not, which is the point: it is the thumb the game has to be fun for.
//
// `make playthrough` (PORT=5187 when another repo's dev server holds the default; RACES=jm-kiviaho,
// jm-hirvisuo to play a subset). Needs `make shots-setup`. Writes shots/playthrough/: a .webm per
// attempt, the result sheet of each, frame sheets to read the race at a glance (every second of
// it, six by six), and summary.json and summary.md with the places, the laps, the time off the
// road, the tows and the money. Exits non-zero when the hour is not fun by the rules at the end:
// a race not finished, the first two folk races not won in three tries, the final not a fight.
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
const OUT = 'shots/playthrough';
const JM = ['jm-kiviaho', 'jm-hirvisuo', 'jm-kiviaho-4', 'jm-hirvisuo-4', 'jm-final'];
const RACES = process.env.RACES ? process.env.RACES.split(',') : JM;
/** the hand's skill per race of the hour, 0..1: the first race is a stranger to the car, the final has learnt it */
const SKILL = [0.5, 0.6, 0.7, 0.8, 0.85];
/** seconds between seeing and doing */
const REACT = 0.12;
/** px/s the thumb moves at most */
const THUMB_SPEED = 1200;
/** px of hand jitter */
const JITTER = 2.5;
/** tries at a race before the hour moves on: a human retries the one that pays the next part */
const TRIES = 3;
/** the parts a folk racer buys, in the order the money allows (docs/progression.md) */
const WANT = ['Ram bar', 'Tyres', 'Engine', 'Nitro', 'Ram bar', 'Tyres', 'Engine', 'Armour'];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const phone = devices['iPhone 15 landscape'];
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
/** the career between races: the save and the records, carried from one page to the next */
let stored = { 'sora.career': null, 'sora.records': null, 'sora.lang': 'en' };
const summary = [];

/** px of thumb travel for a steer of -1..1: the response curve in input.ts, inverted */
const travel = (steer, lock) => {
  const a = Math.pow(Math.min(1, Math.abs(steer)), 1 / 1.7);
  return Math.sign(steer) * (4 + a * (lock - 4));
};

/** One attempt at an event: a fresh page carrying the save, the garage, the race, the result. */
async function attempt(eventId, index, tries, skill) {
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
    await page.goto(`http://localhost:${port}/sora/?lang=en`);
    if (!/sora/i.test(await page.title())) throw new Error(`not Sora on port ${port}: ${await page.title()}`);
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
    stored = await page.evaluate(() => ({ 'sora.career': localStorage.getItem('sora.career'), 'sora.records': localStorage.getItem('sora.records'), 'sora.lang': 'en' }));
    const save = JSON.parse(stored['sora.career']);
    result = { event: eventId, name, tries, skill, bought, ...race, sheet, credits: save.credits, parts: save.cars[0].parts, errors };
  } catch (e) {
    result = { event: eventId, name, tries, skill, error: String(e).split('\n')[0], errors };
    await page.screenshot({ path: join(OUT, `${name}-error.png`) }).catch(() => undefined);
  }
  const video = page.video();
  await context.close();
  const path = await video.path();
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
 * The hand on the race, from the lights to the flag. It runs in the page, once a frame, as a
 * thumb does: each frame it sees where the car points and where the road goes, decides where the
 * thumb should be and whether the pedal is down, and REACT seconds later moves the thumb there at
 * a thumb's speed. The touches are TouchEvents on the game's own element, the ones input.ts
 * listens to, so the dead zone, the response curve, the walking centre, the pedal circle and the
 * tap all count. The script outside only waits for the flag and reads the tally.
 */
async function drive(page, skill) {
  const W = phone.viewport.width;
  const H = phone.viewport.height;
  await page.evaluate(
    ({ skill, REACT, THUMB_SPEED, JITTER, W, H }) => {
      const root = document.querySelector('.game');
      const canvas = root.querySelector('canvas');
      const input = window.__input;
      const s = window.__sim;
      // what the game read off the controls, for the trace
      const read = input.read.bind(input);
      input.read = () => (window.__lastInput = read());
      // the right thumb lands low on the right, clear of the pause and mute buttons at the top
      const land = { x: Math.round(W * 0.72), y: Math.round(H * 0.64) };
      const mk = (id, x, y) => new Touch({ identifier: id, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
      const fire = (type, changed, all) => canvas.dispatchEvent(new TouchEvent(type, { touches: all, changedTouches: changed, targetTouches: all, bubbles: true, cancelable: true }));
      const stats = { ticks: 0, offRoad: 0, sliding: 0, air: 0, slow: 0, tows: 0, backOuts: 0, wrecks: 0, rams: 0, rammed: 0, nitro: 0, fullLock: 0, steerSum: 0, brakeTicks: 0, place: 0, laps: [], finished: false, frames: 0, trace: [], lapDamage: [], fieldDamage: [], oiled: 0, oilPaid: 0 };
      window.__drive = stats;
      let seed = 1234 + Math.round(skill * 1000);
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const queue = [];
      let thumb = null; // { x } while down
      let pedal = null; // { x, y } while down
      let jitter = 0;
      let lateBend = -1;
      let lateJudged = false;
      let tap = null; // a nitro tap in progress: { phase, at }
      const seen = new WeakSet();
      // oil on the road: a slick is noticed, or not, once, as it comes into view, with a chance
      // that grows with skill; a noticed slick is driven round, a missed one is driven through
      const noticed = new WeakMap();
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
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        stats.frames++;
        const c = s.cars[0];
        const t = s.track;
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
          stats.steerSum += Math.abs(c.steer);
          if (Math.abs(c.steer) > 0.95) stats.fullLock++;
          if (pedal) stats.brakeTicks++;
        }
        // what the driver sees: the road about a second ahead, cut toward the inside of the bend
        const speed = Math.max(0, c.speed);
        const look = 8 + 0.6 * speed;
        const turnAhead = t.curvatureAhead(c.s, look + 18);
        let inside = Math.max(-1, Math.min(1, turnAhead * 1.5)) * t.width * 0.15;
        for (const o of s.oils) {
          const at = t.locate(o.x, o.y);
          let gap = at.s - c.s;
          if (gap < -t.length / 2) gap += t.length;
          if (gap > t.length / 2) gap -= t.length;
          if (gap < 3 || gap > look + 14) continue;
          if (!noticed.has(o)) noticed.set(o, rand() < 0.35 + 0.6 * skill);
          if (!noticed.get(o)) continue;
          const clear = 1.5 + c.def.width / 2 + 0.4;
          if (Math.abs(at.d - inside) > clear) continue;
          const room = t.width / 2 - 0.9;
          const left = at.d - clear;
          const right = at.d + clear;
          inside = Math.max(-room, Math.min(room, left < -room ? right : right > room ? left : Math.abs(left - inside) < Math.abs(right - inside) ? left : right));
        }
        const p = t.at(c.s + look);
        let err = Math.atan2(p.y + p.tx * inside - c.y, p.x - p.ty * inside - c.x) - c.heading;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        const steer = Math.max(-1, Math.min(1, err * 2.2));
        // the bend coming: the tightest radius over the stopping distance, and the speed a hand
        // that does not know the tyres' limit allows for it, with a bend now and then judged late
        const stop = Math.min(c.def.brake, c.def.grip) * 0.6;
        const brakeDist = 6 + (speed * speed) / (2 * stop);
        let sharpest = 0;
        let at = 0;
        for (let a = 4; a <= brakeDist + 24; a += 4) {
          const k = Math.abs(t.curvatureAhead(c.s + a, 12));
          if (k > sharpest) {
            sharpest = k;
            at = a;
          }
        }
        const radius = sharpest < 0.04 ? Infinity : 12 / sharpest;
        const bend = Math.floor((c.s + at) / 40);
        if (bend !== lateBend) {
          lateBend = bend;
          lateJudged = rand() < 0.5 * (1 - skill);
        }
        const margin = (0.6 + 0.55 * skill) * (lateJudged ? 1.25 : 1);
        const allowed = radius === Infinity ? Infinity : Math.sqrt(c.def.grip * margin * radius) * (c.onRoad ? 1 : 0.75);
        let brake = speed > allowed * 1.04 || (pedal && speed > allowed * 0.97);
        if (Math.abs(c.slipAngle) > 0.35 && speed > 6) brake = false;
        const straight = Math.abs(t.curvatureAhead(c.s, 60)) < 0.25;
        const nitro = s.hold <= 0 && straight && c.boost > 0.5 && c.boosting <= 0 && speed > 10 && !brake && rand() < 0.02;
        queue.push({ at: now + REACT * 1000, steer, brake, nitro });
        // the hand tremor: a slow wander of a few px
        jitter = Math.max(-JITTER, Math.min(JITTER, jitter + (rand() - 0.5) * 0.8));
        // the hand acts on what it saw REACT ago
        let d = null;
        while (queue.length && queue[0].at <= now) d = queue.shift();
        if (!d) return;
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
        if (d.nitro && thumb) {
          thumbUp();
          tap = { phase: 0, at: now };
          return;
        }
        if (!thumb) thumbDown(land.x);
        const travel = (() => {
          const a = Math.pow(Math.min(1, Math.abs(d.steer)), 1 / 1.7);
          return Math.sign(d.steer) * (4 + a * (input.lock - 4));
        })();
        const wantX = input.wheel.x0 + travel + jitter;
        const step = THUMB_SPEED * dt;
        thumb.x = Math.max(thumb.x - step, Math.min(thumb.x + step, wantX));
        if (d.brake && !pedal) {
          pedal = { x: input.pedal.x, y: input.pedal.y };
          fire('touchstart', [mk(2, pedal.x, pedal.y)], all());
        } else if (!d.brake && pedal) {
          const pt = mk(2, pedal.x, pedal.y);
          pedal = null;
          fire('touchend', [pt], all());
        }
        fire('touchmove', [mk(1, thumb.x, land.y)], all());
      };
      requestAnimationFrame(tick);
    },
    { skill, REACT, THUMB_SPEED, JITTER, W, H },
  );
  const t0 = Date.now();
  let stats = null;
  while (Date.now() - t0 < 480000) {
    stats = await page.evaluate(() => window.__drive);
    if (stats.finished) break;
    if (Date.now() - t0 > 4000 && stats.frames === 0) throw new Error('the driver never ran a frame');
    await page.waitForTimeout(500);
  }
  stats.seconds = (Date.now() - t0) / 1000;
  stats.meanTick = stats.ticks ? (1000 * stats.seconds) / Math.max(1, stats.frames) : 0;
  return stats;
}

// the hour
try {
  for (let i = 0; i < RACES.length; i++) {
    const id = RACES[i];
    const skill = SKILL[Math.min(SKILL.length - 1, i)];
    for (let tries = 1; tries <= TRIES; tries++) {
      const r = await attempt(id, i, tries, skill);
      summary.push(r);
      const best = r.laps?.length ? Math.min(...r.laps) : null;
      console.log(`${r.name}: ${r.error ? `ERROR ${r.error}` : `P${r.place} laps ${r.laps.map((l) => l.toFixed(1)).join(' ')} best ${best?.toFixed(1)} off road ${((100 * r.offRoad) / Math.max(1, r.ticks)).toFixed(0)}% sliding ${((100 * r.sliding) / Math.max(1, r.ticks)).toFixed(0)}% tows ${r.tows} back-outs ${r.backOuts} wrecked ${r.wrecks} nitro ${r.nitro} credits ${r.credits} bought ${r.bought.join(', ') || '-'} damage/lap ${r.lapDamage.join('/')} field ${r.fieldDamage.join('/')} oiled ${r.oiled} oiled them ${r.oilPaid} brake ${((100 * r.brakeTicks) / Math.max(1, r.ticks)).toFixed(0)}% full lock ${((100 * r.fullLock) / Math.max(1, r.ticks)).toFixed(0)}% frame ${r.meanTick.toFixed(0)} ms`}`);
      if (r.error || r.place === 1 || (i >= 2 && r.place <= 2)) break;
    }
  }
} finally {
  await browser.close();
  server.kill();
}
rmSync(join(OUT, 'tmp'), { recursive: true, force: true });

// frame sheets: a frame a second of each video, six by six on a canvas, so a race is read at a
// glance. Playwright's own ffmpeg pulls the frames (it has no tile filter); a page lays them out
const ffmpegDir = readdirSync(join(homedir(), 'Library/Caches/ms-playwright')).find((d) => d.startsWith('ffmpeg-'));
const ffmpeg = ffmpegDir && join(homedir(), 'Library/Caches/ms-playwright', ffmpegDir, 'ffmpeg-mac');
if (ffmpeg && existsSync(ffmpeg)) {
  mkdirSync(join(OUT, 'sheets'), { recursive: true });
  const sheets = await chromium.launch();
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
  return `| ${r.name} | ${r.error ? 'error' : `P${r.place}`} | ${r.laps?.map((l) => l.toFixed(1)).join(' ') ?? ''} | ${best?.toFixed(1) ?? ''} | ${r.ticks ? ((100 * r.offRoad) / r.ticks).toFixed(0) : ''}% | ${r.tows ?? ''} | ${r.wrecks ?? ''} | ${r.credits ?? ''} | ${r.bought?.join(', ') ?? ''} |`;
});
writeFileSync(join(OUT, 'summary.md'), `| race | place | laps | best | off road | tows | wrecked | credits after | bought before |\n|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);

// the rules of a fun hour
const byEvent = (id) => summary.filter((r) => r.event === id);
const won = (id) => byEvent(id).some((r) => r.place === 1);
check(summary.every((r) => !r.error && r.finished), 'every race is finished by the thumb');
check(summary.every((r) => !r.errors?.length), `no page errors (${summary.flatMap((r) => r.errors ?? []).slice(0, 3).join('; ') || 'none'})`);
for (const id of RACES.slice(0, 2)) if (byEvent(id).length) check(won(id), `${id}: won within ${TRIES} tries (${byEvent(id).map((r) => `P${r.place ?? '-'}`).join(' ')})`);
const laps = summary.flatMap((r) => (r.event.startsWith('jm-kiviaho') || r.event === 'jm-final') && r.laps ? r.laps : []);
if (laps.length) check(Math.min(...laps) < 36, `a thumb lap of Kiviaho in the Tauno comes in under 36 s (best ${Math.min(...laps).toFixed(1)})`);
// a built Tauno in the final runs 110 km/h on nitro and this hand overshoots an ess now and then: the final may run a third off
check(summary.every((r) => !r.ticks || r.offRoad / r.ticks < (r.event === 'jm-final' ? 0.33 : 0.2)), `the thumb keeps the car mostly on the road (under 20% off, a third in the final: ${summary.map((r) => (r.ticks ? ((100 * r.offRoad) / r.ticks).toFixed(0) + '%' : '-')).join(' ')})`);
check(summary.every((r) => (r.tows ?? 0) <= 2), 'no race needs more than two tows');
const final = byEvent('jm-final');
if (final.length) check(final.some((r) => r.place <= 2), `the final is a fight: top two within ${TRIES} tries (${final.map((r) => `P${r.place ?? '-'}`).join(' ')})`);
console.log(failed ? 'playthrough failed' : 'playthrough ok');
process.exitCode = failed ? 1 : 0;
