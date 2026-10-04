/**
 * The look in numbers: one low sun and a muted palette. Everything that
 * casts a shadow or catches light reads these, so the whole frame agrees
 * on where the sun is. Mad Max, not Toy Story: the only saturated things
 * are fire, tracers, the player's car and the warning colours.
 */

/** Sun azimuth: the direction shadows fall, world axes (y down), toward the lower right. */
const AZ = Math.atan2(0.62, 0.78);
export const SHADOW_X = Math.cos(AZ);
export const SHADOW_Y = Math.sin(AZ);
/** Sun elevation, 35 degrees: a metre of height throws this many metres of shadow. */
export const SHADOW_PER_M = 1 / Math.tan((35 * Math.PI) / 180);
/** The shadow's ink: cool and hard, laid at one alpha so overlaps never double. */
export const SHADOW_INK = 'rgb(18,14,22)';
export const SHADOW_ALPHA = 0.5;

export const PAL = {
  straw: '#8e7f55',
  strawPale: '#a8986a',
  strawDark: '#6f6640',
  strawGreen: '#5f5f38',
  earth: '#6a5940',
  earthDark: '#4d4130',
  forestFloor: '#3a3424',
  ditch: '#45422a',
  ditchBottom: '#2e2c1e',
  verge: '#786a52',
  berm: '#6c6354',
  gravel: '#7f7666',
  gravelPale: '#a2967e',
  rut: '#4a4337',
  water: '#38443f',
  waterLit: '#5d6b62',
  foam: '#c8cbbc',
  wetBank: '#3b3626',
  /** water on the minimap: lighter than the river itself, to read on the dark plate */
  waterMap: '#7f9faa',
  spruce: ['#0f140f', '#151b13', '#1b2317', '#26301f'],
  spruceLit: '#3a4429',
  birchLeaf: ['#5b5a2e', '#6e6a35', '#7f763b', '#8e8142'],
  birchBark: '#d6cfbd',
  hud: '#e6dcc4',
  hudDim: 'rgba(230,220,196,0.45)',
  warn: '#f0a020',
  danger: '#e0381e',
};

/** A colour pulled toward a dull grey-brown and darkened: years of sun and gravel. */
export function faded(hex: string, k = 0.42): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const grey = r * 0.3 + g * 0.55 + b * 0.15;
  const mix = (c: number, t: number) => Math.round((c * (1 - k) + t * k) * 0.86);
  return hex6(mix(r, grey * 1.02), mix(g, grey * 0.97), mix(b, grey * 0.86));
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return hex6(c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255));
}

function hex6(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
