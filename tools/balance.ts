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
import { tuned, FULL } from '../src/game/content/parts';
import { Track } from '../src/game/track';

declare const process: { argv: string[]; exitCode?: number };

const laps = Math.max(1, Number(process.argv[2]) || 3);
const only = process.argv[3];

for (const track of TRACKS) {
  if (only && track.id !== only) continue;
  console.log(`${track.id}  ${Math.round(new Track(track).length)} m`);
  for (const car of CARS) {
    for (const [label, def] of [['stock', car], ['full', tuned(car, FULL)]] as const) {
      const s = createState(track, def, laps);
      while (!s.finished && s.time < 1200) step(s, [botInput(s)], DT);
      const me = s.cars[0];
      const best = me.laps.length ? Math.min(...me.laps) : NaN;
      const total = me.laps.reduce((a, b) => a + b, 0);
      console.log(`  ${car.id.padEnd(10)} ${label.padEnd(5)} first ${me.laps[0]?.toFixed(2) ?? '-'}  best ${best.toFixed(2)}  total ${total.toFixed(1)}`);
    }
  }
}
