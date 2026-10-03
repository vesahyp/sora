import type { Car, SimState } from '../src/game/state';
import type { CarInput } from '../src/game/types';

/**
 * The bot driver. It aims at a point on the centreline a little ahead,
 * further the faster it goes, and brakes when the road ahead turns more
 * than its speed allows. It is a floor: a human who looks through the
 * corner and uses the whole road beats it. It is also the opponent AI:
 * a driver's `skill` scales how fast it takes a corner and how hard it
 * pushes on the straights, and it steers round a car in front.
 */
export interface BotTuning {
  /** metres of lookahead at rest */
  look: number;
  /** extra metres of lookahead per m/s */
  lookPerSpeed: number;
  /** steer per radian of heading error */
  gain: number;
  /** corner speed: m/s allowed per (1 / rad of turn over 30 m) */
  cornerSpeed: number;
}

export const DEFAULT_BOT: BotTuning = { look: 4, lookPerSpeed: 0.35, gain: 3.2, cornerSpeed: 20 };

export function botInput(s: SimState, c: Car = s.cars[0], tune: BotTuning = DEFAULT_BOT): CarInput {
  const t = s.track;
  const skill = c.driver.skill;
  const speed = Math.max(0, c.speed);
  const look = tune.look + tune.lookPerSpeed * speed;
  const target = t.at(c.s + look);
  // aim a little inside the corner: offset the target against the turn
  const turn = t.curvatureAhead(c.s, look + 20);
  let inside = Math.max(-1, Math.min(1, turn * 1.5)) * (t.width * 0.3);
  // a car just ahead and on this line: move over to pass it
  for (const o of s.cars) {
    if (o === c) continue;
    let gap = o.s - c.s;
    if (gap < -t.length / 2) gap += t.length;
    if (gap > t.length / 2) gap -= t.length;
    if (gap > 0 && gap < 14 && Math.abs(o.d - c.d) < 2.6) inside += (o.d >= c.d ? -1 : 1) * t.width * 0.3;
  }
  const tx = target.x + -target.ty * inside;
  const ty = target.y + target.tx * inside;
  const want = Math.atan2(ty - c.y, tx - c.x);
  let err = want - c.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, err * tune.gain));

  // how sharp is the road coming: the worst turn over the braking distance
  const brakeDist = 10 + (speed * speed) / (2 * c.def.brake);
  let sharpest = 0;
  for (let a = 5; a <= brakeDist + 30; a += 5) {
    const k = Math.abs(t.curvatureAhead(c.s + a, 30));
    if (k > sharpest) sharpest = k;
  }
  // grippier tyres carry more speed through a bend: the Kortteli's stock grip is the baseline
  const cornerSpeed = tune.cornerSpeed * (0.6 + 0.4 * skill) * Math.sqrt(c.def.grip / 4.5);
  const allowed = Math.min(sharpest < 0.05 ? Infinity : cornerSpeed / sharpest, c.def.topSpeed * (0.7 + 0.3 * skill));
  const brake = speed > allowed + 2 ? 1 : 0;
  const throttle = brake ? 0 : speed > allowed ? 0.3 : 1;
  return { steer, throttle, brake };
}
