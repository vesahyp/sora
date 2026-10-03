/**
 * Procedural sprites, drawn once with canvas paths at a fixed pixel scale
 * and cached. The car faces +x; the renderer rotates it. Three bodies:
 * the hatchback is short and boxy with a big rear window, the coupe is
 * long and low with a sloped screen and a lip spoiler, the rally car is
 * wide with a roof vent, a wing, fog lights and mud flaps.
 */
import type { CarDef } from '../game/types';

const cache = new Map<string, HTMLCanvasElement>();

/** pixels per metre inside the sprite; the renderer scales it to the view */
export const SPRITE_PPM = 24;

export function carSprite(def: CarDef): HTMLCanvasElement {
  const key = `car:${def.shape}:${def.length}:${def.width}:${def.colour}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const L = def.length * SPRITE_PPM;
  const W = def.width * SPRITE_PPM;
  const pad = 8;
  const c = document.createElement('canvas');
  c.width = Math.ceil(L + pad * 2);
  c.height = Math.ceil(W + pad * 2);
  const g = c.getContext('2d')!;
  g.translate(pad, pad);
  const shape = def.shape;

  // wheels: the rally car's stick out and carry mud flaps
  g.fillStyle = '#1a1612';
  const wl = L * (shape === 'coupe' ? 0.19 : 0.2);
  const ww = W * (shape === 'rally' ? 0.3 : 0.22);
  const out = shape === 'rally' ? ww * 0.6 : ww * 0.45;
  const front = shape === 'coupe' ? 0.72 : 0.68;
  for (const [x, y] of [[L * 0.12, -out], [L * 0.12, W - ww + out], [L * front, -out], [L * front, W - ww + out]]) {
    rounded(g, x, y, wl, ww, 2);
    g.fill();
  }
  if (shape === 'rally') {
    g.fillStyle = '#2a2420';
    for (const y of [-out - 1, W + out - 2]) {
      g.fillRect(L * 0.08, y, 3, 3);
      g.fillRect(L * 0.64, y, 3, 3);
    }
  }

  // body
  const body = g.createLinearGradient(0, 0, 0, W);
  body.addColorStop(0, shade(def.colour, 1.25));
  body.addColorStop(0.5, def.colour);
  body.addColorStop(1, shade(def.colour, 0.7));
  g.fillStyle = body;
  g.beginPath();
  if (shape === 'coupe') {
    // a long nose that narrows, a tail that tucks in
    g.moveTo(L * 0.02, W * 0.2);
    g.quadraticCurveTo(L * 0.02, W * 0.04, L * 0.14, W * 0.04);
    g.lineTo(L * 0.8, 0);
    g.quadraticCurveTo(L, W * 0.06, L, W * 0.3);
    g.lineTo(L, W * 0.7);
    g.quadraticCurveTo(L, W * 0.94, L * 0.8, W);
    g.lineTo(L * 0.14, W * 0.96);
    g.quadraticCurveTo(L * 0.02, W * 0.96, L * 0.02, W * 0.8);
  } else if (shape === 'rally') {
    // boxy with flared arches
    g.moveTo(0, W * 0.14);
    g.quadraticCurveTo(0, 0, L * 0.1, 0);
    g.lineTo(L * 0.92, 0);
    g.quadraticCurveTo(L, 0, L, W * 0.14);
    g.lineTo(L, W * 0.86);
    g.quadraticCurveTo(L, W, L * 0.92, W);
    g.lineTo(L * 0.1, W);
    g.quadraticCurveTo(0, W, 0, W * 0.86);
  } else {
    g.moveTo(L * 0.02, W * 0.18);
    g.quadraticCurveTo(L * 0.02, 0, L * 0.12, 0);
    g.lineTo(L * 0.88, 0);
    g.quadraticCurveTo(L, 0, L, W * 0.24);
    g.lineTo(L, W * 0.76);
    g.quadraticCurveTo(L, W, L * 0.88, W);
    g.lineTo(L * 0.12, W);
    g.quadraticCurveTo(L * 0.02, W, L * 0.02, W * 0.82);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.5;
  g.stroke();

  // glass and roof
  g.fillStyle = '#1d2a33';
  if (shape === 'coupe') {
    // one long sloped screen, a small rear window, a short roof
    g.beginPath();
    g.moveTo(L * 0.5, W * 0.1);
    g.lineTo(L * 0.72, W * 0.16);
    g.lineTo(L * 0.72, W * 0.84);
    g.lineTo(L * 0.5, W * 0.9);
    g.closePath();
    g.fill();
    rounded(g, L * 0.26, W * 0.14, L * 0.08, W * 0.72, 3);
    g.fill();
    g.fillStyle = shade(def.colour, 1.1);
    rounded(g, L * 0.34, W * 0.1, L * 0.16, W * 0.8, 3);
    g.fill();
    // lip spoiler and a bonnet stripe
    g.fillStyle = '#1a1612';
    g.fillRect(0, W * 0.16, L * 0.035, W * 0.68);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(L * 0.74, W * 0.44, L * 0.24, W * 0.12);
  } else if (shape === 'rally') {
    rounded(g, L * 0.56, W * 0.08, L * 0.16, W * 0.84, 3);
    g.fill();
    rounded(g, L * 0.18, W * 0.1, L * 0.1, W * 0.8, 3);
    g.fill();
    g.fillStyle = shade(def.colour, 1.1);
    rounded(g, L * 0.3, W * 0.06, L * 0.24, W * 0.88, 3);
    g.fill();
    // roof vent, a big wing on struts, two fog lights, a number plate
    g.fillStyle = '#1a1612';
    rounded(g, L * 0.4, W * 0.36, L * 0.09, W * 0.28, 2);
    g.fill();
    g.fillStyle = shade(def.colour, 0.55);
    g.fillRect(L * 0.04, W * 0.12, L * 0.03, W * 0.76);
    g.fillStyle = '#1a1612';
    g.fillRect(-2, W * 0.06, L * 0.07, W * 0.88);
    g.fillStyle = '#fff3c0';
    g.fillRect(L * 0.95, W * 0.3, L * 0.05, W * 0.12);
    g.fillRect(L * 0.95, W * 0.58, L * 0.05, W * 0.12);
    g.fillStyle = '#f4f4f4';
    g.fillRect(L * 0.76, W * 0.38, L * 0.1, W * 0.24);
    g.fillStyle = '#1a1612';
    g.fillRect(L * 0.785, W * 0.44, L * 0.05, W * 0.12);
  } else {
    // a big rear window: the hatch
    rounded(g, L * 0.55, W * 0.1, L * 0.16, W * 0.8, 3);
    g.fill();
    rounded(g, L * 0.14, W * 0.1, L * 0.16, W * 0.8, 3);
    g.fill();
    g.fillStyle = shade(def.colour, 1.1);
    rounded(g, L * 0.32, W * 0.08, L * 0.22, W * 0.84, 3);
    g.fill();
    // a roof rack bar
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(L * 0.36, W * 0.1, 2, W * 0.8);
    g.fillRect(L * 0.5, W * 0.1, 2, W * 0.8);
  }
  // lights
  g.fillStyle = '#fff3c0';
  g.fillRect(L * 0.95, W * 0.08, L * 0.05, W * 0.2);
  g.fillRect(L * 0.95, W * 0.72, L * 0.05, W * 0.2);
  g.fillStyle = '#e02020';
  g.fillRect(0, W * 0.08, L * 0.04, W * 0.2);
  g.fillRect(0, W * 0.72, L * 0.04, W * 0.2);
  cache.set(key, c);
  return c;
}

export function treeSprite(kind: number): HTMLCanvasElement {
  const key = `tree:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const R = 32;
  const c = document.createElement('canvas');
  c.width = c.height = R * 2 + 4;
  const g = c.getContext('2d')!;
  g.translate(R + 2, R + 2);
  const dark = ['#15301a', '#1a3a1c', '#10281a', '#1e3a22'][kind];
  const light = ['#2b5a2a', '#356a2c', '#245232', '#3a6a30'][kind];
  g.fillStyle = dark;
  g.beginPath();
  g.arc(2, 2, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = light;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + kind;
    g.beginPath();
    g.arc(Math.cos(a) * R * 0.35 - 3, Math.sin(a) * R * 0.35 - 3, R * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,220,0.14)';
  g.beginPath();
  g.arc(-R * 0.3, -R * 0.3, R * 0.35, 0, Math.PI * 2);
  g.fill();
  cache.set(key, c);
  return c;
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}
