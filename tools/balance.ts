/**
 * npm run balance [laps] [track]: lap times for every car, the bot driving,
 * one line per car. The number that matters for the career is the gap
 * between two cars on the same track, so the table puts them side by side.
 */
import { createState } from '../src/game/state';
import { step, DT } from '../src/game/sim';
import { TRACKS } from '../src/game/content/tracks';
import { CARS } from '../src/game/content/cars';
import { botInput } from './autoplayer';
import { Track } from '../src/game/track';

declare const process: { argv: string[]; exitCode?: number };

const laps = Math.max(1, Number(process.argv[2]) || 3);
const only = process.argv[3];

for (const track of TRACKS) {
  if (only && track.id !== only) continue;
  console.log(`${track.id}  ${Math.round(new Track(track).length)} m`);
  for (const car of CARS) {
    const s = createState(track, car, laps);
    while (!s.finished && s.time < 1200) step(s, botInput(s), DT);
    const best = s.laps.length ? Math.min(...s.laps) : NaN;
    const total = s.laps.reduce((a, b) => a + b, 0);
    console.log(`  ${car.id.padEnd(12)} best ${best.toFixed(2)}  total ${total.toFixed(1)}  laps ${s.laps.map((l) => l.toFixed(1)).join(' ')}`);
  }
}
