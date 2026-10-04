import { L } from '../../i18n';
import type { Car, Driver, SimState } from '../state';

/** A rival before the race: the skill comes with the vehicle they drive in that class (rivals.ts). */
export type Rival = Omit<Driver, 'skill' | 'id'> & { id: string };

/**
 * The field. Three to race against; how hard the bot drives each one is
 * the vehicle's `skill` in rivals.ts, per class. Aggression is how fast a
 * grudge builds and how hard the bot leans, blocks and punts: Jorma is
 * cold and fast and mostly just drives, Marko is the brawler who
 * remembers every knock, Tapsa is timid. The player is red; these
 * colours stay clear of it, and each rival's vehicles (rivals.ts) are
 * painted in their driver's hue.
 */
export const OPPONENTS: Rival[] = [
  { id: 'jorma', name: L('Jorma'), aggression: 0.6, colour: '#2f6fd6' },
  { id: 'marko', name: L('Marko'), aggression: 1.5, colour: '#e0b030' },
  { id: 'tapsa', name: L('Tapsa'), aggression: 0.4, colour: '#f2f2ea' },
];

/**
 * Grudges, Burnout's hostility arrow. A car that is rammed, shot, blown
 * up or wrecked by another holds it against that car: these are what
 * each costs, times the victim's aggression, up to `max`, decaying by
 * `decay` a second so a full grudge outlasts a lap or two. A bullet is
 * small because a burst is dozens of them. The race leader counts as
 * `leader` of grudge to everyone behind it, so whoever leads draws the
 * fire. The bot reads it, times its own aggression:
 * - `lean`: how much harder it leans on that car alongside;
 * - `punt`: past this it shoves the car ahead instead of passing it;
 * - `block`: how far onto the line of a car within `blockReach` metres
 *   behind it moves; a bot ahead of the player blocks at `blockAhead`
 *   without a grudge, so the player has to fight through;
 * - `wait`: with a grudge against the player up to `waitRange` metres
 *   behind, it lifts by this per point of grudge, at most `waitMax`;
 * - `aim` (in the sim): how much nearer that car looks to the guns.
 * Read off tools/sim-check.ts: rams, wrecks and the view.
 */
export const GRUDGE = {
  ram: 0.7,
  spin: 1,
  bullet: 0.03,
  blast: 1,
  wreck: 2,
  max: 3,
  decay: 0.04,
  leader: 0.5,
  lean: 0.5,
  punt: 1,
  block: 0.6,
  blockReach: 12,
  blockAhead: 0.5,
  wait: 0.15,
  waitMax: 0.3,
  waitRange: 60,
  aim: 0.6,
};

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
 * orders the bots among themselves. Both are times catchUp(), the
 * driver's skill squared: a JM rival barely rubber-bands, an A rival
 * gets the whole push.
 */
export const PACING = {
  pushRange: 20,
  easeRange: 15,
  engine: { push: 0.2, ease: 0.2 },
  corner: { push: 0.4, ease: 0.25 },
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
  return 1 + pace * catchUp(c) * (pace > 0 ? PACING.engine.push : PACING.engine.ease);
}

/**
 * How much of PACING a driver gets: skill squared, so a JM rival (0.3 to 0.4) barely
 * rubber-bands, a C rival gets about a third and an A rival all of it. Linear in skill
 * handed a C rival back the player's pace whenever it fell behind (sim-check, 2026-10-04).
 */
export function catchUp(c: Car): number {
  return c.driver.skill * c.driver.skill;
}

/** Index of the car leading the race on the road, or -1 once someone has the flag. */
export function leaderOf(s: SimState): number {
  let lead = -1;
  for (let k = 0; k < s.cars.length; k++) {
    const o = s.cars[k];
    if (o.finishedAt >= 0) return -1;
    if (lead < 0 || o.progress > s.cars[lead].progress) lead = k;
  }
  return lead;
}

/**
 * How much car `c` wants a go at car `k`: its grudge, plus the leader's
 * share if `k` leads and `c` does not. 0 for itself.
 */
export function hostility(s: SimState, c: Car, k: number, leader: number = leaderOf(s)): number {
  if (s.cars[k] === c) return 0;
  return c.grudge[k] + (k === leader ? GRUDGE.leader : 0);
}
