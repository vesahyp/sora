/**
 * Procedural sprites, drawn once with canvas paths and cached. The car
 * faces +x; the renderer rotates it.
 *
 * Cars are drawn in Hill Climb Racing's proportions inside the game's
 * worn palette: big wheels proud of the arches, a thick dark outline, a
 * bold two-tone livery and a big roof number. Every body has its own
 * silhouette and one feature that reads at 17 m across a phone: the
 * saloon's big bumpers and three boxes, the hatch's tailgate, the
 * coupe's long nose and lip, the rally car's arches and wing, the
 * estate's long roof and rails, the beetle's dome and fenders, the van's
 * ladder, the pickup's loaded bed, the microcar's being tiny. Then the
 * machines, drawn from their own parts: the tractor's huge rear wheels,
 * narrow hood and stack, the monster truck's balloon tyres under a
 * pickup, the bus's row of windows and roof rack, the plough's blade,
 * the hearse's glass back with a coffin in it, the Niva's spare on the
 * tailgate. What the shop fitted is on the car too: the ram bar, armour plate, the guns,
 * the tyres, the scoop and the pipes.
 *
 * The sun never moves but the car turns under it, so a car is cached
 * once per sixteenth of a turn with its light baked for that heading:
 * the bright edge stays toward the sun whichever way the car points.
 * Damage is a separate overlay per stage, drawn over the lit body.
 */
import type { CarDef, CarShape } from '../game/types';
import { hash32 } from '../game/rng';
import { PAL, SHADOW_INK, SHADOW_PER_M, SHADOW_X, SHADOW_Y, faded, shade } from './look';

const cache = new Map<string, HTMLCanvasElement>();

/** drawing units per metre inside a car sprite: the paths below are written in these */
export const SPRITE_PPM = 24;
/**
 * Canvas pixels per drawing unit. The close camera puts up to 80 device
 * px on a metre, so the sprite is cached at three times its drawing units.
 */
const SPRITE_RES = 3;
/** canvas pixels per metre of a cached car sprite: what the renderer divides by */
export const SPRITE_PX = SPRITE_PPM * SPRITE_RES;
/** drawing units of margin around the body: room for a plough, a wing and the wheels */
const PAD = 12;
/** light bins per turn */
const LIGHT_BINS = 16;
/** the outline: dark and thick, so a body reads as a shape before it reads as a colour */
const INK = '#0d0a07';
const STEEL = '#6f6a60';
const STEEL_DARK = '#2a2622';

export interface CarLook {
  /** an opponent: paint sun-bleached */
  faded?: boolean;
  /** the heading the light is baked for, radians */
  heading?: number;
}

function lightBin(heading: number): number {
  const b = Math.round((heading / (Math.PI * 2)) * LIGHT_BINS);
  return ((b % LIGHT_BINS) + LIGHT_BINS) % LIGHT_BINS;
}

/** The sun's direction in the car's frame, a unit vector pointing toward the sun. */
function localSun(bin: number): { x: number; y: number } {
  const a = -(bin / LIGHT_BINS) * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: -(SHADOW_X * c - SHADOW_Y * s), y: -(SHADOW_X * s + SHADOW_Y * c) };
}

/**
 * Per body: where the glass and the roof sit along the length (bonnet
 * seam, screen top, roof back, rear glass end, as fractions from the
 * tail), how far the glass narrows at the screen and the rear, how far
 * the sides sit in from the arches, the nose and tail chamfers, where
 * the wheels are and how big, and how tall the roof stands for the
 * shadow, metres.
 */
interface BodySpec {
  bonnet: number;
  screen: number;
  roofB: number;
  rear: number;
  wF: number;
  wR: number;
  inset: number;
  nose: [number, number];
  tail: [number, number];
  frontX: number;
  rearX: number;
  /** wheel diameter and tread width scale, on the common chunky wheel */
  wheel: number;
  tread: number;
  height: number;
  /** how far the tread stands out of the flank, a share of its width: 0.75 when absent */
  proud?: number;
  /** a front pair unlike the rear: diameter and tread on the rear's, and how far in from the flank (share of the width) */
  front?: [number, number, number];
}

const SPEC: Record<CarShape, BodySpec> = {
  saloon: { bonnet: 0.69, screen: 0.6, roofB: 0.34, rear: 0.26, wF: 0.11, wR: 0.13, inset: 0.035, nose: [0.012, 0.05], tail: [0.012, 0.05], frontX: 0.72, rearX: 0.13, wheel: 1, tread: 1, height: 1.4 },
  hatch: { bonnet: 0.72, screen: 0.6, roofB: 0.16, rear: 0.035, wF: 0.12, wR: 0.1, inset: 0.04, nose: [0.035, 0.12], tail: [0.012, 0.06], frontX: 0.72, rearX: 0.09, wheel: 1, tread: 1, height: 1.5 },
  coupe: { bonnet: 0.56, screen: 0.45, roofB: 0.3, rear: 0.08, wF: 0.15, wR: 0.28, inset: 0.05, nose: [0.07, 0.25], tail: [0.04, 0.15], frontX: 0.7, rearX: 0.12, wheel: 1, tread: 1.05, height: 1.25 },
  rally: { bonnet: 0.66, screen: 0.55, roofB: 0.29, rear: 0.17, wF: 0.15, wR: 0.19, inset: 0.11, nose: [0.035, 0.14], tail: [0.025, 0.1], frontX: 0.7, rearX: 0.11, wheel: 1.08, tread: 1.25, height: 1.35 },
  estate: { bonnet: 0.74, screen: 0.64, roofB: 0.07, rear: 0.02, wF: 0.12, wR: 0.12, inset: 0.03, nose: [0.012, 0.05], tail: [0.008, 0.04], frontX: 0.74, rearX: 0.15, wheel: 1, tread: 1, height: 1.45 },
  beetle: { bonnet: 0.66, screen: 0.58, roofB: 0.3, rear: 0.22, wF: 0.22, wR: 0.24, inset: 0.16, nose: [0, 0], tail: [0, 0], frontX: 0.7, rearX: 0.12, wheel: 1, tread: 0.9, height: 1.5 },
  van: { bonnet: 0.87, screen: 0.8, roofB: 0.02, rear: 0, wF: 0.1, wR: 0.1, inset: 0.015, nose: [0.02, 0.09], tail: [0.006, 0.03], frontX: 0.76, rearX: 0.12, wheel: 1, tread: 1.1, height: 2.1 },
  pickup: { bonnet: 0.71, screen: 0.61, roofB: 0.43, rear: 0.41, wF: 0.12, wR: 0.14, inset: 0.03, nose: [0.015, 0.07], tail: [0.008, 0.04], frontX: 0.74, rearX: 0.11, wheel: 1.08, tread: 1.15, height: 1.75 },
  microcar: { bonnet: 0.84, screen: 0.72, roofB: 0.1, rear: 0.04, wF: 0.12, wR: 0.12, inset: 0.035, nose: [0.06, 0.2], tail: [0.025, 0.12], frontX: 0.71, rearX: 0.08, wheel: 0.66, tread: 0.7, height: 1.7 },
  // the machines: the tractor, the monster truck and the plough draw their own bodies (machineGeometry),
  // so only their wheels and height are read from here
  tractor: { bonnet: 0.46, screen: 0.42, roofB: 0.1, rear: 0.05, wF: 0.2, wR: 0.2, inset: 0.2, nose: [0, 0], tail: [0, 0], frontX: 0.74, rearX: 0.056, wheel: 2.07, tread: 1.8, height: 2.6, proud: 0.3, front: [0.47, 0.42, 0.16] },
  monster: { bonnet: 0.68, screen: 0.6, roofB: 0.42, rear: 0.4, wF: 0.2, wR: 0.2, inset: 0.2, nose: [0, 0], tail: [0, 0], frontX: 0.6, rearX: 0.02, wheel: 2.1, tread: 2.5, height: 3.0, proud: 0.2 },
  bus: { bonnet: 0.985, screen: 0.955, roofB: 0.012, rear: 0, wF: 0.05, wR: 0.05, inset: 0.02, nose: [0.012, 0.06], tail: [0.006, 0.03], frontX: 0.76, rearX: 0.13, wheel: 0.95, tread: 1.15, height: 3.0, proud: 0.5 },
  plough: { bonnet: 0.955, screen: 0.92, roofB: 0.79, rear: 0.79, wF: 0.07, wR: 0.07, inset: 0.05, nose: [0, 0], tail: [0, 0], frontX: 0.78, rearX: 0.1, wheel: 1.15, tread: 1.3, height: 2.9, proud: 0.5 },
  hearse: { bonnet: 0.77, screen: 0.68, roofB: 0.48, rear: 0.025, wF: 0.13, wR: 0.09, inset: 0.03, nose: [0.015, 0.06], tail: [0.008, 0.03], frontX: 0.75, rearX: 0.14, wheel: 0.95, tread: 1, height: 1.55 },
  niva: { bonnet: 0.72, screen: 0.63, roofB: 0.08, rear: 0.02, wF: 0.13, wR: 0.12, inset: 0.06, nose: [0.015, 0.06], tail: [0.01, 0.04], frontX: 0.7, rearX: 0.1, wheel: 1.15, tread: 1.15, height: 1.8 },
};

/** The bodies that are boxes to the roof: their whole outline casts the tall shadow. */
const BOXES: CarShape[] = ['van', 'microcar', 'bus', 'monster'];

interface WheelLayout {
  wl: number;
  ww: number;
  out: number;
  frontX: number;
  rearX: number;
  /** the front pair: the tractor's are small and tucked in under the hood */
  fwl: number;
  fww: number;
  fout: number;
}

/** Wheel size and where the pairs sit, in sprite units; the renderer scales by SPRITE_PPM. */
export function wheelLayout(def: CarDef): WheelLayout {
  const L = def.length * SPRITE_PPM;
  const sp = SPEC[def.shape];
  const t = def.tyres ?? 0;
  // Hill Climb wheels: bigger than life and standing out of the arches, fatter with every set of tyres
  const wl = (0.52 + 0.07 * def.length) * sp.wheel * (def.wheel ?? 1) * (1 + 0.04 * t) * SPRITE_PPM;
  const ww = 0.34 * sp.tread * (def.wheel ?? 1) * (1 + 0.12 * t) * SPRITE_PPM;
  const out = ww * (sp.proud ?? (def.shape === 'rally' ? 0.85 : 0.75));
  const f = sp.front;
  return { wl, ww, out, frontX: L * sp.frontX, rearX: L * sp.rearX, fwl: f ? wl * f[0] : wl, fww: f ? ww * f[1] : ww, fout: f ? -def.width * SPRITE_PPM * f[2] : out };
}

/** The tread drawn: the monster truck's balloons and the tractor's lugs are knobbly from new. */
export function tyreLevel(def: CarDef): number {
  const t = def.tyres ?? 0;
  return def.shape === 'monster' ? Math.max(t, 3) : def.shape === 'tractor' || def.shape === 'niva' ? Math.max(t, 1) : t;
}

/** Where the tractor's stack stands, metres from the car's centre (forward, right): the renderer puffs smoke from it. */
export function stackAt(def: CarDef): [number, number] | null {
  if (def.shape === 'tractor') return [def.length * 0.06, -def.width * 0.1];
  if (def.shape === 'plough') return [def.length * 0.2, def.width * 0.42];
  return null;
}

type Pt = [number, number];
/** a path segment: a line to a point, or a cubic with two controls */
type Seg = { to: Pt; c1?: Pt; c2?: Pt };

/**
 * The outline of one flank, tail to nose, as segments from a start
 * point; the other flank is the mirror, traced back. One closed path,
 * so the rims and the clip see a single shape.
 */
function mirrored(start: Pt, segs: Seg[], W: number): Path2D {
  const p = new Path2D();
  p.moveTo(...start);
  for (const s of segs) {
    if (s.c1 && s.c2) p.bezierCurveTo(...s.c1, ...s.c2, ...s.to);
    else p.lineTo(...s.to);
  }
  const m = (q: Pt): Pt => [q[0], W - q[1]];
  // across the nose to the mirror of the last point, then back down the other flank
  const last = segs[segs.length - 1].to;
  if (Math.abs(last[1] - W / 2) > 0.01) p.lineTo(...m(last));
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const from = i ? segs[i - 1].to : start;
    if (s.c1 && s.c2) p.bezierCurveTo(...m(s.c2), ...m(s.c1), ...m(from));
    else p.lineTo(...m(from));
  }
  p.closePath();
  return p;
}

interface Geo {
  L: number;
  W: number;
  body: Path2D;
  /** the greenhouse: screen, roof and rear window, the part that stands tall */
  cabin: Path2D;
  roof: [number, number, number, number];
  /** the roof as drawn: a box, or the beetle's dome */
  roofPath: Path2D;
  screen: Pt[];
  rear: Pt[];
  sideL: Pt[];
  sideR: Pt[];
  /** x of the bonnet seam and the boot seam */
  bonnetX: number;
  bootX: number;
  /** what casts the low shadow when it is not the body: a machine's wheels stand outside it */
  foot?: Path2D;
}

const geoCache = new Map<string, Geo>();

