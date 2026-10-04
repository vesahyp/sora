import { L, type Text } from '../../i18n';
import type { CarDef, Livery } from '../types';

/**
 * The paint shop. A colour from a palette of worn nineties Finnish car
 * colours and a livery kind, both bought once per car and then free to
 * switch back to. The player's red and the car's own livery are the
 * stock ones, free. Each colour brings the second tone it wears best,
 * so a stripe on a white car is not white on white. Prices are a share
 * of the car's price, like the parts.
 */
export interface PaintDef {
  id: string;
  name: Text;
  colour: string;
  /** the livery's tone on this colour; null keeps the car's own */
  accent: string | null;
}

export const PAINTS: PaintDef[] = [
  { id: 'red', name: L('Punainen', 'Red'), colour: '#c8352a', accent: null },
  { id: 'white', name: L('Polaarinvalkoinen', 'Polar white'), colour: '#d6cfbd', accent: '#24406e' },
  { id: 'black', name: L('Musta', 'Black'), colour: '#221f1c', accent: '#d4ab3c' },
  { id: 'green', name: L('Metsänvihreä', 'Forest green'), colour: '#2f5638', accent: '#e2d8be' },
  { id: 'blue', name: L('Taivaansininen', 'Sky blue'), colour: '#4c7aa3', accent: '#ece4cf' },
  { id: 'mustard', name: L('Sinappi', 'Mustard'), colour: '#bf8e2e', accent: '#231e18' },
  { id: 'wine', name: L('Viininpunainen', 'Burgundy'), colour: '#6a2130', accent: '#d8c6a0' },
  { id: 'beige', name: L('Ladanbeige', 'Lada beige'), colour: '#bfa983', accent: '#5e3a22' },
];

export const PAINT_BY_ID: Record<string, PaintDef> = Object.fromEntries(PAINTS.map((p) => [p.id, p]));

export interface LiveryDef {
  kind: Livery;
  name: Text;
}

/** The liveries the shop lays; a car's own (a stripe, primer) stays on offer as its stock one. */
export const LIVERIES: LiveryDef[] = [
  { kind: 'twin', name: L('Tuplaraidat', 'Twin stripes') },
  { kind: 'band', name: L('Kylkiraita', 'Side band') },
  { kind: 'split', name: L('Kaksivärinen', 'Split') },
  { kind: 'roof', name: L('Kattoväritys', 'Contrast roof') },
  { kind: 'checker', name: L('Ruutukatto', 'Chequered roof') },
  { kind: 'works', name: L('Tehdasväritys', 'Works livery') },
];

/** price shares of the car's price: a colour, a livery */
export const PAINT_COST = { colour: 0.05, livery: 0.08 };

function round50(n: number): number {
  return Math.max(50, Math.round(n / 50) * 50);
}

export function colourPrice(car: CarDef): number {
  return round50(car.price * PAINT_COST.colour);
}

export function liveryPrice(car: CarDef): number {
  return round50(car.price * PAINT_COST.livery);
}

/** The car in its paint: a new def with the colour, its tone and the livery. */
export function painted(car: CarDef, paint?: string, livery?: Livery): CarDef {
  const p = paint ? PAINT_BY_ID[paint] : undefined;
  return { ...car, colour: p ? p.colour : car.colour, accent: p?.accent ?? car.accent, livery: livery ?? car.livery };
}
