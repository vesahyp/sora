/**
 * npm run sim-check: the bot drives every car round every track and the
 * lap must be clean enough to ship. Prints the lap table, then asserts.
 * Run by `make check`, so a physics change that strands the bot fails the
 * build.
 */
import { createState } from '../src/game/state';
import { step, DT, TOW_AFTER } from '../src/game/sim';
import { TRACKS } from '../src/game/content/tracks';
import { CARS, classCar } from '../src/game/content/cars';
import { botInput, DEFAULT_BOT } from './autoplayer';
import { OPPONENTS } from '../src/game/content/drivers';
import type { CarClass } from '../src/game/types';
import { PICKUPS } from '../src/game/content/pickups';
import { standings } from '../src/game/state';
import { STOCK, tuned } from '../src/game/content/parts';
import { RIVAL_CARS, rivalEntry, rivalField, vehicleDef } from '../src/game/content/rivals';
import { CLASSES } from '../src/game/types';
import { canCarry, carried } from '../src/game/content/weapons';

/**
 * A phone's view of the world in metres, portrait: the renderer shows
 * fourteen cars across the short side (CARS_ACROSS in renderer.ts), so
 * 24 m by 52 m. The shares of the race that another car must be on it
 * and that a target must be in the sights, averaged over six races
 * (every grid order). On the closer camera (17 by 37 m) with the field
 * at the bot's ceiling the armed classes sat at 29 to 44% and JM at 66
 * to 75%; the floor is a quarter, the target still a half, and PACING
 * is the knob. JM's field is slow on purpose since 2026-10-04 (skill per
 * class, rivals.ts): the player leaves it behind, at 17 to 36% on
 * screen and 5 to 11% in the sights, so JM's floors are 15% and 3%.
 */
const VIEW = { w: 24, h: 52 };
const ON_SCREEN_MIN = 0.25;
const ON_SCREEN_MIN_JM = 0.15;
const IN_SIGHTS_MIN = 0.1;
/** JM has no gun, so the sights only say someone is ahead; the player leaves a slow field behind */
const IN_SIGHTS_MIN_JM = 0.03;

declare const process: { argv: string[]; exitCode?: number };

let failed = false;
const assert = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

/** The player's result in each armed race, the default bot at the wheel: place, and the gap to the best rival (negative is ahead). */
const results: { track: string; cls: CarClass; grid: string; place: number; gap: number }[] = [];

