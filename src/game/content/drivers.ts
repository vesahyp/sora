import { L } from '../../i18n';
import type { Car, Driver, SimState } from '../state';

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

/**
 * Pacing to the player, Death Rally's trick (Burnout does it too): the
 * opponents' cars run faster behind you and slower ahead of you, by the
 * gap, so the field stays within a screen of you and the race is a
 * fight, not a procession. The gap is measured along the track; it counts
 * in full at `pushRange` metres behind you and `easeRange` metres ahead,
 * about a screen either way. `engine` scales an opponent's top speed and
 * pull in the sim (the player's car never changes); `corner` scales how
 * hard the bot takes a bend. Read off sim-check and three drivers: a bot
 * player that drives worse than the field (margin 0.55) finishes behind
 * it, one that drives better (0.85) wins most Kiviaho races. Skill still
 * orders the bots among themselves.
 */
export const PACING = {
  pushRange: 20,
  easeRange: 15,
  engine: { push: 0.15, ease: 0.2 },
  corner: { push: 0.25, ease: 0.25 },
};

/**
 * How far behind the player this car is, -1..1: positive when the player
 * is ahead (push), negative when the car leads the player (ease off).
 * Zero for the player's own car and once either has finished.
 */
export function paceToPlayer(s: SimState, c: Car): number {
  const me = s.cars[0];
  if (c === me || me.finishedAt >= 0 || c.finishedAt >= 0) return 0;
  const gap = me.progress - c.progress;
  return Math.max(-1, Math.min(1, gap / (gap > 0 ? PACING.pushRange : PACING.easeRange)));
}

/** The factor on a car's top speed and pull from its gap to the player: 1 for the player. */
export function enginePace(s: SimState, c: Car): number {
  const pace = paceToPlayer(s, c);
  return 1 + pace * (pace > 0 ? PACING.engine.push : PACING.engine.ease);
}
