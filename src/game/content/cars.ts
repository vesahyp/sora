import { L } from '../../i18n';
import type { CarDef } from '../types';

/**
 * The cars, one per class. Numbers are the balance knobs; the bot in
 * tools/ reports what they do to a lap. The classes should be a clear
 * step apart with stock parts, and a fully built car of one class should
 * be close to a stock car of the next, so the choice at the dealer is
 * a real one.
 */
export const CARS: CarDef[] = [
  {
    id: 'kortteli',
    name: L('Kortteli 1.3'),
    cls: 'C',
    price: 2500,
    blurb: L('Väsynyt kaupunkiauto soranastoilla. Kaikki alkaa tästä.', 'A tired town car on gravel tyres. Everyone starts here.'),
    accel: 14,
    topSpeed: 42,
    brake: 26,
    turnRate: 2.8,
    grip: 4.5,
    length: 3.9,
    width: 1.7,
    colour: '#c8352a',
  },
  {
    id: 'sorsa',
    name: L('Sorsa 1.6 GT'),
    cls: 'B',
    price: 9000,
    blurb: L('Kevyt ja terävä. Ei anna anteeksi, mutta kääntyy.', 'Light and sharp. Unforgiving, but it turns.'),
    accel: 19,
    topSpeed: 50,
    brake: 32,
    turnRate: 3.0,
    grip: 5.2,
    length: 4.0,
    width: 1.7,
    colour: '#c8352a',
  },
  {
    id: 'kiila',
    name: L('Kiila 4x4 Turbo'),
    cls: 'A',
    price: 28000,
    blurb: L('Neliveto ja turbo. Metsän kuningas.', 'Four-wheel drive and a turbo. King of the forest.'),
    accel: 26,
    topSpeed: 58,
    brake: 38,
    turnRate: 3.1,
    grip: 6.2,
    length: 4.2,
    width: 1.8,
    colour: '#c8352a',
  },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));
