import type { CarDef } from './types';

/**
 * A car as the physics engine sees it: every number a physical quantity
 * with a unit (docs/adr/0005-rapier-cars.md has the table for the stock
 * Tauno). Derived from the game's knobs in `CarDef`, so the shop's parts,
 * the dealer's cars and the rivals' `pace` all reach the physics through
 * the same few numbers.
 */
export interface Rig {
  /** kg */
  mass: number;
  /** m, the centre of mass over the ground at rest */
  comHeight: number;
  /** share of the weight on the front axle */
  frontWeight: number;
  /** kg·m², about the vertical, the lateral and the long axis */
  yawInertia: number;
  pitchInertia: number;
  rollInertia: number;
  /** m */
  wheelbase: number;
  track: number;
  wheelRadius: number;
  /** m: the spring's length with no load, and how far it can compress */
  restLength: number;
  travel: number;
  /** N/m per wheel */
  springRate: number;
  /** N per wheel: the most a spring and damper push with, at full compression on a hard landing */
  maxSpringForce: number;
  /** N·s/m per wheel, compressing and rebounding */
  damperCompression: number;
  damperRebound: number;
  /** the tyre's friction coefficient on gravel; a surface scales it */
  mu: number;
  /** rad: the slip angle at which the tyre reaches its friction limit on gravel, front and rear */
  peakFront: number;
  peakRear: number;
  /** N at the driven wheels, up to `powerFrom` m/s; W above it */
  engineForce: number;
  enginePower: number;
  /** share of the drive on the front wheels */
  frontDrive: number;
  /** N·s²/m²: the air's pull is drag × v² */
  drag: number;
  /** m/s: where the engine's power and the air's drag meet */
  topSpeed: number;
  /** N, all four wheels, and the share on the front: the brake balance */
  brakeForce: number;
  brakeFront: number;
  /** N on the rear wheels from the pedal above HANDBRAKE_FROM: the handbrake. At the rear tyres' friction limit it locks them */
  handbrakeForce: number;
  /** share of a tyre's friction left when its wheel is locked and sliding */
  lockedGrip: number;
  /** rad: the wheel's lock at rest; the speed in m/s that halves it; how fast the wheel turns, rad/s */
  maxSteer: number;
  lockHalf: number;
  steerRate: number;
  /** m: the body's box */
  length: number;
  width: number;
  height: number;
}

export const G = 9.81;
/** m/s: above this the pedal also locks the rear wheels (the handbrake); below it it brakes, at a standstill reverses */
export const HANDBRAKE_FROM = 6;
/** m over the ground: the bottom of the body's box */
export const CLEARANCE = 0.25;
/** share of the top speed up to which the engine gives its full force; above it its power is the limit */
const FULL_FORCE_TO = 0.3;
/** a spring rate and damping per kg of car keep every car's ride alike, whatever it weighs */
const SPRING_PER_KG = 30;
const COMPRESSION_PER_KG = 6;
const REBOUND_PER_KG = 5;
/** a wheel's spring and damper push with at most this many times the car's weight */
const MAX_SPRING_G = 3;
/** the rear tyres reach their limit at this share of the front's slip angle: a stiffer rear keeps the car stable */
const REAR_STIFF = 0.55;
/**
 * the handbrake's force as a share of the force that locks the rear tyres on gravel: at the full
 * lock the rear let go within 0.3 s of the pedal in a bend at 65 km/h, a snap the thumb made more
 * than once a race; at 0.6 the bots, which brake as they land off a crest at 150 km/h, came down
 * crooked into the trees, where a dragging rear holds a car straight. 0.8 keeps the bots clean and
 * the thumb under one snap a race (tools/dbg/spinwhy.ts, tools/dbg/landsweep.ts, 2026-10-06)
 */
const HANDBRAKE_SHARE = 0.8;
/** rad of lock per unit of `turnRate` */
const LOCK_PER_TURN = 0.17;

/** for the sweeps in tools/dbg: changes applied to every rig worked out from now on */
export const rigTweaks: ((r: Rig, def: CarDef) => void)[] = [];

export function rig(def: CarDef): Rig {
  const mass = def.mass * 1000;
  const height = 1.0;
  const L = def.length;
  const W = def.width;
  const engineForce = mass * def.accel;
  const enginePower = engineForce * FULL_FORCE_TO * def.topSpeed;
  const r: Rig = {
    mass,
    comHeight: 0.3,
    frontWeight: 0.5,
    yawInertia: (mass * (L * L + W * W)) / 12,
    pitchInertia: (mass * (L * L + height * height)) / 12,
    rollInertia: (mass * (W * W + height * height)) / 12,
    wheelbase: L * 0.62,
    track: W * 0.85,
    wheelRadius: 0.28,
    restLength: 0.3,
    travel: 0.3,
    springRate: SPRING_PER_KG * mass,
    maxSpringForce: mass * G * MAX_SPRING_G,
    damperCompression: COMPRESSION_PER_KG * mass,
    damperRebound: REBOUND_PER_KG * mass,
    mu: def.grip / G,
    peakFront: 0.13,
    peakRear: 0.13 * REAR_STIFF,
    engineForce,
    enginePower,
    frontDrive: def.frontDrive ?? 0,
    drag: enginePower / def.topSpeed ** 3,
    topSpeed: def.topSpeed,
    brakeForce: mass * def.brake,
    brakeFront: 0.6,
    handbrakeForce: HANDBRAKE_SHARE * mass * def.grip,
    lockedGrip: 0.85,
    maxSteer: def.turnRate * LOCK_PER_TURN,
    lockHalf: 20,
    steerRate: 5,
    length: L,
    width: W,
    height,
  };
  for (const tweak of rigTweaks) tweak(r, def);
  return r;
}

const rigs = new WeakMap<CarDef, Rig>();
/** The rig of a car, worked out once per CarDef. */
export function rigOf(def: CarDef): Rig {
  let r = rigs.get(def);
  if (!r) {
    r = rig(def);
    rigs.set(def, r);
  }
  return r;
}

/** rad: the wheel's lock at this speed, m/s */
export function lockAt(r: Rig, v: number): number {
  return r.maxSteer / (1 + Math.abs(v) / r.lockHalf);
}

/** N: what the engine pushes with at this forward speed, before the surface, damage and nitro */
export function engineAt(r: Rig, v: number, force = r.engineForce, power = r.enginePower): number {
  return Math.min(force, power / Math.max(1, Math.abs(v)));
}
