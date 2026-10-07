/**
 * npm run sim-check: the bot drives every car round every track and the
 * lap must be clean enough to ship. Prints the lap table, then asserts.
 * Run by `make check`, so a physics change that strands the bot fails the
 * build.
 */
import { createState as create, dispose, type SimState } from '../src/game/state';
import { initPhysics } from '../src/game/physics';
import { step, DT, TOW_AFTER } from '../src/game/sim';
import { TRACKS, TRACK_BY_ID } from '../src/game/content/tracks';
import { CARS, classCar } from '../src/game/content/cars';
import { botInput, DEFAULT_BOT } from './autoplayer';
import { OPPONENTS } from '../src/game/content/drivers';
import type { CarClass } from '../src/game/types';
import { PICKUPS } from '../src/game/content/pickups';
import { standings } from '../src/game/state';
import { STOCK, tuned } from '../src/game/content/parts';
import { RIVAL_CARS, rivalEntry, rivalField, vehicleDef } from '../src/game/content/rivals';
import { EVENTS, dealBoots, fieldBoots } from '../src/game/content/events';
import { CLASSES } from '../src/game/types';
import { canCarry, carried } from '../src/game/content/weapons';
import { Hand } from './hand';
import type { TrackDef } from '../src/game/types';

/** the classes with an event on this track: the folk class races the short loops, the rest the full tracks */
const classesOn = (track: TrackDef): CarClass[] => CLASSES.filter((cls) => EVENTS.some((e) => e.cls === cls && e.trackId === track.id));

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

await initPhysics();
/**
 * A race's world lives in Rapier's WASM memory until it is freed. Each race here is stepped only
 * inside its own loop, so the oldest are freed once a handful are open.
 */
const open: SimState[] = [];
const createState = (...args: Parameters<typeof create>): SimState => {
  const s = create(...args);
  open.push(s);
  if (open.length > 6) dispose(open.shift()!);
  return s;
};

let failed = false;
const assert = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

/** The player's result in each armed race, the default bot at the wheel: place, and the gap to the best rival (negative is ahead). */
const results: { track: string; cls: CarClass; grid: string; place: number; gap: number }[] = [];
/**
 * A thumb that has not learnt the car: the hand (tools/hand.ts, the playthrough's driver, headless)
 * at skill 0.5, a reaction late and blind to the tyres' limit. The folk class is raced by this
 * driver, in the view checks and the first-races check: the learnt bot walks JM. Until
 * 2026-10-05 this was the bot at 0.65 of its corner margin, which still asked the car for yaw and
 * lapped seconds under any thumb.
 */
const NEW_PLAYER_SKILL = 0.5;
/** the thumbs (the hand's seed) that race each folk event in the first-races check, from each of three grids */
const FOLK_THUMBS = 4;
const newPlayer = (s: ReturnType<typeof createState>, hand: Hand) => hand.input(s, s.cars[0], DT);
/** a grid order of the seven opponents: the field turned k slots */
const rotation = (k: number): number[] => OPPONENTS.map((_, i) => (i + k) % OPPONENTS.length);