/** The body: chamfered, the arches flared where the wheels sit, the beetle round. */
function geometry(def: CarDef): Geo {
  const gk = `${def.shape}:${def.length}:${def.width}:${def.wheel ?? 1}:${def.tyres ?? 0}`;
  const hit = geoCache.get(gk);
  if (hit) return hit;
  const L = def.length * SPRITE_PPM;
  const W = def.width * SPRITE_PPM;
  const sp = SPEC[def.shape];
  const wh = wheelLayout(def);
  const machine = machineGeometry(def, L, W, wh);
  if (machine) {
    geoCache.set(gk, machine);
    return machine;
  }
  const inset = W * sp.inset;
  let body: Path2D;
  if (def.shape === 'beetle') {
    // a round tub, four fenders that stand out over the wheels, running boards between them
    const tub = inset;
    const board = W * 0.07;
    const r0 = wh.rearX - 4;
    const r1 = wh.rearX + wh.wl + 4;
    const f0 = wh.frontX - 4;
    const f1 = wh.frontX + wh.wl + 4;
    body = mirrored([0, W / 2], [
      { to: [L * 0.1, tub], c1: [0, W * 0.2], c2: [L * 0.04, tub] },
      { to: [r0, tub] },
      { to: [r1, board], c1: [r0 + 2, -1.5], c2: [r1 - 2, -1.5] },
      { to: [f0, board] },
      { to: [f1, tub], c1: [f0 + 2, -1.5], c2: [f1 - 2, -1.5] },
      { to: [L * 0.88, tub] },
      { to: [L, W / 2], c1: [L * 0.97, tub], c2: [L, W * 0.24] },
    ], W);
  } else {
    const fl = 3;
    const ra0 = wh.rearX - 3;
    const ra1 = wh.rearX + wh.wl + 3;
    const fa0 = wh.frontX - 3;
    const fa1 = wh.frontX + wh.wl + 3;
    const [nx, ny] = [L * sp.nose[0], W * sp.nose[1]];
    const [tx, ty] = [L * sp.tail[0], W * sp.tail[1]];
    body = mirrored([0, ty], [
      { to: [tx, inset] },
      { to: [ra0, inset] },
      { to: [ra0 + fl, 0] },
      { to: [ra1 - fl, 0] },
      { to: [ra1, inset] },
      { to: [fa0, inset] },
      { to: [fa0 + fl, 0] },
      { to: [fa1 - fl, 0] },
      { to: [fa1, inset] },
      { to: [L - nx, inset] },
      { to: [L, ny] },
    ], W);
  }

  const g0 = inset + W * 0.06;
  const rIn = def.shape === 'beetle' ? inset + W * 0.06 : def.shape === 'bus' ? inset + W * 0.2 : inset + W * 0.12;
  const roof: [number, number, number, number] = [L * sp.roofB, rIn, L * (sp.screen - sp.roofB), W - 2 * rIn];
  const roofPath = new Path2D();
  if (def.shape === 'beetle') roofPath.ellipse(roof[0] + roof[2] / 2, W / 2, roof[2] / 2 + 3, roof[3] / 2, 0, 0, Math.PI * 2);
  else roofPath.rect(...roof);
  const screen: Pt[] = [
    [L * sp.screen, roof[1]],
    [L * sp.bonnet, W * sp.wF],
    [L * sp.bonnet, W * (1 - sp.wF)],
    [L * sp.screen, roof[1] + roof[3]],
  ];
  // the van's back is barn doors, no glass to speak of from above
  const rear: Pt[] = def.shape === 'van' ? [] : [
    [L * sp.roofB, roof[1]],
    [L * sp.rear, W * sp.wR],
    [L * sp.rear, W * (1 - sp.wR)],
    [L * sp.roofB, roof[1] + roof[3]],
  ];
  const sx0 = L * sp.roofB + 3;
  const sx1 = L * sp.screen - 2;
  const sideL: Pt[] = [
    [sx0, g0],
    [sx1, g0],
    [sx1 - 2, roof[1] - 1],
    [sx0 + 1, roof[1] - 1],
  ];
  const sideR = sideL.map(([x, y]) => [x, W - y] as Pt);
  const cabin = polyPath([
    [L * sp.rear, W * sp.wR],
    [L * sp.roofB, g0],
    [L * sp.screen, g0],
    [L * sp.bonnet, W * sp.wF],
    [L * sp.bonnet, W * (1 - sp.wF)],
    [L * sp.screen, W - g0],
    [L * sp.roofB, W - g0],
    [L * sp.rear, W * (1 - sp.wR)],
  ]);
  const geo = { L, W, body, cabin, roof, roofPath, screen, rear, sideL, sideR, bonnetX: L * sp.bonnet, bootX: L * sp.rear };
  geoCache.set(gk, geo);
  return geo;
}

/** A flank's outline, tail to nose, with its mirror traced back: one symmetric polygon. */
function both(top: Pt[], W: number): Pt[] {
  return [...top, ...top.map(([x, y]) => [x, W - y] as Pt).reverse()];
}

function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/**
 * The machines that are not cars, built from their own parts instead of
 * the car's three boxes: the tractor's cab between its fenders and its
 * narrow hood, the monster truck's pickup riding high between its tyres,
 * the plough's cab and sand box with the chassis between them. Null for
 * the cars.
 */
function machineGeometry(def: CarDef, L: number, W: number, wh: WheelLayout): Geo | null {
  const tyres = (p: Path2D) => {
    for (const [x, wl, ww, out] of [[wh.rearX, wh.wl, wh.ww, wh.out], [wh.frontX, wh.fwl, wh.fww, wh.fout]]) {
      p.rect(x, -out, wl, ww);
      p.rect(x, W - ww + out, wl, ww);
    }
  };
  switch (def.shape) {
    case 'tractor': {
      // the cab sits between the fenders over the huge rear wheels; the hood runs forward, narrow,
      // with the small front wheels tucked in under it
      const half = W * 0.19;
      const cab0 = wh.rearX + 1;
      const cab1 = wh.rearX + wh.wl + 2;
      const cy = wh.ww - wh.out - 1.5;
      const f0 = wh.rearX + wh.wl * 0.2;
      const f1 = wh.rearX + wh.wl * 0.8;
      const fy = cy - 3;
      const body = polyPath(both([[cab0, W / 2], [cab0, cy], [f0, cy], [f0 + 2, fy], [f1 - 2, fy], [f1, cy], [cab1, cy], [cab1, W / 2 - half], [L - 2, W / 2 - half], [L, W / 2 - half + 2]], W));
      const roof: [number, number, number, number] = [cab0 + 4, cy + 2.5, cab1 - cab0 - 9, W - 2 * cy - 5];
      const [rx, ry, rw, rh] = roof;
      const foot = new Path2D(body);
      tyres(foot);
      return {
        L,
        W,
        body,
        cabin: polyPath(rectPts(cab0, cy, cab1 - cab0, W - 2 * cy)),
        roof,
        roofPath: polyPath(rectPts(...roof)),
        screen: [[rx + rw, ry], [cab1 - 1, cy + 1.2], [cab1 - 1, W - cy - 1.2], [rx + rw, ry + rh]],
        rear: [[rx, ry], [cab0 + 1, cy + 1.2], [cab0 + 1, W - cy - 1.2], [rx, ry + rh]],
        sideL: [[rx + 1, cy + 1], [rx + rw - 1, cy + 1], [rx + rw - 1, ry - 0.6], [rx + 1, ry - 0.6]],
        sideR: [[rx + 1, W - cy - 1], [rx + rw - 1, W - cy - 1], [rx + rw - 1, W - ry + 0.6], [rx + 1, W - ry + 0.6]],
        bonnetX: cab1,
        bootX: 0,
        foot,
      };
    }
    case 'monster': {
      // a pickup a size too small for its wheels, riding between them
      const bi = W * 0.25;
      const body = polyPath(both([[2, W / 2], [2, bi + 3], [5, bi], [L - 6, bi], [L - 1, bi + 4]], W));
      const roof: [number, number, number, number] = [L * 0.42, bi + 4, L * 0.18, W - 2 * bi - 8];
      const [rx, ry, rw, rh] = roof;
      const foot = new Path2D(body);
      tyres(foot);
      return {
        L,
        W,
        body,
        cabin: polyPath(rectPts(L * 0.4, bi, L * 0.28, W - 2 * bi)),
        roof,
        roofPath: polyPath(rectPts(...roof)),
        screen: [[rx + rw, ry], [L * 0.68, bi + 3], [L * 0.68, W - bi - 3], [rx + rw, ry + rh]],
        rear: [[rx, ry + 1], [rx - 2, ry + 2], [rx - 2, ry + rh - 2], [rx, ry + rh - 1]],
        sideL: [[rx + 2, bi + 1.5], [rx + rw - 2, bi + 1.5], [rx + rw - 3, ry - 0.6], [rx + 2, ry - 0.6]],
        sideR: [[rx + 2, W - bi - 1.5], [rx + rw - 2, W - bi - 1.5], [rx + rw - 3, W - ry + 0.6], [rx + 2, W - ry + 0.6]],
        bonnetX: L * 0.68,
        bootX: L * 0.4,
        foot,
      };
    }
    case 'plough': {
      // a lorry: the cab at the front, a sand box behind it, the chassis rails between; the blade is
      // drawn ahead of the nose (tailFeatures)
      const box1 = L * 0.72;
      const cab0 = L * 0.755;
      const body = new Path2D();
      poly(body, rectPts(1.5, 1.5, box1 - 1.5, W - 3));
      poly(body, rectPts(cab0, 3, L - cab0, W - 6));
      const roof: [number, number, number, number] = [L * 0.78, 6, L * 0.14, W - 12];
      const [rx, ry, rw, rh] = roof;
      return {
        L,
        W,
        body,
        cabin: polyPath(rectPts(cab0, 3, L - cab0, W - 6)),
        roof,
        roofPath: polyPath(rectPts(...roof)),
        screen: [[rx + rw, ry], [L * 0.955, 4.5], [L * 0.955, W - 4.5], [rx + rw, ry + rh]],
        rear: [],
        sideL: [[rx + 1, 4], [rx + rw - 1, 4], [rx + rw - 1, ry - 0.6], [rx + 1, ry - 0.6]],
        sideR: [[rx + 1, W - 4], [rx + rw - 1, W - 4], [rx + rw - 1, W - ry + 0.6], [rx + 1, W - ry + 0.6]],
        bonnetX: L * 0.955,
        bootX: 0,
      };
    }
    default:
      return null;
  }
}

function poly(g: CanvasRenderingContext2D | Path2D, pts: Pt[]): void {
  if (!pts.length) return;
  if (!(g instanceof Path2D)) g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function polyPath(pts: Pt[]): Path2D {
  const p = new Path2D();
  poly(p, pts);
  return p;
}

/**
 * Paint the strip of a shape that a shifted copy of it does not cover:
 * with the shift away from the sun that is the lit edge, toward it the
 * shaded one. One clip and one even-odd fill, no per-pixel work.
 */
function rim(g: CanvasRenderingContext2D, shape: Path2D, dx: number, dy: number, style: string): void {
  g.save();
  g.clip(shape);
  const p = new Path2D();
  p.rect(-1e4, -1e4, 2e4, 2e4);
  p.addPath(shape, new DOMMatrix().translate(dx, dy));
  g.fillStyle = style;
  g.fill(p, 'evenodd');
  g.restore();
}

/** A gradient across a shape along the sun: warm toward it, dark away. */
function sunWash(g: CanvasRenderingContext2D, shape: Path2D, cx: number, cy: number, r: number, sun: { x: number; y: number }, lit: number, dark: number): void {
  const gr = g.createLinearGradient(cx + sun.x * r, cy + sun.y * r, cx - sun.x * r, cy - sun.y * r);
  gr.addColorStop(0, `rgba(255,236,200,${lit})`);
  gr.addColorStop(0.45, 'rgba(255,236,200,0)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(10,6,4,${dark})`);
  g.fillStyle = gr;
  g.fill(shape);
}

/** A steel part: filled, outlined in ink, a lit top edge. */
function steel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = STEEL_DARK): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.strokeStyle = INK;
  g.lineWidth = 0.7;
  g.strokeRect(x, y, w, h);
  g.fillStyle = 'rgba(255,236,204,0.3)';
  g.fillRect(x, y, w, Math.min(0.7, h));
}

function rivets(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 3.5): void {
  g.fillStyle = 'rgba(230,220,200,0.55)';
  for (let i = x + 1.2; i < x + w - 0.5; i += step) {
    g.fillRect(i, y + 0.6, 0.7, 0.7);
    g.fillRect(i, y + h - 1.3, 0.7, 0.7);
  }
}

/** One wheel seen from above: a fat black tread, a pale sidewall, knobs once the tyres are bought. */
export function tyre(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, level = 0): void {
  const r = Math.min(w, h) * 0.3;
  g.fillStyle = '#121110';
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
  if (level > 0) {
    // knobbly: blocks standing proud of the tread along both shoulders
    const n = 5 + level;
    const k = 0.5 + level * 0.35;
    for (let i = 0; i < n; i++) {
      const bx = x + 1 + ((w - 2) * (i + 0.5)) / n - 0.9;
      g.fillRect(bx, y - k, 1.8, k + 1);
      g.fillRect(bx + (i % 2 ? 0.6 : -0.6), y + h - 1, 1.8, k + 1);
    }
  }
  // the sidewalls: grey rubber caught by the light, so a wheel reads on dark ground too
  g.fillStyle = '#4a453e';
  g.fillRect(x + r * 0.6, y + 0.4, w - r * 1.2, Math.max(0.9, h * 0.14));
  g.fillRect(x + r * 0.6, y + h - 0.4 - Math.max(0.9, h * 0.14), w - r * 1.2, Math.max(0.9, h * 0.14));
  g.fillStyle = level > 0 ? 'rgba(150,140,120,0.55)' : 'rgba(120,110,95,0.4)';
  const bars = 5 + level * 2;
  for (let i = 1; i < bars; i++) g.fillRect(x + (w * i) / bars, y + h * 0.2, 0.7, h * 0.6);
  g.strokeStyle = INK;
  g.lineWidth = 0.8;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.stroke();
}