// the full workout on the class cars, the career's spine; the dealer's wild buys are lapped alone below
for (const track of TRACKS) {
  for (const car of CLASSES.map(classCar)) {
    // alone first: the clean lap, and the track's ground on the way round: every flight, from a
    // river's lip or a crest, logged with where it left and where it came down
    const solo = createState(track, car, 3);
    let offRoad = 0;
    let hits = 0;
    let topSpeed = 0;
    let steps = 0;
    let flight: { s0: number; v0: number; t0: number } | null = null;
    const flights: { s0: number; v0: number; air: number; s1: number; d: number; wet: boolean }[] = [];
    let prevAir = false;
    while (!solo.finished && solo.time < 600) {
      step(solo, [botInput(solo)], DT);
      steps++;
      if (solo.hold <= 0) {
        const c = solo.cars[0];
        if (!c.onRoad) offRoad++;
        if (c.hit) hits++;
        topSpeed = Math.max(topSpeed, c.speed);
        if (!prevAir && c.air) flight = { s0: c.s, v0: c.speed, t0: solo.time };
        // the first touch ends a flight: a bounce after it is the landing, not a second jump
        if (flight && c.air && c.vz <= 0 && c.z <= solo.track.groundAt(c.s, c.d) + 0.02) {
          flights.push({ s0: flight.s0, v0: flight.v0, air: solo.time - flight.t0, s1: c.s, d: Math.abs(c.d), wet: c.surface === 'water' });
          flight = null;
        }
        if (prevAir && !c.air && flight) {
          flights.push({ s0: flight.s0, v0: flight.v0, air: solo.time - flight.t0, s1: c.s, d: Math.abs(c.d), wet: c.surface === 'water' });
          flight = null;
        }
        prevAir = c.air;
      }
    }
    const me = solo.cars[0];
    console.log(`\n${track.id} (${Math.round(solo.track.length)} m, ${track.width} m wide)  ${car.id}`);
    console.log(`  alone: ${me.laps.map((l) => l.toFixed(2)).join('  ')}   top ${(topSpeed * 3.6).toFixed(0)} km/h   off road ${((offRoad / steps) * 100).toFixed(1)}%   tree hits ${hits}`);
    assert(solo.finished, `${track.id}/${car.id}: the bot finishes three laps alone`);
    if (me.laps.length) {
      const best = Math.min(...me.laps);
      assert(best > 15 && best < 90, `${track.id}/${car.id}: a lap is between 15 s and 90 s (${best.toFixed(1)})`);
      assert(offRoad / steps < 0.08, `${track.id}/${car.id}: the bot stays on the road (off ${((offRoad / steps) * 100).toFixed(1)}%)`);
      assert(hits < 30, `${track.id}/${car.id}: the bot rarely meets a tree (${hits} steps)`);
    }
    // the ground: a river is cleared every lap at racing speed, the car coming down on the far
    // bank or the road past it, never in the water; every flight, a crest's too, lands on the road
    const near = (a: number, b: number) => Math.abs(((a - b + solo.track.length * 1.5) % solo.track.length) - solo.track.length / 2);
    (track.rivers ?? []).forEach((r) => {
      const f = flights.filter((x) => near(x.s0, r.s) < 3);
      console.log(`  river at ${r.s} m, ${r.gap} m wide: ${f.map((x) => `${(x.v0 * 3.6).toFixed(0)} km/h ${x.air.toFixed(2)} s down at +${((x.s1 - r.s + solo.track.length) % solo.track.length).toFixed(0)} m d ${x.d.toFixed(1)}`).join(', ') || 'never flown'}`);
      assert(f.length >= 3, `${track.id}/${car.id}: the river at ${r.s} m is jumped every lap (${f.length} flights)`);
      assert(f.every((x) => !x.wet && (x.s1 - r.s + solo.track.length) % solo.track.length > r.gap), `${track.id}/${car.id}: the river at ${r.s} m is cleared, never landed in`);
    });
    (track.crests ?? []).forEach((c) => {
      const f = flights.filter((x) => near(x.s0, c.s) < c.len / 2 + 2);
      console.log(`  crest at ${c.s} m, ${c.h} m: ${f.map((x) => `${(x.v0 * 3.6).toFixed(0)} km/h ${x.air.toFixed(2)} s`).join(', ') || 'only lifted'}`);
    });
    assert(flights.every((x) => x.d < track.width / 2), `${track.id}/${car.id}: every flight lands on the road (${flights.map((x) => x.d.toFixed(1)).join('/')} m off the centreline)`);
    // the shortcut: the bot told to take it drives it without meeting the trees and gains on the
    // lap, but not a free lap: under three seconds, the rest is the driver's
    if (track.shortcuts?.length && me.laps.length) {
      const lane = createState(track, car, 3);
      let inLane = 0;
      let laneHits = 0;
      const tune = { ...DEFAULT_BOT, shortcuts: true };
      while (!lane.finished && lane.time < 600) {
        step(lane, [botInput(lane, lane.cars[0], tune)], DT);
        if (lane.hold > 0) continue;
        if (lane.track.inLane(lane.cars[0].x, lane.cars[0].y)) inLane++;
        if (lane.cars[0].hit) laneHits++;
      }
      const you = lane.cars[0];
      const saved = Math.min(...me.laps) - (you.laps.length ? Math.min(...you.laps) : Infinity);
      console.log(`  shortcut: ${you.laps.map((l) => l.toFixed(2)).join('  ')}   ${(inLane / 60).toFixed(1)} s in the lane, ${laneHits} tree hits, saves ${saved.toFixed(2)} s a lap`);
      assert(lane.finished && laneHits < 30, `${track.id}/${car.id}: the bot drives the shortcut home (${laneHits} tree hits)`);
      assert(inLane > 60 * 3, `${track.id}/${car.id}: the bot takes the shortcut every lap (${(inLane / 60).toFixed(1)} s in it)`);
      assert(saved > 0.3 && saved < 3, `${track.id}/${car.id}: the shortcut is worth taking and not a free lap (saves ${saved.toFixed(2)} s)`);
    }
    // then the race: four bots, armed with what the class carries (oil in JM, mines and the
    // gun from C, missiles from B), so the race is tested with its weapons in. One race is
    // chaos (a wreck early moves everything after it), so it is run in every grid order of the
    // three opponents, everyone must finish each, and the view is the average.
    const guns = canCarry(car.cls, 'mine');
    const parts = guns ? { ...STOCK, gun: 1 } : STOCK;
    const armed = tuned(car, parts);
    const boot = carried(car.cls, { oil: 2, mines: 2, missiles: 2 });
    let racing = 0;
    let onScreen = 0;
    let inSights = 0;
    let playerWrecks = 0;
    let playerRams = 0;
    let stalled = 0;
    let fightCredits = 0;
    let roadCredits = 0;
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const grid of orders) {
      // every rival in their own vehicle at its class's skill: the class car's numbers under their body and mass
      const race = createState(track, armed, 3, grid.map((k) => ({ ...rivalEntry(OPPONENTS[k], car.cls, parts), ...boot })), boot);
      let drifting = 0;
      let boosts = 0;
      let slicks = 0;
      // stalled off the road: off it and not 3 m along the lap since the clock started, per car
      const stalledFrom = race.cars.map(() => ({ t: -1, s: 0 }));
      while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) {
        step(race, race.cars.map((c) => botInput(race, c)), DT);
        race.cars.forEach((c, k) => {
          const st = stalledFrom[k];
          const along = Math.abs(((c.s - st.s + race.track.length * 1.5) % race.track.length) - race.track.length / 2);
          if (race.hold > 0 || c.finishedAt >= 0 || c.wreck > 0 || Math.abs(c.d) <= race.track.width / 2 || along >= 3 || st.t < 0) {
            st.t = Math.abs(c.d) > race.track.width / 2 && c.wreck <= 0 && c.finishedAt < 0 && race.hold <= 0 ? race.time : -1;
            st.s = c.s;
          } else stalled = Math.max(stalled, race.time - st.t);
        });
        for (const c of race.cars) {
          if (c.sliding && c.wreck <= 0) drifting++;
          if (c.boosting > 0) boosts++;
          if (c.slick > 0 && c.wreck <= 0) slicks++;
        }
        // is the race on the player's screen: a living car inside the view around the player,
        // and a car in the player's sights, counted from the lights to the player's flag
        const me = race.cars[0];
        if (race.hold > 0 || me.finishedAt >= 0) continue;
        racing++;
        if (race.cars.some((o) => o !== me && o.wreck <= 0 && Math.abs(o.x - me.x) < VIEW.w / 2 && Math.abs(o.y - me.y) < VIEW.h / 2)) onScreen++;
        if (me.target >= 0) inSights++;
      }
      const me = race.cars[0];
      playerWrecks += me.wrecks;
      playerRams += me.rams + me.rammed;
      fightCredits += me.bounty + me.ramCash;
      roadCredits += me.cash;
      const shots = race.cars.reduce((a, c) => a + c.shots, 0);
      const wrecks = race.cars.reduce((a, c) => a + c.wrecked, 0);
      const cash = race.cars.reduce((a, c) => a + c.cash, 0);
      const oils = race.cars.reduce((a, c) => a + (boot.oil - c.oil), 0);
      console.log(`  guns:  ${shots} rounds, ${oils} cans of oil, ${(slicks / 60).toFixed(0)} s on oil, ${wrecks} wrecks, ${(drifting / 60).toFixed(0)} s sliding, ${(boosts / 60).toFixed(0)} s of nitro, ${cash} cr off the road, damage ${race.cars.map((c) => Math.round(c.damage)).join('/')}`);
      if (guns) assert(shots > 0, `${track.id}/${car.id}: the guns fire (${shots} rounds)`);
      else assert(shots === 0, `${track.id}/${car.id}: no guns in this class (${shots} rounds)`);
      assert(slicks > 0, `${track.id}/${car.id}: oil is laid and somebody crosses it (${(slicks / 60).toFixed(1)} s on oil)`);
      assert(drifting > 60, `${track.id}/${car.id}: the cars slide (${(drifting / 60).toFixed(1)} s)`);
      const order = standings(race);
      console.log(`  race:  ${order.map((c) => `${c.driver.name.en} ${c.finishedAt >= 0 ? c.finishedAt.toFixed(1) : 'DNF'}`).join('  ')}`);
      assert(race.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: the whole field finishes, guns and all`);
      const rivals = race.cars.slice(1).map((c) => (c.finishedAt >= 0 ? c.finishedAt : Infinity));
      results.push({ track: track.id, cls: car.cls, grid: grid.map((k) => OPPONENTS[k].name.en[0]).join(''), place: order.indexOf(me) + 1, gap: me.finishedAt - Math.min(...rivals) });
    }
    const seen = onScreen / Math.max(1, racing);
    const aimed = inSights / Math.max(1, racing);
    // the owner's stuck spot, 2026-10-04: nobody sits off the road going nowhere; the back-out
    // frees a car nose first in the trees and the marshals tow whatever it cannot
    assert(stalled <= TOW_AFTER + 0.1, `${track.id}/${car.id}: no car is stalled off the road more than ${TOW_AFTER} s in any race (longest ${stalled.toFixed(1)} s)`);
    console.log(`  view:  another car on screen ${(seen * 100).toFixed(0)}% of the race, a target in the sights ${(aimed * 100).toFixed(0)}%, the player wrecked ${playerWrecks} in ${orders.length} races`);
    // aggression against the road, the player's own, per race: wrecking and ramming must pay more
    // than driving over cash, or the race teaches the player to drive round the fight. The bot
    // drives the line and rarely takes cash, so it is also held against a race that takes every
    // cash pickup on every lap (they grow back faster than a lap)
    const fight = fightCredits / orders.length;
    const road = roadCredits / orders.length;
    const allCash = createState(track, car, 3).pickups.filter((p) => p.kind === 'cash').length * PICKUPS.cash.amount * 3;
    console.log(`  fight: per race the player rams or is rammed ${(playerRams / orders.length).toFixed(1)} times, wrecks ${(playerWrecks / orders.length).toFixed(1)}, earns ${Math.round(fight)} cr from aggression and ${Math.round(road)} cr off the road (every cash: ${allCash})`);
    // in JM the only weapon is oil and a ram rarely wrecks: the prize is the money there, and the
    // bot player, starting last, lays little oil. It only has to pay at all. With guns the fight
    // has to beat the road, and every cash on every lap
    if (guns) {
      assert(fight > road, `${track.id}/${car.id}: aggression pays more than the road (${Math.round(fight)} > ${Math.round(road)} cr)`);
      assert(fight > allCash, `${track.id}/${car.id}: aggression pays more than taking every cash (${Math.round(fight)} > ${allCash} cr)`);
    } else assert(fight > 0, `${track.id}/${car.id}: oil and rams pay something (${Math.round(fight)} cr a race)`);
    const floor = car.cls === 'JM' ? ON_SCREEN_MIN_JM : ON_SCREEN_MIN;
    assert(seen > floor, `${track.id}/${car.id}: the race happens on screen (${(seen * 100).toFixed(0)}% > ${floor * 100}%)`);
    const sights = car.cls === 'JM' ? IN_SIGHTS_MIN_JM : IN_SIGHTS_MIN;
    assert(aimed > sights, `${track.id}/${car.id}: the player has someone ahead to go for (${(aimed * 100).toFixed(0)}% > ${sights * 100}%)`);
    // unarmed the cars still lean on each other, so the order is not skill's alone; everyone must still get home
    const clean = createState(track, car, 3, rivalField(car.cls, STOCK));
    while (clean.cars.some((c) => c.finishedAt < 0) && clean.time < 900) step(clean, clean.cars.map((c) => botInput(clean, c)), DT);
    const skills = standings(clean).map((c) => c.driver.skill);
    console.log(`  unarmed order by skill: ${skills.join(' > ')}`);
    assert(clean.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: unarmed, the whole field finishes`);
  }
}

