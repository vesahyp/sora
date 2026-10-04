import { CARS, CAR_BY_ID } from '../game/content/cars';
import { STOCK, tuned, type Parts } from '../game/content/parts';
import { CLASS_RANK, type CarClass, type CarDef } from '../game/types';
export { CLASS_RANK };

/**
 * The career: credits, the cars owned with their parts, which one is
 * out of the garage, and the licences. One object in localStorage. A
 * new career owns the Tauno, three cans of oil and the price of a ram
 * bar (docs/progression.md). A v1 save, from before the JM class, starts
 * over: ADR 0004.
 */
export interface OwnedCar {
  carId: string;
  parts: Parts;
}

export interface Save {
  v: 2;
  credits: number;
  cars: OwnedCar[];
  /** index into cars */
  current: number;
  licences: CarClass[];
  races: number;
  wins: number;
  /** cars wrecked over the career */
  wrecks?: number;
  /** the best place per event id */
  results: Record<string, number>;
  /** in the boot, carried from race to race; a car takes what its class can carry */
  missiles: number;
  mines: number;
  oil: number;
}

const KEY = 'sora.career';

export const START_CREDITS = 150;
export const START_OIL = 3;

export function newSave(): Save {
  return { v: 2, credits: START_CREDITS, cars: [{ carId: CARS[0].id, parts: { ...STOCK } }], current: 0, licences: [], races: 0, wins: 0, results: {}, missiles: 0, mines: 0, oil: START_OIL };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      // a save from before a new part gets it stock
      if (s.v === 2 && s.cars.length) {
        const cars = s.cars.map((o) => ({ ...o, parts: { ...STOCK, ...o.parts } }));
        return { ...s, cars };
      }
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
  return cls === 'JM' || cls === 'C' || s.licences.includes(cls);
}

/** The highest class among the cars owned: what the armoury sells for. */
export function topClass(s: Save): CarClass {
  return s.cars.map((o) => CAR_BY_ID[o.carId].cls).reduce((a, b) => (CLASS_RANK[b] > CLASS_RANK[a] ? b : a), 'JM' as CarClass);
}

/** Can this car enter this class: its own class or below. */
export function carFits(car: CarDef, cls: CarClass): boolean {
  return CLASS_RANK[car.cls] <= CLASS_RANK[cls];
}

/** Credits with a thin space, the way a Finnish price reads. */
export function cr(n: number): string {
  return `${Math.round(n).toLocaleString('fi-FI')} cr`;
}
