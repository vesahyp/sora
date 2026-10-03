import { type CarInput } from '../game/types';

/**
 * One thumb and a keyboard.
 *
 * Touch: the throttle is on. A touch anywhere on the play field is the
 * wheel: the car steers by how far the thumb has moved sideways from
 * where it landed, full lock at `lock` css px. Lift and the wheel
 * centres. A touch that starts on the brake pedal is the brake, and so
 * is a second finger anywhere. Held at a standstill, the brake reverses.
 * Elements marked `data-ui` are left to React.
 *
 * Keyboard: left and right (or A and D) steer, down, S or space brakes.
 * Up and W are accepted and do nothing: the throttle is on.
 */
export class InputController {
  readonly lock = 70;
  /** the steering touch, for the on-screen wheel ghost */
  wheel = { active: false, x0: 0, y0: 0, x: 0 };
  private wheelId: number | null = null;
  private brakeIds = new Set<number>();
  /** the pedal's centre and radius, css px; set by the HUD layout */
  pedal = { x: -999, y: -999, r: 0 };
  /** the brake is down, for the pedal's look */
  braking = false;
  private keys = new Set<string>();
  usedTouch = false;
  private el: HTMLElement | null = null;

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') this.keys.add(k);
    else this.keys.delete(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  };

  private onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement | null)?.closest('[data-ui]')) return;
    e.preventDefault();
    this.usedTouch = true;
    for (const t of Array.from(e.changedTouches)) {
      const onPedal = Math.hypot(t.clientX - this.pedal.x, t.clientY - this.pedal.y) < this.pedal.r;
      if (this.wheelId === null && !onPedal) {
        this.wheelId = t.identifier;
        this.wheel = { active: true, x0: t.clientX, y0: t.clientY, x: t.clientX };
      } else this.brakeIds.add(t.identifier);
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
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
      if (t.identifier === this.wheelId) {
        this.wheelId = null;
        this.wheel.active = false;
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

  read(): CarInput {
    let steer = 0;
    let brake = 0;
    if (this.wheel.active) steer = Math.max(-1, Math.min(1, (this.wheel.x - this.wheel.x0) / this.lock));
    if (this.brakeIds.size) brake = 1;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) steer -= 1;
    if (k.has('arrowright') || k.has('d')) steer += 1;
    if (k.has('arrowdown') || k.has('s') || k.has(' ')) brake = 1;
    // the foot comes off the gas while braking
    return { steer: Math.max(-1, Math.min(1, steer)), throttle: brake ? 0 : 1, brake };
  }
}
