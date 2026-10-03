import type { CarDef, TrackDef } from './types';
import { Track } from './track';

export interface Car {
  def: CarDef;
  x: number;
  y: number;
  /** radians, 0 is +x, screen-down positive */
  heading: number;
  vx: number;
  vy: number;
  /** the wheel, smoothed from the input */
  steer: number;
  /** forward speed, m/s, for the HUD and the bot */
  speed: number;
  /** sideways speed, for dust and sound */
  slip: number;
  onRoad: boolean;
  /** 1 while scraping the trees this step */
  hit: number;
  /** where on the lap */
  s: number;
  /** signed offset from the centreline */
  d: number;
  /** set after passing half distance; a lap counts only with it */
  half: boolean;
}

export interface SimState {
  time: number;
  track: Track;
  car: Car;
  totalLaps: number;
  /** 1-based; totalLaps + 1 once finished */
  lap: number;
  lapStart: number;
  laps: number[];
  finished: boolean;
  /** the countdown before the lights go, seconds; the car is held while > 0 */
  hold: number;
  /** names of sounds for the loop to drain */
  sounds: string[];
  /** world metres visible, set by the renderer so the sim can cull; unused by the sim itself */
  view: { w: number; h: number };
}

export function createState(trackDef: TrackDef, carDef: CarDef, totalLaps: number): SimState {
  const track = new Track(trackDef);
  const p = track.at(-8);
  const heading = Math.atan2(p.ty, p.tx);
  return {
    time: 0,
    track,
    car: {
      def: carDef,
      x: p.x,
      y: p.y,
      heading,
      vx: 0,
      vy: 0,
      steer: 0,
      speed: 0,
      slip: 0,
      onRoad: true,
      hit: 0,
      s: track.length - 8,
      d: 0,
      half: false,
    },
    totalLaps,
    lap: 1,
    lapStart: 0,
    laps: [],
    finished: false,
    hold: 2.5,
    sounds: [],
    view: { w: 40, h: 70 },
  };
}
