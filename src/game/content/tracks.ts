import { L } from '../../i18n';
import type { TrackDef } from '../types';

/**
 * The tracks. A track is its centreline in metres, a width and a surface;
 * track.ts smooths the line and the renderer draws the road from it, so a
 * new track is a new list of points and nothing else.
 */
export const TRACKS: TrackDef[] = [
  {
    id: 'hirvisuo',
    name: L('Hirvisuo'),
    width: 9,
    surface: 'gravel',
    // Clockwise on screen (y grows downward). A long start straight, a
    // hairpin, an esses section, a fast sweeper home.
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
