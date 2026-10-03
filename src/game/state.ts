import type { CarDef, TrackDef } from './types';
import { Track } from './track';
import type { Text } from '../i18n';
import { PICKUP_ORDER, PICKUP_SPACING, type PickupKind } from './content/pickups';

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
  /** rad/s, the yaw rate */
  yaw: number;
  /** last step's longitudinal acceleration, for the load shift */
  ax: number;
  /** the wheel, smoothed from the input */
  steer: number;
  /** forward speed, m/s */
  speed: number;
  /** sideways speed, m/s: the slide */
  slip: number;
  /** radians between where the car points and where it goes */
  slipAngle: number;
  /** the tyres have let go this step */
  sliding: boolean;
  handbrake: boolean;
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
  /** 0..100; a wreck at 100 */
  damage: number;
  /** seconds left burning, 0 when driving */
  wreck: number;
  missiles: number;
  mines: number;
  /** nitro in the tank, 0..1 */
  boost: number;
  /** seconds of burst left */
  boosting: number;
  /** machine gun heat 0..1 and whether it is cooling */
  heat: number;
  overheated: boolean;
  /** index of the car in the sights, or -1, and how long it has been there */
  target: number;
  lockTime: number;
  /** seconds until the next shot, missile or mine */
  gunWait: number;
  missileWait: number;
  mineWait: number;
  /** seconds left of being a passenger after a hit */
  spin: number;
  /** seconds the car has been near standstill with the throttle down; the bot reverses on it */
  stall: number;
  /** the race's tally */
  wrecks: number;
  wrecked: number;
  cash: number;
  shots: number;
  /** index of the last car that hurt this one, for the bounty */
  lastHitBy: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  owner: number;
}

export interface Missile {
  x: number;
  y: number;
  heading: number;
  speed: number;
  age: number;
  owner: number;
  target: number;
}

export interface Mine {
  x: number;
  y: number;
  age: number;
  owner: number;
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  /** seconds until it is back, 0 when on the road */
  gone: number;
}

/** A burst for the renderer: an explosion, a puff, sparks, a pickup flash, a wreck's fire. */
export interface Fx {
  kind: 'boom' | 'puff' | 'spark' | 'flash' | 'cash';
  x: number;
  y: number;
  age: number;
  colour?: string;
}

/** A line for the HUD: who wrecked whom, what was picked up. */
export interface Toast {
  text: Text;
  colour: string;
  age: number;
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
  bullets: Bullet[];
  missiles: Missile[];
  mines: Mine[];
  pickups: Pickup[];
  fx: Fx[];
  toasts: Toast[];
  /** screen shake asked of the renderer, 0..1 */
  shake: number;
  /** names of sounds for the loop to drain */
  sounds: string[];
  /** world metres visible, set by the renderer; unused by the sim itself */
  view: { w: number; h: number };
}

export const PLAYER: Driver = { name: { fi: 'Sinä', en: 'You' }, skill: 1, colour: '#c8352a' };

/** One car on the grid: who drives it, what it is, what is in the boot. */
export interface Entry {
  driver: Driver;
  car: CarDef;
  missiles?: number;
  mines?: number;
}

export function createState(trackDef: TrackDef, playerCar: CarDef, totalLaps: number, opponents: Entry[] = [], ammo: { missiles: number; mines: number } = { missiles: 0, mines: 0 }): SimState {
  const track = new Track(trackDef);
  const entries: Entry[] = [{ driver: PLAYER, car: playerCar, ...ammo }, ...opponents];
  // the grid: two abreast, the player on the front row, behind the line
  const cars = entries.map(({ driver, car, missiles = 0, mines = 0 }, i) => {
    const row = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const s = track.length - 7 - row * 7;
    const p = track.at(s);
    const d = side * trackDef.width * 0.22;
    return {
      def: { ...car, colour: driver.colour },
      driver,
      x: p.x - p.ty * d,
      y: p.y + p.tx * d,
      heading: Math.atan2(p.ty, p.tx),
      vx: 0,
      vy: 0,
      yaw: 0,
      ax: 0,
      steer: 0,
      speed: 0,
      slip: 0,
      slipAngle: 0,
      sliding: false,
      handbrake: false,
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
      damage: 0,
      wreck: 0,
      missiles,
      mines,
      boost: 0.3,
      boosting: 0,
      heat: 0,
      overheated: false,
      target: -1,
      lockTime: 0,
      gunWait: 0,
      missileWait: 0,
      mineWait: 0,
      spin: 0,
      stall: 0,
      wrecks: 0,
      wrecked: 0,
      cash: 0,
      shots: 0,
      lastHitBy: -1,
    };
  });
  // pickups along the lap, alternating sides, the kinds in rotation
  const pickups: Pickup[] = [];
  const n = Math.floor(track.length / PICKUP_SPACING);
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) * track.length) / n;
    const p = track.at(s);
    const d = (i % 2 ? 1 : -1) * trackDef.width * 0.25;
    pickups.push({ kind: PICKUP_ORDER[i % PICKUP_ORDER.length], x: p.x - p.ty * d, y: p.y + p.tx * d, gone: 0 });
  }
  return { time: 0, track, cars, totalLaps, finished: false, hold: 2.5, bullets: [], missiles: [], mines: [], pickups, fx: [], toasts: [], shake: 0, sounds: [], view: { w: 40, h: 70 } };
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