/** The livery's second colour on the body, clipped to it: how it is laid is the car's own. */
function paintLivery(g: CanvasRenderingContext2D, def: CarDef, geo: Geo, tone: string): void {
  const { L, W } = geo;
  g.fillStyle = tone;
  switch (def.livery) {
    case 'roof':
      // a white roof and a pinstripe down each flank
      g.fillRect(-2, W * 0.13, L + 4, 1.2);
      g.fillRect(-2, W * 0.87 - 1.2, L + 4, 1.2);
      break;
    case 'band':
      g.fillRect(-2, 0, L + 4, W * 0.2);
      g.fillRect(-2, W * 0.8, L + 4, W * 0.2);
      break;
    case 'twin':
      g.fillRect(-2, W * 0.33, L + 4, W * 0.11);
      g.fillRect(-2, W * 0.56, L + 4, W * 0.11);
      break;
    case 'stripe':
      g.fillRect(-2, W * 0.39, L + 4, W * 0.22);
      break;
    case 'split':
      // the front in the second tone, cut on a slant
      poly(g, [[L * 0.64, -2], [L + 4, -2], [L + 4, W + 2], [L * 0.5, W + 2]]);
      g.fill();
      break;
    case 'works':
      // a sweep from the nose back along the flanks, a dark pinstripe on its edge, a sponsor on the bonnet
      for (const s of [1, -1]) {
        const y = (v: number) => (s > 0 ? v : W - v);
        poly(g, [[L + 4, y(W * 0.3)], [L + 4, y(W * 0.5)], [L * 0.78, y(W * 0.42)], [L * 0.3, y(W * 0.2)], [-2, y(W * 0.17)], [-2, y(W * 0.06)], [L * 0.3, y(W * 0.08)], [L * 0.78, y(W * 0.26)]]);
        g.fill();
      }
      g.strokeStyle = 'rgba(20,16,12,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      for (const s of [1, -1]) {
        const y = (v: number) => (s > 0 ? v : W - v);
        g.moveTo(L + 4, y(W * 0.5));
        g.lineTo(L * 0.78, y(W * 0.42));
        g.lineTo(L * 0.3, y(W * 0.2));
        g.lineTo(-2, y(W * 0.17));
      }
      g.stroke();
      break;
    case 'primer':
      // scrapyard panels: a grey bonnet and a grey door, rust at the edges
      g.fillRect(geo.bonnetX + 1, W * 0.1, L - geo.bonnetX - 3, W * 0.8);
      g.fillRect(geo.roof[0] - 2, -2, geo.roof[2] * 0.6, W * 0.24);
      g.fillStyle = 'rgba(120,62,30,0.55)';
      for (let i = 0; i < 14; i++) {
        const h = hash32(i * 331 + 17);
        g.fillRect(((h & 0xff) / 255) * L, (h >>> 8) & 1 ? W - 2.5 : 0.5, 1.5 + ((h >>> 9) & 3), 1.4);
      }
      break;
    case 'checker':
      break;
  }
}

/** The roof's share of the livery: a white roof, the stripes carried over, a chequer. */
function roofLivery(g: CanvasRenderingContext2D, def: CarDef, geo: Geo, tone: string): void {
  const { W } = geo;
  const [rx, ry, rw, rh] = geo.roof;
  g.save();
  g.clip(geo.roofPath);
  g.fillStyle = shade(tone, 1.04);
  if (def.livery === 'roof') g.fill(geo.roofPath);
  else if (def.livery === 'twin') {
    g.fillRect(rx - 4, W * 0.33, rw + 8, W * 0.11);
    g.fillRect(rx - 4, W * 0.56, rw + 8, W * 0.11);
  } else if (def.livery === 'stripe') g.fillRect(rx - 4, W * 0.39, rw + 8, W * 0.22);
  else if (def.livery === 'checker') {
    const n = 4;
    const s = rh / n;
    for (let i = 0; i * s < rw + 4; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) g.fillRect(rx + i * s, ry + j * s, s, s);
  }
  g.restore();
}

/** Everything a car's picture depends on: the body, the paint, every fitted part, the light. */
function carKey(def: CarDef, look: CarLook): string {
  return `${def.shape}:${def.length}:${def.width}:${def.wheel ?? 1}:${def.colour}:${def.accent}:${def.livery}:${def.number}:${def.ram}:${def.armour}:${def.gun}:${def.tyres ?? 0}:${def.engine ?? 0}:${look.faded ? 1 : 0}:${lightBin(look.heading ?? -0.3)}`;
}

