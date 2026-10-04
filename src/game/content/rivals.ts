import { L, type Text } from '../../i18n';
import type { CarClass, CarDef, CarShape, Livery } from '../types';
import type { Driver } from '../state';
import { CARS } from './cars';
import { OPPONENTS, type Rival } from './drivers';
import { tuned, type Parts } from './parts';

/**
 * What each rival drives, per class: their own vehicle, not the player's
 * car repainted. The body says who they are: Jorma, cold and fast, in a
 * coupe, a saloon, a rally car, a hot hatch; Marko, the brawler, in a
 * box of an estate, a pickup, a van, a land yacht; Tapsa, timid, in a
 * Beetle, a little estate, a hatch, a coupe. In every class the four
 * bodies on the grid differ, and no rival drives the same body twice,
 * so a body in a driver's colour is one vehicle.
 *
 * Size climbs with the class, Hill Climb Racing's first jeep to its
 * monster: JM cars are tiny boxes, 2.8 to 3.2 m (a Fiat 126, a Mini),
 * C 3.6 to 4.1, B 4.1 to 4.7, A 4.5 to 5.0, so a class reads a size up
 * at a glance. The player's cars (cars.ts) sit on the same ladder.
 *
 * The pace is the class car's numbers (through tuned()), so the balance
 * holds whatever the body; the footprint, the wheels and the mass come
 * from the vehicle, a van heavier in a shunt and a Beetle lighter. Any
 * length, width, wheel and mass is fine: the car model reads the box and
 * the sprite scales the body to it. The colour stays in the driver's hue,
 * so the minimap and the standings still know them; the livery, the
 * accent and the number are the vehicle's own.
 *
 * `skill` is how hard the bot drives this vehicle in this class, 0..1.
 * It climbs with the class: JM rivals are weekend jokkis drivers who
 * wobble and brake late, A rivals are the bot's ceiling. The player's
 * first race is won by learning the car, the last by beating the bot.
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
  /** how hard the bot drives it, 0..1 */
  skill: number;
}

export const RIVAL_CARS: Record<string, Record<CarClass, Vehicle>> = {
  jorma: {
    JM: { shape: 'coupe', name: L('Mantta'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'stripe', number: 3, length: 3.1, width: 1.4, massScale: 0.95, skill: 0.4 },
    C: { shape: 'saloon', name: L('Mosse'), colour: '#2a5bb0', accent: '#e6dfcc', livery: 'checker', number: 33, length: 4.1, width: 1.65, massScale: 1, skill: 0.6 },
    B: { shape: 'rally', name: L('Kiituri'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'split', number: 8, length: 4.4, width: 1.85, massScale: 1.05, skill: 0.8 },
    A: { shape: 'hatch', name: L('Ohjus'), colour: '#2456b8', accent: '#e6dfcc', livery: 'works', number: 2, length: 4.5, width: 1.8, massScale: 1, skill: 1.0 },
  },
  marko: {
    JM: { shape: 'estate', name: L('Vollari'), colour: '#d8a428', accent: '#77756c', livery: 'primer', number: 66, length: 3.2, width: 1.45, massScale: 1.1, skill: 0.35 },
    C: { shape: 'pickup', name: L('Lava'), colour: '#d0a02c', accent: '#7a2a1e', livery: 'split', number: 99, length: 4.1, width: 1.75, massScale: 1.15, skill: 0.55 },
    B: { shape: 'van', name: L('Paku'), colour: '#e0b030', accent: '#2c2a26', livery: 'band', number: 44, length: 4.7, width: 1.95, massScale: 1.3, skill: 0.74 },
    A: { shape: 'saloon', name: L('Laiva'), colour: '#d4a52c', accent: '#2c2a26', livery: 'roof', number: 69, length: 5.0, width: 1.9, massScale: 1.25, skill: 0.92 },
  },
  tapsa: {
    JM: { shape: 'beetle', name: L('Kupla'), colour: '#ecebe0', accent: '#3c7a5a', livery: 'stripe', number: 12, length: 2.8, width: 1.35, massScale: 0.85, skill: 0.3 },
    C: { shape: 'estate', name: L('Farkku'), colour: '#f2f2ea', accent: '#2a2a26', livery: 'checker', number: 21, length: 3.8, width: 1.6, massScale: 1, skill: 0.5 },
    B: { shape: 'hatch', name: L('Kirppu'), colour: '#e6e4d8', accent: '#2f6f8a', livery: 'twin', number: 18, length: 4.2, width: 1.7, massScale: 0.95, skill: 0.68 },
    A: { shape: 'coupe', name: L('Liitäjä'), colour: '#f2f2ea', accent: '#d06a2a', livery: 'split', number: 5, length: 4.7, width: 1.8, massScale: 1.05, skill: 0.84 },
  },
};

/** The rival's vehicle as a def: the class car built to `parts`, under this body. */
export function vehicleDef(v: Vehicle, cls: CarClass, parts: Parts): CarDef {
  const base = tuned(CARS.find((c) => c.cls === cls)!, parts);
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
  };
}

/** A rival on the grid of a race of this class: the driver at that vehicle's skill, in it, built to `parts`. */
export function rivalEntry(rival: Rival, cls: CarClass, parts: Parts): { driver: Driver; car: CarDef } {
  const v = RIVAL_CARS[rival.id][cls];
  return { driver: { ...rival, skill: v.skill }, car: vehicleDef(v, cls, parts) };
}

/** The field for a race: every rival in their own vehicle. */
export function rivalField(cls: CarClass, parts: Parts): { driver: Driver; car: CarDef }[] {
  return OPPONENTS.map((rival) => rivalEntry(rival, cls, parts));
}
