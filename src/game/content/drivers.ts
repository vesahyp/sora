import { L } from '../../i18n';
import type { Driver } from '../state';

/**
 * The field. Three to race against; skill is how hard the bot drives
 * that car, 1 being the bot's own ceiling. The player is red; these
 * colours stay clear of it.
 */
export const OPPONENTS: Driver[] = [
  { name: L('Jorma'), skill: 1.0, colour: '#2f6fd6' },
  { name: L('Marko'), skill: 0.92, colour: '#e0b030' },
  { name: L('Tapsa'), skill: 0.84, colour: '#f2f2ea' },
];