export function carSprite(def: CarDef, look: CarLook = {}): HTMLCanvasElement {
  const bin = lightBin(look.heading ?? -0.3);
  const key = `car:${carKey(def, look)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = geometry(def);
  const { L, W, body } = geo;
  const sun = localSun(bin);
  const c = document.createElement('canvas');
  c.width = Math.ceil((L + PAD * 2) * SPRITE_RES);
  c.height = Math.ceil((W + PAD * 2) * SPRITE_RES);
  const g = c.getContext('2d')!;
  g.scale(SPRITE_RES, SPRITE_RES);
  g.translate(PAD, PAD);
  g.lineJoin = 'round';
  const shape = def.shape;
  const paint = look.faded ? faded(def.colour, 0.25) : def.colour;
  const tone = look.faded ? faded(def.accent, 0.2) : def.accent;
  const wh = wheelLayout(def);
  const eng = def.engine ?? 0;

  // the side pipes run out under the body, so they go down first
  if (eng >= 2) {
    for (const side of eng >= 3 ? [0, 1] : [0]) {
      const y = side ? W - 0.5 : -1.9;
      const x0 = wh.rearX + wh.wl + 4;
      steel(g, x0, y, wh.frontX - x0 - 4, 2.4, '#8d877a');
      g.fillStyle = '#16130f';
      g.beginPath();
      g.arc(x0 + 1, y + 1.2, 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  // rear tyres: the front pair turn, so the renderer draws them. The plough's lorry has a tandem
  const tread = tyreLevel(def);
  for (const x of shape === 'plough' ? [wh.rearX, wh.rearX + wh.wl + 2] : [wh.rearX]) {
    tyre(g, x, -wh.out, wh.wl, wh.ww, tread);
    tyre(g, x, W - wh.ww + wh.out, wh.wl, wh.ww, tread);
  }
  if (shape === 'tractor') {
    // the lugs: chevrons across the big rear tread, the tractor's signature from above
    g.strokeStyle = 'rgba(150,140,120,0.6)';
    g.lineWidth = 1.3;
    g.beginPath();
    for (const [y0, y1] of [[-wh.out, -wh.out + wh.ww], [W - wh.ww + wh.out, W + wh.out]]) {
      const ym = (y0 + y1) / 2;
      for (let x = wh.rearX + 3; x < wh.rearX + wh.wl - 3; x += 4.2) {
        g.moveTo(x, y0 + 1);
        g.lineTo(x + 2.5, ym);
        g.lineTo(x, y1 - 1);
      }
    }
    g.stroke();
  }
  if (shape === 'tractor' || shape === 'monster') {
    // the axles, visible between the wheels where the body does not cover them
    for (const [x, wl, ww, out] of [[wh.rearX, wh.wl, wh.ww, wh.out], [wh.frontX, wh.fwl, wh.fww, wh.fout]]) steel(g, x + wl / 2 - 1.5, ww - out, 3, W - 2 * (ww - out), '#24211c');
  }
  if (shape === 'rally') {
    // mud flaps behind every wheel
    g.fillStyle = '#1c1915';
    for (const y of [-wh.out + 0.5, W + wh.out - 3.5]) {
      g.fillRect(wh.rearX - 3, y, 2, 3);
      g.fillRect(wh.frontX - 3, y, 2, 3);
    }
  }

  // the outline first, thick, so the body's fill covers its inner half
  g.strokeStyle = INK;
  g.lineWidth = 3.2;
  g.stroke(body);

  // paint
  g.fillStyle = paint;
  g.fill(body);
  g.save();
  g.clip(body);
  paintLivery(g, def, geo, tone);
  if (shape === 'beetle') {
    // the running boards: black rubber between the fenders
    g.fillStyle = '#1e1b17';
    g.fillRect(wh.rearX + wh.wl + 2, 0, wh.frontX - wh.rearX - wh.wl - 4, W * 0.16);
    g.fillRect(wh.rearX + wh.wl + 2, W * 0.84, wh.frontX - wh.rearX - wh.wl - 4, W * 0.16);
  }
  // years of gravel: the paint is chipped, the sills and arches are mud
  for (let i = 0; i < 70; i++) {
    const h = hash32(i * 977 + def.length * 100);
    const x = ((h & 0xff) / 255) * L;
    const y = (((h >>> 8) & 0xff) / 255) * W;
    g.fillStyle = (h >>> 16) & 1 ? 'rgba(220,210,190,0.18)' : 'rgba(30,24,18,0.2)';
    g.fillRect(x, y, 0.8 + ((h >>> 20) & 3) * 0.4, 0.6);
  }
  const mud = (x: number, w: number) => {
    for (const side of [0, 1]) {
      const gr = g.createLinearGradient(0, side ? W : 0, 0, side ? W - W * 0.2 : W * 0.2);
      gr.addColorStop(0, 'rgba(78,62,40,0.8)');
      gr.addColorStop(1, 'rgba(78,62,40,0)');
      g.fillStyle = gr;
      g.fillRect(x, side ? W - W * 0.2 : 0, w, W * 0.2);
    }
  };
  mud(0, L);
  mud(wh.rearX - 6, wh.wl + 10);
  mud(wh.frontX - 6, wh.wl + 10);
  for (let i = 0; i < 90; i++) {
    const h = hash32(i * 7919 + 3);
    const side = h & 1;
    const x = (((h >>> 1) & 0xff) / 255) * L;
    const dy = Math.pow(((h >>> 9) & 0xff) / 255, 2) * W * 0.3;
    g.fillStyle = 'rgba(70,54,34,0.7)';
    g.fillRect(x, side ? W - dy - 1 : dy, 0.7 + ((h >>> 17) & 3) * 0.5, 0.7);
  }
  g.restore();

  // panel seams
  g.strokeStyle = 'rgba(12,8,6,0.45)';
  g.lineWidth = 0.7;
  g.beginPath();
  if (!BOXES.includes(shape) && shape !== 'tractor' && shape !== 'plough') {
    g.moveTo(geo.bonnetX + 1, W * 0.14);
    g.lineTo(L - 3, W * 0.14);
    g.moveTo(geo.bonnetX + 1, W * 0.86);
    g.lineTo(L - 3, W * 0.86);
  }
  if (geo.bootX > 4) {
    g.moveTo(geo.bootX - 1, W * 0.16);
    g.lineTo(geo.bootX - 1, W * 0.84);
  }
  g.stroke();

  // what makes each body itself, below the glass
  bodyFeatures(g, def, geo);

  // armour: riveted plates on the doors first; on a machine, wherever its body is
  if (def.armour >= 1) {
    const x0 = wh.rearX + wh.wl + 3;
    const w = wh.frontX - x0 - 3;
    g.save();
    if (SPEC[shape].inset >= 0.2) g.clip(body);
    for (const y of [0.2, W - W * 0.2 - 0.2]) {
      steel(g, x0, y, w, W * 0.2, STEEL);
      rivets(g, x0, y, w, W * 0.2);
    }
    g.restore();
  }

  // glass: dark, with the sky caught on the side toward the sun
  const glass = new Path2D();
  poly(glass, geo.screen);
  poly(glass, geo.rear);
  poly(glass, geo.sideL);
  poly(glass, geo.sideR);
  g.fillStyle = '#262d31';
  g.fill(glass);
  sunWash(g, glass, L * 0.45, W / 2, L * 0.3, sun, 0.45, 0.3);
  g.fillStyle = 'rgba(70,64,52,0.3)';
  g.fill(glass);
  g.strokeStyle = INK;
  g.lineWidth = 0.9;
  g.stroke(glass);
  throughGlass(g, def, geo, paint);
  if (def.armour >= 3) {
    // mesh over the glass
    g.save();
    g.clip(glass);
    g.strokeStyle = 'rgba(150,145,130,0.75)';
    g.lineWidth = 0.45;
    g.beginPath();
    for (let x = -W; x < L + W; x += 2.4) {
      g.moveTo(x, 0);
      g.lineTo(x + W, W);
      g.moveTo(x + W, 0);
      g.lineTo(x, W);
    }
    g.stroke();
    g.restore();
  }

  // the roof: the highest panel, it catches the most light
  const roof = geo.roofPath;
  g.fillStyle = shade(paint, 1.07);
  g.fill(roof);
  roofLivery(g, def, geo, tone);
  if (def.armour >= 2) {
    // riveted plates along the roof's edges, the paint and the number left between them
    const [rx, ry, rw, rh] = geo.roof;
    for (const y of [ry, ry + rh * 0.76]) {
      steel(g, rx + 1, y, rw - 2, rh * 0.24, STEEL);
      rivets(g, rx + 1, y, rw - 2, rh * 0.24, 3);
    }
  }
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.stroke(roof);
  roofFeatures(g, def, geo);

  // the race number: a big scuffed white disc on the roof, the number across the car
  roofNumber(g, def, geo, look.faded === true);

  // light: a wash across the whole body, a bright edge toward the sun, a dark one away
  sunWash(g, body, L / 2, W / 2, Math.max(L, W) * 0.5, sun, 0.2, 0.36);
  rim(g, body, -sun.x * 1.8, -sun.y * 1.8, 'rgba(255,236,204,0.5)');
  rim(g, body, sun.x * 2.4, sun.y * 2.4, 'rgba(8,5,3,0.5)');
  rim(g, roof, -sun.x * 1.2, -sun.y * 1.2, 'rgba(255,240,214,0.45)');
  rim(g, roof, sun.x * 1.3, sun.y * 1.3, 'rgba(8,5,3,0.4)');
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.stroke(body);

  tailFeatures(g, def, geo);
  lamps(g, def, geo);
  if (def.gun > 0) guns(g, def, geo);
  if (eng >= 1) scoop(g, def, geo, eng);
  // the plough's blade is its ram
  if (def.ram > 0 && shape !== 'plough') ramBar(g, def, geo);
  cache.set(key, c);
  return c;
}

/** What shows through the glass: the bus's window pillars, the coffin and the wreath in the hearse. */
function throughGlass(g: CanvasRenderingContext2D, def: CarDef, geo: Geo, paint: string): void {
  const { L, W } = geo;
  if (def.shape === 'bus') {
    // a row of windows down each flank: pillars every metre across the long side glass
    g.fillStyle = shade(paint, 0.92);
    g.strokeStyle = INK;
    g.lineWidth = 0.6;
    for (const side of [geo.sideL, geo.sideR]) {
      const y0 = Math.min(side[0][1], side[3][1]);
      const y1 = Math.max(side[0][1], side[3][1]);
      for (let x = side[0][0] + SPRITE_PPM * 0.9; x < side[1][0] - 4; x += SPRITE_PPM * 0.95) {
        g.fillRect(x, y0 - 0.3, 2, y1 - y0 + 0.6);
        g.strokeRect(x, y0 - 0.3, 2, y1 - y0 + 0.6);
      }
    }
  }
  if (def.shape === 'hearse') {
    // the coffin under the long rear glass, a wreath on its lid, curtains pleated along the sides
    const x0 = L * 0.06;
    const x1 = geo.roof[0] - 3;
    const hw = W * 0.17;
    const cy = W / 2;
    const lid = polyPath([[x0, cy - hw * 0.7], [x0 + (x1 - x0) * 0.72, cy - hw], [x1, cy - hw * 0.8], [x1, cy + hw * 0.8], [x0 + (x1 - x0) * 0.72, cy + hw], [x0, cy + hw * 0.7]]);
    g.fillStyle = '#6a4024';
    g.fill(lid);
    g.strokeStyle = INK;
    g.lineWidth = 0.8;
    g.stroke(lid);
    g.strokeStyle = 'rgba(255,220,170,0.35)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(x0 + 2, cy);
    g.lineTo(x1 - 2, cy);
    g.stroke();
    g.fillStyle = '#c9a85a';
    for (const x of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.6]) {
      g.fillRect(x, cy - hw - 0.4, 2.2, 0.9);
      g.fillRect(x, cy + hw - 0.5, 2.2, 0.9);
    }
    const wx = x0 + (x1 - x0) * 0.66;
    const wr = hw * 0.75;
    g.strokeStyle = '#2f4a26';
    g.lineWidth = wr * 0.55;
    g.beginPath();
    g.arc(wx, cy, wr, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e8e0cc';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.beginPath();
      g.arc(wx + Math.cos(a) * wr, cy + Math.sin(a) * wr, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9a1e18';
    poly(g, [[wx - 1, cy], [wx - 6, cy - 2.5], [wx - 6.5, cy - 0.5]]);
    g.fill();
    poly(g, [[wx - 1, cy], [wx - 6, cy + 2.5], [wx - 6.5, cy + 0.5]]);
    g.fill();
    g.strokeStyle = 'rgba(200,190,170,0.4)';
    g.lineWidth = 0.5;
    g.beginPath();
    for (let x = x0; x < x1; x += 2.2) {
      g.moveTo(x, W * 0.12);
      g.lineTo(x + 1, W * 0.2);
      g.moveTo(x, W * 0.88);
      g.lineTo(x + 1, W * 0.8);
    }
    g.stroke();
  }
}

/** The signature panels of each body, painted over the paint and under the glass. */
function bodyFeatures(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { L, W } = geo;
  switch (def.shape) {
    case 'coupe':
      // bonnet louvres and the pop-up lamp lids down the long nose
      g.fillStyle = 'rgba(10,8,6,0.6)';
      for (let i = 0; i < 5; i++) g.fillRect(L * 0.68 + i * 2.4, W * 0.4, 1.1, W * 0.2);
      g.strokeStyle = 'rgba(10,8,6,0.6)';
      g.lineWidth = 0.7;
      g.strokeRect(L * 0.88, W * 0.2, L * 0.07, W * 0.16);
      g.strokeRect(L * 0.88, W * 0.64, L * 0.07, W * 0.16);
      break;
    case 'rally':
      // a bonnet vent
      g.fillStyle = '#16130f';
      g.fillRect(L * 0.74, W * 0.38, L * 0.08, W * 0.24);
      break;
    case 'hatch': {
      // the tailgate: a panel that is the whole back of the car, its hinge line across the roof
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.strokeRect(1.5, W * 0.12, geo.roof[0] - 1.5, W * 0.76);
      break;
    }
    case 'beetle':
      // the engine lid's louvres at the back, the bonnet's ridge at the front
      g.fillStyle = 'rgba(10,8,6,0.55)';
      for (let i = 0; i < 4; i++) g.fillRect(L * 0.06 + i * 1.8, W * 0.36, 0.9, W * 0.28);
      g.strokeStyle = 'rgba(10,8,6,0.45)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(geo.bonnetX + 2, W / 2);
      g.lineTo(L - 4, W / 2);
      g.stroke();
      break;
    case 'pickup': {
      // the open bed: dark floor between the sides, and a load in it
      const x0 = L * 0.025;
      const x1 = geo.bootX - 1.5;
      const y0 = W * 0.13;
      const y1 = W * 0.87;
      g.fillStyle = '#1f1b16';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = 'rgba(255,236,204,0.08)';
      for (let x = x0 + 2; x < x1; x += 3) g.fillRect(x, y0, 0.6, y1 - y0);
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      // two old tyres stacked, a rusty barrel
      const r = (y1 - y0) * 0.24;
      for (const [cx, cy] of [[x0 + r + 2, y0 + r + 1], [x0 + r + 3.5, y0 + r + 3]] as Pt[]) {
        g.fillStyle = '#151311';
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(140,130,110,0.5)';
        g.lineWidth = 0.6;
        g.stroke();
        g.fillStyle = '#3a352e';
        g.beginPath();
        g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
        g.fill();
      }
      const br = (y1 - y0) * 0.22;
      const bx = x1 - br - 2;
      const by = y1 - br - 1.5;
      g.fillStyle = '#2f5a6a';
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.8;
      g.stroke();
      g.strokeStyle = 'rgba(200,190,160,0.45)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(bx, by, br * 0.62, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(120,62,30,0.6)';
      g.fillRect(bx - br * 0.4, by - br * 0.6, br * 0.5, br * 0.4);
      break;
    }
    case 'van':
      // a sliding door's runner along one flank
      g.fillStyle = 'rgba(10,8,6,0.5)';
      g.fillRect(L * 0.3, W * 0.12, L * 0.38, 0.8);
      break;
    case 'microcar':
      // a single big wiper on the screen's base, a plastic body with a seam round it
      g.strokeStyle = 'rgba(10,8,6,0.5)';
      g.lineWidth = 0.7;
      g.strokeRect(2, W * 0.1, L - 4, W * 0.8);
      break;
    case 'tractor': {
      // the engine out in the open behind the hood: a ribbed block, the grille ahead of it
      const half = W * 0.19;
      steel(g, geo.bonnetX, W / 2 - half - 1.2, 9, half * 2 + 2.4, '#3a362f');
      g.fillStyle = 'rgba(255,236,204,0.25)';
      for (let x = geo.bonnetX + 1.5; x < geo.bonnetX + 8.5; x += 1.8) g.fillRect(x, W / 2 - half, 0.7, half * 2);
      g.fillStyle = 'rgba(10,8,6,0.55)';
      for (let i = 0; i < 6; i++) g.fillRect(L * 0.62 + i * 2.6, W / 2 - half + 1.5, 1.1, half * 2 - 3);
      break;
    }
    case 'monster': {
      // the bed: dark floor, a roll bar across it, a spare balloon tyre lying in it
      const bi = W * 0.25;
      const x0 = 5;
      const x1 = geo.bootX - 1.5;
      g.fillStyle = '#1f1b16';
      g.fillRect(x0, bi + 2.5, x1 - x0, W - 2 * bi - 5);
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.strokeRect(x0, bi + 2.5, x1 - x0, W - 2 * bi - 5);
      const r = (W - 2 * bi) * 0.3;
      g.fillStyle = '#121110';
      g.beginPath();
      g.arc(x0 + (x1 - x0) * 0.42, W / 2, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,140,120,0.55)';
      g.lineWidth = 0.8;
      g.stroke();
      g.fillStyle = '#4a453e';
      g.beginPath();
      g.arc(x0 + (x1 - x0) * 0.42, W / 2, r * 0.45, 0, Math.PI * 2);
      g.fill();
      steel(g, x1 - 4, bi + 1, 2.4, W - 2 * bi - 2, '#2a2622');
      break;
    }
    case 'plough': {
      // the sand box: steel sides, a heap of grit, the spreader at its tail; the chassis rails to the cab
      const box1 = L * 0.72;
      g.fillStyle = '#4a453d';
      g.fillRect(1.5, 1.5, box1 - 1.5, W - 3);
      g.fillStyle = '#7d6e55';
      g.beginPath();
      g.ellipse(box1 * 0.5, W / 2, box1 * 0.42, W * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 120; i++) {
        const h = hash32(i * 613 + 5);
        g.fillStyle = (h >>> 12) & 1 ? 'rgba(30,24,18,0.35)' : 'rgba(220,206,176,0.3)';
        g.fillRect(box1 * (0.1 + ((h & 0xff) / 255) * 0.8), W * (0.2 + (((h >>> 8) & 0xff) / 255) * 0.6), 1, 1);
      }
      g.strokeStyle = INK;
      g.lineWidth = 0.8;
      g.beginPath();
      for (let x = 10; x < box1 - 4; x += 12) {
        g.moveTo(x, 1.5);
        g.lineTo(x, 4.5);
        g.moveTo(x, W - 1.5);
        g.lineTo(x, W - 4.5);
      }
      g.stroke();
      g.strokeRect(4.5, 4.5, box1 - 7.5, W - 9);
      steel(g, box1, W * 0.25, L * 0.755 - box1, 2.5, '#1d1a15');
      steel(g, box1, W * 0.75 - 2.5, L * 0.755 - box1, 2.5, '#1d1a15');
      break;
    }
    case 'niva':
      // the bonnet's raised centre and the black plastic arches
      g.strokeStyle = 'rgba(10,8,6,0.5)';
      g.lineWidth = 0.8;
      g.strokeRect(geo.bonnetX + 2, W * 0.3, L - geo.bonnetX - 5, W * 0.4);
      break;
    default:
      break;
  }
}

/** What sits on the roof: the rally scoop, the estate's rails, the van's ladder, the hatch's spoiler. */
function roofFeatures(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { W } = geo;
  const [rx, ry, rw, rh] = geo.roof;
  switch (def.shape) {
    case 'rally': {
      g.fillStyle = '#1a1712';
      const r0 = rx + rw * 0.62;
      const r1 = rx + rw * 0.92;
      poly(g, [[r0, W * 0.4], [r1, W * 0.35], [r1, W * 0.65], [r0, W * 0.6]]);
      g.fill();
      g.strokeStyle = 'rgba(255,236,204,0.3)';
      g.lineWidth = 0.6;
      g.stroke();
      break;
    }
    case 'estate':
      // roof rails the length of the long flat roof, on feet
      for (const y of [ry + 0.6, ry + rh - 2.4]) {
        steel(g, rx + 2, y, rw - 4, 1.8, '#3a362f');
        g.fillStyle = INK;
        g.fillRect(rx + 2, y - 0.4, 2, 2.6);
        g.fillRect(rx + rw - 4, y - 0.4, 2, 2.6);
      }
      // two cross bars
      g.fillStyle = '#2a2622';
      g.fillRect(rx + rw * 0.25, ry + 1, 1.4, rh - 2);
      g.fillRect(rx + rw * 0.55, ry + 1, 1.4, rh - 2);
      break;
    case 'van': {
      // a ladder along one side of the roof, a vent behind the cab
      const x0 = rx + 3;
      const x1 = rx + rw * 0.58;
      const y0 = ry + 1;
      const y1 = ry + rh * 0.36;
      g.strokeStyle = INK;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y0);
      g.moveTo(x0, y1);
      g.lineTo(x1, y1);
      for (let x = x0 + 1; x <= x1; x += 4.5) {
        g.moveTo(x, y0);
        g.lineTo(x, y1);
      }
      g.stroke();
      g.strokeStyle = '#a49e8e';
      g.lineWidth = 1.1;
      g.stroke();
      steel(g, rx + rw * 0.66, W * 0.62, 6, 6, '#3a362f');
      break;
    }
    case 'microcar': {
      // a whip aerial taller than the car, bent back by the wind, a big orange flag on it: the one bit of pride it has
      const ax = rx + rw * 0.12;
      const ay = ry + rh - 1.5;
      g.strokeStyle = INK;
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(ax, ay);
      g.quadraticCurveTo(ax - 8, ay + 2, ax - 16, ay + 3);
      g.stroke();
      g.fillStyle = '#d06a2a';
      poly(g, [[ax - 9, ay + 2.3], [ax - 16, ay + 3], [ax - 15, ay + 9], [ax - 8, ay + 7]]);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.5;
      g.stroke();
      break;
    }
    case 'bus': {
      // a roof rack over the back third, loaded: suitcases, skis, a milk can; two hatches ahead of it
      const x0 = rx + 2;
      const x1 = rx + rw * 0.36;
      g.strokeStyle = '#a49e8e';
      g.lineWidth = 1;
      g.strokeRect(x0, ry + 1.5, x1 - x0, rh - 3);
      g.beginPath();
      for (let x = x0 + 5; x < x1; x += 5) {
        g.moveTo(x, ry + 1.5);
        g.lineTo(x, ry + rh - 1.5);
      }
      g.stroke();
      const bags: [number, number, number, number, string][] = [
        [x0 + 3, ry + 3, 14, 9, '#6a4a2c'],
        [x0 + 4, ry + 13, 11, 8, '#3c4a3a'],
        [x0 + 20, ry + 4, 9, 12, '#8a6a3a'],
        [x0 + 32, ry + 14, 13, 8, '#5a3a2a'],
      ];
      for (const [bx, by, bw, bh, col] of bags) steel(g, bx, by, bw, bh, col);
      g.fillStyle = '#c8c0a8';
      g.beginPath();
      g.arc(x0 + 38, ry + 7, 3.2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.6;
      g.stroke();
      // the skis, a pair longer than the rack
      g.fillStyle = '#b8321e';
      g.fillRect(x0 - 2, ry + rh - 6, x1 - x0 + 6, 1.2);
      g.fillRect(x0 - 2, ry + rh - 4.2, x1 - x0 + 6, 1.2);
      for (const hx of [rx + rw * 0.45, rx + rw * 0.8]) steel(g, hx, W / 2 - 4, 8, 8, '#3a362f');
      break;
    }
    case 'monster':
      // a light bar across the roof's front edge: five lamps
      steel(g, rx + rw - 3.5, ry - 1, 3, rh + 2, '#1d1a15');
      g.fillStyle = '#efe4b8';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(rx + rw - 2, ry + ((i + 0.5) / 5) * rh, 1.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'plough':
      // the amber beacon on the cab
      g.fillStyle = '#e09a2a';
      g.beginPath();
      g.arc(rx + rw * 0.25, ry + rh * 0.2, 2.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.7;
      g.stroke();
      g.fillStyle = 'rgba(255,240,200,0.7)';
      g.fillRect(rx + rw * 0.25 - 1, ry + rh * 0.2 - 1.4, 1, 1);
      break;
    case 'niva':
      // a roof rack with a jerrycan
      steel(g, rx + 2, ry + 1, rw * 0.5, rh - 2, '#2a2622');
      steel(g, rx + 4, ry + rh * 0.55, 8, rh * 0.3, '#3c5a2e');
      break;
    default:
      break;
  }
}

/** The number: a scuffed white disc on the roof, as big as the roof allows. */
function roofNumber(g: CanvasRenderingContext2D, def: CarDef, geo: Geo, old: boolean): void {
  if (!def.number) return;
  const { W } = geo;
  const [rx, , rw, rh] = geo.roof;
  const at = def.shape === 'rally' ? 0.3 : def.shape === 'van' ? 0.8 : def.shape === 'bus' ? 0.66 : def.shape === 'estate' || def.shape === 'niva' ? 0.62 : 0.5;
  const r = Math.min(rh * 0.42, rw * 0.42, 11);
  const cx = rx + rw * at;
  const cy = W / 2;
  g.fillStyle = old ? '#cfc7b2' : '#eae3d0';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.stroke();
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#16130f';
  const digits = String(def.number).length;
  g.font = `900 ${Math.round(r * (digits > 1 ? 1.15 : 1.5))}px "Arial Black", "Arial Narrow", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(def.number), 0, r * 0.06);
  g.restore();
}

