import type { Text } from '../i18n';

/** What the driver asks of the car this step. Steer is -1 (left) to 1 (right). */
export interface CarInput {
  steer: number;
  throttle: number;
  /** the pedal: a brake, a handbrake at speed, reverse at a standstill */
  brake: number;
  /** an edge: light the nitro for a burst */
  boost: boolean;
}

export const NO_INPUT: CarInput = { steer: 0, throttle: 0, brake: 0, boost: false };

export type Surface = 'gravel' | 'tarmac';

/** The classes, slowest first. A car has one; an event is run in one. */
export type CarClass = 'C' | 'B' | 'A';
export const CLASSES: CarClass[] = ['C', 'B', 'A'];
export const CLASS_RANK: Record<CarClass, number> = { C: 0, B: 1, A: 2 };

export interface TrackDef {
  id: string;
  name: Text;
  /** road width in metres */
  width: number;
  surface: Surface;
  /** the centreline, metres, closed: the last point joins the first. Driven in index order. */
  points: [number, number][];
}

/** The body the sprite draws: a boxy hatchback, a low coupe, a winged rally car. */
export type CarShape = 'hatch' | 'coupe' | 'rally';

export interface CarDef {
  id: string;
  name: Text;
  cls: CarClass;
  shape: CarShape;
  /** credits at the dealer */
  price: number;
  /** one line at the dealer */
  blurb: Text;
  /** m/s² at standstill; the push fades as the car nears its top speed */
  accel: number;
  /** m/s */
  topSpeed: number;
  /** m/s² */
  brake: number;
  /** rad/s at full lock and the steering speed */
  turnRate: number;
  /** how hard the tyres pull sideways before they let go, m/s²; lower is more gravel */
  grip: number;
  /** tonnes-ish: who wins a shunt */
  mass: number;
  /** armour level 0..3: less damage taken, more dealt */
  armour: number;
  /** gun level 0..3: rate and punch */
  gun: number;
  /** metres, nose to tail */
  length: number;
  width: number;
  colour: string;
}
