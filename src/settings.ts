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

const TUNING_KEY = 'sora.tuning-mode';
const TUNED_KEY = 'sora.tuning';

/** The tuning mode (title screen): a TUNE button in the race that opens every physics number of the player's car. */
export function tuningMode(): boolean {
  try {
    return localStorage.getItem(TUNING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTuningMode(on: boolean): void {
  try {
    localStorage.setItem(TUNING_KEY, on ? '1' : '0');
  } catch {
    // private mode: the switch lasts as long as the page
  }
}

/** What the tuning panel has changed: rig numbers per car id (SI units, only the changed ones) and the game pace. */
export interface Tuned {
  pace?: number;
  cars: Record<string, Record<string, number>>;
}

export function loadTuned(): Tuned {
  try {
    const t = JSON.parse(localStorage.getItem(TUNED_KEY) ?? '') as Tuned;
    if (t && typeof t === 'object' && t.cars) return t;
  } catch {
    // nothing saved, or unreadable
  }
  return { cars: {} };
}

export function saveTuned(t: Tuned): void {
  try {
    localStorage.setItem(TUNED_KEY, JSON.stringify(t));
  } catch {
    // private mode
  }
}