/** Off the tail: the wing, the lip, the barn doors, the slow-vehicle triangle, the big bumpers. */
function tailFeatures(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { L, W } = geo;
  switch (def.shape) {
    case 'rally':
      // a big wing on endplates, wider than the car
      g.fillStyle = INK;
      g.fillRect(2, W * 0.3, 3, 1.4);
      g.fillRect(2, W * 0.7 - 1.4, 3, 1.4);
      steel(g, -6, -3, 7, W + 6, '#1d1a15');
      g.fillStyle = '#16130f';
      g.fillRect(-6.5, -3.5, 8, 1.6);
      g.fillRect(-6.5, W + 1.9, 8, 1.6);
      break;
    case 'coupe':
      steel(g, -1, W * 0.12, 3, W * 0.76, '#1a1712');
      break;
    case 'hatch':
      // a roof spoiler over the tailgate
      steel(g, geo.roof[0] - 3, W * 0.16, 3.5, W * 0.68, '#1a1712');
      break;
    case 'saloon':
    case 'estate':
      // big old bumpers, nose and tail, standing off the body
      steel(g, -1.6, W * 0.04, 2.6, W * 0.92, '#3c3933');
      steel(g, L - 1, W * 0.04, 2.6, W * 0.92, '#3c3933');
      break;
    case 'van':
      // barn doors: the split down the middle, the hinges, a step
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, W / 2);
      g.lineTo(4, W / 2);
      g.stroke();
      g.fillStyle = '#8d877a';
      for (const y of [W * 0.08, W * 0.3, W * 0.66, W * 0.88]) g.fillRect(-0.8, y, 1.6, 2);
      steel(g, -2.4, W * 0.3, 2.4, W * 0.4, '#2a2622');
      break;
    case 'pickup':
      steel(g, -1.6, W * 0.06, 2.6, W * 0.88, '#3c3933');
      break;
    case 'microcar': {
      // the slow-vehicle triangle on its tail, red and orange, too big for it; mirrors on stalks
      const cy = W / 2;
      g.fillStyle = '#b8321e';
      poly(g, [[-2, cy - 8], [-2, cy + 8], [7, cy]]);
      g.fill();
      g.fillStyle = '#e07a2a';
      poly(g, [[-0.5, cy - 4.6], [-0.5, cy + 4.6], [4.6, cy]]);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.7;
      poly(g, [[-2, cy - 8], [-2, cy + 8], [7, cy]]);
      g.stroke();
      const mx = geo.screen[0][0] + 1;
      for (const s of [-1, 1]) {
        const y = s < 0 ? 0 : W;
        g.strokeStyle = INK;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(mx, y);
        g.lineTo(mx, y + s * 4);
        g.stroke();
        g.fillStyle = '#2a2622';
        g.beginPath();
        g.arc(mx, y + s * 5.2, 2, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    }
    case 'tractor': {
      // front weights stacked on the nose, the lamps on the hood's sides, and the stack
      const half = W * 0.19;
      steel(g, L - 2, W / 2 - half - 3, 5, half * 2 + 6, '#3a362f');
      g.fillStyle = 'rgba(10,8,6,0.6)';
      for (let y = W / 2 - half - 1.5; y < W / 2 + half + 2; y += 2.6) g.fillRect(L - 1.5, y, 4, 0.7);
      g.fillStyle = '#e4d6a4';
      g.fillRect(L - 9, W / 2 - half - 1.4, 3, 1.6);
      g.fillRect(L - 9, W / 2 + half - 0.2, 3, 1.6);
      const [sx, sy] = stackAt(def)!;
      const px = L / 2 + sx * SPRITE_PPM;
      const py = W / 2 + sy * SPRITE_PPM;
      g.fillStyle = '#8d877a';
      g.beginPath();
      g.arc(px, py, 2.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.stroke();
      g.fillStyle = '#0c0a08';
      g.beginPath();
      g.arc(px, py, 1.4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'monster': {
      // tube bumpers, and the coil-overs from the body out to every hub, yellow springs
      const bi = W * 0.25;
      steel(g, -1.5, bi + 1, 3, W - 2 * bi - 2, '#3c3933');
      steel(g, L - 1.5, bi + 1, 3, W - 2 * bi - 2, '#3c3933');
      const wh = wheelLayout(def);
      for (const x of [wh.rearX + wh.wl / 2, wh.frontX + wh.fwl / 2]) {
        for (const s of [1, -1]) {
          const y0 = s > 0 ? bi + 1 : W - bi - 1;
          const y1 = s > 0 ? wh.ww / 2 - wh.out : W - wh.ww / 2 + wh.out;
          g.strokeStyle = INK;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x, y0);
          g.lineTo(x, y1);
          g.stroke();
          g.strokeStyle = '#d8b02a';
          g.lineWidth = 1;
          g.beginPath();
          const n = 5;
          for (let i = 0; i <= n; i++) {
            const y = y0 + ((y1 - y0) * i) / n;
            g[i ? 'lineTo' : 'moveTo'](x + (i % 2 ? 1.6 : -1.6), y);
          }
          g.stroke();
          g.fillStyle = '#9a9486';
          g.beginPath();
          g.arc(x, y1, 2.2, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 0.7;
          g.stroke();
        }
      }
      g.fillStyle = '#e4d6a4';
      g.fillRect(L - 2.4, bi + 2, 2, 4);
      g.fillRect(L - 2.4, W - bi - 6, 2, 4);
      break;
    }
    case 'bus':
      // the ladder up the back to the rack, and the big bumpers
      steel(g, -1.6, W * 0.03, 2.6, W * 0.94, '#3c3933');
      steel(g, L - 1, W * 0.03, 2.6, W * 0.94, '#3c3933');
      g.strokeStyle = '#a49e8e';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(0.5, W * 0.62);
      g.lineTo(9, W * 0.62);
      g.moveTo(0.5, W * 0.76);
      g.lineTo(9, W * 0.76);
      for (let x = 1.5; x < 9; x += 2.4) {
        g.moveTo(x, W * 0.62);
        g.lineTo(x, W * 0.76);
      }
      g.stroke();
      break;
    case 'plough': {
      // the blade: an angled steel wing wider than the lorry, hazard stripes on its face, on a push frame
      const a: Pt = [L + 11.5, -11];
      const b: Pt = [L + 1.5, W + 11];
      const blade = polyPath([a, b, [b[0] - 5, b[1]], [a[0] - 5, a[1]]]);
      g.strokeStyle = INK;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(L - 1, W * 0.3);
      g.lineTo(L + 7, W * 0.3);
      g.moveTo(L - 1, W * 0.7);
      g.lineTo(L + 4.5, W * 0.7);
      g.stroke();
      g.strokeStyle = '#4a453d';
      g.lineWidth = 1.4;
      g.stroke();
      g.fillStyle = '#c9822e';
      g.fill(blade);
      g.save();
      g.clip(blade);
      g.fillStyle = '#16130f';
      for (let y = -12; y < W + 12; y += 7) {
        poly(g, [[L - 4, y], [L + 14, y - 4], [L + 14, y - 0.5], [L - 4, y + 3.5]]);
        g.fill();
      }
      g.restore();
      g.strokeStyle = INK;
      g.lineWidth = 1.1;
      g.stroke(blade);
      g.strokeStyle = 'rgba(255,236,204,0.5)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b);
      g.stroke();
      // the lamps on posts above the blade
      g.fillStyle = '#efe4b8';
      for (const y of [W * 0.12, W * 0.88]) {
        g.beginPath();
        g.arc(L - 1, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'hearse':
      // chrome bumpers, slim
      steel(g, -1.2, W * 0.06, 2, W * 0.88, '#8d877a');
      steel(g, L - 0.8, W * 0.06, 2, W * 0.88, '#8d877a');
      break;
    case 'niva': {
      // the spare standing on the back door, a tyre across the tail
      steel(g, -1.4, W * 0.06, 2.4, W * 0.88, '#2a2622');
      const d = W * 0.46;
      tyre(g, -5.6, W / 2 - d / 2, 5, d, 1);
      g.fillStyle = '#4a453e';
      g.fillRect(-4.2, W / 2 - 2, 2.2, 4);
      break;
    }
    default:
      break;
  }
}

/** Lamps: square on the old cars, round on the beetle, the rally car's pod. */
function lamps(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { L, W } = geo;
  // the machines carry their own, in tailFeatures
  if (def.shape === 'tractor' || def.shape === 'monster' || def.shape === 'plough') return;
  g.strokeStyle = INK;
  g.lineWidth = 0.6;
  if (def.shape === 'beetle') {
    const wh = wheelLayout(def);
    for (const y of [W * 0.12, W * 0.88]) {
      g.fillStyle = '#e8dcb0';
      g.beginPath();
      g.arc(wh.frontX + wh.wl + 1, y, 2.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#8a1e14';
    for (const y of [W * 0.14, W * 0.86]) {
      g.beginPath();
      g.arc(wh.rearX - 1.5, y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  g.fillStyle = '#e4d6a4';
  g.fillRect(L - 2.4, W * 0.1, 2.2, W * 0.17);
  g.fillRect(L - 2.4, W * 0.73, 2.2, W * 0.17);
  g.fillStyle = '#8a1e14';
  g.fillRect(0.2, W * 0.1, 1.8, W * 0.15);
  g.fillRect(0.2, W * 0.75, 1.8, W * 0.15);
  if (def.shape === 'rally') {
    // the four-lamp pod on the nose
    steel(g, L - 3.6, W * 0.18, 3, W * 0.64, '#22201b');
    g.fillStyle = '#efe4b8';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(L - 2.1, W * (0.26 + i * 0.16), 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** The machine gun on the bonnet: one barrel, a second, then the heavy pair on an ammo box. */
function guns(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { L, W } = geo;
  const x0 = geo.bonnetX - 2;
  const heavy = def.gun >= 3;
  const ys = def.gun >= 2 ? [W * 0.3, W * 0.7] : [W * 0.3];
  steel(g, x0, W * (def.gun >= 2 ? 0.22 : 0.22), 7, W * (def.gun >= 2 ? 0.56 : 0.16), '#34302a');
  if (heavy) steel(g, x0 - 1, W * 0.4, 6, W * 0.2, '#4a4a30');
  const bw = heavy ? 2.2 : 1.5;
  for (const y of ys) {
    g.fillStyle = INK;
    g.fillRect(x0 + 3, y - bw / 2 - 0.5, L - x0 + 1, bw + 1);
    g.fillStyle = '#3a362f';
    g.fillRect(x0 + 3, y - bw / 2, L - x0 + 1, bw);
    g.fillStyle = 'rgba(255,236,204,0.35)';
    g.fillRect(x0 + 3, y - bw / 2, L - x0 + 1, 0.5);
    g.fillStyle = '#121010';
    g.fillRect(L + 2.6, y - bw / 2 - 0.4, 1.8, bw + 0.8);
  }
}

/** The engine on the outside: a bonnet scoop, then a bigger one, then a blower through the bonnet. */
function scoop(g: CanvasRenderingContext2D, def: CarDef, geo: Geo, lvl: number): void {
  const { L, W } = geo;
  const cx = def.shape === 'van' || def.shape === 'microcar' || def.shape === 'bus' || def.shape === 'plough' ? geo.bonnetX - 3 : (geo.bonnetX + L) / 2;
  if (lvl >= 3) {
    // a blower: chrome body, two butterflies on top
    steel(g, cx - 5, W * 0.36, 10, W * 0.28, '#9a9486');
    g.fillStyle = '#16130f';
    g.fillRect(cx - 3.5, W * 0.4, 3, W * 0.2);
    g.fillRect(cx + 0.5, W * 0.4, 3, W * 0.2);
    return;
  }
  const w = lvl >= 2 ? 9 : 7;
  g.fillStyle = shade(def.colour, 0.75);
  poly(g, [[cx - w / 2, W * 0.4], [cx + w / 2, W * 0.36], [cx + w / 2, W * 0.64], [cx - w / 2, W * 0.6]]);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 0.8;
  g.stroke();
  g.fillStyle = '#121010';
  g.fillRect(cx + w / 2 - 1.6, W * 0.39, 1.6, W * 0.22);
}

/** The ram on the nose: a steel bar, then a bull bar, then a welded plough. */
function ramBar(g: CanvasRenderingContext2D, def: CarDef, geo: Geo): void {
  const { L, W } = geo;
  if (def.ram === 1) {
    steel(g, L, W * 0.05, 2.4, W * 0.9, STEEL_DARK);
    return;
  }
  if (def.ram === 2) {
    // a bull bar: a tube frame standing off the nose with uprights
    g.strokeStyle = INK;
    g.lineWidth = 2.6;
    const path = new Path2D();
    path.moveTo(L - 1, W * 0.08);
    path.lineTo(L + 3.5, W * 0.12);
    path.lineTo(L + 4.5, W * 0.5);
    path.lineTo(L + 3.5, W * 0.88);
    path.lineTo(L - 1, W * 0.92);
    for (const y of [0.3, 0.7]) {
      path.moveTo(L - 1, W * y);
      path.lineTo(L + 4.2, W * y);
    }
    g.stroke(path);
    g.strokeStyle = '#7a756a';
    g.lineWidth = 1.3;
    g.stroke(path);
    return;
  }
  // a plough: a welded wedge wider than the car, its seams and its lit edge
  const p = polyPath([[L - 1, -2], [L + 3, -2.5], [L + 8, W * 0.5], [L + 3, W + 2.5], [L - 1, W + 2]]);
  g.fillStyle = '#4a453d';
  g.fill(p);
  g.strokeStyle = INK;
  g.lineWidth = 1.2;
  g.stroke(p);
  g.strokeStyle = 'rgba(255,236,204,0.4)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(L + 3, -2.5);
  g.lineTo(L + 8, W * 0.5);
  g.lineTo(L + 3, W + 2.5);
  g.stroke();
  g.strokeStyle = 'rgba(20,16,12,0.6)';
  g.lineWidth = 0.5;
  g.beginPath();
  for (const y of [0.25, 0.5, 0.75]) {
    g.moveTo(L - 1, W * y);
    g.lineTo(L + 3 + 5 * (1 - Math.abs(y - 0.5) * 2), W * y);
  }
  g.stroke();
}

/**
 * The car as a picture, front wheels and all, for the garage and the
 * lineup: the race draws the front pair itself so they can steer.
 */
export function carPicture(def: CarDef, look: CarLook = {}): HTMLCanvasElement {
  const key = `pic:${carKey(def, look)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spr = carSprite(def, look);
  const c = document.createElement('canvas');
  c.width = spr.width;
  c.height = spr.height;
  const g = c.getContext('2d')!;
  g.scale(SPRITE_RES, SPRITE_RES);
  g.translate(PAD, PAD);
  const wh = wheelLayout(def);
  const W = def.width * SPRITE_PPM;
  tyre(g, wh.frontX, -wh.fout, wh.fwl, wh.fww, tyreLevel(def));
  tyre(g, wh.frontX, W - wh.fww + wh.fout, wh.fwl, wh.fww, tyreLevel(def));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(spr, 0, 0);
  cache.set(key, c);
  return c;
}

/**
 * The car's shadow for this heading: the body extruded along the sun at
 * its sill height and the cabin at its roof height, filled solid so the
 * renderer lays it at one alpha. Returned with where its corner sits in
 * the car's frame, metres. A van's stands long, a coupe's short.
 */
export function carShadow(def: CarDef, heading: number): { img: HTMLCanvasElement; x: number; y: number; w: number; h: number } {
  const bin = lightBin(heading);
  const key = `shadow:${def.shape}:${def.length}:${def.width}:${def.wheel ?? 1}:${def.tyres ?? 0}:${bin}`;
  const geo = geometry(def);
  const sun = localSun(bin);
  const reach = SPEC[def.shape].height * SHADOW_PER_M * SPRITE_PPM;
  const x0 = -PAD + Math.min(0, -sun.x * reach);
  const y0 = -PAD + Math.min(0, -sun.y * reach);
  const x1 = geo.L + PAD + Math.max(0, -sun.x * reach);
  const y1 = geo.W + PAD + Math.max(0, -sun.y * reach);
  const res = 2;
  let img = cache.get(key);
  if (!img) {
    img = document.createElement('canvas');
    img.width = Math.ceil((x1 - x0) * res);
    img.height = Math.ceil((y1 - y0) * res);
    const g = img.getContext('2d')!;
    g.fillStyle = SHADOW_INK;
    const sill = 0.75 * SHADOW_PER_M * SPRITE_PPM;
    // the van is a box to the roof: its whole body stands tall; a machine's wheels throw the low shadow
    const tall = BOXES.includes(def.shape) ? geo.body : geo.cabin;
    const low = geo.foot ?? geo.body;
    // stamped finely enough that the swept edge never shows steps
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      g.setTransform(res, 0, 0, res, (-x0 - sun.x * sill * k) * res, (-y0 - sun.y * sill * k) * res);
      g.fill(low);
      g.setTransform(res, 0, 0, res, (-x0 - sun.x * reach * k) * res, (-y0 - sun.y * reach * k) * res);
      g.fill(tall);
    }
    cache.set(key, img);
  }
  const k = 1 / SPRITE_PPM;
  return { img, x: x0 * k - def.length / 2, y: y0 * k - def.width / 2, w: (x1 - x0) * k, h: (y1 - y0) * k };
}

/**
 * Damage stages by the damage gauge: 0 clean, then 1 from DAMAGE_AT[0] and so
 * on. Each has to read at race zoom, where a car is about forty pixels long:
 * a mark smaller than a hand on the panel is not there. Stage 1 is a big dent
 * in a door, the rear bumper hanging off and a cracked lamp; 2 crumples the
 * bonnet and cracks the screen (the renderer adds a thin smoke trail); 3
 * buckles the body and loses a door (thick black smoke and sparks); 4 is soot
 * and a sprung boot, a wreck that still runs (fire under the bonnet).
 */
export const DAMAGE_AT = [10, 35, 60, 85];
/** the worst stage: what a wreck wears */
export const DAMAGE_WORST = DAMAGE_AT.length;

export function damageStage(damage: number): number {
  let n = 0;
  while (n < DAMAGE_AT.length && damage >= DAMAGE_AT[n]) n++;
  return n;
}

/**
 * The damage overlay, the same size as the car sprite. It peels like an
 * onion: each stage keeps the last stage's marks and adds its own. Sizes are
 * shares of the body, so a JM box and an A-class land yacht read the same.
 */
export function damageSprite(def: CarDef, stage: number): HTMLCanvasElement | null {
  if (stage <= 0) return null;
  const key = `dmg:${def.shape}:${def.length}:${def.width}:${def.wheel ?? 1}:${def.tyres ?? 0}:${stage}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = geometry(def);
  const { L, W } = geo;
  const c = document.createElement('canvas');
  c.width = Math.ceil((L + PAD * 2) * SPRITE_RES);
  c.height = Math.ceil((W + PAD * 2) * SPRITE_RES);
  const g = c.getContext('2d')!;
  g.scale(SPRITE_RES, SPRITE_RES);
  g.translate(PAD, PAD);
  const rnd = (i: number) => hash32(i * 2246822519 + Math.round(L * 7)) / 4294967296;
  // a crumple: a dark hollow pushed in from an edge, creased, with the lit lip of torn metal
  const crumple = (x: number, y: number, len: number, depth: number, side: 1 | -1) => {
    g.fillStyle = 'rgba(8,5,3,0.8)';
    g.beginPath();
    g.moveTo(x - len / 2, y);
    g.bezierCurveTo(x - len / 4, y + side * depth * 1.1, x + len / 4, y + side * depth * 1.1, x + len / 2, y);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,236,204,0.55)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(x - len / 2, y + side * 0.6);
    g.bezierCurveTo(x - len / 4, y + side * (depth * 1.1 + 0.6), x + len / 4, y + side * (depth * 1.1 + 0.6), x + len / 2, y + side * 0.6);
    g.stroke();
    // creases fanning from the deepest point
    g.strokeStyle = 'rgba(8,5,3,0.75)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (let k = -2; k <= 2; k++) {
      g.moveTo(x + k * len * 0.12, y + side * depth * 0.8);
      g.lineTo(x + k * len * 0.2, y + side * depth * 0.1);
    }
    g.stroke();
  };
  // a scrape to bare metal, rust at its root
  const scrape = (i: number) => {
    const x = rnd(100 + i * 3) * L * 0.8 + L * 0.1;
    const y = rnd(101 + i * 3) < 0.5 ? W * (0.08 + rnd(102 + i) * 0.12) : W * (0.8 + rnd(102 + i) * 0.12);
    g.strokeStyle = i % 3 === 0 ? 'rgba(120,64,30,0.8)' : 'rgba(196,190,176,0.75)';
    g.lineWidth = 0.9 + rnd(103 + i);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - L * (0.12 + rnd(104 + i) * 0.15), y + (rnd(105 + i) - 0.5) * 2);
    g.stroke();
  };
  // a lamp smashed: the glass gone dark and a starburst of cracks round it
  const lamp = (x: number, y: number) => {
    g.fillStyle = '#0c0a08';
    g.beginPath();
    g.arc(x, y, W * 0.07, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(240,240,232,0.9)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rnd(400 + k);
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * W * 0.13, y + Math.sin(a) * W * 0.13);
    }
    g.stroke();
  };

  g.save();
  g.clip(geo.body);
  // stage 1: a big dent in the near door, a cracked lamp, scrapes
  crumple(L * 0.5, 0, L * 0.4, W * 0.42, 1);
  for (let i = 0; i < 4; i++) scrape(i);
  lamp(L - W * 0.08, W * 0.18);
  if (stage >= 2) {
    // the bonnet crumpled: bands of crease across it, the nose pushed in
    const b0 = geo.bonnetX;
    const span = L - b0;
    g.fillStyle = 'rgba(8,5,3,0.4)';
    g.fillRect(L - span * 0.22, 0, span * 0.22, W);
    for (let k = 0; k < 4; k++) {
      const x = b0 + span * (0.2 + k * 0.2);
      g.strokeStyle = k % 2 ? 'rgba(255,236,204,0.5)' : 'rgba(8,5,3,0.75)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, W * 0.12);
      g.lineTo(x + span * 0.08, W * 0.35);
      g.lineTo(x - span * 0.04, W * 0.6);
      g.lineTo(x + span * 0.06, W * 0.88);
      g.stroke();
    }
    // the screen cracks from the impact
    const sx = (geo.screen[0][0] + geo.screen[1][0]) / 2;
    g.strokeStyle = 'rgba(230,236,230,0.85)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd(301 + i);
      const r = W * (0.15 + rnd(310 + i) * 0.2);
      g.moveTo(sx, W * 0.45);
      g.lineTo(sx + Math.cos(a) * r * 0.5 + 0.8, W * 0.45 + Math.sin(a) * r * 0.5);
      g.lineTo(sx + Math.cos(a) * r, W * 0.45 + Math.sin(a) * r);
    }
    g.stroke();
    crumple(L * 0.2, W, L * 0.26, W * 0.32, -1);
    for (let i = 4; i < 8; i++) scrape(i);
  }
  if (stage >= 3) {
    // the body buckled: a fold right across the roof, and the far door gone, the cabin open to the gravel
    g.strokeStyle = 'rgba(8,5,3,0.8)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(L * 0.42, 0);
    g.lineTo(L * 0.5, W * 0.45);
    g.lineTo(L * 0.44, W);
    g.stroke();
    g.strokeStyle = 'rgba(255,236,204,0.45)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(L * 0.44, 0);
    g.lineTo(L * 0.52, W * 0.45);
    g.lineTo(L * 0.46, W);
    g.stroke();
    const d0 = L * 0.4;
    const d1 = L * 0.62;
    g.fillStyle = '#16120e';
    g.fillRect(d0, W * 0.7, d1 - d0, W * 0.3 + 1);
    // the seat inside, and the bare edge of the opening
    g.fillStyle = '#4a3a2c';
    g.fillRect(d0 + (d1 - d0) * 0.2, W * 0.74, (d1 - d0) * 0.4, W * 0.14);
    g.strokeStyle = 'rgba(196,190,176,0.8)';
    g.lineWidth = 0.8;
    g.strokeRect(d0, W * 0.7, d1 - d0, W * 0.3 + 1);
    lamp(L - W * 0.08, W * 0.82);
    for (let i = 8; i < 12; i++) scrape(i);
  }
  if (stage >= 4) {
    // soot over the engine and the roof, the boot lid sprung open a hand
    const soot = g.createRadialGradient(L * 0.8, W / 2, 0, L * 0.8, W / 2, L * 0.55);
    soot.addColorStop(0, 'rgba(12,9,7,0.9)');
    soot.addColorStop(1, 'rgba(12,9,7,0.35)');
    g.fillStyle = soot;
    g.fillRect(0, 0, L, W);
    g.fillStyle = '#0c0a08';
    g.fillRect(geo.bootX - 1.5, W * 0.1, 2.5, W * 0.8);
  }
  g.restore();
  // outside the body: the rear bumper hanging off one corner, scraping the road
  g.strokeStyle = INK;
  g.lineWidth = 4.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(1, W * 0.12);
  g.lineTo(-W * 0.22, W * 0.62);
  g.stroke();
  g.strokeStyle = STEEL;
  g.lineWidth = 2.4;
  g.stroke();
  if (stage >= 3) {
    // and the front bumper half off the other way
    g.strokeStyle = INK;
    g.lineWidth = 4.2;
    g.beginPath();
    g.moveTo(L - 1, W * 0.9);
    g.lineTo(L + W * 0.2, W * 0.45);
    g.stroke();
    g.strokeStyle = STEEL;
    g.lineWidth = 2.4;
    g.stroke();
  }
  g.lineCap = 'butt';
  cache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- trees

/** Tree sprites are drawn at this radius in units and scaled to the tree's radius in metres. */
const TREE_R = 40;
const TREE_RES = 2;
/** the margin around a tree sprite, as a share of its radius */
export const TREE_SPAN = 1.1;

/** The sun's direction on the ground, toward the sun, for things that never turn. */
const SUN = { x: -SHADOW_X, y: -SHADOW_Y };

/** a hash as a fraction, 0 to 1 */
function frac(seed: number): number {
  return hash32(seed) / 4294967296;
}

/**
 * A ragged lobe: a clump of branch tips seen from above. The radius wanders
 * slowly round the lobe and every few points a tip pokes out or a gap cuts
 * in, unevenly, so no two lobes and no two sides of one lobe match.
 */
function lobe(p: Path2D, seed: number, x: number, y: number, r: number, n = 30): void {
  const w1 = frac(seed) * 6.3;
  const w2 = frac(seed + 1) * 6.3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w1;
    const h = frac(seed * 131 + i);
    const slow = 0.82 + 0.12 * Math.sin(a * 2 + w1) + 0.08 * Math.sin(a * 3 + w2);
    const tip = h > 0.72 ? 0.16 * (h - 0.72) / 0.28 : h < 0.2 ? -0.18 * (0.2 - h) / 0.2 : 0;
    const rr = r * (slow + tip);
    if (i) p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  p.closePath();
}

/** A crown tier: a few overlapping lobes round a centre, their union one ragged mass. */
function tier(seed: number, r: number, lobes: number, cx = 0, cy = 0): Path2D {
  const p = new Path2D();
  lobe(p, seed, cx, cy, r * 0.62, 26);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + frac(seed + 7) * 6.3 + (frac(seed * 3 + i) - 0.5) * 0.9;
    const d = r * (0.36 + frac(seed * 5 + i) * 0.18);
    const lr = r * (0.42 + frac(seed * 11 + i) * 0.2);
    lobe(p, seed * 17 + i, cx + Math.cos(a) * d, cy + Math.sin(a) * d, lr, 24);
  }
  return p;
}

function treeCanvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const S = TREE_R * TREE_SPAN;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(S * 2 * TREE_RES);
  const g = c.getContext('2d')!;
  g.scale(TREE_RES, TREE_RES);
  g.translate(S, S);
  return { c, g };
}

/**
 * rim() for a shape made of overlapping subpaths: an even-odd fill would
 * cut the overlaps into petals, so the strip is cut out on a scratch canvas
 * instead, the shape minus its shifted copy, and laid over in one go.
 */
let scratch: HTMLCanvasElement | null = null;
function unionRim(g: CanvasRenderingContext2D, shape: Path2D, dx: number, dy: number, style: string): void {
  const c = g.canvas;
  scratch ??= document.createElement('canvas');
  if (scratch.width !== c.width || scratch.height !== c.height) {
    scratch.width = c.width;
    scratch.height = c.height;
  }
  const s = scratch.getContext('2d')!;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, c.width, c.height);
  s.setTransform(g.getTransform());
  s.fillStyle = style;
  s.fill(shape);
  s.globalCompositeOperation = 'destination-out';
  s.translate(dx, dy);
  s.fillStyle = '#000';
  s.fill(shape);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(scratch, 0, 0);
  g.restore();
}

/** Spruce shape variants: shape, lobe count and how far the top tier sits off centre all change. */
export const SPRUCE_VARIANTS = 8;

/**
 * A spruce from above in a low sun: a soft, near-black mass with a ragged
 * edge, a darker core, the whorls only hinted, and the apex catching the
 * last light. Built from a few overlapping lobes per tier, never a star.
 */
export function spruceSprite(v: number): HTMLCanvasElement {
  const key = `spruce:${v}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = treeCanvas();
  const R = TREE_R;
  const seed = v * 977 + 31;
  // the apex leans a little off the trunk, so a stand is never a grid of bullseyes
  const ox = (frac(seed + 3) - 0.5) * R * 0.12 + SUN.x * R * 0.05;
  const oy = (frac(seed + 4) - 0.5) * R * 0.12 + SUN.y * R * 0.05;
  const tiers = [
    { r: R * (0.98 + frac(seed + 5) * 0.06), lobes: 5 + (v % 3), k: 0 },
    { r: R * 0.7, lobes: 4 + ((v >> 1) % 2), k: 0.45 },
    { r: R * 0.42, lobes: 3 + (v % 2), k: 0.8 },
  ];
  // a soft fringe first: the outer tier a touch larger and faint, so the edge never cuts clean
  const fringe = tier(seed + 99, tiers[0].r * 1.08, tiers[0].lobes + 1);
  g.fillStyle = 'rgba(16,20,14,0.45)';
  g.fill(fringe);
  tiers.forEach((t, i) => {
    const p = tier(seed + i * 13, t.r, t.lobes, ox * t.k, oy * t.k);
    g.fillStyle = PAL.spruce[i];
    g.fill(p);
    // the lit side is a dull olive and narrow; the far side drops into black
    unionRim(g, p, -SUN.x * t.r * 0.1, -SUN.y * t.r * 0.1, i === 0 ? 'rgba(58,66,40,0.5)' : 'rgba(74,82,48,0.55)');
    unionRim(g, p, SUN.x * t.r * 0.14, SUN.y * t.r * 0.14, 'rgba(0,0,0,0.5)');
    if (i < 2) {
      // the core between tiers sits in its own shade
      const gr = g.createRadialGradient(ox * t.k, oy * t.k, 0, ox * t.k, oy * t.k, t.r * 0.75);
      gr.addColorStop(0, 'rgba(4,6,4,0.55)');
      gr.addColorStop(1, 'rgba(4,6,4,0)');
      g.save();
      g.clip(p);
      g.fillStyle = gr;
      g.fill(p);
      g.restore();
    }
  });
  // whorls hinted: a few short broken arcs of lit tips on the sun side
  g.lineCap = 'round';
  g.lineWidth = 0.9;
  for (let i = 0; i < 7; i++) {
    const h = frac(seed * 7 + i);
    const rr = R * (0.5 + h * 0.4);
    const a0 = Math.atan2(SUN.y, SUN.x) + (frac(seed * 13 + i) - 0.5) * 2.2;
    g.strokeStyle = `rgba(80,88,52,${0.25 + h * 0.2})`;
    g.beginPath();
    g.arc(ox * 0.4, oy * 0.4, rr, a0, a0 + 0.25 + h * 0.3);
    g.stroke();
  }
  // the apex: a small lit clump toward the sun, not a dot
  const top = new Path2D();
  lobe(top, seed + 777, ox + SUN.x * 1.6, oy + SUN.y * 1.6, R * 0.12, 14);
  g.fillStyle = '#4e5434';
  g.fill(top);
  g.fillStyle = 'rgba(150,140,90,0.45)';
  g.beginPath();
  g.arc(ox + SUN.x * 2.6, oy + SUN.y * 2.6, 1.3, 0, Math.PI * 2);
  g.fill();
  cache.set(key, c);
  return c;
}

/** A birch from above: a pale trunk and limbs showing through a thin, yellowing crown. */
export function birchSprite(v: number): HTMLCanvasElement {
  const key = `birch:${v}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = treeCanvas();
  g.strokeStyle = PAL.birchBark;
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + v;
    const r = TREE_R * (0.55 + (hash32(v * 9 + i) / 4294967296) * 0.3);
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(Math.cos(a + 0.3) * r * 0.5, Math.sin(a + 0.3) * r * 0.5, Math.cos(a) * r, Math.sin(a) * r);
    g.stroke();
  }
  g.fillStyle = PAL.birchBark;
  g.beginPath();
  g.arc(0, 0, 3.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1814';
  g.fillRect(-2, -0.6, 2.2, 1.2);
  // the crown: loose clumps with gaps between them
  for (let i = 0; i < 26; i++) {
    const h = hash32(v * 1009 + i * 31);
    const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
    const rr = Math.sqrt(((h >>> 16) & 0xff) / 255) * TREE_R * 0.78;
    const cr = TREE_R * (0.13 + (((h >>> 24) & 0xff) / 255) * 0.12);
    const q = new Path2D();
    lobe(q, v * 77 + i, Math.cos(a) * rr, Math.sin(a) * rr, cr, 16);
    g.fillStyle = PAL.birchLeaf[(h >>> 4) & 3];
    g.fill(q);
    rim(g, q, -SUN.x * cr * 0.3, -SUN.y * cr * 0.3, 'rgba(200,180,110,0.4)');
    rim(g, q, SUN.x * cr * 0.25, SUN.y * cr * 0.25, 'rgba(20,16,8,0.45)');
  }
  cache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- roadside

/** Low props drawn every frame: a kilometre post, a reflector post, a round straw bale. */
export function propSprite(kind: 'km' | 'reflector' | 'bale'): { img: HTMLCanvasElement; size: number } {
  const key = `prop:${kind}`;
  const size = kind === 'bale' ? 1.6 : 0.6;
  const hit = cache.get(key);
  if (hit) return { img: hit, size };
  const res = 64;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(size / 2, size / 2);
  if (kind === 'bale') {
    // a round bale on its end: straw wound tight, lit on the sun side
    const r = 0.68;
    const disc = new Path2D();
    disc.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = '#a08a52';
    g.fill(disc);
    g.strokeStyle = 'rgba(70,56,30,0.55)';
    g.lineWidth = 0.025;
    g.beginPath();
    for (let a = 0; a < Math.PI * 14; a += 0.2) {
      const rr = (a / (Math.PI * 14)) * r;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.stroke();
    for (let i = 0; i < 60; i++) {
      const h = hash32(i * 31 + 5);
      const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
      const rr = (((h >>> 16) & 0xff) / 255) * r;
      g.fillStyle = (h >>> 24) & 1 ? 'rgba(200,180,120,0.5)' : 'rgba(60,46,24,0.4)';
      g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 0.08, 0.02);
    }
    rim(g, disc, -SUN.x * 0.12, -SUN.y * 0.12, 'rgba(240,220,160,0.45)');
    rim(g, disc, SUN.x * 0.14, SUN.y * 0.14, 'rgba(20,14,6,0.5)');
  } else if (kind === 'km') {
    // a pale post with a dark cap and the plate edge-on
    g.fillStyle = '#d8d0bc';
    g.fillRect(-0.09, -0.09, 0.18, 0.18);
    g.fillStyle = '#26221c';
    g.fillRect(-0.09, -0.09, 0.18, 0.06);
    g.fillStyle = '#c9b84a';
    g.fillRect(-0.26, 0.02, 0.52, 0.06);
  } else {
    // a reflector post: white, a black band, the amber eye
    g.fillStyle = '#d4ccb8';
    g.fillRect(-0.07, -0.07, 0.14, 0.14);
    g.fillStyle = '#1a1814';
    g.fillRect(-0.07, -0.07, 0.14, 0.05);
    g.fillStyle = '#e09020';
    g.fillRect(-0.03, 0.0, 0.06, 0.05);
  }
  cache.set(key, c);
  return { img: c, size };
}

// ---------------------------------------------------------------- air

/** A soft puff of dust or smoke, one per tint: drawn scaled and faded, never as hard circles. */
export function puffSprite(rgb: string): HTMLCanvasElement {
  const key = `puff:${rgb}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.45, `rgba(${rgb},0.55)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  cache.set(key, c);
  return c;
}

/** A headlight's throw: a warm wedge that fades with distance. Faces +x from the left edge's middle. */
export function coneSprite(): HTMLCanvasElement {
  const key = 'cone';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  // three wedges, wide and faint to narrow and brighter, so the throw has no hard edge
  for (const [spread, alpha] of [[64, 0.18], [44, 0.22], [26, 0.3]] as const) {
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, `rgba(255,226,170,${alpha})`);
    gr.addColorStop(0.6, `rgba(255,220,160,${alpha * 0.35})`);
    gr.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 60);
    g.lineTo(256, 64 - spread);
    g.lineTo(256, 64 + spread);
    g.lineTo(0, 68);
    g.closePath();
    g.fill();
  }
  cache.set(key, c);
  return c;
}

/** A fireball: white heat at the core, orange, then a dirty red edge. */
export function fireSprite(): HTMLCanvasElement {
  const key = 'fire';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,200,80,0.95)');
  gr.addColorStop(0.55, 'rgba(240,110,30,0.7)');
  gr.addColorStop(0.8, 'rgba(150,40,16,0.3)');
  gr.addColorStop(1, 'rgba(60,20,10,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  cache.set(key, c);
  return c;
}

/**
 * A tongue of flame: a stretched teardrop, white-yellow at the root, red
 * and gone at the tip. Points +x from its root at the left third; the
 * renderer layers several, flickering, leaned downwind.
 */
export function flameSprite(): HTMLCanvasElement {
  const key = 'flame';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.scale(2, 1);
  const gr = g.createRadialGradient(18, 32, 0, 22, 32, 30);
  gr.addColorStop(0, 'rgba(255,240,190,0.95)');
  gr.addColorStop(0.25, 'rgba(255,186,70,0.85)');
  gr.addColorStop(0.55, 'rgba(226,96,24,0.5)');
  gr.addColorStop(0.8, 'rgba(120,34,10,0.18)');
  gr.addColorStop(1, 'rgba(60,16,6,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  cache.set(key, c);
  return c;
}

/** metres across a pickup sprite, and how tall a pickup stands for its shadow */
export const PICKUP_SIZE = 1.5;
export const PICKUP_HEIGHT = 0.32;

/**
 * What lies on the road, each drawn as the thing it is: a jerrycan of
 * nitro, a bundle of notes, a wrench, a missile, a mine. Muted, worn,
 * lit from the one sun. The silhouette is kept apart so the renderer can
 * lay the hard shadow from the same shape.
 */
function pickupShape(kind: string): Path2D {
  const p = new Path2D();
  if (kind === 'nitro') {
    // a jerrycan lying flat: the body, the triple handle at one end, the spout
    p.rect(-0.42, -0.3, 0.84, 0.6);
    p.rect(0.42, -0.2, 0.14, 0.4);
    p.rect(-0.56, -0.07, 0.15, 0.14);
  } else if (kind === 'cash') {
    // a bundle of notes, a second bundle askew under it
    const a = new DOMMatrix().rotate(-14);
    const under = new Path2D();
    under.rect(-0.46, -0.22, 0.92, 0.44);
    p.addPath(under, a.translate(0.06, 0.14));
    p.rect(-0.46, -0.24, 0.92, 0.46);
  } else if (kind === 'wrench') {
    // an open-ended spanner: a bar and two jaws
    p.rect(-0.4, -0.085, 0.8, 0.17);
    p.moveTo(0.34, 0);
    p.arc(0.47, 0, 0.2, 0, Math.PI * 2);
    p.moveTo(-0.3, 0);
    p.arc(-0.47, 0, 0.18, 0, Math.PI * 2);
  } else if (kind === 'oil') {
    // an oil can lying on its side: a drum with a spout off one end
    p.rect(-0.4, -0.28, 0.72, 0.56);
    p.rect(0.32, -0.08, 0.26, 0.16);
    p.rect(-0.1, -0.4, 0.18, 0.12);
  } else if (kind === 'missile') {
    // a tube with an ogive nose and four fins seen from above as two
    p.moveTo(-0.55, -0.1);
    p.lineTo(0.38, -0.1);
    p.quadraticCurveTo(0.62, -0.08, 0.66, 0);
    p.quadraticCurveTo(0.62, 0.08, 0.38, 0.1);
    p.lineTo(-0.55, 0.1);
    p.closePath();
    p.moveTo(-0.55, -0.1);
    p.lineTo(-0.66, -0.28);
    p.lineTo(-0.4, -0.1);
    p.closePath();
    p.moveTo(-0.55, 0.1);
    p.lineTo(-0.66, 0.28);
    p.lineTo(-0.4, 0.1);
    p.closePath();
  } else {
    // a mine: a squat drum with a pressure plate and a carry handle
    p.arc(0, 0, 0.42, 0, Math.PI * 2);
    p.moveTo(0.42, 0);
    p.rect(0.36, -0.06, 0.16, 0.12);
  }
  return p;
}

function pickupCanvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const res = 56;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(PICKUP_SIZE * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(PICKUP_SIZE / 2, PICKUP_SIZE / 2);
  return { c, g };
}

/** the turns a pickup can lie at on the road, so its shadow can be baked per turn */
export const PICKUP_TURNS = [-0.45, -0.15, 0.15, 0.45];
/** metres across a pickup's shadow sprite: the pickup and the length of its shadow */
export const PICKUP_SHADOW_SIZE = PICKUP_SIZE + 1.2;

/**
 * The pickup's shadow for one of its turns: the silhouette swept along the
 * sun up to its height, in solid ink, so the renderer lays it once at the
 * shadow alpha and it never doubles. Drawn in the pickup's own frame, so
 * the sweep runs against the turn.
 */
export function pickupShadow(kind: string, turn: number): HTMLCanvasElement {
  const key = `pickup-shadow:${kind}:${turn}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = 56;
  const S = PICKUP_SHADOW_SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(S * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(S / 2, S / 2);
  const a = PICKUP_TURNS[turn];
  const len = PICKUP_HEIGHT * SHADOW_PER_M;
  const dx = (SHADOW_X * Math.cos(-a) - SHADOW_Y * Math.sin(-a)) * len;
  const dy = (SHADOW_X * Math.sin(-a) + SHADOW_Y * Math.cos(-a)) * len;
  const shape = pickupShape(kind);
  g.fillStyle = SHADOW_INK;
  for (let i = 0; i <= 8; i++) {
    g.save();
    g.translate((dx * i) / 8, (dy * i) / 8);
    g.fill(shape);
    g.restore();
  }
  cache.set(key, c);
  return c;
}

export function pickupSprite(kind: string): HTMLCanvasElement {
  const key = `pickup:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = pickupCanvas();
  const shape = pickupShape(kind);
  const lit = (style: string, k = 0.05) => rim(g, shape, SUN.x * k, SUN.y * k, style);
  const dark = (k = 0.06) => rim(g, shape, -SUN.x * k, -SUN.y * k, 'rgba(0,0,0,0.5)');
  g.lineCap = 'round';
  if (kind === 'nitro') {
    g.fillStyle = '#5b5a3c';
    g.fill(shape);
    // the pressed X and the rim seam
    g.strokeStyle = 'rgba(20,18,10,0.45)';
    g.lineWidth = 0.035;
    g.beginPath();
    g.moveTo(-0.34, -0.22);
    g.lineTo(0.3, 0.22);
    g.moveTo(-0.34, 0.22);
    g.lineTo(0.3, -0.22);
    g.stroke();
    g.strokeStyle = 'rgba(210,200,160,0.25)';
    g.strokeRect(-0.38, -0.26, 0.76, 0.52);
    // a faded blue band: what is in it
    g.fillStyle = faded('#4a8ab0', 0.35);
    g.fillRect(-0.12, -0.3, 0.1, 0.6);
    // paint worn off the edges
    g.fillStyle = 'rgba(120,110,90,0.5)';
    g.fillRect(0.3, -0.3, 0.12, 0.05);
    g.fillRect(-0.42, 0.18, 0.06, 0.12);
    g.fillStyle = '#2c2a20';
    g.fillRect(-0.56, -0.07, 0.15, 0.14);
  } else if (kind === 'cash') {
    g.fillStyle = '#7d8064';
    g.fill(shape);
    // note edges along the bundle, the paper band across it
    g.strokeStyle = 'rgba(40,44,30,0.4)';
    g.lineWidth = 0.02;
    g.beginPath();
    for (let y = -0.18; y < 0.22; y += 0.08) {
      g.moveTo(-0.44, y);
      g.lineTo(0.44, y);
    }
    g.stroke();
    g.fillStyle = '#c9bc96';
    g.fillRect(-0.08, -0.24, 0.16, 0.46);
    g.fillStyle = 'rgba(60,50,30,0.5)';
    g.fillRect(-0.03, -0.1, 0.06, 0.18);
  } else if (kind === 'wrench') {
    g.fillStyle = '#7c7a72';
    g.fill(shape);
    // the jaws cut open, a dull sheen along the bar
    g.fillStyle = '#2e2b24';
    g.fillRect(0.52, -0.08, 0.2, 0.16);
    g.beginPath();
    g.arc(-0.47, 0, 0.08, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(230,220,200,0.3)';
    g.fillRect(-0.32, -0.08, 0.64, 0.04);
    g.fillStyle = 'rgba(110,60,30,0.45)';
    g.fillRect(0.05, -0.085, 0.12, 0.17);
  } else if (kind === 'oil') {
    g.fillStyle = '#4a4238';
    g.fill(shape);
    // the drum's ribs, a faded label, and the oil it has leaked onto itself
    g.strokeStyle = 'rgba(15,12,8,0.5)';
    g.lineWidth = 0.025;
    g.beginPath();
    for (const x of [-0.3, 0.2]) {
      g.moveTo(x, -0.28);
      g.lineTo(x, 0.28);
    }
    g.stroke();
    g.fillStyle = faded('#c8a030', 0.4);
    g.fillRect(-0.22, -0.16, 0.34, 0.32);
    g.fillStyle = 'rgba(10,8,6,0.55)';
    g.fillRect(0.4, -0.04, 0.18, 0.08);
  } else if (kind === 'missile') {
    g.fillStyle = '#6a6a58';
    g.fill(shape);
    g.fillStyle = '#3a3a30';
    g.fillRect(-0.55, -0.1, 0.12, 0.2);
    // a yellow band, faded, and the stencil dash behind the nose
    g.fillStyle = faded('#c8a030', 0.35);
    g.fillRect(0.24, -0.1, 0.06, 0.2);
    g.fillStyle = 'rgba(220,210,180,0.35)';
    g.fillRect(-0.3, -0.02, 0.3, 0.04);
  } else {
    g.fillStyle = '#4c4c3a';
    g.fill(shape);
    g.strokeStyle = 'rgba(15,14,10,0.6)';
    g.lineWidth = 0.035;
    g.beginPath();
    g.arc(0, 0, 0.3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#3a3a2c';
    g.beginPath();
    g.arc(0, 0, 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200,190,150,0.3)';
    g.beginPath();
    g.arc(-0.04, -0.04, 0.07, 0, Math.PI * 2);
    g.fill();
  }
  lit('rgba(255,236,200,0.38)');
  dark();
  cache.set(key, c);
  return c;
}
