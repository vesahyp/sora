/**
 * Local records: the best lap and the best race per track and car, in
 * localStorage. Global records come later, the Räkkä way.
 */
export interface Records {
  bestLap: Record<string, number>;
  bestRace: Record<string, number>;
}

const KEY = 'sora.records';

export const recordKey = (trackId: string, carId: string) => `${trackId}/${carId}`;

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Records>;
      return { bestLap: r.bestLap ?? {}, bestRace: r.bestRace ?? {} };
    }
  } catch {
    /* no storage */
  }
  return { bestLap: {}, bestRace: {} };
}

/** Records the race; returns which of the two records it set. */
export function saveRace(r: Records, key: string, laps: number[]): { lap: boolean; race: boolean } {
  const best = Math.min(...laps);
  const total = laps.reduce((a, b) => a + b, 0);
  const lap = !(key in r.bestLap) || best < r.bestLap[key];
  const race = !(key in r.bestRace) || total < r.bestRace[key];
  if (lap) r.bestLap[key] = best;
  if (race) r.bestRace[key] = total;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* fine */
  }
  return { lap, race };
}

/** m:ss.hh */
export function fmt(sec: number): string {
  if (!isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

type Track = (event: string, data?: Record<string, string | number>) => void;
/** The clavesa tracker, when index.html loaded it. */
export const track: Track = (event, data) => {
  const w = window as unknown as { __clvtracker?: { track: Track } };
  try {
    w.__clvtracker?.track(event, data);
  } catch {
    /* never let analytics break the game */
  }
};
