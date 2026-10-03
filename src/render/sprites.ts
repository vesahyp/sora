/**
 * Procedural sprites, drawn once with canvas paths and cached. The car
 * faces +x; the renderer rotates it. Three bodies that read apart at a
 * glance: the hatch is short and square with a big tailgate window, the
 * coupe is long and low with a long bonnet and a fastback, the rally car
 * is wide with flared arches, a roof scoop, a light pod and a wing.
 *
 * The sun never moves but the car turns under it, so a car is cached
 * once per sixteenth of a turn with its light baked for that heading:
 * the bright edge stays toward the sun whichever way the car points.
 * Damage is a separate overlay per stage, drawn over the lit body.
 */
import type { CarDef } from '../game/types';
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
/** drawing units of margin around the body */
const PAD = 10;
/** light bins per turn */
const LIGHT_BINS = 16;

export interface CarLook {
  /** the race number on the roof */
  number?: number;
  /** an opponent: paint sun-bleached */
  faded?: boolean;
  /** the heading the light is baked for, radians */
  heading?: number;
  /** which livery: twin stripes, side bands, a two-tone split */
  livery?: number;
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

interface Geo {
  L: number;
  W: number;
  body: Path2D;
  /** the greenhouse: screen, roof and rear window, the part that stands tall */
  cabin: Path2D;
  roof: [number, number, number, number];
  screen: [number, number][];
  rear: [number, number][];
  sideL: [number, number][];
  sideR: [number, number][];
  /** x of the bonnet seam and the boot seam */
  bonnetX: number;
  bootX: number;
}

/** The body: chamfered, never rounded, with the arches flared where the wheels sit. */
function geometry(def: CarDef): Geo {
  const L = def.length * SPRITE_PPM;
  const W = def.width * SPRITE_PPM;
  const shape = def.shape;
  const wh = wheelLayout(def);
  const inset = W * (shape === 'rally' ? 0.075 : shape === 'coupe' ? 0.03 : 0.04);
  const fl = 2.5;
  const nose = shape === 'coupe' ? [L * 0.05, W * 0.2] : shape === 'rally' ? [L * 0.03, W * 0.1] : [L * 0.025, W * 0.09];
  const tail = shape === 'coupe' ? [L * 0.04, W * 0.14] : [L * 0.025, W * 0.08];
  const ra0 = wh.rearX - 2;
  const ra1 = wh.rearX + wh.wl + 2;
  const fa0 = wh.frontX - 2;
  const fa1 = wh.frontX + wh.wl + 2;
  const top: [number, number][] = [
    [0, tail[1]],
    [tail[0], inset],
    [ra0, inset],
    [ra0 + fl, 0],
    [ra1 - fl, 0],
    [ra1, inset],
    [fa0, inset],
    [fa0 + fl, 0],
    [fa1 - fl, 0],
    [fa1, inset],
    [L - nose[0], inset],
    [L, nose[1]],
  ];
  const body = new Path2D();
  top.forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  for (let i = top.length - 1; i >= 0; i--) body.lineTo(top[i][0], W - top[i][1]);
  body.closePath();

  // the greenhouse in fractions of the length: bonnet seam, screen, roof, rear window
  const f =
    shape === 'coupe'
      ? { bonnet: 0.62, screen: 0.48, roofB: 0.36, rear: 0.12, wF: 0.15, wR: 0.22 }
      : shape === 'rally'
        ? { bonnet: 0.68, screen: 0.55, roofB: 0.27, rear: 0.17, wF: 0.12, wR: 0.17 }
        : { bonnet: 0.76, screen: 0.63, roofB: 0.15, rear: 0.06, wF: 0.12, wR: 0.13 };
  const g0 = inset + W * 0.06;
  const roof: [number, number, number, number] = [L * f.roofB, inset + W * 0.13, L * (f.screen - f.roofB), W - 2 * (inset + W * 0.13)];
  const screen: [number, number][] = [
    [L * f.screen, roof[1]],
    [L * f.bonnet, W * f.wF],
    [L * f.bonnet, W * (1 - f.wF)],
    [L * f.screen, roof[1] + roof[3]],
  ];
  const rear: [number, number][] = [
    [L * f.roofB, roof[1]],
    [L * f.rear, W * f.wR],
    [L * f.rear, W * (1 - f.wR)],
    [L * f.roofB, roof[1] + roof[3]],
  ];
  const sx0 = L * f.roofB + 3;
  const sx1 = L * f.screen - 2;
  const sideL: [number, number][] = [
    [sx0, g0],
    [sx1, g0],
    [sx1 - 2, roof[1] - 1],
    [sx0 + 1, roof[1] - 1],
  ];
  const sideR = sideL.map(([x, y]) => [x, W - y] as [number, number]);
  const cabin = polyPath([
    [L * f.rear, W * f.wR],
    [L * f.roofB, g0],
    [L * f.screen, g0],
    [L * f.bonnet, W * f.wF],
    [L * f.bonnet, W * (1 - f.wF)],
    [L * f.screen, W - g0],
    [L * f.roofB, W - g0],
    [L * f.rear, W * (1 - f.wR)],
  ]);
  return { L, W, body, cabin, roof, screen, rear, sideL, sideR, bonnetX: L * f.bonnet, bootX: L * f.rear };
}

function poly(g: CanvasRenderingContext2D | Path2D, pts: [number, number][]): void {
  if (!(g instanceof Path2D)) g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function polyPath(pts: [number, number][]): Path2D {
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

/** Livery per car: a second tone, dark on light paint and light on dark, and how it is laid. */
function livery(colour: string, k: number): { kind: 'twin' | 'band' | 'split'; tone: string } {
  const n = parseInt(colour.slice(1), 16);
  const kind = (['twin', 'band', 'split'] as const)[k % 3];
  const light = ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) > 500;
  return { kind, tone: light ? '#2c2a26' : '#d9d0ba' };
}

export function carSprite(def: CarDef, look: CarLook = {}): HTMLCanvasElement {
  const bin = lightBin(look.heading ?? -0.3);
  const key = `car:${def.shape}:${def.length}:${def.width}:${def.colour}:${look.number ?? 0}:${look.faded ? 1 : 0}:${look.livery ?? 0}:${bin}`;
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
  const shape = def.shape;
  const paint = look.faded ? faded(def.colour) : def.colour;
  const liv = livery(def.colour, look.livery ?? 0);
  const tone = look.faded ? faded(liv.tone, 0.25) : liv.tone;
  const wh = wheelLayout(def);

  // rear tyres: black and tired; the front pair turn, so the renderer draws them
  tyre(g, wh.rearX, -wh.out, wh.wl, wh.ww);
  tyre(g, wh.rearX, W - wh.ww + wh.out, wh.wl, wh.ww);
  if (shape === 'rally') {
    // mud flaps behind every wheel
    g.fillStyle = '#1c1915';
    for (const y of [-wh.out + 0.5, W + wh.out - 3.5]) {
      g.fillRect(wh.rearX - 3, y, 2, 3);
      g.fillRect(wh.frontX - 3, y, 2, 3);
    }
  }

  // paint
  g.fillStyle = paint;
  g.fill(body);
  g.save();
  g.clip(body);
  g.fillStyle = tone;
  if (liv.kind === 'twin') {
    g.fillRect(-2, W * 0.36, L + 4, W * 0.08);
    g.fillRect(-2, W * 0.56, L + 4, W * 0.08);
  } else if (liv.kind === 'band') {
    g.fillRect(-2, 0, L + 4, W * 0.17);
    g.fillRect(-2, W * 0.83, L + 4, W * 0.17);
  } else {
    // the front in the second tone, cut on a slant
    poly(g, [[L * 0.62, -2], [L + 4, -2], [L + 4, W + 2], [L * 0.5, W + 2]]);
    g.fill();
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
      const gr = g.createLinearGradient(0, side ? W : 0, 0, side ? W - W * 0.22 : W * 0.22);
      gr.addColorStop(0, 'rgba(78,62,40,0.85)');
      gr.addColorStop(1, 'rgba(78,62,40,0)');
      g.fillStyle = gr;
      g.fillRect(x, side ? W - W * 0.22 : 0, w, W * 0.22);
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
  g.strokeStyle = 'rgba(12,8,6,0.4)';
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(geo.bonnetX + 1, W * 0.12);
  g.lineTo(L - 2, W * 0.12);
  g.moveTo(geo.bonnetX + 1, W * 0.88);
  g.lineTo(L - 2, W * 0.88);
  g.moveTo(geo.bootX - 1, W * 0.14);
  g.lineTo(geo.bootX - 1, W * 0.86);
  for (const x of [geo.roof[0] + geo.roof[2] * 0.55, geo.roof[0] - 1]) {
    g.moveTo(x, 0.5);
    g.lineTo(x, 3);
    g.moveTo(x, W - 0.5);
    g.lineTo(x, W - 3);
  }
  g.stroke();

  if (shape === 'coupe') {
    // bonnet louvres and the pop-up lamp lids
    g.fillStyle = 'rgba(10,8,6,0.55)';
    for (let i = 0; i < 4; i++) g.fillRect(L * 0.74 + i * 2.2, W * 0.4, 1, W * 0.2);
    g.strokeStyle = 'rgba(10,8,6,0.5)';
    g.strokeRect(L * 0.9, W * 0.14, L * 0.07, W * 0.18);
    g.strokeRect(L * 0.9, W * 0.68, L * 0.07, W * 0.18);
  } else if (shape === 'rally') {
    // a bonnet vent and the four-lamp pod on the nose
    g.fillStyle = '#16130f';
    g.fillRect(L * 0.76, W * 0.38, L * 0.08, W * 0.24);
    g.fillStyle = '#22201b';
    g.fillRect(L * 0.955, W * 0.18, L * 0.04, W * 0.64);
    g.fillStyle = '#e8dcb0';
    for (let i = 0; i < 4; i++) g.fillRect(L * 0.962, W * (0.22 + i * 0.15), L * 0.026, W * 0.09);
  }

  // glass: dark, with the sky caught on the side toward the sun
  const glass = new Path2D();
  poly(glass, geo.screen);
  poly(glass, geo.rear);
  poly(glass, geo.sideL);
  poly(glass, geo.sideR);
  g.fillStyle = '#262d31';
  g.fill(glass);
  sunWash(g, glass, L * 0.45, W / 2, L * 0.3, sun, 0.4, 0.3);
  g.fillStyle = 'rgba(70,64,52,0.35)';
  g.fill(glass);
  // the roof: the highest panel, it catches the most light
  const roof = new Path2D();
  roof.rect(...geo.roof);
  g.fillStyle = shade(paint, 1.06);
  g.fill(roof);
  if (liv.kind === 'twin') {
    g.fillStyle = shade(tone, 1.04);
    g.fillRect(geo.roof[0], W * 0.36, geo.roof[2], W * 0.08);
    g.fillRect(geo.roof[0], W * 0.56, geo.roof[2], W * 0.08);
  }
  if (shape === 'hatch') {
    // roof rack bars
    g.fillStyle = '#1c1915';
    g.fillRect(geo.roof[0] + geo.roof[2] * 0.15, geo.roof[1] - 1, 1.6, geo.roof[3] + 2);
    g.fillRect(geo.roof[0] + geo.roof[2] * 0.8, geo.roof[1] - 1, 1.6, geo.roof[3] + 2);
  } else if (shape === 'rally') {
    // the roof scoop
    g.fillStyle = '#1a1712';
    const r0 = geo.roof[0] + geo.roof[2] * 0.62;
    const r1 = geo.roof[0] + geo.roof[2] * 0.9;
    poly(g, [[r0, W * 0.42], [r1, W * 0.38], [r1, W * 0.62], [r0, W * 0.58]]);
    g.fill();
  }
  // the race number: a scuffed white plate on the roof
  if (look.number) {
    const pw = Math.min(geo.roof[2] * 0.42, 11);
    const ph = Math.min(geo.roof[3] * 0.5, 12);
    const px = geo.roof[0] + geo.roof[2] * (shape === 'rally' ? 0.12 : 0.3);
    const py = W / 2 - ph / 2;
    g.fillStyle = look.faded ? '#c8c0ac' : '#e6dfcc';
    g.fillRect(px, py, pw, ph);
    g.save();
    g.translate(px + pw / 2, W / 2);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#16130f';
    g.font = `bold ${Math.round(ph * 0.75)}px "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(look.number), 0, 0.5);
    g.restore();
  }

  // light: a wash across the whole body, a bright edge toward the sun, a dark one away
  sunWash(g, body, L / 2, W / 2, Math.max(L, W) * 0.5, sun, 0.2, 0.38);
  rim(g, body, -sun.x * 1.6, -sun.y * 1.6, 'rgba(255,236,204,0.5)');
  rim(g, body, sun.x * 2.2, sun.y * 2.2, 'rgba(8,5,3,0.5)');
  rim(g, roof, -sun.x * 1.1, -sun.y * 1.1, 'rgba(255,240,214,0.45)');
  rim(g, roof, sun.x * 1.2, sun.y * 1.2, 'rgba(8,5,3,0.4)');
  g.strokeStyle = 'rgba(8,6,4,0.75)';
  g.lineWidth = 0.8;
  g.stroke(body);

  if (shape === 'rally') {
    // the wing on its struts, off the tail
    g.fillStyle = '#1a1712';
    g.fillRect(-3, -1, 5, W + 2);
    g.fillStyle = 'rgba(255,236,204,0.25)';
    g.fillRect(-3, -1, 5, 1);
  } else if (shape === 'coupe') {
    g.fillStyle = '#1a1712';
    g.fillRect(-0.5, W * 0.14, 2.4, W * 0.72);
  }
  // lamps: dull yellow headlights, dark red tails
  g.fillStyle = '#e4d6a4';
  g.fillRect(L - 2.2, W * 0.1, 2, W * 0.16);
  g.fillRect(L - 2.2, W * 0.74, 2, W * 0.16);
  g.fillStyle = '#8a1e14';
  g.fillRect(0, W * 0.1, 1.8, W * 0.16);
  g.fillRect(0, W * 0.74, 1.8, W * 0.16);
  cache.set(key, c);
  return c;
}

function tyre(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#121110';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(120,110,95,0.35)';
  for (let i = 1; i < 5; i++) g.fillRect(x + (w * i) / 5, y, 0.5, h);
}

/**
 * The car's shadow for this heading: the body extruded along the sun at
 * its sill height and the cabin at its roof height, filled solid so the
 * renderer lays it at one alpha. Returned with where its corner sits in
 * the car's frame, metres.
 */
export function carShadow(def: CarDef, heading: number): { img: HTMLCanvasElement; x: number; y: number; w: number; h: number } {
  const bin = lightBin(heading);
  const key = `shadow:${def.shape}:${def.length}:${def.width}:${bin}`;
  const geo = geometry(def);
  const sun = localSun(bin);
  const reach = 1.45 * SHADOW_PER_M * SPRITE_PPM;
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
    // stamped finely enough that the swept edge never shows steps
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      g.setTransform(res, 0, 0, res, (-x0 - sun.x * sill * k) * res, (-y0 - sun.y * sill * k) * res);
      g.fill(geo.body);
      g.setTransform(res, 0, 0, res, (-x0 - sun.x * reach * k) * res, (-y0 - sun.y * reach * k) * res);
      g.fill(geo.cabin);
    }
    cache.set(key, img);
  }
  const k = 1 / SPRITE_PPM;
  return { img, x: x0 * k - def.length / 2, y: y0 * k - def.width / 2, w: (x1 - x0) * k, h: (y1 - y0) * k };
}

/** Damage stages: 0 clean, then dents, then a cracked screen and torn paint, then a wreck in waiting. */
export function damageStage(damage: number): number {
  return damage < 22 ? 0 : damage < 48 ? 1 : damage < 72 ? 2 : 3;
}

/**
 * The damage overlay, the same size as the car sprite. It peels like an
 * onion: each stage keeps the last stage's marks and adds its own.
 */
export function damageSprite(def: CarDef, stage: number): HTMLCanvasElement | null {
  if (stage <= 0) return null;
  const key = `dmg:${def.shape}:${def.length}:${def.width}:${stage}`;
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
  g.save();
  g.clip(geo.body);
  const rnd = (i: number) => hash32(i * 2246822519) / 4294967296;
  // dents: a dark hollow with a lit lip, along the flanks and the corners
  for (let i = 0; i < stage * 4; i++) {
    const side = rnd(i * 5) < 0.5;
    const x = rnd(i * 5 + 1) * L;
    const y = side ? rnd(i * 5 + 2) * W * 0.25 : W - rnd(i * 5 + 2) * W * 0.25;
    const r = 2 + rnd(i * 5 + 3) * 3.5;
    const a = rnd(i * 5 + 4) * 3;
    g.fillStyle = 'rgba(10,6,4,0.45)';
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r, a, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,236,204,0.35)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.ellipse(x - 0.6, y - 0.6, r * 1.4, r, a, Math.PI * 0.9, Math.PI * 1.6);
    g.stroke();
  }
  // scrapes to the primer, rust where it has been bare a while
  for (let i = 0; i < stage * 6; i++) {
    const x = rnd(100 + i * 3) * L;
    const y = rnd(101 + i * 3) * W;
    g.strokeStyle = i % 3 === 0 ? 'rgba(110,60,30,0.7)' : 'rgba(150,145,130,0.6)';
    g.lineWidth = 0.7 + rnd(102 + i * 3);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rnd(103 + i) * 8, y + (rnd(104 + i) - 0.5) * 2);
    g.stroke();
  }
  if (stage >= 2) {
    // the screen cracks from a stone strike
    const sx = (geo.screen[0][0] + geo.screen[1][0]) / 2;
    const sy = W * (0.3 + rnd(300) * 0.3);
    g.strokeStyle = 'rgba(225,230,225,0.75)';
    g.lineWidth = 0.4;
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd(301 + i);
      const r = 3 + rnd(310 + i) * 5;
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a) * r * 0.5 + 0.6, sy + Math.sin(a) * r * 0.5);
      g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    g.stroke();
  }
  if (stage >= 3) {
    // a buckled bonnet, a lamp gone, soot round the engine
    g.strokeStyle = 'rgba(10,6,4,0.6)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(geo.bonnetX + 2, W * 0.2);
    for (let i = 1; i <= 6; i++) g.lineTo(geo.bonnetX + 2 + i * (L - geo.bonnetX) * 0.13, W * (0.2 + i * 0.1) + (i % 2 ? 2 : -2));
    g.stroke();
    const soot = g.createRadialGradient(L * 0.85, W / 2, 0, L * 0.85, W / 2, W * 0.6);
    soot.addColorStop(0, 'rgba(14,10,8,0.65)');
    soot.addColorStop(1, 'rgba(14,10,8,0)');
    g.fillStyle = soot;
    g.fillRect(geo.bonnetX - 4, 0, L, W);
    g.fillStyle = '#121010';
    g.fillRect(L - 3, W * 0.72, 3, W * 0.2);
  }
  g.restore();
  cache.set(key, c);
  return c;
}

/** Wheel size and where the pairs sit, in sprite units; the renderer scales by SPRITE_PPM. */
export function wheelLayout(def: CarDef): { wl: number; ww: number; out: number; frontX: number; rearX: number } {
  const L = def.length * SPRITE_PPM;
  const W = def.width * SPRITE_PPM;
  const wl = L * (def.shape === 'coupe' ? 0.16 : 0.17);
  const ww = W * (def.shape === 'rally' ? 0.2 : 0.16);
  const out = def.shape === 'rally' ? ww * 0.3 : ww * 0.15;
  const frontX = L * (def.shape === 'coupe' ? 0.72 : def.shape === 'hatch' ? 0.74 : 0.7);
  const rearX = L * (def.shape === 'hatch' ? 0.1 : 0.12);
  return { wl, ww, out, frontX, rearX };
}

// ---------------------------------------------------------------- trees

/** Tree sprites are drawn at this radius in units and scaled to the tree's radius in metres. */
const TREE_R = 40;
const TREE_RES = 2;
/** the margin around a tree sprite, as a share of its radius */
export const TREE_SPAN = 1.1;

/** The sun's direction on the ground, toward the sun, for things that never turn. */
const SUN = { x: -SHADOW_X, y: -SHADOW_Y };

/** A spiky star: a layer of spruce branches seen from above. */
function star(seed: number, r: number, n: number, inner: number): Path2D {
  const p = new Path2D();
  const rot = (hash32(seed) / 4294967296) * Math.PI * 2;
  for (let i = 0; i < n * 2; i++) {
    const h = hash32(seed * 131 + i) / 4294967296;
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * (inner + h * 0.12) : r * (0.84 + h * 0.2);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  p.closePath();
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

/** A spruce from above: near black, layered, its apex catching the last light. */
export function spruceSprite(v: number): HTMLCanvasElement {
  const key = `spruce:${v}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = treeCanvas();
  const layers = [
    { r: TREE_R, n: 13, inner: 0.55 },
    { r: TREE_R * 0.76, n: 11, inner: 0.5 },
    { r: TREE_R * 0.52, n: 9, inner: 0.48 },
    { r: TREE_R * 0.3, n: 7, inner: 0.45 },
  ];
  layers.forEach((l, i) => {
    const p = star(v * 17 + i, l.r, l.n, l.inner);
    g.fillStyle = PAL.spruce[i];
    g.fill(p);
    rim(g, p, -SUN.x * l.r * 0.16, -SUN.y * l.r * 0.16, i < 2 ? 'rgba(70,80,48,0.55)' : 'rgba(92,100,60,0.6)');
    rim(g, p, SUN.x * l.r * 0.12, SUN.y * l.r * 0.12, 'rgba(0,0,0,0.45)');
  });
  // the apex: a hard point of light toward the sun
  g.fillStyle = '#5c5e3a';
  g.beginPath();
  g.arc(SUN.x * 1.5, SUN.y * 1.5, 1.6, 0, Math.PI * 2);
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
    q.addPath(star(v * 77 + i, cr, 6, 0.62), new DOMMatrix().translate(Math.cos(a) * rr, Math.sin(a) * rr));
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

/** A pickup as a stencilled steel box with a coloured band, 1.6 m across. */
export function crateSprite(kind: string, colour: string): HTMLCanvasElement {
  const key = `crate:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = 48;
  const s = 1.6;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(s * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(s / 2, s / 2);
  const box = new Path2D();
  box.rect(-0.62, -0.62, 1.24, 1.24);
  g.fillStyle = '#3b382f';
  g.fill(box);
  g.fillStyle = faded(colour, 0.2);
  g.fillRect(-0.62, -0.62, 1.24, 0.3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 4; i++) g.fillRect(-0.62, -0.32 + i * 0.24, 1.24, 0.02);
  rim(g, box, -SUN.x * 0.08, -SUN.y * 0.08, 'rgba(255,236,204,0.4)');
  rim(g, box, SUN.x * 0.1, SUN.y * 0.1, 'rgba(0,0,0,0.5)');
  g.fillStyle = PAL.hud;
  g.font = 'bold 0.7px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText({ cash: '$', nitro: 'N', wrench: '+', missile: 'M', mine: 'X' }[kind] ?? '?', 0, 0.2);
  cache.set(key, c);
  return c;
}
