import type { Text } from '../i18n';

/** What the driver asks of the car this step. Steer is -1 (left) to 1 (right). */
export interface CarInput {
  steer: number;
  throttle: number;
  brake: number;
}

export const NO_INPUT: CarInput = { steer: 0, throttle: 0, brake: 0 };

export type Surface = 'gravel' | 'tarmac';

/** The classes, slowest first. A car has one; an event is run in one. */
export type CarClass = 'C' | 'B' | 'A';
export const CLASSES: CarClass[] = ['C', 'B', 'A'];

export interface TrackDef {
  id: string;
  name: Text;
  /** road width in metres */
  width: number;
  surface: Surface;
  /** the centreline, metres, closed: the last point joins the first. Driven in index order. */
  points: [number, number][];
}

export interface CarDef {
  id: string;
  name: Text;
  cls: CarClass;
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
  /** how fast the sideways slide dies, 1/s; lower is more gravel */
  grip: number;
  /** metres, nose to tail */
  length: number;
  width: number;
  colour: string;
}
