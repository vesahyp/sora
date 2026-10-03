import { L, type Text } from '../../i18n';
import type { CarDef } from '../types';

/**
 * The parts shop. Four kinds, three levels each; a level is a price and
 * what it does to the car. The order of value is the Gran Turismo one:
 * tyres first, then weight, then the engine, with brakes for the driver
 * who has learned to use them. Prices are a fraction of the car's price,
 * so the same shop fits every class.
 */
export type PartKind = 'tyres' | 'weight' | 'engine' | 'brakes' | 'armour' | 'gun';
export const PART_KINDS: PartKind[] = ['tyres', 'weight', 'engine', 'brakes', 'armour', 'gun'];
export type Parts = Record<PartKind, number>;
export const STOCK: Parts = { tyres: 0, weight: 0, engine: 0, brakes: 0, armour: 0, gun: 0 };

export interface PartDef {
  kind: PartKind;
  name: Text;
  /** what one level does, for the shop */
  effect: Text;
  /** price per level, as a fraction of the car's price */
  cost: [number, number, number];
  levels: [Text, Text, Text];
}

export const PARTS: PartDef[] = [
  {
    kind: 'tyres',
    name: L('Renkaat', 'Tyres'),
    effect: L('pito mutkissa', 'grip in the corners'),
    cost: [0.12, 0.2, 0.32],
    levels: [L('Pehmeät soranastat', 'Soft gravel tyres'), L('Kilparenkaat', 'Rally tyres'), L('Tehdasrenkaat', 'Works tyres')],
  },
  {
    kind: 'weight',
    name: L('Kevennys', 'Weight'),
    effect: L('kiihtyvyys ja jarrut', 'acceleration and braking'),
    cost: [0.1, 0.18, 0.3],
    levels: [L('Penkit pois', 'Seats out'), L('Turvakaari ja lasikuitu', 'Cage and fibreglass'), L('Kaikki pois', 'Everything out')],
  },
  {
    kind: 'engine',
    name: L('Moottori', 'Engine'),
    effect: L('huippunopeus ja veto', 'top speed and pull'),
    cost: [0.15, 0.28, 0.45],
    levels: [L('Viritetty imusarja', 'Tuned intake'), L('Nokka ja pakoputki', 'Cam and exhaust'), L('Kilpamoottori', 'Race engine')],
  },
  {
    kind: 'brakes',
    name: L('Jarrut', 'Brakes'),
    effect: L('jarrutus', 'braking'),
    cost: [0.08, 0.14, 0.22],
    levels: [L('Urheilupalat', 'Sport pads'), L('Isot levyt', 'Big discs'), L('Kilpajarrut', 'Race brakes')],
  },
  {
    kind: 'armour',
    name: L('Panssari', 'Armour'),
    effect: L('kestää osumia, painaa kolarissa', 'takes hits, weighs in a shunt'),
    cost: [0.12, 0.22, 0.36],
    levels: [L('Pellit ja puskuri', 'Plates and a bumper'), L('Piikkipuskuri', 'Spiked bumper'), L('Aurat ja häkki', 'Ploughs and a cage')],
  },
  {
    kind: 'gun',
    name: L('Konekivääri', 'Machine gun'),
    effect: L('tulinopeus ja teho', 'rate and punch'),
    cost: [0.14, 0.25, 0.4],
    levels: [L('Toinen piippu', 'A second barrel'), L('Isompi kaliiperi', 'Bigger calibre'), L('Pyörivä tykki', 'Rotary cannon')],
  },
];

export const PART_BY_KIND: Record<PartKind, PartDef> = Object.fromEntries(PARTS.map((p) => [p.kind, p])) as Record<PartKind, PartDef>;

/** The price of the next level of a part, or null at the top. */
export function partPrice(car: CarDef, kind: PartKind, parts: Parts): number | null {
  const lvl = parts[kind];
  if (lvl >= 3) return null;
  return Math.round((car.price * PART_BY_KIND[kind].cost[lvl]) / 50) * 50;
}

/** The car with its parts: a new def, the stock one untouched. */
export function tuned(car: CarDef, parts: Parts): CarDef {
  const t = parts.tyres;
  const w = parts.weight;
  const e = parts.engine;
  const b = parts.brakes;
  const a = parts.armour;
  const g = parts.gun;
  return {
    ...car,
    grip: car.grip * (1 + 0.1 * t),
    turnRate: car.turnRate * (1 + 0.04 * t),
    accel: car.accel * (1 + 0.07 * w + 0.09 * e - 0.03 * a),
    topSpeed: car.topSpeed * (1 + 0.06 * e),
    brake: car.brake * (1 + 0.05 * w + 0.12 * b),
    mass: car.mass * (1 - 0.06 * w + 0.12 * a),
    armour: a,
    gun: g,
  };
}

/** Everything fitted, for the balance tool and the opponents of a tough event. */
export const FULL: Parts = { tyres: 3, weight: 3, engine: 3, brakes: 3, armour: 3, gun: 3 };
