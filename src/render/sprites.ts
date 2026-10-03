/**
 * Procedural sprites, drawn once with canvas paths at a fixed pixel scale
 * and cached. The car faces +x; the renderer rotates it.
 */
import type { CarDef } from '../game/types';

const cache = new Map<string, HTMLCanvasElement>();

/** pixels per metre inside the sprite; the renderer scales it to the view */
export const SPRITE_PPM = 24;

export function carSprite(def: CarDef): HTMLCanvasElement {
  const key = `car:${def.id}:${def.colour}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const L = def.length * SPRITE_PPM;
  const W = def.width * SPRITE_PPM;
  const pad = 6;
  const c = document.createElement('canvas');
  c.width = Math.ceil(L + pad * 2);
  c.height = Math.ceil(W + pad * 2);
  const g = c.getContext('2d')!;
  g.translate(pad, pad);
  // wheels
  g.fillStyle = '#1a1612';
  const wl = L * 0.2;
  const ww = W * 0.22;
  for (const [x, y] of [[L * 0.14, -ww * 0.45], [L * 0.14, W - ww * 0.55], [L * 0.68, -ww * 0.45], [L * 0.68, W - ww * 0.55]]) {
    rounded(g, x, y, wl, ww, 2);
    g.fill();
  }
  // body
  const body = g.createLinearGradient(0, 0, 0, W);
  body.addColorStop(0, shade(def.colour, 1.25));
  body.addColorStop(0.5, def.colour);
  body.addColorStop(1, shade(def.colour, 0.7));
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(L * 0.02, W * 0.18);
  g.quadraticCurveTo(L * 0.02, 0, L * 0.12, 0);
  g.lineTo(L * 0.9, 0);
  g.quadraticCurveTo(L, 0, L, W * 0.2);
  g.lineTo(L, W * 0.8);
  g.quadraticCurveTo(L, W, L * 0.9, W);
  g.lineTo(L * 0.12, W);
  g.quadraticCurveTo(L * 0.02, W, L * 0.02, W * 0.82);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.5;
  g.stroke();
  // glass: windscreen toward the nose, rear window at the tail
  g.fillStyle = '#1d2a33';
  rounded(g, L * 0.55, W * 0.1, L * 0.16, W * 0.8, 3);
  g.fill();
  rounded(g, L * 0.2, W * 0.12, L * 0.11, W * 0.76, 3);
  g.fill();
  // roof
  g.fillStyle = shade(def.colour, 1.1);
  rounded(g, L * 0.32, W * 0.08, L * 0.22, W * 0.84, 3);
  g.fill();
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
  // layered canopy, offset to the light from the top-left
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
