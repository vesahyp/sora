import { L } from '../../i18n';
import type { CarDef } from '../types';

/**
 * The cars. One for now: the first car of the career, a tired nineties
 * hatchback on gravel tyres. Numbers are the balance knobs; the bot in
 * tools/ reports what they do to a lap.
 */
export const CARS: CarDef[] = [
  {
    id: 'kortteli',
    name: L('Kortteli 1.3'),
    accel: 14,
    topSpeed: 42,
    brake: 26,
    turnRate: 2.8,
    grip: 4.5,
    length: 3.9,
    width: 1.7,
    colour: '#c8352a',
  },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));
