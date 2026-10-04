import { L } from '../../i18n';
import type { TrackDef } from '../types';

/**
 * The tracks. A track is its centreline in metres, a width and a surface,
 * with jumps and patches of another surface (a ford, mud, ice) by arc
 * length, and shortcuts as lanes through the forest in world metres;
 * track.ts smooths the line and the renderer draws the road from it, so a
 * new track is a new list of points and nothing else. Points run
 * clockwise on screen (y grows downward). The first point is the start
 * line and the first segment the start straight. Roads are 6 m, about
 * three cars abreast, the width of a Death Rally road: room to pass and
 * no room to pass without a fight.
 */
export const TRACKS: TrackDef[] = [
  {
    id: 'kiviaho',
    name: L('Kiviaho'),
    width: 6,
    surface: 'gravel',
    // The first track, about 680 m, built to be fun in its first ten
    // seconds (docs/progression.md): a kicker on the start straight throws
    // the whole field on lap one, a long right sweeper, then the ford right
    // after it; a second kicker on the diagonal down to the hairpin, where
    // a gap in the forest cuts across the inside on grass, a car and a half
    // wide between the trees; then esses home up the left.
    jumps: [
      { s: 48, len: 8, h: 0.9 },
      { s: 292, len: 7, h: 0.7 },
    ],
    patches: [{ surface: 'water', s: 215, to: 224 }],
    shortcuts: [{ points: [[4, 168], [-10, 182], [-28, 190], [-46, 192], [-60, 184], [-65, 174], [-66, 164]], width: 4, surface: 'grass' }],
    points: [
      [0, 0],
      [72, 0],
      [104, 10],
      [120, 40],
      [104, 72],
      [76, 86],
      [52, 104],
      [28, 130],
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
    // About a kilometre: a long start straight with a kicker, a hairpin, an
    // esses section with a ford at its foot, a fast sweeper home.
    jumps: [{ s: 50, len: 8, h: 0.8 }],
    patches: [{ surface: 'water', s: 346, to: 355 }],
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
      [74, 242],
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
