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

declare const process: { argv: string[]; exitCode?: number };

let failed = false;
const assert = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};

for (const track of TRACKS) {
  for (const car of CARS) {
    const s = createState(track, car, 3);
    let offRoad = 0;
    let hits = 0;
    let topSpeed = 0;
    let steps = 0;
    while (!s.finished && s.time < 600) {
      step(s, botInput(s), DT);
      steps++;
      if (s.hold <= 0) {
        if (!s.car.onRoad) offRoad++;
        if (s.car.hit) hits++;
        topSpeed = Math.max(topSpeed, s.car.speed);
      }
    }
    const laps = s.laps.map((l) => l.toFixed(2)).join('  ');
    console.log(`\n${track.id} (${Math.round(s.track.length)} m, ${track.width} m wide)  ${car.id}`);
    console.log(`  laps: ${laps}   top ${(topSpeed * 3.6).toFixed(0)} km/h   off road ${(offRoad / steps * 100).toFixed(1)}%   tree hits ${hits}`);
    assert(s.finished, `${track.id}/${car.id}: the bot finishes three laps`);
    if (s.laps.length) {
      const best = Math.min(...s.laps);
      assert(best > 20 && best < 120, `${track.id}/${car.id}: a lap is between 20 s and 120 s (${best.toFixed(1)})`);
      assert(offRoad / steps < 0.08, `${track.id}/${car.id}: the bot stays on the road (off ${(offRoad / steps * 100).toFixed(1)}%)`);
      assert(hits < 30, `${track.id}/${car.id}: the bot rarely meets a tree (${hits} steps)`);
    }
  }
}

console.log('');
if (failed) {
  console.log('sim-check failed');
  process.exitCode = 1;
}
console.log('sim-check ok');
