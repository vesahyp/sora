/**
 * npm run balance [laps] [track]: lap times for every car, the bot driving,
 * one line per car, on the tracks its class races. The number that matters
 * for the career is the gap between two cars on the same track, so the
 * table puts them side by side. The folk class adds the hand (tools/hand.ts,
 * the thumb that has not learnt the car, at 0.5, and one that has, at 0.85):
 * the folk laps and the upgrade gap are read off the thumb, not the bot.
 */
import { createState, dispose } from '../src/game/state';
import { initPhysics } from '../src/game/physics';
import { step, DT } from '../src/game/sim';
import { TRACKS } from '../src/game/content/tracks';
import { CARS } from '../src/game/content/cars';
import { EVENTS } from '../src/game/content/events';
import { botInput } from './autoplayer';
import { Hand } from './hand';
import { tuned, fullFor } from '../src/game/content/parts';
import { Track } from '../src/game/track';

declare const process: { argv: string[]; exitCode?: number };

await initPhysics();

const laps = Math.max(1, Number(process.argv[2]) || 3);
const only = process.argv[3];

for (const track of TRACKS) {
  if (only && track.id !== only) continue;
  console.log(`${track.id}  ${Math.round(new Track(track).length)} m`);
  for (const car of CARS) {
    if (!EVENTS.some((e) => e.cls === car.cls && e.trackId === track.id)) continue;
    for (const [label, def] of [['stock', car], ['full', tuned(car, fullFor(car.cls))]] as const) {
      const drivers: ['bot' | number, string][] = car.cls === 'JM' ? [['bot', 'bot'], [0.5, 'hand 0.5'], [0.85, 'hand 0.85']] : [['bot', 'bot']];
      for (const [driver, who] of drivers) {
        const s = createState(track, def, laps);
        const hand = typeof driver === 'number' ? new Hand(driver) : null;
        while (!s.finished && s.time < 1200) step(s, [hand ? hand.input(s, s.cars[0], DT) : botInput(s)], DT);
        const me = s.cars[0];
        const best = me.laps.length ? Math.min(...me.laps) : NaN;
        const total = me.laps.reduce((a, b) => a + b, 0);
        dispose(s);
        console.log(`  ${car.id.padEnd(10)} ${label.padEnd(5)} ${who.padEnd(9)} first ${me.laps[0]?.toFixed(2) ?? '-'}  best ${best.toFixed(2)}  total ${total.toFixed(1)}`);
      }
    }
  }
}
