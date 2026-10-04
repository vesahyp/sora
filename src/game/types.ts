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

/** What a tyre is on. A road is gravel or tarmac; patches and the verge bring the rest (content/surfaces.ts). */
export type Surface = 'gravel' | 'tarmac' | 'grass' | 'mud' | 'water' | 'ice';

/**
 * A stretch of a track that is not its road surface: a ford, a mud hole,
 * an icy bend. From `s` to `to` metres along the lap, and across the road
 * from `d[0]` to `d[1]` metres off the centreline (positive is right of
 * travel); without `d` it spans the road and the verge.
 */
export interface SurfacePatch {
  surface: Surface;
  s: number;
  to: number;
  d?: [number, number];
}

/**
 * A kicker: the road rises over `len` metres to `h` metres at `s`, then
 * drops straight back to the ground. A car that reaches the lip faster
 * than gravity can pull it down leaves the ground.
 */
export interface JumpDef {
  s: number;
  len: number;
  h: number;
}

/**
 * The classes, slowest first. A car has one; an event is run in one. JM is
 * jokamiesluokka, folk racing in old saloons, where a career starts
 * (docs/adr/0004-career-starts-in-jokamiesluokka.md).
 */
export type CarClass = 'JM' | 'C' | 'B' | 'A';
export const CLASSES: CarClass[] = ['JM', 'C', 'B', 'A'];
export const CLASS_RANK: Record<CarClass, number> = { JM: 0, C: 1, B: 2, A: 3 };

/**
 * A shortcut: a gap in the forest, a lane `width` metres wide on `surface`
 * along an open polyline in world metres from a point on the road to a
 * point on the road further along the lap. The trees are its walls; the
 * sim's walls and surfaces follow it, the bot can drive it, the renderer
 * draws it as a worn two-track.
 */
export interface ShortcutDef {
  points: [number, number][];
  width: number;
  surface: Surface;
}

export interface TrackDef {
  id: string;
  name: Text;
  /** road width in metres */
  width: number;
  /** the road's surface; off the road is grass */
  surface: 'gravel' | 'tarmac';
  /** stretches of another surface, in arc length: fords, mud, ice */
  patches?: SurfacePatch[];
  jumps?: JumpDef[];
  shortcuts?: ShortcutDef[];
  /** the centreline, metres, closed: the last point joins the first. Driven in index order. */
  points: [number, number][];
}

/**
 * The body the sprite draws. Each has its own silhouette and one thing
 * that reads at a glance: the saloon's three boxes, the hatch's tailgate,
 * the coupe's long nose, the rally car's arches and wing, the estate's
 * long roof and rails, the beetle's dome and fenders, the van's ladder,
 * the pickup's open bed, the microcar's being tiny.
 */
export type CarShape = 'saloon' | 'hatch' | 'coupe' | 'rally' | 'estate' | 'beetle' | 'van' | 'pickup' | 'microcar';

/**
 * How the second colour is laid: a white roof, bands along the flanks,
 * twin stripes over the top, a works livery, the nose in another colour,
 * one broad stripe, primer-grey doors off a scrapyard, a chequered roof.
 */
export type Livery = 'roof' | 'band' | 'twin' | 'works' | 'split' | 'stripe' | 'primer' | 'checker';

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
  /** the steering lock: 0.17 rad per unit at rest, less at speed */
  turnRate: number;
  /** the tyres' grip as an acceleration, m/s²: what a loaded axle can pull sideways before it slides */
  grip: number;
  /** share of the drive on the front axle: 0 is rear drive, 0.5 four-wheel drive. Rear when absent */
  frontDrive?: number;
  /** tonnes-ish: who wins a shunt */
  mass: number;
  /** armour level 0..3: less damage taken */
  armour: number;
  /** ram bar level 0..3: a shunt hurts the other car more and this one less */
  ram: number;
  /** machine gun level 0..3: 0 is no gun at all, 1 the gun, then its rate and punch */
  gun: number;
  /** tyre level 0..3, stamped by tuned() so the sprite can draw it; stock when absent */
  tyres?: number;
  /** engine level 0..3, stamped by tuned() for the sprite */
  engine?: number;
  /** metres, nose to tail */
  length: number;
  width: number;
  /** the paint: the hue the minimap and the standings know the car by */
  colour: string;
  /** the livery's second colour */
  accent: string;
  livery: Livery;
  /** the race number on the roof */
  number: number;
}