// the full workout on the class cars, the career's spine; the dealer's wild buys are lapped alone below
for (const track of TRACKS) {
  for (const car of classesOn(track).map(classCar)) {
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
    // on the road, or with the inside wheels on it: the A car flies Kiviaho's river 36 m at 145 km/h
    // and the road bends a little under it, so it comes down a wheel onto the verge (2026-10-04)
    assert(flights.every((x) => x.d < track.width / 2 + car.width / 2), `${track.id}/${car.id}: every flight lands on the road (${flights.map((x) => x.d.toFixed(1)).join('/')} m off the centreline, a wheel on it under ${(track.width / 2 + car.width / 2).toFixed(1)})`);
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
    // then the race: eight bots, armed with what the class carries (oil in JM, mines and the
    // gun from C, missiles from B), so the race is tested with its weapons in. One race is
    // chaos (a wreck early moves everything after it), so it is run from six grid orders of the
    // seven opponents (each one turned a slot), everyone must finish each, and the view is the average.
    const guns = canCarry(car.cls, 'mine');
    const parts = guns ? { ...STOCK, gun: 1 } : STOCK;
    const armed = tuned(car, parts);
    const boot = carried(car.cls, { oil: 2, mines: 2, missiles: 2 });
    // the field carries three such boots between them, as the game deals it (events.ts)
    const boots = dealBoots(boot);
    let racing = 0;
    let onScreen = 0;
    let inSights = 0;
    let playerWrecks = 0;
    let playerRams = 0;
    let stalled = 0;
    let fightCredits = 0;
    let roadCredits = 0;
    const orders = [0, 1, 2, 3, 4, 5].map(rotation);
    // C is chaos (the block at the end): its races are run three times over with a hair of skill
    // on the rivals, and the places and the money are read over all of them; the race logs and the
    // per-race asserts come from the first run, as before
    const reps = car.cls === 'C' ? 3 : 1;
    for (let rep = 0; rep < reps; rep++)
    for (const grid of orders) {
      const first = rep === 0;
      // every rival in their own vehicle at its class's skill: the class car's numbers under their body and mass
      const race = createState(track, armed, 3, grid.map((k) => { const e = rivalEntry(OPPONENTS[k], car.cls, parts); return { ...e, driver: { ...e.driver, skill: e.driver.skill + rep * 0.003 }, ...boots[k] }; }), boot);
      let drifting = 0;
      let boosts = 0;
      let slicks = 0;
      // stalled off the road: the sim's own tow clock (Car.stuck: off the road and not 3 m along the
      // lap from its mark), read every step. A second clock here took its 3 m marks at other moments,
      // and a car rocking at the trees read 6 s on one and 4 s on the other (2026-10-04)
      const hand = car.cls === 'JM' ? new Hand(NEW_PLAYER_SKILL) : null;
      while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) {
        step(race, race.cars.map((c, i) => (i === 0 && hand ? newPlayer(race, hand) : botInput(race, c))), DT);
        for (const c of race.cars) if (c.wreck <= 0) stalled = Math.max(stalled, c.stuck);
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
      const oils = race.cars.reduce((a, c, i) => a + ((i ? boots[grid[i - 1]].oil : boot.oil) - c.oil), 0);
      if (first) {
        console.log(`  guns:  ${shots} rounds, ${oils} cans of oil, ${(slicks / 60).toFixed(0)} s on oil, ${wrecks} wrecks, ${(drifting / 60).toFixed(0)} s sliding, ${(boosts / 60).toFixed(0)} s of nitro, ${cash} cr off the road, damage ${race.cars.map((c) => Math.round(c.damage)).join('/')}`);
        if (guns) assert(shots > 0, `${track.id}/${car.id}: the guns fire (${shots} rounds)`);
        else assert(shots === 0, `${track.id}/${car.id}: no guns in this class (${shots} rounds)`);
        assert(slicks > 0, `${track.id}/${car.id}: oil is laid and somebody crosses it (${(slicks / 60).toFixed(1)} s on oil)`);
        assert(drifting > 60, `${track.id}/${car.id}: the cars slide (${(drifting / 60).toFixed(1)} s)`);
      }
      const order = standings(race);
      if (first) console.log(`  race:  ${order.map((c) => `${c.driver.name.en} ${c.finishedAt >= 0 ? c.finishedAt.toFixed(1) : 'DNF'}`).join('  ')}`);
      assert(race.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: the whole field finishes, guns and all`);
      const rivals = race.cars.slice(1).map((c) => (c.finishedAt >= 0 ? c.finishedAt : Infinity));
      results.push({ track: track.id, cls: car.cls, grid: grid.map((k) => OPPONENTS[k].name.en[0]).join(''), place: order.indexOf(me) + 1, gap: me.finishedAt - Math.min(...rivals) });
    }
    const seen = onScreen / Math.max(1, racing);
    const aimed = inSights / Math.max(1, racing);
    // the owner's stuck spot, 2026-10-04: nobody sits off the road going nowhere; the back-out
    // frees a car nose first in the trees and the marshals tow whatever it cannot, a step after the clock passes
    assert(stalled <= TOW_AFTER + 2 * DT, `${track.id}/${car.id}: no car is stalled off the road more than ${TOW_AFTER} s in any race (longest ${stalled.toFixed(2)} s)`);
    const races = orders.length * reps;
    console.log(`  view:  another car on screen ${(seen * 100).toFixed(0)}% of the race, a target in the sights ${(aimed * 100).toFixed(0)}%, the player wrecked ${playerWrecks} in ${races} races`);
    // aggression against the road, the player's own, per race: wrecking and ramming must pay more
    // than driving over cash, or the race teaches the player to drive round the fight. The bot
    // drives the line and rarely takes cash, so it is also held against a race that takes every
    // cash pickup on every lap (they grow back faster than a lap)
    const fight = fightCredits / races;
    const road = roadCredits / races;
    const allCash = createState(track, car, 3).pickups.filter((p) => p.kind === 'cash').length * PICKUPS.cash.amount * 3;
    console.log(`  fight: per race the player rams or is rammed ${(playerRams / races).toFixed(1)} times, wrecks ${(playerWrecks / races).toFixed(1)}, earns ${Math.round(fight)} cr from aggression and ${Math.round(road)} cr off the road (every cash: ${allCash})`);
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
  for (const cls of classesOn(track)) {
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
  for (const car of wild.filter((c) => classesOn(track).includes(c.cls))) {
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
console.log('\nthe player against the field, the default bot driving, six grid orders (initials of the seven rivals)');
for (const track of TRACKS) {
  for (const cls of CLASSES) {
    const rs = results.filter((r) => r.track === track.id && r.cls === cls);
    if (!rs.length) continue;
    const cells = rs.map((r) => `${r.grid} P${r.place} ${r.gap <= 0 ? '+' : '-'}${Math.abs(r.gap).toFixed(1)}s`);
    console.log(`  ${track.id.padEnd(9)} ${cls.padEnd(3)} ${cells.join('   ')}`);
    // JM is raced by the hand at 0.5 in the stock car against the drivers at their full skill, the
    // final's level, which it is not meant to beat: the event-by-event check below holds the folk
    // class's curve, race by race, with the parts a player has by then

    if (cls === 'A') assert(rs.some((r) => r.place > 1), `${track.id}/A: the player does not win every race`);
  }
}

// the first races as a new player meets them: the event's own field (its parts, its drivers at
// the event's share of their skill) against the player as the playthrough plays him: in the folk
// class the hand, a stranger to the car in the first race (0.5) and used to it by the final
// (0.85), in the Tauno with the parts a winning player has bought by then (the playthrough's
// WANT list: the ram bar, tyres, the engine, nitro); in C the bot in the stock Kortteli. The
// rivals' cars are no better than his in JM (2026-10-04, after "why do the rivals have better
// cars"). Since the cars run on Rapier (ADR 0005) one race is chance: a thumb with no spin guard
// that meets the pack or a slick can lose a race it would win nine times in ten, and three grids
// read P4 P4 P1 one run and P1 P1 P1 the next. So each folk event is raced by four thumbs (the
// hand's seed) from three grids, and held as rates: the first two won in two of three, the next
// two top two in five of six, the final top two in half, and last in at most one of six
console.log('\nthe first races as a new player: the hand in the Tauno with the parts of the hour against each event\'s own field');
{
  const early = EVENTS.filter((e) => e.cls === 'JM' || e.cls === 'C');
  const hour: { skill: number; parts: typeof STOCK }[] = [
    { skill: 0.5, parts: STOCK },
    { skill: 0.6, parts: { ...STOCK, ram: 1 } },
    { skill: 0.7, parts: { ...STOCK, ram: 1, tyres: 1 } },
    { skill: 0.8, parts: { ...STOCK, ram: 2, tyres: 2, engine: 1 } },
    { skill: 0.85, parts: { ...STOCK, ram: 3, tyres: 3, engine: 2, nitro: 1 } },
  ];
  let jm = 0;
  for (const e of early) {
    const track = TRACK_BY_ID[e.trackId];
    const stage = e.cls === 'JM' ? hour[Math.min(jm++, hour.length - 1)] : null;
    const mine = stage ? tuned(classCar('JM'), stage.parts) : CARS.find((c) => c.cls === e.cls)!;
    const places: number[] = [];
    const gaps: number[] = [];
    const thumbs = stage ? FOLK_THUMBS : 1;
    for (let thumb = 0; thumb < thumbs; thumb++)
    for (const grid of [0, 2, 4].map(rotation)) {
      const field = rivalField(e.cls, e.fieldParts, e.fieldSkill ?? 1);
      // the field's boot as the game packs it (one can of oil each in the early folk races); the player's own is a new career's
      const boots = fieldBoots(e);
      const race = createState(track, mine, e.laps, grid.map((k) => ({ ...field[k], ...boots[k] })), carried(e.cls, { oil: 3, mines: 1, missiles: 1 }));
      const hand = stage ? new Hand(stage.skill, 1234 + thumb * 7919) : null;
      while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) step(race, race.cars.map((c, i) => (i === 0 && hand ? newPlayer(race, hand) : botInput(race, c))), DT);
      const me = race.cars[0];
      const order = standings(race);
      places.push(order.indexOf(me) + 1);
      gaps.push(me.finishedAt - Math.min(...race.cars.slice(1).map((c) => c.finishedAt)));
    }
    console.log(`  ${e.id.padEnd(14)} ${stage ? `hand ${stage.skill} ` : 'bot      '}${places.map((p, i) => `P${p} ${gaps[i] <= 0 ? '+' : '-'}${Math.abs(gaps[i]).toFixed(1)}s`).join('   ')}`);
    if (stage) {
      const n = jm - 1;
      const k = places.length;
      const top2 = places.filter((p) => p <= 2).length;
      const top3 = places.filter((p) => p <= 3).length;
      const last = places.filter((p) => p === OPPONENTS.length + 1).length;
      // with eight cars (2026-10-07) a race in four is lost in the pack from the back of the grid,
      // stuck 8 to 12 s among the field, whatever the field's pace (tools/dbg/folk8.ts); with four
      // the rules were a win two times in three, then top two five in six, then top two in half
      if (n < 2) assert(top3 >= k / 2, `${e.id}: a new player is top three in half the folk races (${top3} of ${k})`);
      else if (n < 4) assert(top2 >= (k * 2) / 3, `${e.id}: a player with his first parts is top two two times in three (${top2} of ${k})`);
      else assert(top3 >= k / 2, `${e.id}: the final is a fight, top three in half the races (${top3} of ${k})`);
      assert(last <= k / 6, `${e.id}: a new player is last in at most one race in six (${last} of ${k})`);
    }
  }
}

// C is a fight with mines and guns, and one race is chaos: the same six grids with a hair of skill
// changed land the player anywhere from P1 to P4. Measured over 48 such races (tools/dbg/grid2.ts,
// 2026-10-04) the shipped field of 2026-10-03 put the player in the top two 52% of the time, the wild
// cast 62%, while this asserted five of six per track and passed by luck. Since the scrub
// (2026-10-06, physics.ts SCRUB) a slide costs speed, and the player's stand-in, which drives at
// the limit and is the one the field goes for, pays for it: over 36 C races its top-two rate went
// from 72% to 58%, and neither a slower field nor a wider corner margin on the bot buys it back
// (grid2.ts). So the twelve races are run three times over above, and it is held at half.
// With eight cars (2026-10-07) the rule is the top three: a rival on the front row leads from the
// lights while the stand-in climbs through six cars, and the top two sat at half (grid2.ts, 6 of 12
// twice) where the top three was 9 of 12
{
  const cs = results.filter((r) => r.cls === 'C');
  const top = cs.filter((r) => r.place <= 3).length;
  assert(top >= cs.length / 2, `C: the player finishes in the top three in half the races over both tracks, three runs each (${top} of ${cs.length})`);
}

console.log('');
if (failed) {
  console.log('sim-check failed');
  process.exitCode = 1;
} else console.log('sim-check ok');
