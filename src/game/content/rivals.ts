import { L, type Text } from '../../i18n';
import type { CarClass, CarDef, CarShape, Livery } from '../types';
import type { Driver } from '../state';
import { classCar } from './cars';
import { OPPONENTS, type Rival } from './drivers';
import { tuned, type Parts } from './parts';

/**
 * What each rival drives, per class: their own vehicle, not the player's
 * car repainted. The body says who they are: Jorma, cold and fast, in a
 * Beetle, a saloon, a rally car and a hearse; Marko, the brawler, in
 * whatever shoves hardest: a tiny van, a Valmet tractor, a monster truck,
 * a lorry with a snowplough blade; Tapsa, timid, in a mopoauto, a Niva,
 * a country bus (he cannot pass, so he blocks) and a coupe. In every
 * class the four bodies on the grid differ, every grid has at least one
 * machine that is not a car (Hill Climb Racing's garage, the owner on
 * 2026-10-04: "i want tractors, monster trucks, wild stuff"), and no
 * rival drives the same body twice, so a body in a driver's colour is
 * one vehicle.
 *
 * Size climbs with the class, Hill Climb Racing's first jeep to its
 * monster: JM cars are tiny boxes, 2.4 to 3.2 m (a mopoauto, a Fiat
 * 126), C 3.6 to 4.1, B 4.4 to 7.5 with the bus, A 4.7 to 6.0 with the
 * plough, so a class reads a size up at a glance. The player's cars
 * (cars.ts) sit on the same ladder.
 *
 * The pace is the class car's numbers (through tuned()), so the balance
 * holds whatever the body; `pace` then bends them to what the machine
 * is: the tractor slow on a straight and quick to turn, the bus slow and
 * a wall. The footprint, the wheels and the mass come from the vehicle,
 * so a tractor wins a shunt and a mopoauto loses it. The car model reads
 * the box and the sprite scales the body to it. The colour stays in the
 * driver's hue, so the minimap and the standings still know them; the
 * livery, the accent and the number are the vehicle's own.
 *
 * `skill` is how hard the bot drives this vehicle in this class, 0..1.
 * It climbs with the class: JM rivals are weekend jokkis drivers who
 * wobble and brake late, A rivals are near the bot's ceiling. The player's
 * first race is won by learning the car, the last by beating the bot.
 * C sits just over JM (0.35 to 0.45) since the cars got faster on
 * 2026-10-04: with the bot's margin raised to the tyres' real limit a
 * skill-1 player gains less on a corner than before, and the C field at
 * 0.5 to 0.6 held the bot player behind it for a race. A came down a
 * touch (from 1, 0.92, 0.84) for the same reason: at the new speeds the
 * field drew out of the guns' range.
 */
export interface Vehicle {
  shape: CarShape;
  name: Text;
  colour: string;
  accent: string;
  livery: Livery;
  number: number;
  length: number;
  width: number;
  /** on the class car's mass: what the body weighs in a shunt */
  massScale: number;
  /** the wheels drawn, on the body's own: bigger for a vehicle that stands tall. 1 when absent */
  wheel?: number;
  /** the class car's numbers bent to the machine, each a factor, 1 when absent */
  pace?: { top?: number; accel?: number; turn?: number; grip?: number; brake?: number };
  /** a ram built in, 0..3: the plough's blade */
  ram?: number;
  /** CarDef.offroad: tyres that bite on grass */
  offroad?: number;
  /** CarDef.spinOnShunt: the monster truck throws whoever it hits */
  spinOnShunt?: boolean;
  /** how hard the bot drives it, 0..1 */
  skill: number;
}

/*
 * Skill per class, read with the bot's formula (autoplayer.ts: corner margin 0.25 + 0.75 x skill,
 * throttle 0.45 + 0.55 x skill, 2026-10-04). JM is the ceiling of the folk drivers, 0.75 to 0.85,
 * and the events scale it (EventDef.fieldSkill, 0.5 in the first race to 1.15 at the final): at
 * 0.4 effective a folk rival laps Kiviahon lenkki in 28 s against a new thumb's 25, wobbling and
 * braking late, at 1.0 in 24.3, which the built Tauno of the final beats by a second
 * (tools/dbg/ladder.ts, 2026-10-05). Before the folk car was slowed the JM skills were 0.3 to
 * 0.4 flat, and on the slow car that was 16 m/s of top speed. C, B and A sit where they sat.
 */
