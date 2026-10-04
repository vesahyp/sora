import { L } from '../../i18n';
import type { CarDef } from '../types';

/**
 * The cars, one per class, slowest first. Numbers are the balance knobs;
 * the bot in tools/ reports what they do to a lap. The classes should be
 * a clear step apart with stock parts, and a fully built car of one class
 * should be close to a stock car of the next, so the choice at the dealer
 * is a real one. The career starts in the Tauno (docs/progression.md).
 * All four are the player's red; the body, the livery and the number
 * tell them apart. The footprint is real: the car model reads it, and
 * it climbs with the class (the ladder is in rivals.ts): the Tauno is a
 * tiny boxy old saloon, a Fiat 126 of a car.
 */
export const CARS: CarDef[] = [
  {
    id: 'tauno',
    name: L('Tauno 2.0'),
    cls: 'JM',
    shape: 'saloon',
    price: 1200,
    blurb: L('Pieni kulmikas jokkisauto: takaveto, pehmeä ja väsynyt. Vuotaa öljyä, ja se on ainoa aseesi.', 'A tiny boxy folk-racing saloon: rear drive, soft and tired. It leaks oil, and that is your only weapon.'),
    accel: 10.5,
    topSpeed: 31,
    brake: 13,
    turnRate: 2.6,
    grip: 17,
    mass: 1.25,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 2.9,
    width: 1.35,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'roof',
    number: 7,
  },
  {
    id: 'kortteli',
    name: L('Kortteli 1.3'),
    cls: 'C',
    shape: 'hatch',
    price: 2500,
    blurb: L('Väsynyt kaupunkiauto soranastoilla. Kaikki alkaa tästä.', 'A tired town car on gravel tyres. Everyone starts here.'),
    accel: 14,
    topSpeed: 42,
    brake: 16,
    turnRate: 2.8,
    grip: 20,
    mass: 1,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 3.7,
    width: 1.65,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'band',
    number: 13,
  },
  {
    id: 'sorsa',
    name: L('Sorsa 1.6 GT'),
    cls: 'B',
    shape: 'coupe',
    price: 9000,
    blurb: L('Kevyt ja terävä. Ei anna anteeksi, mutta kääntyy.', 'Light and sharp. Unforgiving, but it turns.'),
    accel: 19,
    topSpeed: 50,
    brake: 19,
    turnRate: 3.0,
    grip: 23,
    mass: 0.95,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 4.4,
    width: 1.75,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'twin',
    number: 22,
  },
  {
    id: 'kiila',
    name: L('Kiila 4x4 Turbo'),
    cls: 'A',
    shape: 'rally',
    price: 28000,
    blurb: L('Neliveto ja turbo. Metsän kuningas.', 'Four-wheel drive and a turbo. King of the forest.'),
    accel: 22,
    topSpeed: 58,
    brake: 22,
    turnRate: 3.1,
    grip: 26,
    frontDrive: 0.3,
    mass: 1.25,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 4.7,
    width: 1.9,
    colour: '#c8352a',
    accent: '#e8c040',
    livery: 'works',
    number: 1,
  },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));
