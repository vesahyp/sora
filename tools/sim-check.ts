/**
 * npm run sim-check: the bot drives every car round every track and the
 * lap must be clean enough to ship. Prints the lap table, then asserts.
 * Run by `make check`, so a physics change that strands the bot fails the
 * build.
 */
import { createState } from '../src/game/state';
import { step, DT } from '../src/game/sim';
import { TRACKS } from '../src/game/content/tracks';
import { CARS } from '../src/game/content/cars';
import { botInput } from './autoplayer';
import { OPPONENTS } from '../src/game/content/drivers';
import { standings } from '../src/game/state';

declare const process: { argv: string[]; exitCode?: number };

let failed = false;
const assert = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

for (const track of TRACKS) {
  for (const car of CARS) {
    // alone first: the clean lap
    const solo = createState(track, car, 3);
    let offRoad = 0;
    let hits = 0;
    let topSpeed = 0;
    let steps = 0;
    while (!solo.finished && solo.time < 600) {
      step(solo, [botInput(solo)], DT);
      steps++;
      if (solo.hold <= 0) {
        const c = solo.cars[0];
        if (!c.onRoad) offRoad++;
        if (c.hit) hits++;
        topSpeed = Math.max(topSpeed, c.speed);
      }
    }
    const me = solo.cars[0];
    console.log(`\n${track.id} (${Math.round(solo.track.length)} m, ${track.width} m wide)  ${car.id}`);
    console.log(`  alone: ${me.laps.map((l) => l.toFixed(2)).join('  ')}   top ${(topSpeed * 3.6).toFixed(0)} km/h   off road ${((offRoad / steps) * 100).toFixed(1)}%   tree hits ${hits}`);
    assert(solo.finished, `${track.id}/${car.id}: the bot finishes three laps alone`);
    if (me.laps.length) {
      const best = Math.min(...me.laps);
      assert(best > 15 && best < 90, `${track.id}/${car.id}: a lap is between 15 s and 90 s (${best.toFixed(1)})`);
      assert(offRoad / steps < 0.15, `${track.id}/${car.id}: the bot stays on the road (off ${((offRoad / steps) * 100).toFixed(1)}%)`);
      assert(hits < 30, `${track.id}/${car.id}: the bot rarely meets a tree (${hits} steps)`);
    }
    // then the race: four bots, everyone must finish and the order must follow skill
    // armed: everyone has a few missiles and mines, so the race is tested with the guns in
    const race = createState(track, car, 3, OPPONENTS.map((driver) => ({ driver, car, missiles: 2, mines: 2 })), { missiles: 2, mines: 2 });
    let drifting = 0;
    let boosts = 0;
    while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) {
      step(race, race.cars.map((c) => botInput(race, c)), DT);
      for (const c of race.cars) {
        if (c.sliding && c.wreck <= 0) drifting++;
        if (c.boosting > 0) boosts++;
      }
    }
    const shots = race.cars.reduce((a, c) => a + c.shots, 0);
    const wrecks = race.cars.reduce((a, c) => a + c.wrecked, 0);
    const cash = race.cars.reduce((a, c) => a + c.cash, 0);
    console.log(`  guns:  ${shots} rounds, ${wrecks} wrecks, ${(drifting / 60).toFixed(0)} s sliding, ${(boosts / 60).toFixed(0)} s of nitro, ${cash} cr off the road, damage ${race.cars.map((c) => Math.round(c.damage)).join('/')}`);
    assert(shots > 0, `${track.id}/${car.id}: the guns fire (${shots} rounds)`);
    assert(drifting > 60, `${track.id}/${car.id}: the cars slide (${(drifting / 60).toFixed(1)} s)`);
    const order = standings(race);
    console.log(`  race:  ${order.map((c) => `${c.driver.name.en} ${c.finishedAt >= 0 ? c.finishedAt.toFixed(1) : 'DNF'}`).join('  ')}`);
    assert(race.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: the whole field finishes, guns and all`);
    // unarmed the cars still lean on each other, so the order is not skill's alone; everyone must still get home
    const clean = createState(track, car, 3, OPPONENTS.map((driver) => ({ driver, car })));
    while (clean.cars.some((c) => c.finishedAt < 0) && clean.time < 900) step(clean, clean.cars.map((c) => botInput(clean, c)), DT);
    const skills = standings(clean).map((c) => c.driver.skill);
    console.log(`  unarmed order by skill: ${skills.join(' > ')}`);
    assert(clean.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: unarmed, the whole field finishes`);
  }
}

console.log('');
if (failed) {
  console.log('sim-check failed');
  process.exitCode = 1;
} else console.log('sim-check ok');
