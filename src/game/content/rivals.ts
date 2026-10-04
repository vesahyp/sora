import { L, type Text } from '../../i18n';
import type { CarClass, CarDef, CarShape, Livery } from '../types';
import type { Driver } from '../state';
import { CARS } from './cars';
import { OPPONENTS } from './drivers';
import { tuned, type Parts } from './parts';

/**
 * What each rival drives, per class: their own vehicle, not the player's
 * car repainted. The body says who they are: Jorma, cold and fast, in a
 * coupe, a rally car or a hot hatch; Marko, the brawler, in a brick of
 * an estate, a van, a pickup or a land yacht; Tapsa, timid, in a Beetle,
 * the microcar, a little hatch. JM is folk racing: an old coupe, an
 * estate, a Beetle. In every class the four bodies on the grid differ,
 * and no rival drives the same body twice, so a body in a driver's
 * colour is one vehicle.
 *
 * The pace is the class car's numbers (through tuned()), so the balance
 * holds whatever the body; only the footprint and the mass come from the
 * vehicle, a van heavier in a shunt and the microcar lighter. The colour
 * stays in the driver's hue, so the minimap and the standings still know
 * them; the livery, the accent and the number are the vehicle's own.
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
}

export const RIVAL_CARS: Record<string, Record<CarClass, Vehicle>> = {
  jorma: {
    JM: { shape: 'coupe', name: L('Mantta'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'stripe', number: 3, length: 4.4, width: 1.7, massScale: 1 },
    C: { shape: 'saloon', name: L('Mosse'), colour: '#2a5bb0', accent: '#e6dfcc', livery: 'checker', number: 33, length: 4.3, width: 1.7, massScale: 1 },
    B: { shape: 'rally', name: L('Kiituri'), colour: '#2f6fd6', accent: '#e6dfcc', livery: 'split', number: 8, length: 4.1, width: 1.9, massScale: 1.05 },
    A: { shape: 'hatch', name: L('Ohjus'), colour: '#2456b8', accent: '#e6dfcc', livery: 'works', number: 2, length: 3.8, width: 1.75, massScale: 1 },
  },
  marko: {
    JM: { shape: 'estate', name: L('Vollari'), colour: '#d8a428', accent: '#77756c', livery: 'primer', number: 66, length: 4.9, width: 1.8, massScale: 1.15 },
    C: { shape: 'van', name: L('Paku'), colour: '#e0b030', accent: '#2c2a26', livery: 'band', number: 44, length: 5.0, width: 2.0, massScale: 1.3 },
    B: { shape: 'pickup', name: L('Lava'), colour: '#d0a02c', accent: '#7a2a1e', livery: 'split', number: 99, length: 5.0, width: 1.85, massScale: 1.2 },
    A: { shape: 'saloon', name: L('Laiva'), colour: '#d4a52c', accent: '#2c2a26', livery: 'roof', number: 69, length: 5.0, width: 1.9, massScale: 1.25 },
  },
  tapsa: {
    JM: { shape: 'beetle', name: L('Kupla'), colour: '#ecebe0', accent: '#3c7a5a', livery: 'stripe', number: 12, length: 4.0, width: 1.6, massScale: 0.9 },
    C: { shape: 'microcar', name: L('Mopoauto'), colour: '#f2f2ea', accent: '#d06a2a', livery: 'split', number: 5, length: 2.6, width: 1.4, massScale: 0.7 },
    B: { shape: 'hatch', name: L('Kirppu'), colour: '#e6e4d8', accent: '#2f6f8a', livery: 'twin', number: 18, length: 3.6, width: 1.65, massScale: 0.95 },
    A: { shape: 'estate', name: L('Farkku'), colour: '#f2f2ea', accent: '#2a2a26', livery: 'checker', number: 21, length: 4.8, width: 1.8, massScale: 1.1 },
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
    mass: base.mass * v.massScale,
  };
}

/** What this rival drives in a race of this class, built to `parts`. */
export function rivalCar(driver: Driver, cls: CarClass, parts: Parts): CarDef {
  return vehicleDef(RIVAL_CARS[driver.id!][cls], cls, parts);
}

/** The field for a race: every rival in their own vehicle. */
export function rivalField(cls: CarClass, parts: Parts): { driver: Driver; car: CarDef }[] {
  return OPPONENTS.map((driver) => ({ driver, car: rivalCar(driver, cls, parts) }));
}
