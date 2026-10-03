import { CARS, CAR_BY_ID } from '../game/content/cars';
import { STOCK, tuned, type Parts } from '../game/content/parts';
import type { CarClass, CarDef } from '../game/types';

/**
 * The career: credits, the cars owned with their parts, which one is
 * out of the garage, and the licences. One object in localStorage. A
 * new career owns the Kortteli with a little money for tyres.
 */
export interface OwnedCar {
  carId: string;
  parts: Parts;
}

export interface Save {
  v: 1;
  credits: number;
  cars: OwnedCar[];
  /** index into cars */
  current: number;
  licences: CarClass[];
  races: number;
  wins: number;
  /** the best place per event id */
  results: Record<string, number>;
  /** in the boot, carried from race to race */
  missiles: number;
  oil: number;
}

const KEY = 'sora.career';

export function newSave(): Save {
  return { v: 1, credits: 600, cars: [{ carId: CARS[0].id, parts: { ...STOCK } }], current: 0, licences: [], races: 0, wins: 0, results: {}, missiles: 4, oil: 3 };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      // saves from before the armoury get the starter ammo
      if (s.v === 1 && s.cars.length) return { ...s, missiles: s.missiles ?? 4, oil: s.oil ?? 3 };
    }
  } catch {
    /* no storage */
  }
  return newSave();
}

export function store(s: Save): Save {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* fine */
  }
  return { ...s };
}

export function currentCar(s: Save): OwnedCar {
  return s.cars[s.current];
}

/** The car the player drives, parts fitted. */
export function playerCar(s: Save): CarDef {
  const o = currentCar(s);
  return tuned(CAR_BY_ID[o.carId], o.parts);
}

export function hasLicence(s: Save, cls: CarClass): boolean {
  return cls === 'C' || s.licences.includes(cls);
}

export const CLASS_RANK: Record<CarClass, number> = { C: 0, B: 1, A: 2 };

/** Can this car enter this class: its own class or below. */
export function carFits(car: CarDef, cls: CarClass): boolean {
  return CLASS_RANK[car.cls] <= CLASS_RANK[cls];
}

/** Credits with a thin space, the way a Finnish price reads. */
export function cr(n: number): string {
  return `${Math.round(n).toLocaleString('fi-FI')} cr`;
}
