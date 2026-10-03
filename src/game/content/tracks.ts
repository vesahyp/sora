import { L } from '../../i18n';
import type { TrackDef } from '../types';

/**
 * The tracks. A track is its centreline in metres, a width and a surface,
 * with jumps and patches of another surface (a ford, mud, ice) by arc length;
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
    // The first track: about 600 m, a long straight, two hairpins and a
    // sweeper. Under half a minute a lap. A kicker on the start straight
    // throws the field on the first lap, and a ford crosses the sweeper.
    jumps: [{ s: 45, len: 6, h: 0.6 }],
    patches: [{ surface: 'water', s: 340, to: 349 }],
    points: [
      [0, 0],
      [72, 0],
      [104, 10],
      [120, 40],
      [104, 72],
      [68, 76],
      [48, 104],
      [64, 140],
      [32, 164],
      [-24, 160],
      [-56, 128],
      [-48, 88],
      [-16, 68],
      [-36, 40],
      [-40, 12],
      [-24, 0],
    ],
  },
  {
    id: 'hirvisuo',
    name: L('Hirvisuo'),
    width: 6,
    surface: 'gravel',
    // About a kilometre: a long start straight, a hairpin, an esses
    // section, a fast sweeper home.
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