// every rival's vehicle alone, on the class car's numbers under its own footprint: the widest
// (the van, 2 m on a 6 m road), the smallest (the JM boxes) and, at their own skill, the
// sloppiest (a JM driver, wobbling and braking late) must get round without living in the trees
for (const track of TRACKS) {
  console.log(`\n${track.id}: the rivals' vehicles alone`);
  for (const cls of CLASSES) {
    for (const [who, byClass] of Object.entries(RIVAL_CARS)) {
      const v = byClass[cls];
      const def = vehicleDef(v, cls, STOCK);
      const solo = createState(track, def, 3);
      // JM and C at the vehicle's own skill: a poor driver wobbles and runs wide, and must still get
      // round. B and A at the bot's ceiling: the footprint is what is checked there
      const sloppy = cls === 'JM' || cls === 'C';
      if (sloppy) solo.cars[0].driver = { ...solo.cars[0].driver, skill: v.skill };
      let offRoad = 0;
      let hits = 0;
      let steps = 0;
      while (!solo.finished && solo.time < 600) {
        step(solo, [botInput(solo)], DT);
        if (solo.hold > 0) continue;
        steps++;
        if (!solo.cars[0].onRoad) offRoad++;
        if (solo.cars[0].hit) hits++;
      }
      const laps = solo.cars[0].laps;
      const name = `${cls} ${who} ${v.name.fi} (${v.shape} ${v.length} x ${v.width} m${sloppy ? `, skill ${v.skill}` : ''})`;
      console.log(`  ${name.padEnd(46)} ${laps.map((l) => l.toFixed(2)).join('  ')}   off road ${((offRoad / Math.max(1, steps)) * 100).toFixed(1)}%   tree hits ${hits}`);
      assert(solo.finished, `${track.id}/${name}: the bot finishes three laps alone`);
      // a poor driver runs wide onto the verge now and then: that is the point, the trees are not
      assert(offRoad / Math.max(1, steps) < 0.15 && hits < 30, `${track.id}/${name}: mostly on the road and clear of the trees (off ${((offRoad / Math.max(1, steps)) * 100).toFixed(1)}%, ${hits} tree steps)`);
    }
  }
}

