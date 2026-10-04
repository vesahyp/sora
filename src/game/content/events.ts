import { L, type Text } from '../../i18n';
import type { CarClass } from '../types';
import { STOCK, type Parts } from './parts';
import { carried } from './weapons';

/**
 * The calendar. An event is a track, a lap count, a class, and the
 * money. The field drives the class's car; `fieldParts` is how built
 * those cars are, so the second event of a class is harder than the
 * first. A class above C needs its licence; JM to C is bought. The
 * prize rule (docs/progression.md): a class's winner's prizes add up to
 * a little more than the next class's car, and the lower places pay
 * about 55%, 28% and 13% of the win.
 */
export interface EventDef {
  id: string;
  name: Text;
  cls: CarClass;
  trackId: string;
  laps: number;
  /** credits for 1st to 4th */
  prizes: [number, number, number, number];
  fieldParts: Parts;
  /**
   * How much of their own skill the rivals drive at, 1 when absent. The
   * early folk races are won by a new player in a stock car: the rivals'
   * cars are no better than his and their drivers start poor and improve
   * race by race; the parts and the real pace arrive with the classes.
   */
  fieldSkill?: number;
}

const stock: Parts = { ...STOCK };
/** the JM field: stock cars until the final, where a ram bar and an engine show up (2026-10-04:
 *  the field used to gain a part a race, and a new player in a stock Tauno met cars 2 s a lap
 *  faster than his by the fourth race and asked why the rivals had better cars) */
const jmFinal: Parts = { ...STOCK, ram: 1, engine: 1 };
const some: Parts = { ...STOCK, tyres: 1, weight: 1, ram: 1, gun: 1 };
const built: Parts = { ...STOCK, tyres: 2, weight: 2, engine: 2, brakes: 1, armour: 1, ram: 2, gun: 2 };

/** the lower places from the win: about 55%, 28% and 13%, rounded to tens */
const purse = (win: number): [number, number, number, number] => [win, Math.round((win * 0.55) / 10) * 10, Math.round((win * 0.28) / 10) * 10, Math.round((win * 0.13) / 10) * 10];

export const EVENTS: EventDef[] = [
  { id: 'jm-kiviaho', name: L('Kiviahon jokkis', 'Kiviaho Folk Race'), cls: 'JM', trackId: 'kiviaho', laps: 3, prizes: purse(300), fieldParts: stock, fieldSkill: 0.7 },
  { id: 'jm-hirvisuo', name: L('Hirvisuon jokkis', 'Hirvisuo Folk Race'), cls: 'JM', trackId: 'hirvisuo', laps: 3, prizes: purse(450), fieldParts: stock, fieldSkill: 0.8 },
  { id: 'jm-kiviaho-4', name: L('Kiviahon kahlaus', 'Kiviaho Wade'), cls: 'JM', trackId: 'kiviaho', laps: 4, prizes: purse(600), fieldParts: stock, fieldSkill: 0.9 },
  { id: 'jm-hirvisuo-4', name: L('Hirvisuon pitkä jokkis', 'Hirvisuo Long Folk Race'), cls: 'JM', trackId: 'hirvisuo', laps: 4, prizes: purse(800), fieldParts: stock, fieldSkill: 1 },
  { id: 'jm-final', name: L('Jokkisfinaali', 'Folk Race Final'), cls: 'JM', trackId: 'kiviaho', laps: 6, prizes: purse(1200), fieldParts: jmFinal, fieldSkill: 1.1 },
  { id: 'c-kiviaho', name: L('Kiviahon sprintti', 'Kiviaho Sprint'), cls: 'C', trackId: 'kiviaho', laps: 3, prizes: purse(1200), fieldParts: stock, fieldSkill: 0.9 },
  { id: 'c-hirvisuo', name: L('Hirvisuon ajot', 'Hirvisuo Trophy'), cls: 'C', trackId: 'hirvisuo', laps: 3, prizes: purse(2200), fieldParts: stock },
  { id: 'c-kiviaho-5', name: L('Kiviahon kuntoajo', 'Kiviaho Endurance'), cls: 'C', trackId: 'kiviaho', laps: 5, prizes: purse(3400), fieldParts: some },
  { id: 'b-kiviaho', name: L('Kiviahon B-sprintti', 'Kiviaho B Sprint'), cls: 'B', trackId: 'kiviaho', laps: 3, prizes: purse(4000), fieldParts: stock },
  { id: 'b-hirvisuo', name: L('Hirvisuon B-ajot', 'Hirvisuo B Trophy'), cls: 'B', trackId: 'hirvisuo', laps: 4, prizes: purse(7000), fieldParts: some },
  { id: 'b-hirvisuo-6', name: L('Hirvisuon pitkä', 'Hirvisuo Long'), cls: 'B', trackId: 'hirvisuo', laps: 6, prizes: purse(11000), fieldParts: built },
  { id: 'a-kiviaho', name: L('Kiviahon A-sprintti', 'Kiviaho A Sprint'), cls: 'A', trackId: 'kiviaho', laps: 4, prizes: purse(14000), fieldParts: stock },
  { id: 'a-hirvisuo', name: L('Hirvisuon mestaruus', 'Hirvisuo Championship'), cls: 'A', trackId: 'hirvisuo', laps: 6, prizes: purse(24000), fieldParts: built },
];

/** What the field takes into an event: what its class carries, more as the cars get built. */
export function fieldAmmo(e: EventDef): { oil: number; mines: number; missiles: number } {
  const built = Object.values(e.fieldParts).reduce((a, b) => a + b, 0);
  return carried(e.cls, { oil: 2 + Math.round(built / 4), mines: 1 + Math.round(built / 4), missiles: 1 + Math.round(built / 3) });
}

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
