import { type CarInput } from '../game/types';

/**
 * One thumb and a keyboard.
 *
 * Touch: the throttle is on. A touch anywhere on the play field is the
 * wheel: the car steers by how far the thumb has moved sideways from
 * where it landed, full lock at `lock` css px. The response is a curve
 * (`CURVE`), not a line: the first few px are a dead zone and a small
 * move is a small correction, so a thumb can hold the car straight; the
 * lock is still there at the end of the swing. Lift and the wheel
 * centres. A tap (lifted quickly, without a slide) lights the nitro. A
 * touch that starts on the pedal is the pedal, and so is a second
 * finger anywhere: it brakes and loosens the rear, and held at a
 * standstill it reverses. The guns fire themselves. Elements marked
 * `data-ui` are left to React.
 *
 * With the gas lever (LEVER, the default) the left thumb is the gas and
 * the brake, and the car coasts without it; with the gas always on, the
 * pedal brakes. Keyboard: left and right (or A and D) steer, down, S or
 * space is the brake, up or W the gas with the lever (else the nitro),
 * X the nitro.
 */
/** px of thumb travel that do nothing, so a resting thumb does not wander the car */
const DEAD = 4;
/**
 * the response curve's power: 1 is linear, higher makes the centre finer and the ends steeper.
 * 1.7 until 2026-10-05: the first third of the swing gave a tenth of the steer, and with the car
 * answering a thumb honestly since the caster fix (physics.ts) that read as a car that would not
 * turn in; at 1.3 a third of the swing is a fifth of the steer and half the swing is 0.4
 */
export const CURVE = 1.3;

/** thumb travel in css px to a steer of -1..1 */
export function thumbToSteer(dx: number, lock: number): number {
  const a = Math.min(1, Math.max(0, (Math.abs(dx) - DEAD) / (lock - DEAD)));
  return Math.sign(dx) * Math.pow(a, CURVE);
}

/** the inverse: the px of thumb travel that give a steer of -1..1, for the scripted hands (tools/hand.ts, scripts/playthrough.mjs) */
export function steerToThumb(steer: number, lock: number): number {
  const a = Math.pow(Math.min(1, Math.abs(steer)), 1 / CURVE);
  return Math.sign(steer) * (DEAD + a * (lock - DEAD));
}

/**
 * The gas lever (settings: Gas, the left thumb, the default since 2026-10-06): a tall pedal at the
 * bottom left read like a console's trigger. Where the left thumb is on it sets the amount: the top
 * GAS_FULL of its height is full gas, gas fades out down to GAS_FROM, the band below that coasts,
 * and the bottom BRAKE_TO is the brake, harder the lower (held at a standstill it reverses). No thumb
 * on it and the car coasts. Shares of the lever's height from the bottom
 */
export const LEVER = { BRAKE_TO: 0.3, GAS_FROM: 0.4, GAS_FULL: 0.85 };

/** throttle and brake, 0..1, for a thumb at `t` of the lever's height from its bottom */
export function leverToInput(t: number): { throttle: number; brake: number } {
  const throttle = Math.max(0, Math.min(1, (t - LEVER.GAS_FROM) / (LEVER.GAS_FULL - LEVER.GAS_FROM)));
  const brake = Math.max(0, Math.min(1, (LEVER.BRAKE_TO - t) / LEVER.BRAKE_TO));
  return { throttle, brake };
}

