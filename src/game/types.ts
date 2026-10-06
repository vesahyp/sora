import type { Text } from '../i18n';

/** What the driver asks of the car this step. Steer is -1 (left) to 1 (right). */
export interface CarInput {
  steer: number;
  throttle: number;
  /** the pedal: a brake, reverse at a standstill */
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
 * A river across the road, jumped from a bank. Ahead of `s` the road
 * climbs a bank over RIVER.ramp metres to `bank` metres at the lip; past
 * the lip the ground drops to the water (RIVER.water, below the road)
 * for `gap` metres; then the far bank rises back to the road over
 * RIVER.out metres. A car at racing speed clears the water and lands on
 * the far bank; a slow one drops in, splashes and drives out. It spans
 * the road and the verge to the trees.
 */
export interface RiverDef {
  s: number;
  gap: number;
  bank: number;
}

/**
 * A crest: a brow of the land that rises and falls smoothly over `len`
 * metres, `h` metres high at `s`. Fast enough over the top and the ground
 * falls away quicker than gravity can follow: the car flies. A slow car
 * is only lifted.
 */
export interface CrestDef {
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
  /** stretches of another surface, in arc length: mud, ice, a ford */
  patches?: SurfacePatch[];
  /** rivers jumped from a bank, and crests: the ground's height along the lap */
  rivers?: RiverDef[];
  crests?: CrestDef[];
  shortcuts?: ShortcutDef[];
  /** the centreline, metres, closed: the last point joins the first. Driven in index order. */
  points: [number, number][];
}

/**
 * The body the sprite draws. Each has its own silhouette and one thing
 * that reads at a glance: the saloon's three boxes, the hatch's tailgate,
 * the coupe's long nose, the rally car's arches and wing, the estate's
 * long roof and rails, the beetle's dome and fenders, the van's ladder,
 * the pickup's open bed, the microcar's being tiny. Then the machines
 * that are not cars at all, Hill Climb Racing's garage: the tractor's
 * huge rear wheels and stack, the monster truck's balloon tyres, the
 * bus's row of windows, the plough's blade, the hearse's glass back and
 * coffin, the Niva's spare on the tailgate.
 */
export type CarShape =
  | 'saloon'
  | 'hatch'
  | 'coupe'
  | 'rally'
  | 'estate'
  | 'beetle'
  | 'van'
  | 'pickup'
  | 'microcar'
  | 'tractor'
  | 'monster'
  | 'bus'
  | 'plough'
  | 'hearse'
  | 'niva';

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
  /** m/s² at standstill: the engine's force over the mass, until its power runs out (rig.ts) */
  accel: number;
  /** m/s: the speed the car reaches on gravel, where its engine's power meets the air's drag */
  topSpeed: number;
  /** m/s²: the brakes' force over the mass */
  brake: number;
  /** the steering lock: 0.17 rad of wheel per unit at rest, less at speed (rig.ts, lockAt) */
  turnRate: number;
  /** the tyres' grip as an acceleration, m/s²: over g it is the tyres' friction coefficient on gravel */
  grip: number;
  /** share of the drive on the front axle: 0 is rear drive, 0.5 four-wheel drive. Rear when absent */
  frontDrive?: number;
  /** tonnes: the body's mass, and who wins a shunt */
  mass: number;
  /**
   * Lugs and balloon tyres: the share of what grass, mud and water take from the grip and the
   * top speed that these tyres keep, 0..1. The Niva and the tractor drive on the verge as on the
   * road, so a corner cut is theirs. 0 when absent
   */
  offroad?: number;
  /**
   * A shunt from this car throws the victim into a spin at any ramming speed, not only past
   * RAM.spinClosing: the monster truck lands on people. False when absent
   */
  spinOnShunt?: boolean;
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
  /** nitro level 0..3: a bigger boost tank that fills faster (nitroTank, nitroFill). 0 when absent */
  nitro?: number;
  /** brakes level 0..3, stamped by tuned() for the sprite */
  brakes?: number;
  /** weight level 0..3, stamped by tuned() for the sprite: the shell stripped bare */
  weight?: number;
  /** metres, nose to tail */
  length: number;
  width: number;
  /** the wheels drawn, on the body's own size: a cosmetic scale for a vehicle that stands tall. 1 when absent */
  wheel?: number;
  /** the paint: the hue the minimap and the standings know the car by */
  colour: string;
  /** the livery's second colour */
  accent: string;
  livery: Livery;
  /** the race number on the roof */
  number: number;
}