// the dealer's wild buys alone, at the bot's ceiling: a tractor, a monster truck, a hearse must each get
// round both tracks on their own numbers. They are a character, not a class car, so no pace is asserted
const wild = CARS.filter((c) => c !== classCar(c.cls));
for (const track of TRACKS) {
  console.log(`\n${track.id}: the dealer's wild buys alone`);
  for (const car of wild) {
    const solo = createState(track, car, 3);
    let offRoad = 0;
    let hits = 0;
    let steps = 0;
    while (!solo.finished && solo.time < 600) {
      step(solo, [botInput(solo)], DT);
      if (solo.hold > 0) continue;
      steps++;
      if (!solo.cars[0].onRoad) offRoad++;
      if (solo.cars[0].hit) hits++;
    }
    const laps = solo.cars[0].laps;
    const name = `${car.cls} ${car.id} (${car.shape} ${car.length} x ${car.width} m)`;
    console.log(`  ${name.padEnd(46)} ${laps.map((l) => l.toFixed(2)).join('  ')}   off road ${((offRoad / Math.max(1, steps)) * 100).toFixed(1)}%   tree hits ${hits}`);
    assert(solo.finished, `${track.id}/${name}: the bot finishes three laps alone`);
    assert(offRoad / Math.max(1, steps) < 0.15 && hits < 30, `${track.id}/${name}: mostly on the road and clear of the trees (off ${((offRoad / Math.max(1, steps)) * 100).toFixed(1)}%, ${hits} tree steps)`);
  }
}

