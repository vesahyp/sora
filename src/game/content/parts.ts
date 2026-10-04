import { L, type Text } from '../../i18n';
import { CLASS_RANK, type CarClass, type CarDef } from '../types';

/**
 * The parts shop. Seven kinds, three levels each; a level is a price and
 * what it does to the car. A part arrives with a class (`from`): a JM car
 * fits a ram bar, armour, an engine and tyres, the Death Rally start; a
 * class C car adds weight, brakes and the machine gun, whose first level
 * is the gun itself. Prices are a fraction of the car's price, so the
 * same shop fits every class. The order of value is the Gran Turismo
 * one: tyres and the ram bar first.
 */
export type PartKind = 'ram' | 'armour' | 'engine' | 'tyres' | 'weight' | 'brakes' | 'gun';
export const PART_KINDS: PartKind[] = ['ram', 'armour', 'engine', 'tyres', 'weight', 'brakes', 'gun'];
export type Parts = Record<PartKind, number>;
export const STOCK: Parts = { ram: 0, armour: 0, engine: 0, tyres: 0, weight: 0, brakes: 0, gun: 0 };

export interface PartDef {
  kind: PartKind;
  name: Text;
  /** what one level does, for the shop */
  effect: Text;
  /** price per level, as a fraction of the car's price */
  cost: [number, number, number];
  levels: [Text, Text, Text];
  /** the lowest class whose cars fit it */
  from: CarClass;
}

export const PARTS: PartDef[] = [
  {
    kind: 'ram',
    name: L('Puskuri', 'Ram bar'),
    effect: L('töytäisy sattuu heihin, ei sinuun', 'a shunt hurts them, not you'),
    cost: [0.12, 0.2, 0.32],
    levels: [L('Putkipuskuri', 'Pipe bumper'), L('Piikkipuskuri', 'Spiked bumper'), L('Aura', 'Plough')],
    from: 'JM',
  },
  {
    kind: 'armour',
    name: L('Panssari', 'Armour'),
    effect: L('kestää osumia, painaa kolarissa', 'takes hits, weighs in a shunt'),
    cost: [0.12, 0.22, 0.36],
    levels: [L('Pellit', 'Plates'), L('Turvakaari', 'A cage'), L('Panssarilevyt', 'Armour plate')],
    from: 'JM',
  },
  {
    kind: 'engine',
    name: L('Moottori', 'Engine'),
    effect: L('huippunopeus ja veto', 'top speed and pull'),
    cost: [0.15, 0.28, 0.45],
    levels: [L('Viritetty imusarja', 'Tuned intake'), L('Nokka ja pakoputki', 'Cam and exhaust'), L('Kilpamoottori', 'Race engine')],
    from: 'JM',
  },
  {
    kind: 'tyres',
    name: L('Renkaat', 'Tyres'),
    effect: L('pito mutkissa', 'grip in the corners'),
    cost: [0.12, 0.2, 0.32],
    levels: [L('Pehmeät soranastat', 'Soft gravel tyres'), L('Kilparenkaat', 'Rally tyres'), L('Tehdasrenkaat', 'Works tyres')],
    from: 'JM',
  },
  {
    kind: 'weight',
    name: L('Kevennys', 'Weight'),
    effect: L('kiihtyvyys ja jarrut', 'acceleration and braking'),
    cost: [0.1, 0.18, 0.3],
    levels: [L('Penkit pois', 'Seats out'), L('Lasikuitupellit', 'Fibreglass panels'), L('Kaikki pois', 'Everything out')],
    from: 'C',
  },
  {
    kind: 'brakes',
    name: L('Jarrut', 'Brakes'),
    effect: L('jarrutus', 'braking'),
    cost: [0.08, 0.14, 0.22],
    levels: [L('Urheilupalat', 'Sport pads'), L('Isot levyt', 'Big discs'), L('Kilpajarrut', 'Race brakes')],
    from: 'C',
  },
  {
    kind: 'gun',
    name: L('Konekivääri', 'Machine gun'),
    effect: L('ampuu itsestään edessä olevaa', 'fires itself at the car ahead'),
    cost: [0.14, 0.25, 0.4],
    levels: [L('Konekivääri', 'A machine gun'), L('Toinen piippu', 'A second barrel'), L('Isompi kaliiperi', 'Bigger calibre')],
    from: 'C',
  },
];

export const PART_BY_KIND: Record<PartKind, PartDef> = Object.fromEntries(PARTS.map((p) => [p.kind, p])) as Record<PartKind, PartDef>;

/** The parts a car of this class fits: its own class's and every class below. */
export function partsFor(cls: CarClass): PartDef[] {
  return PARTS.filter((p) => CLASS_RANK[p.from] <= CLASS_RANK[cls]);
}

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
  const r = parts.ram;
  const g = parts.gun;
  return {
    ...car,
    grip: car.grip * (1 + 0.1 * t),
    turnRate: car.turnRate * (1 + 0.04 * t),
    accel: car.accel * (1 + 0.07 * w + 0.09 * e - 0.03 * a - 0.01 * r),
    topSpeed: car.topSpeed * (1 + 0.06 * e),
    brake: car.brake * (1 + 0.05 * w + 0.12 * b),
    mass: car.mass * (1 - 0.06 * w + 0.12 * a + 0.04 * r),
    armour: a,
    ram: r,
    gun: g,
    // not read by the car model: the sprite draws them
    tyres: t,
    engine: e,
  };
}

/** Everything fitted, for the balance tool and the opponents of a tough event. */
export const FULL: Parts = { ram: 3, armour: 3, engine: 3, tyres: 3, weight: 3, brakes: 3, gun: 3 };

/** Everything the class fits, fitted: FULL cut down to the parts the car can take. */
export function fullFor(cls: CarClass): Parts {
  const p = { ...STOCK };
  for (const d of partsFor(cls)) p[d.kind] = 3;
  return p;
}
