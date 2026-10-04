import type { Track } from './track';

/**
 * The co-driver: rally pace notes read off the track. A note is a bend's
 * direction and its grade, 1 a hairpin to 6 flat out, from the tightest
 * radius in it. The game loop asks for the next one every frame and the
 * HUD shows it as a big arrow from about 2.5 s before the bend until the
 * car is in it, so the thumb knows where the road goes before the road is
 * on screen. Headless: arc length in, a note out.
 */
export interface PaceNote {
  /** 1 right, -1 left (positive curvature is right, y down) */
  dir: 1 | -1;
  /** 1 hairpin, 2 to 5 tighter to looser, 6 flat */
  grade: number;
  /** where the bend starts and ends, metres along the lap */
  s: number;
  end: number;
}

/** the tightest radius, metres, that earns each grade: under 22 m is a 1, under 32 a 2, and so on; a 6 is anything looser that still turns */
const GRADE_R = [22, 32, 45, 65, 100];
/** a stretch is a bend while its radius is under this, metres */
const BEND_R = 120;
/** and only if it turns this much in all, radians: a kink is not a note */
const MIN_TURN = 0.3;
/** seconds of warning before the bend, and the least distance, metres, at a crawl */
const WARN = 2.5;
const WARN_MIN = 25;
/** sample spacing along the lap, metres */
const STEP = 2;

const cache = new WeakMap<Track, PaceNote[]>();

function grade(r: number): number {
  const i = GRADE_R.findIndex((g) => r < g);
  return i < 0 ? 6 : i + 1;
}

/** Every bend on the lap, in order, once per track. */
export function bendsOf(t: Track): PaceNote[] {
  const hit = cache.get(t);
  if (hit) return hit;
  const n = Math.floor(t.length / STEP);
  // signed curvature per metre, over a short window centred on each sample
  const k: number[] = [];
  for (let i = 0; i < n; i++) k.push(t.curvatureAhead(i * STEP - 4, 8) / 8);
  // start on a straight so no bend is cut in two by the start line
  let i0 = k.findIndex((x) => Math.abs(x) < 1 / BEND_R);
  if (i0 < 0) i0 = 0;
  const notes: PaceNote[] = [];
  let run: number[] = [];
  const close = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    // a long run with two apexes and an opening between them is two notes: once the road opens to
    // twice the apex radius and then closes again, cut at the widest point
    const parts: number[][] = [];
    let part: number[] = [];
    let apex = Infinity;
    let open = -1;
    let openR = 0;
    for (const j of run) {
      const r = 1 / Math.abs(k[j]);
      if (open >= 0 && r < openR / 2 && r < 45) {
        parts.push(part.slice(0, open));
        part = part.slice(open);
        apex = Math.min(...part.map((q) => 1 / Math.abs(k[q])));
        open = -1;
        openR = 0;
      }
      part.push(j);
      if (r < apex) {
        apex = r;
        open = -1;
        openR = 0;
      } else if (r > Math.max(50, apex * 2) && r > openR) {
        open = part.length - 1;
        openR = r;
      }
    }
    parts.push(part);
    for (const p of parts) {
      if (p.length < 2) continue;
      let turn = 0;
      let tightest = Infinity;
      for (const j of p) {
        turn += k[j] * STEP;
        tightest = Math.min(tightest, 1 / Math.abs(k[j]));
      }
      if (Math.abs(turn) < MIN_TURN) continue;
      notes.push({ dir: turn > 0 ? 1 : -1, grade: grade(tightest), s: (p[0] * STEP) % t.length, end: ((p[p.length - 1] + 1) * STEP) % t.length });
    }
    run = [];
  };
  for (let m = 0; m < n; m++) {
    const j = (i0 + m) % n;
    const bend = Math.abs(k[j]) > 1 / BEND_R;
    if (bend && run.length && Math.sign(k[j]) !== Math.sign(k[run[run.length - 1]])) close();
    if (bend) run.push(j);
    else close();
  }
  close();
  notes.sort((a, b) => a.s - b.s);
  cache.set(t, notes);
  return notes;
}

/**
 * The note to show for a car at `s` going `speed` m/s: the first bend it
 * has not yet entered, once it is within WARN seconds; it stays up until
 * the car is ten metres into the bend. Null on a straight.
 */
export function nextNote(t: Track, s: number, speed: number): PaceNote | null {
  const notes = bendsOf(t);
  const warn = Math.max(WARN_MIN, Math.max(0, speed) * WARN);
  let best: PaceNote | null = null;
  let bestGap = Infinity;
  for (const note of notes) {
    // metres from the car to the bend, -10 once it is ten metres in
    let gap = note.s - s;
    if (gap < -t.length / 2) gap += t.length;
    if (gap > t.length / 2) gap -= t.length;
    let len = note.end - note.s;
    if (len < 0) len += t.length;
    if (gap < -Math.min(10, len) || gap > warn) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = note;
    }
  }
  return best;
}