// the career's curve, read off the player's results: the default bot (skill 1) is a fair
// stand-in for a player who has learnt the car. JM must be won easily from the back of the
// grid, C fought for, A not handed over
console.log('\nthe player against the field, the default bot driving, every grid order (J M T = Jorma Marko Tapsa)');
for (const track of TRACKS) {
  for (const cls of CLASSES) {
    const rs = results.filter((r) => r.track === track.id && r.cls === cls);
    if (!rs.length) continue;
    const cells = rs.map((r) => `${r.grid} P${r.place} ${r.gap <= 0 ? '+' : '-'}${Math.abs(r.gap).toFixed(1)}s`);
    console.log(`  ${track.id.padEnd(9)} ${cls.padEnd(3)} ${cells.join('   ')}`);
    if (cls === 'JM') assert(rs.every((r) => r.place === 1 && r.gap <= -3), `${track.id}/JM: the player wins every race by 3 s or more`);

    if (cls === 'A') assert(rs.some((r) => r.place > 1), `${track.id}/A: the player does not win every race`);
  }
}

// C is a fight with mines and guns, and one race is chaos: the same six grids with a hair of skill
// changed land the player anywhere from P1 to P4. Measured over 48 such races (tools/dbg/grid2.ts,
// 2026-10-04) the shipped field of 2026-10-03 put the player in the top two 52% of the time, the wild
// cast 62%, while this asserted five of six per track and passed by luck. So it is held over both
// tracks' twelve races together, at two in three
{
  const cs = results.filter((r) => r.cls === 'C');
  const top = cs.filter((r) => r.place <= 2).length;
  assert(top >= (cs.length * 2) / 3, `C: the player finishes in the top two in two races of three over both tracks (${top} of ${cs.length})`);
}

console.log('');
if (failed) {
  console.log('sim-check failed');
  process.exitCode = 1;
} else console.log('sim-check ok');
