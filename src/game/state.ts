import type { CarDef, TrackDef } from './types';
import { Track } from './track';
import type { Text } from '../i18n';

export interface Driver {
  name: Text;
  /** 0..1: how hard the bot drives this car. 1 is the bot's own ceiling. */
  skill: number;
  colour: string;
}

export interface Car {
  def: CarDef;
  driver: Driver;
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
  /** 1 while scraping the trees or another car this step */
  hit: number;
  /** where on the lap */
  s: number;
  /** signed offset from the centreline */
  d: number;
  /** set after passing half distance; a lap counts only with it */
  half: boolean;
  /** 1-based; totalLaps + 1 once finished */
  lap: number;
  lapStart: number;
  laps: number[];
  /** race time at the flag, or -1 */
  finishedAt: number;
  /** lap * L + s, for the running order */
  progress: number;
}

export interface SimState {
  time: number;
  track: Track;
  /** index 0 is the player */
  cars: Car[];
  totalLaps: number;
  /** the player has crossed the flag */
  finished: boolean;
  /** the countdown before the lights go, seconds; the cars are held while > 0 */
  hold: number;
  /** names of sounds for the loop to drain */
  sounds: string[];
  /** world metres visible, set by the renderer; unused by the sim itself */
  view: { w: number; h: number };
}

export const PLAYER: Driver = { name: { fi: 'Sinä', en: 'You' }, skill: 1, colour: '#c8352a' };

export function createState(trackDef: TrackDef, carDef: CarDef, totalLaps: number, opponents: Driver[] = []): SimState {
  const track = new Track(trackDef);
  const drivers = [PLAYER, ...opponents];
  // the grid: two abreast, the player on the front row, behind the line
  const cars = drivers.map((driver, i) => {
    const row = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const s = track.length - 7 - row * 7;
    const p = track.at(s);
    const d = side * trackDef.width * 0.22;
    return {
      def: { ...carDef, colour: driver.colour },
      driver,
      x: p.x - p.ty * d,
      y: p.y + p.tx * d,
      heading: Math.atan2(p.ty, p.tx),
      vx: 0,
      vy: 0,
      steer: 0,
      speed: 0,
      slip: 0,
      onRoad: true,
      hit: 0,
      s,
      d,
      half: false,
      lap: 1,
      lapStart: 0,
      laps: [],
      finishedAt: -1,
      progress: 0,
    };
  });
  return { time: 0, track, cars, totalLaps, finished: false, hold: 2.5, sounds: [], view: { w: 40, h: 70 } };
}

/** The running order: finishers by flag time, then everyone by distance covered. */
export function standings(s: SimState): Car[] {
  return s.cars.slice().sort((a, b) => {
    if (a.finishedAt >= 0 && b.finishedAt >= 0) return a.finishedAt - b.finishedAt;
    if (a.finishedAt >= 0) return -1;
    if (b.finishedAt >= 0) return 1;
    return b.progress - a.progress;
  });
}

/** 1-based place of a car. */
export function placeOf(s: SimState, car: Car): number {
  return standings(s).indexOf(car) + 1;
}
