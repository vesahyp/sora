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

/**
 * A phone's view of the world in metres, portrait: the renderer shows ten
 * cars across the short side (CARS_ACROSS in renderer.ts), so 17 m by
 * 37 m. The shares of the race that another car must be on it and that
 * a target must be in the sights, averaged over three races. The
 * on-screen floor is where the race landed once the opponents' engines
 * were paced to the player (PACING in drivers.ts): 39 to 51% across the
 * tracks and cars. The target is a half, and rivals that fight
 * (blocking, grudges) are what should raise it.
 */
const VIEW = { w: 17, h: 37 };
const ON_SCREEN_MIN = 0.3;
const IN_SIGHTS_MIN = 0.1;

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
      assert(offRoad / steps < 0.08, `${track.id}/${car.id}: the bot stays on the road (off ${((offRoad / steps) * 100).toFixed(1)}%)`);
      assert(hits < 30, `${track.id}/${car.id}: the bot rarely meets a tree (${hits} steps)`);
    }
    // then the race: four bots, armed, so the race is tested with the guns in. One race is
    // chaos (a wreck early moves everything after it), so it is run three times with the
    // field in a different grid order, everyone must finish each, and the view is the average.
    let racing = 0;
    let onScreen = 0;
    let inSights = 0;
    let playerWrecks = 0;
    for (let rot = 0; rot < 3; rot++) {
      const field = OPPONENTS.map((_, k) => OPPONENTS[(k + rot) % OPPONENTS.length]);
      const race = createState(track, car, 3, field.map((driver) => ({ driver, car, missiles: 2, mines: 2 })), { missiles: 2, mines: 2 });
      let drifting = 0;
      let boosts = 0;
      while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) {
        step(race, race.cars.map((c) => botInput(race, c)), DT);
        for (const c of race.cars) {
          if (c.sliding && c.wreck <= 0) drifting++;
          if (c.boosting > 0) boosts++;
        }
        // is the race on the player's screen: a living car inside the view around the player,
        // and a car in the player's sights, counted from the lights to the player's flag
        const me = race.cars[0];
        if (race.hold > 0 || me.finishedAt >= 0) continue;
        racing++;
        if (race.cars.some((o) => o !== me && o.wreck <= 0 && Math.abs(o.x - me.x) < VIEW.w / 2 && Math.abs(o.y - me.y) < VIEW.h / 2)) onScreen++;
        if (me.target >= 0) inSights++;
      }
      playerWrecks += race.cars[0].wrecks;
      const shots = race.cars.reduce((a, c) => a + c.shots, 0);
      const wrecks = race.cars.reduce((a, c) => a + c.wrecked, 0);
      const cash = race.cars.reduce((a, c) => a + c.cash, 0);
      console.log(`  guns:  ${shots} rounds, ${wrecks} wrecks, ${(drifting / 60).toFixed(0)} s sliding, ${(boosts / 60).toFixed(0)} s of nitro, ${cash} cr off the road, damage ${race.cars.map((c) => Math.round(c.damage)).join('/')}`);
      assert(shots > 0, `${track.id}/${car.id}: the guns fire (${shots} rounds)`);
      assert(drifting > 60, `${track.id}/${car.id}: the cars slide (${(drifting / 60).toFixed(1)} s)`);
      const order = standings(race);
      console.log(`  race:  ${order.map((c) => `${c.driver.name.en} ${c.finishedAt >= 0 ? c.finishedAt.toFixed(1) : 'DNF'}`).join('  ')}`);
      assert(race.cars.every((c) => c.finishedAt >= 0), `${track.id}/${car.id}: the whole field finishes, guns and all`);
    }
    const seen = onScreen / Math.max(1, racing);
    const aimed = inSights / Math.max(1, racing);
    console.log(`  view:  another car on screen ${(seen * 100).toFixed(0)}% of the race, a target in the sights ${(aimed * 100).toFixed(0)}%, the player wrecked ${playerWrecks} in three races`);
    assert(seen > ON_SCREEN_MIN, `${track.id}/${car.id}: the race happens on screen (${(seen * 100).toFixed(0)}% > ${ON_SCREEN_MIN * 100}%)`);
    assert(aimed > IN_SIGHTS_MIN, `${track.id}/${car.id}: the player has someone to shoot at (${(aimed * 100).toFixed(0)}% > ${IN_SIGHTS_MIN * 100}%)`);
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
