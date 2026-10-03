import { L, type Text } from '../../i18n';
import type { CarClass } from '../types';

/**
 * Licence tests: one timed lap, alone, in your own car, under a target.
 * The target is read off the `make balance` table: a shade under the
 * bot's first lap in the stock car of the class below, so a clean human
 * lap passes it, and a few parts make it comfortable.
 */
export interface LicenceDef {
  cls: CarClass;
  name: Text;
  trackId: string;
  /** seconds for one lap from the grid */
  target: number;
  desc: Text;
}

export const LICENCES: LicenceDef[] = [
  { cls: 'B', name: L('B-ajokortti', 'B licence'), trackId: 'kiviaho', target: 33, desc: L('Yksi kierros Kiviahoa alle 33 sekunnin.', 'One lap of Kiviaho under 33 seconds.') },
  { cls: 'A', name: L('A-ajokortti', 'A licence'), trackId: 'hirvisuo', target: 42.5, desc: L('Yksi kierros Hirvisuota alle 42,5 sekunnin.', 'One lap of Hirvisuo under 42.5 seconds.') },
];

export const LICENCE_BY_CLASS: Partial<Record<CarClass, LicenceDef>> = Object.fromEntries(LICENCES.map((l) => [l.cls, l]));
