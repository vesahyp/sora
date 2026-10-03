import { L } from '../../i18n';
import type { TrackDef } from '../types';

/**
 * The tracks. A track is its centreline in metres, a width and a surface;
 * track.ts smooths the line and the renderer draws the road from it, so a
 * new track is a new list of points and nothing else. Points run
 * clockwise on screen (y grows downward). The first point is the start
 * line and the first segment the start straight.
 */
export const TRACKS: TrackDef[] = [
  {
    id: 'kiviaho',
    name: L('Kiviaho'),
    width: 9,
    surface: 'gravel',
    // The first track: about 600 m, a long straight, two hairpins and a
    // sweeper. Under half a minute a lap.
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
    width: 9,
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