export const RIVAL_CARS: Record<string, Record<CarClass, Vehicle>> = {
  jorma: {
    JM: { shape: 'beetle', name: L('Kupla'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'stripe', number: 3, length: 2.9, width: 1.4, massScale: 0.9, skill: 0.85 },
    C: { shape: 'saloon', name: L('Mosse'), colour: '#2a5bb0', accent: '#e6dfcc', livery: 'checker', number: 33, length: 4.1, width: 1.65, massScale: 1, skill: 0.6 },
    B: { shape: 'rally', name: L('Kiituri'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'split', number: 8, length: 4.4, width: 1.85, massScale: 1.05, skill: 0.85 },
    A: { shape: 'hearse', name: L('Saattaja'), colour: '#22345e', accent: '#c9b07a', livery: 'band', number: 2, length: 5.2, width: 1.8, massScale: 1.1, pace: { top: 1.02 }, skill: 0.97 },
  },
  marko: {
    // no heavier than the Tauno: in the first races the shunts go both ways
    JM: { shape: 'van', name: L('Pikkupaku'), colour: '#d8a428', accent: '#77756c', livery: 'primer', number: 66, length: 3.2, width: 1.5, massScale: 1.0, skill: 0.8 },
    C: { shape: 'tractor', name: L('Valmet'), colour: '#d0a02c', accent: '#2c2a26', livery: 'roof', number: 99, length: 3.6, width: 1.9, massScale: 1.8, pace: { top: 0.6, accel: 1.15, turn: 1.4 }, offroad: 0.85, skill: 0.55 },
    B: { shape: 'monster', name: L('Monsteri'), colour: '#e0b030', accent: '#2c2a26', livery: 'split', number: 44, length: 4.6, width: 2.6, massScale: 2.1, pace: { top: 0.96, grip: 0.92 }, offroad: 0.6, spinOnShunt: true, skill: 0.8 },
    A: { shape: 'plough', name: L('Aura-Sisu'), colour: '#d4a52c', accent: '#2c2a26', livery: 'band', number: 69, length: 6.0, width: 2.4, massScale: 3.2, pace: { top: 0.88, accel: 0.85, turn: 1.3 }, ram: 3, skill: 0.92 },
  },
  tapsa: {
    JM: { shape: 'microcar', name: L('Mopoauto'), colour: '#ecebe0', accent: '#3c7a5a', livery: 'stripe', number: 12, length: 2.4, width: 1.3, massScale: 0.6, pace: { top: 0.88, accel: 0.85, turn: 1.4 }, skill: 0.75 },
    C: { shape: 'niva', name: L('Niva'), colour: '#f2f2ea', accent: '#2a2a26', livery: 'stripe', number: 21, length: 3.7, width: 1.7, massScale: 1.15, pace: { top: 0.94, turn: 1.05 }, offroad: 0.3, skill: 0.5 },
    B: { shape: 'bus', name: L('Linja-auto'), colour: '#e6e4d8', accent: '#2f6f8a', livery: 'band', number: 18, length: 7.5, width: 2.3, massScale: 3.0, pace: { top: 0.86, accel: 0.8, turn: 1.3 }, skill: 0.75 },
    A: { shape: 'coupe', name: L('Liitäjä'), colour: '#f2f2ea', accent: '#d06a2a', livery: 'split', number: 5, length: 4.7, width: 1.8, massScale: 1.05, skill: 0.86 },
  },
};

/** The rival's vehicle as a def: the class car built to `parts`, under this body, bent to the machine. */
export function vehicleDef(v: Vehicle, cls: CarClass, parts: Parts): CarDef {
  const base = tuned(classCar(cls), parts);
  const p = v.pace ?? {};
  return {
    ...base,
    id: `${base.id}:${v.shape}:${v.number}`,
    name: v.name,
    shape: v.shape,
    colour: v.colour,
    accent: v.accent,
    livery: v.livery,
    number: v.number,
    length: v.length,
    width: v.width,
    wheel: v.wheel,
    mass: base.mass * v.massScale,
    topSpeed: base.topSpeed * (p.top ?? 1),
    accel: base.accel * (p.accel ?? 1),
    turnRate: base.turnRate * (p.turn ?? 1),
    grip: base.grip * (p.grip ?? 1),
    brake: base.brake * (p.brake ?? 1),
    ram: Math.max(base.ram, v.ram ?? 0),
    offroad: v.offroad,
    spinOnShunt: v.spinOnShunt,
  };
}

/** A rival on the grid of a race of this class: the driver at that vehicle's skill, in it, built to `parts`. */
export function rivalEntry(rival: Rival, cls: CarClass, parts: Parts, skillScale = 1): { driver: Driver; car: CarDef } {
  const v = RIVAL_CARS[rival.id][cls];
  return { driver: { ...rival, skill: Math.min(1, v.skill * skillScale) }, car: vehicleDef(v, cls, parts) };
}

/** The field for a race: every rival in their own vehicle. */
/** The field of a race: every rival in that class's vehicle, built to `parts`, driving at `skillScale` of its skill (EventDef.fieldSkill). */
export function rivalField(cls: CarClass, parts: Parts, skillScale = 1): { driver: Driver; car: CarDef }[] {
  return OPPONENTS.map((rival) => rivalEntry(rival, cls, parts, skillScale));
}
