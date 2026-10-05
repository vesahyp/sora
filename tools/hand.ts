import type { Car, SimState } from '../src/game/state';
import type { CarInput } from '../src/game/types';
import { steerToThumb, thumbToSteer } from '../src/input/input';

/**
 * The hand: a thumb on a phone, headless. The same driver as the one `make playthrough` puts on
 * the emulated phone (scripts/playthrough.mjs, `drive`), kept in step with it by hand: it looks
 * down the road about a second ahead and pushes the thumb in proportion to how wrong the heading
 * looks, a reaction late (REACT), the thumb moving at a thumb's speed in px through input.ts's
 * own response curve, a little tremor, the pedal when a bend looks too fast and now and then too
 * late, and it does not know the tyres' limit. The bot (autoplayer.ts) asks the car for yaw and
 * knows the limit, so it laps seconds quicker than any thumb; this is the thumb the folk class
 * has to be fun for, and the one `make balance` and `sim-check` read the folk laps off.
 *
 * `skill` 0..1 is the hand's: how late it judges a bend and how much margin it leaves.
 */
export const HAND = { REACT: 0.12, THUMB_SPEED: 1200, JITTER: 2.5, LOCK: 110 };


export class Hand {
  private queue: { at: number; steer: number; brake: boolean; nitro: boolean }[] = [];
  /** the thumb's px off where it landed */
  thumb = 0;
  pedal = false;
  private jitter = 0;
  private lateBend = -1;
  private lateJudged = false;
  private seed: number;
  private noticed = new WeakMap<object, boolean>();
  /** what the hand asked for last, for the trace */
  last: CarInput = { steer: 0, throttle: 1, brake: 0, boost: false };

  constructor(readonly skill: number, seed = 1234) {
    this.seed = seed + Math.round(skill * 1000);
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** One frame, dt seconds: what the hand sees now goes on the queue, what it saw REACT ago moves the thumb. */
  input(s: SimState, c: Car, dt: number): CarInput {
    const t = s.track;
    const now = s.time;
    const speed = Math.max(0, c.speed);
    const look = 8 + 0.6 * speed;
    const turnAhead = t.curvatureAhead(c.s, look + 18);
    let inside = Math.max(-1, Math.min(1, turnAhead * 1.5)) * t.width * 0.15;
    for (const o of s.oils) {
      const at = t.locate(o.x, o.y);
      let gap = at.s - c.s;
      if (gap < -t.length / 2) gap += t.length;
      if (gap > t.length / 2) gap -= t.length;
      if (gap < 3 || gap > look + 14) continue;
      if (!this.noticed.has(o)) this.noticed.set(o, this.rand() < 0.35 + 0.6 * this.skill);
      if (!this.noticed.get(o)) continue;
      const clear = 1.5 + c.def.width / 2 + 0.4;
      if (Math.abs(at.d - inside) > clear) continue;
      const room = t.width / 2 - 0.9;
      const left = at.d - clear;
      const right = at.d + clear;
      inside = Math.max(-room, Math.min(room, left < -room ? right : right > room ? left : Math.abs(left - inside) < Math.abs(right - inside) ? left : right));
    }
    // a car just ahead on this line: go round it, on the side with road, the way a thumb does the
    // moment it sees a bumper (a thumb that only drove the line sat behind a slow field for a race)
    for (const o of s.cars) {
      if (o === c || o.wreck > 0) continue;
      let gap = o.s - c.s;
      if (gap < -t.length / 2) gap += t.length;
      if (gap > t.length / 2) gap -= t.length;
      if (gap <= 0 || gap > 10 + speed * 0.3 || Math.abs(o.d - inside) > 2.4) continue;
      const room = t.width / 2 - 0.9;
      const left = o.d - 2.4;
      const right = o.d + 2.4;
      inside = Math.max(-room, Math.min(room, left < -room ? right : right > room ? left : Math.abs(left - c.d) < Math.abs(right - c.d) ? left : right));
    }
    const p = t.at(c.s + look);
    let err = Math.atan2(p.y + p.tx * inside - c.y, p.x - p.ty * inside - c.x) - c.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, err * 2.2));
    const stop = Math.min(c.def.brake, c.def.grip) * 0.6;
    const brakeDist = 6 + (speed * speed) / (2 * stop);
    let sharpest = 0;
    let at = 0;
    for (let a = 4; a <= brakeDist + 24; a += 4) {
      const k = Math.abs(t.curvatureAhead(c.s + a, 12));
      if (k > sharpest) {
        sharpest = k;
        at = a;
      }
    }
    const radius = sharpest < 0.04 ? Infinity : 12 / sharpest;
    const bend = Math.floor((c.s + at) / 40);
    if (bend !== this.lateBend) {
      this.lateBend = bend;
      this.lateJudged = this.rand() < 0.5 * (1 - this.skill);
    }
    const margin = (0.6 + 0.55 * this.skill) * (this.lateJudged ? 1.25 : 1);
    const allowed = radius === Infinity ? Infinity : Math.sqrt(c.def.grip * margin * radius) * (c.onRoad ? 1 : 0.75);
    let brake = speed > allowed * 1.04 || (this.pedal && speed > allowed * 0.97);
    if (Math.abs(c.slipAngle) > 0.35 && speed > 6) brake = false;
    // a river ahead: the thumb sees the bank and keeps the throttle on over it, whatever bend
    // follows, from the foot of the bank to the far side. A hand that braked for the bend after the
    // river dropped into the water every lap (2026-10-05)
    for (const r of t.def.rivers ?? []) {
      let to = r.s - c.s;
      if (to < -t.length / 2) to += t.length;
      if (to > t.length / 2) to -= t.length;
      if (to > -(r.gap + 10) && to < 24) brake = false;
    }
    const straight = Math.abs(t.curvatureAhead(c.s, 60)) < 0.25;
    const nitro = s.hold <= 0 && straight && c.boost > 0.5 && c.boosting <= 0 && speed > 10 && !brake && this.rand() < 0.02;
    this.queue.push({ at: now + HAND.REACT, steer, brake, nitro });
    this.jitter = Math.max(-HAND.JITTER, Math.min(HAND.JITTER, this.jitter + (this.rand() - 0.5) * 0.8));
    let d: { steer: number; brake: boolean; nitro: boolean } | null = null;
    while (this.queue.length && this.queue[0].at <= now) d = this.queue.shift()!;
    if (d) {
      const wantX = steerToThumb(d.steer, HAND.LOCK) + this.jitter;
      const step = HAND.THUMB_SPEED * dt;
      this.thumb = Math.max(this.thumb - step, Math.min(this.thumb + step, wantX));
      this.pedal = d.brake;
    }
    const boost = d?.nitro ?? false;
    this.last = { steer: thumbToSteer(this.thumb, HAND.LOCK), throttle: this.pedal ? 0 : 1, brake: this.pedal ? 1 : 0, boost };
    return this.last;
  }
}