export class InputController {
  readonly lock = 110;
  /** 'lever': the left thumb's gas lever; 'auto': the gas is always on and the pedal only brakes */
  gasMode: 'lever' | 'auto' = 'auto';
  /** the lever's box, css px, set by the HUD layout; and the thumb on it */
  lever = { x: -999, y: -999, w: 0, h: 0 };
  private leverId: number | null = null;
  private leverY = 0;
  /** what the lever gives now, for its look */
  leverOut = { throttle: 0, brake: 0, active: false };
  /** the steering touch, for the on-screen wheel ghost */
  wheel = { active: false, x0: 0, y0: 0, x: 0 };
  private wheelId: number | null = null;
  private wheelAt = 0;
  private brakeIds = new Set<number>();
  /** the pedal's centre and radius, css px; set by the HUD layout */
  pedal = { x: -999, y: -999, r: 0 };
  /** the pedal is down, for its look */
  braking = false;
  private boostEdge = false;
  private keys = new Set<string>();
  usedTouch = false;
  private el: HTMLElement | null = null;

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (!this.keys.has(k) && (k === 'x' || (this.gasMode === 'auto' && (k === 'arrowup' || k === 'w')))) this.boostEdge = true;
      this.keys.add(k);
    } else this.keys.delete(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  };

  private onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement | null)?.closest('[data-ui]')) return;
    e.preventDefault();
    this.usedTouch = true;
    for (const t of Array.from(e.changedTouches)) {
      if (this.gasMode === 'lever' && this.leverId === null && this.onLever(t.clientX, t.clientY)) {
        this.leverId = t.identifier;
        this.leverY = t.clientY;
        continue;
      }
      const onPedal = this.gasMode === 'auto' && Math.hypot(t.clientX - this.pedal.x, t.clientY - this.pedal.y) < this.pedal.r;
      if (this.wheelId === null && !onPedal) {
        this.wheelId = t.identifier;
        this.wheel = { active: true, x0: t.clientX, y0: t.clientY, x: t.clientX };
        this.wheelAt = performance.now();
      } else this.brakeIds.add(t.identifier);
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    // a finger on React's chrome (the tuning panel's scroll and sliders) is left to the browser;
    // cancelling it here kept the panel from scrolling at all (Vesa, 2026-10-06)
    if ((e.target as HTMLElement | null)?.closest('[data-ui]')) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.leverId) this.leverY = t.clientY;
      if (t.identifier === this.wheelId) {
        this.wheel.x = t.clientX;
        // let the thumb walk: if it is past full lock, the centre follows
        const d = this.wheel.x - this.wheel.x0;
        if (d > this.lock) this.wheel.x0 = this.wheel.x - this.lock;
        if (d < -this.lock) this.wheel.x0 = this.wheel.x + this.lock;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.leverId) this.leverId = null;
      if (t.identifier === this.wheelId) {
        this.wheelId = null;
        this.wheel.active = false;
        // a tap: down and up within 180 ms without a slide
        if (performance.now() - this.wheelAt < 180 && Math.abs(this.wheel.x - this.wheel.x0) < 10) this.boostEdge = true;
      }
      this.brakeIds.delete(t.identifier);
    }
  };

  attach(el: HTMLElement): void {
    this.el = el;
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);
    el.addEventListener('touchcancel', this.onTouchEnd);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  detach(): void {
    const el = this.el;
    if (el) {
      el.removeEventListener('touchstart', this.onTouchStart);
      el.removeEventListener('touchmove', this.onTouchMove);
      el.removeEventListener('touchend', this.onTouchEnd);
      el.removeEventListener('touchcancel', this.onTouchEnd);
    }
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }

  /** px of thumb travel for a steer, on this controller's lock: the scripted hand's way in */
  travel(steer: number): number {
    return steerToThumb(steer, this.lock);
  }

  /** on the lever, or a thumb's width beside it */
  private onLever(x: number, y: number): boolean {
    const l = this.lever;
    return x >= l.x - 16 && x <= l.x + l.w + 24 && y >= l.y - 16 && y <= l.y + l.h + 16;
  }

  read(): CarInput {
    let steer = 0;
    let brake = 0;
    let throttle = this.gasMode === 'auto' ? 1 : 0;
    if (this.wheel.active) steer = thumbToSteer(this.wheel.x - this.wheel.x0, this.lock);
    if (this.brakeIds.size) brake = 1;
    if (this.gasMode === 'lever' && this.leverId !== null && this.lever.h > 0) {
      const t = (this.lever.y + this.lever.h - this.leverY) / this.lever.h;
      const o = leverToInput(t);
      throttle = o.throttle;
      brake = Math.max(brake, o.brake);
    }
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) steer -= 1;
    if (k.has('arrowright') || k.has('d')) steer += 1;
    if (k.has('arrowdown') || k.has('s') || k.has(' ')) brake = 1;
    // on the keyboard the lever is up or W; the nitro stays on X
    if (this.gasMode === 'lever' && (k.has('arrowup') || k.has('w'))) throttle = 1;
    this.braking = brake > 0;
    this.leverOut = { throttle: brake ? 0 : throttle, brake, active: this.leverId !== null };
    const boost = this.boostEdge;
    this.boostEdge = false;
    // the foot comes off the gas while braking
    return { steer: Math.max(-1, Math.min(1, steer)), throttle: brake ? 0 : throttle, brake, boost };
  }
}
