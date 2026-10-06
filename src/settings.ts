/**
 * The player's switches that are not the language or the sound: one so far, the physics
 * readout, which shows what the car is doing while it is driven (speed, yaw rate, steer
 * angle, each tyre's slip). For talking about the handling in numbers. Kept in localStorage.
 */
const KEY = 'sora.physics-readout';

export function physicsReadout(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPhysicsReadout(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // private mode: the switch lasts as long as the page
  }
}
