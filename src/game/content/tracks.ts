import { L } from '../../i18n';
import type { TrackDef } from '../types';

/**
 * The tracks. A track is its centreline in metres, a width and a surface,
 * the land under it (hills along the lap, bends banked toward their inside,
 * bumps and two ruts on the gravel: ADR 0006; the hills kept 30 m clear of
 * every river's banks so a jump's take-off and landing stay as checked),
 * with its ground by arc length (rivers jumped from a bank, crests),
 * patches of another surface (mud, ice) and shortcuts as lanes through the forest in world metres;
 * track.ts smooths the line and the renderer draws the road from it, so a
 * new track is a new list of points and nothing else. Points run
 * clockwise on screen (y grows downward). The first point is the start
 * line and the first segment the start straight. Roads are 6 m, about
 * three cars abreast, the width of a Death Rally road: room to pass and
 * no room to pass without a fight.
 */
export const TRACKS: TrackDef[] = [
  {
    id: 'kiviaho-lenkki',
    name: L('Kiviahon lenkki'),
    width: 6,
    surface: 'gravel',
    // The folk class's first track (2026-10-05), Kiviaho's opening in little: about 400 m, a lap
    // of 25 s for a new thumb in the stock Tauno. The crest on the start straight, the right
    // sweeper, the river jumped from its bank on the diagonal, a hairpin back toward the start
    // and a gap in the forest across its inside on grass, then esses home. The folk cars are slow
    // (docs/progression.md), so the river is 8 m, not Kiviaho's 12, and the road runs straight
    // for 30 m past the lip.
    crests: [{ s: 18, len: 20, h: 0.9 }],
    rivers: [{ s: 171, gap: 8, bank: 0.45 }],
    hills: [{ s: 80, len: 90, h: 2.5 }, { s: 300, len: 100, h: -2 }],
    bank: 0.14,
    bumps: 0.06,
    ruts: 0.05,
    shortcuts: [{ points: [[34, 88], [14, 90], [-6, 86], [-22, 74]], width: 4, surface: 'grass' }],
    points: [
      [0, 0],
      [50, 0],
      [76, 6],
      [92, 28],
      [84, 54],
      [62, 68],
      [40, 82],
      [20, 100],
      [6, 116],
      [-12, 118],
      [-24, 104],
      [-22, 80],
      [-28, 56],
      [-24, 34],
      [-26, 14],
      [-14, 2],
    ],
  },
  {
    id: 'hirvisuo-lenkki',
    name: L('Hirvisuon lenkki'),
    width: 6,
    surface: 'gravel',
    // The folk class's second track: Hirvisuo in little, about 420 m. A longer start straight
    // over a crest, a right-left, a sweeping right onto the bottom straight with the river on it,
    // a right-hander home up the left. About 410 m.
    crests: [{ s: 24, len: 20, h: 0.9 }],
    rivers: [{ s: 246, gap: 8, bank: 0.45 }],
    hills: [{ s: 120, len: 110, h: 3 }, { s: 350, len: 90, h: -2 }],
    bank: 0.14,
    bumps: 0.06,
    ruts: 0.05,
    points: [
      [0, 0],
      [60, 0],
      [88, 8],
      [100, 30],
      [86, 50],
      [64, 54],
      [52, 72],
      [42, 94],
      [22, 108],
      [-6, 110],
      [-30, 106],
      [-40, 84],
      [-42, 54],
      [-38, 26],
      [-22, 6],
    ],
  },
  {
    id: 'kiviaho',
    name: L('Kiviaho'),
    width: 6,
    surface: 'gravel',
    // The first track, about 700 m, built to be fun in its first ten
    // seconds (docs/progression.md): a crest on the start straight lifts
    // the whole field on lap one, a long right sweeper, then a river
    // jumped from its bank right after it; the diagonal runs flat down to
    // the hairpin, where a gap in the forest cuts across the inside on
    // grass, a car and a half wide between the trees; then esses home up
    // the left. Nothing throws a car into the hairpin: a car lands where
    // it can still steer for it. The road runs straight for 45 m past
    // the river's lip (2026-10-04): a flight is straight, and the A car
    // flies 40 m at 155 km/h; before, the diagonal bent under it and it
    // came down on the verge (tools/dbg/exits.ts).
    crests: [{ s: 26, len: 24, h: 0.9 }],
    rivers: [{ s: 214, gap: 12, bank: 0.45 }],
    hills: [{ s: 110, len: 120, h: 3 }, { s: 360, len: 160, h: -3 }, { s: 580, len: 120, h: 2.5 }],
    bank: 0.14,
    bumps: 0.06,
    ruts: 0.05,
    shortcuts: [{ points: [[4, 168], [-10, 182], [-28, 190], [-46, 192], [-60, 184], [-65, 174], [-66, 164]], width: 4, surface: 'grass' }],
    points: [
      [0, 0],
      [72, 0],
      [104, 10],
      [120, 40],
      [104, 72],
      [76, 86],
      [50, 103],
      [22, 126],
      [8, 160],
      [-4, 194],
      [-12, 222],
      [-40, 240],
      [-68, 226],
      [-78, 196],
      [-70, 176],
      [-58, 148],
      [-66, 116],
      [-58, 80],
      [-42, 52],
      [-36, 24],
      [-20, 4],
    ],
  },
  {
    id: 'hirvisuo',
    name: L('Hirvisuo'),
    width: 6,
    surface: 'gravel',
    // About a kilometre: a long start straight over a crest, a hairpin, an
    // esses section with a river at its foot, a fast sweeper home. The
    // bottom straight is straight for 45 m past the river's lip, for the
    // same reason as on Kiviaho.
    crests: [{ s: 50, len: 24, h: 0.9 }],
    rivers: [{ s: 560, gap: 12, bank: 0.45 }],
    hills: [{ s: 200, len: 180, h: 4 }, { s: 400, len: 120, h: -3 }, { s: 800, len: 200, h: 3.5 }],
    bank: 0.14,
    bumps: 0.06,
    ruts: 0.05,
    points: [
      [0, 0],
      [74, 0],
      [124, 6],
      [155, 31],
      [152, 68],
      [124, 87],
      [93, 78],
      [74, 93],
      [81, 130],
      [112, 155],
      [155, 161],
      [186, 192],
      [174, 236],
      [124, 248],
      [74, 252],
      [37, 254],
      [-12, 242],
      [-43, 205],
      [-37, 161],
      [-12, 130],
      [-19, 93],
      [-50, 68],
      [-56, 31],
      [-31, 6],
    ],
  },
];

export const TRACK_BY_ID: Record<string, TrackDef> = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
