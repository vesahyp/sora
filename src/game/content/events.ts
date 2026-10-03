import { L, type Text } from '../../i18n';
import type { CarClass } from '../types';
import type { Parts } from './parts';

/**
 * The calendar. An event is a track, a lap count, a class, and the
 * money. The field drives the class's car; `fieldParts` is how built
 * those cars are, so the second event of a class is harder than the
 * first. A class above C needs its licence.
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
}

const stock: Parts = { tyres: 0, weight: 0, engine: 0, brakes: 0 };
const some: Parts = { tyres: 1, weight: 1, engine: 0, brakes: 0 };
const built: Parts = { tyres: 2, weight: 2, engine: 2, brakes: 1 };

export const EVENTS: EventDef[] = [
  { id: 'c-kiviaho', name: L('Kiviahon sprintti', 'Kiviaho Sprint'), cls: 'C', trackId: 'kiviaho', laps: 3, prizes: [400, 220, 120, 60], fieldParts: stock },
  { id: 'c-hirvisuo', name: L('Hirvisuon ajot', 'Hirvisuo Trophy'), cls: 'C', trackId: 'hirvisuo', laps: 3, prizes: [700, 380, 200, 100], fieldParts: some },
  { id: 'c-kiviaho-5', name: L('Kiviahon kuntoajo', 'Kiviaho Endurance'), cls: 'C', trackId: 'kiviaho', laps: 5, prizes: [1000, 550, 300, 150], fieldParts: built },
  { id: 'b-kiviaho', name: L('Kiviahon B-sprintti', 'Kiviaho B Sprint'), cls: 'B', trackId: 'kiviaho', laps: 3, prizes: [1500, 800, 450, 200], fieldParts: stock },
  { id: 'b-hirvisuo', name: L('Hirvisuon B-ajot', 'Hirvisuo B Trophy'), cls: 'B', trackId: 'hirvisuo', laps: 4, prizes: [2600, 1400, 750, 350], fieldParts: some },
  { id: 'b-hirvisuo-6', name: L('Hirvisuon pitkä', 'Hirvisuo Long'), cls: 'B', trackId: 'hirvisuo', laps: 6, prizes: [4200, 2300, 1200, 600], fieldParts: built },
  { id: 'a-kiviaho', name: L('Kiviahon A-sprintti', 'Kiviaho A Sprint'), cls: 'A', trackId: 'kiviaho', laps: 4, prizes: [5000, 2700, 1500, 700], fieldParts: stock },
  { id: 'a-hirvisuo', name: L('Hirvisuon mestaruus', 'Hirvisuo Championship'), cls: 'A', trackId: 'hirvisuo', laps: 6, prizes: [9000, 4800, 2600, 1200], fieldParts: built },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
