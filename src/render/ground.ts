import type { Track } from '../game/track';
import { hash32 } from '../game/rng';
import type { Scenery } from './scenery';
import { PAL, SHADOW_ALPHA, SHADOW_INK, SHADOW_PER_M, SHADOW_X, SHADOW_Y, faded } from './look';
import { carSprite, damageSprite, SPRITE_PX } from './sprites';
import { CARS } from '../game/content/cars';

/**
 * The ground, baked. The world is cut into square chunks; each chunk is
 * painted once, the first time the camera comes near it, with everything
 * on the ground that never moves: dry straw, bare earth, the ditch and
 * the verge, the gravel with its ruts and loose stones, the start line,
 * and the long shadows of every tree, post, pole, barn and spectator.
 * The barn, the power poles and the crowd stand beyond where a car can
 * reach, so they are baked in too. A frame then draws a few chunks with
 * drawImage and nothing else.
 */

/** metres a side */
const CHUNK = 16;
/** chunks kept; older ones are reused */
const KEEP = 30;
/** the most device pixels per metre a chunk is baked at: 30 chunks of 16 m at 56 px/m is 100 MB */
const MAX_RES = 56;
/** the centreline sample spacing for stones and ragged edges, metres */
const STEP = 0.5;
/** how far beyond a chunk's edge a road sample can still paint into it */
const MARGIN = 8;

const SX = SHADOW_X * SHADOW_PER_M;
const SY = SHADOW_Y * SHADOW_PER_M;

interface Chunk {
  key: number;
  c: HTMLCanvasElement;
  used: number;
}

export class Ground {
  /** canvas pixels per metre */
  private res = 0;
  private chunks = new Map<number, Chunk>();
  private spare: HTMLCanvasElement[] = [];
  private frame = 0;
  private centre: Path2D;
  private offsets = new Map<number, Path2D>();
  private xs: Float32Array;
  private ys: Float32Array;
  private txs: Float32Array;
  private tys: Float32Array;
  /** the bend at each sample: heading change over the next 16 m, signed, right turns positive */
  private ks: Float32Array;
  /** road sample indices per chunk, margin included */
  private bins = new Map<number, number[]>();
  /** milliseconds the last bake took, for the dev readout */
  lastBake = 0;
  /**
   * The skid mark layer, kept by the renderer. Marks are stamped straight
   * into the baked chunks as they are laid, so a frame never draws them;
   * a chunk baked later copies its piece of this layer.
   */
  marks: { c: HTMLCanvasElement; ppm: number; x: number; y: number } | null = null;

  /** Lay a mark into every baked chunk it crosses. */
  markLine(x0: number, y0: number, x1: number, y1: number, style: string, width: number): void {
    const m = width + 0.1;
    for (const ch of this.chunks.values()) {
      const cx = Math.floor(ch.key / 8192) - 4096;
      const cy = (ch.key % 8192) - 4096;
      const wx = cx * CHUNK;
      const wy = cy * CHUNK;
      if (Math.max(x0, x1) < wx - m || Math.min(x0, x1) > wx + CHUNK + m || Math.max(y0, y1) < wy - m || Math.min(y0, y1) > wy + CHUNK + m) continue;
      const g = ch.c.getContext('2d')!;
      g.setTransform(this.res, 0, 0, this.res, -wx * this.res + 1, -wy * this.res + 1);
      g.strokeStyle = style;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }

  constructor(private t: Track, private sc: Scenery) {
    const n = Math.ceil(t.length / STEP);
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.txs = new Float32Array(n);
    this.tys = new Float32Array(n);
    this.ks = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ks[i] = t.curvatureAhead(i * STEP - 8, 16);
      const p = t.at(i * STEP);
      const l = Math.hypot(p.tx, p.ty) || 1;
      this.xs[i] = p.x;
      this.ys[i] = p.y;
      this.txs[i] = p.tx / l;
      this.tys[i] = p.ty / l;
      const c0x = Math.floor((p.x - MARGIN) / CHUNK);
      const c1x = Math.floor((p.x + MARGIN) / CHUNK);
      const c0y = Math.floor((p.y - MARGIN) / CHUNK);
      const c1y = Math.floor((p.y + MARGIN) / CHUNK);
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cy = c0y; cy <= c1y; cy++) {
          const k = key(cx, cy);
          const list = this.bins.get(k);
          if (list) list.push(i);
          else this.bins.set(k, [i]);
        }
      }
    }
    this.centre = this.offset(0);
  }

  /** The centreline moved d metres to the right of travel, closed. */
  private offset(d: number): Path2D {
    const hit = this.offsets.get(d);
    if (hit) return hit;
    const p = new Path2D();
    for (let i = 0; i < this.xs.length; i++) {
      const x = this.xs[i] - this.tys[i] * d;
      const y = this.ys[i] + this.txs[i] * d;
      if (i) p.lineTo(x, y);
      else p.moveTo(x, y);
    }
    p.closePath();
    this.offsets.set(d, p);
    return p;
  }

  /**
   * Draw the ground. `res` is the device pixels per metre the camera wants
   * and (ox, oy) where world (0, 0) lands in device pixels. When a chunk is
   * a whole number of device pixels across, the chunks are copied 1:1 onto
   * whole pixels with no resampling, the cheapest blit there is; past the
   * size a chunk may grow to, they are scaled. A change of zoom rebakes.
   */
  draw(g: CanvasRenderingContext2D, res: number, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, aheadX: number, aheadY: number): void {
    const exact = res <= MAX_RES && Math.abs(res * CHUNK - Math.round(res * CHUNK)) < 1e-6;
    res = exact ? Math.max(16, res) : Math.max(16, Math.min(MAX_RES, Math.round(res / 4) * 4));
    if (res !== this.res) {
      this.res = res;
      for (const ch of this.chunks.values()) this.spare.push(ch.c);
      this.chunks.clear();
    }
    this.frame++;
    const cx0 = Math.floor(x0 / CHUNK);
    const cx1 = Math.floor(x1 / CHUNK);
    const cy0 = Math.floor(y0 / CHUNK);
    const cy1 = Math.floor(y1 / CHUNK);
    if (exact) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      const side = Math.round(CHUNK * res);
      const bx = Math.round(ox);
      const by = Math.round(oy);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          // the chunk's canvas has a pixel of bleed round it, so it starts one pixel early
          g.drawImage(this.chunk(cx, cy).c, bx + cx * side - 1, by + cy * side - 1);
        }
      }
      g.restore();
    } else {
      const bleed = 1 / res;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const ch = this.chunk(cx, cy);
          g.drawImage(ch.c, cx * CHUNK - bleed, cy * CHUNK - bleed, CHUNK + bleed * 2, CHUNK + bleed * 2);
        }
      }
    }
    // bake one chunk ahead of the camera a frame, so driving never waits on a bake
    const ax = Math.floor(aheadX / CHUNK);
    const ay = Math.floor(aheadY / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!this.chunks.has(key(ax + dx, ay + dy))) {
          this.chunk(ax + dx, ay + dy);
          return;
        }
      }
    }
  }

  private chunk(cx: number, cy: number): Chunk {
    const k = key(cx, cy);
    let ch = this.chunks.get(k);
    if (ch) {
      ch.used = this.frame;
      return ch;
    }
    if (this.chunks.size >= KEEP) {
      let old: Chunk | null = null;
      for (const c of this.chunks.values()) if (!old || c.used < old.used) old = c;
      this.chunks.delete(old!.key);
      this.spare.push(old!.c);
    }
    const t0 = performance.now();
    const px = Math.round(CHUNK * this.res) + 2;
    let c = this.spare.pop();
    if (!c || c.width !== px) {
      c = document.createElement('canvas');
      c.width = c.height = px;
    }
    this.bake(c, cx, cy);
    this.lastBake = performance.now() - t0;
    ch = { key: k, c, used: this.frame };
    this.chunks.set(k, ch);
    return ch;
  }

  private strawFor = 0;
  private strawPat: CanvasPattern | null = null;

  /**
   * The straw's fine fuzz: one seamless tile of short blades, low in
   * contrast so its repeat never shows. The character of the straw, the
   * clumps, the lean and the tone, is laid per chunk on top of it from
   * world-space hashes, so it never repeats at all.
   */
  private straw(g: CanvasRenderingContext2D): CanvasPattern {
    if (this.strawPat && this.strawFor === this.res) return this.strawPat;
    const T = 6;
    const R = this.res;
    const c = document.createElement('canvas');
    c.width = c.height = T * R;
    const tg = c.getContext('2d')!;
    tg.scale(R, R);
    tg.fillStyle = PAL.straw;
    tg.fillRect(0, 0, T, T);
    const tones = ['rgba(170,154,106,0.32)', 'rgba(100,90,56,0.3)', 'rgba(150,136,90,0.3)', 'rgba(80,72,46,0.24)'];
    tg.lineWidth = 0.04;
    for (let tone = 0; tone < 4; tone++) {
      tg.strokeStyle = tones[tone];
      tg.beginPath();
      for (let i = 0; i < 420; i++) {
        const h = hash32((i * 4 + tone) * 2654435761 + 12345);
        const x = ((h & 0xffff) / 0xffff) * T;
        const y = (((h >>> 16) & 0xff) / 255) * T + (((h >>> 24) & 0xf) / 15) * (T / 255);
        const a = (((h >>> 12) & 0xff) / 255) * Math.PI * 2;
        const l = 0.08 + (((h >>> 20) & 0xf) / 15) * 0.16;
        // drawn four times so a blade over an edge comes back on the other side
        for (const [ox, oy] of [[0, 0], [-T, 0], [0, -T], [-T, -T]]) {
          tg.moveTo(x + ox, y + oy);
          tg.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        }
      }
      tg.stroke();
    }
    const pat = g.createPattern(c, 'repeat')!;
    pat.setTransform(new DOMMatrix().scale(1 / R, 1 / R));
    this.strawPat = pat;
    this.strawFor = R;
    return pat;
  }

  /**
   * The straw's character, from world hashes: a clump of blades every
   * metre or so, leaning the way a slow field says, each blade its own
   * length and tone; bare earth and damp dark patches at a larger scale,
   * their edges frayed with blades rather than drawn.
   */
  private strawField(g: CanvasRenderingContext2D, wx: number, wy: number): void {
    // the lie of the grass: a slow field of angles, so neighbouring clumps agree and far ones do not
    const lie = (x: number, y: number) => Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * 1.4 + Math.sin(y * 0.13 - x * 0.05) * 0.9;
    // a slow field of tone, -1 to 1: where the straw is greener, paler, thinner
    const tone = (x: number, y: number) => Math.sin(x * 0.09 + 1.3) * Math.sin(y * 0.083 + 0.4) + Math.sin((x + y) * 0.21) * 0.35;

    // large patches first: bare earth where the soil shows, damp dark hollows
    const M = 6;
    for (let gx = Math.floor((wx - M) / 9); gx * 9 < wx + CHUNK + M; gx++) {
      for (let gy = Math.floor((wy - M) / 9); gy * 9 < wy + CHUNK + M; gy++) {
        const h = hash32((gx * 73856093) ^ (gy * 19349663) ^ 4242);
        if ((h & 0xff) > 120) continue;
        const x = gx * 9 + ((h >>> 8) & 0xff) / 255 * 9;
        const y = gy * 9 + ((h >>> 16) & 0xff) / 255 * 9;
        const r = 1.2 + ((h >>> 24) & 0xff) / 255 * 3.2;
        const damp = (h >>> 5) & 1;
        const colour = damp ? '#4f4a2e' : (h >>> 6) & 1 ? PAL.earth : '#7a6a4c';
        g.globalAlpha = damp ? 0.32 : 0.4;
        g.fillStyle = colour;
        blob(g, x, y, r, h, 15);
        g.fill();
        g.globalAlpha = damp ? 0.22 : 0.28;
        blob(g, x + r * 0.2, y - r * 0.15, r * 0.65, h >>> 2, 11);
        g.fill();
        // the fray: blades of the patch's colour across its edge, and straw blades into it
        const fray = new Path2D();
        const n = Math.round(r * 26);
        for (let i = 0; i < n; i++) {
          const hb = hash32(h + i * 2654435761);
          const a = (i / n) * Math.PI * 2;
          const rr = r * (0.7 + ((hb & 0xff) / 255) * 0.55);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          const ba = a + ((((hb >>> 8) & 0xff) / 255) - 0.5) * 1.6;
          const l = 0.15 + (((hb >>> 16) & 0xff) / 255) * 0.45;
          fray.moveTo(px - Math.cos(ba) * l * 0.5, py - Math.sin(ba) * l * 0.5);
          fray.lineTo(px + Math.cos(ba) * l * 0.5, py + Math.sin(ba) * l * 0.5);
        }
        g.globalAlpha = 0.45;
        g.strokeStyle = colour;
        g.lineWidth = 0.07;
        g.lineCap = 'round';
        g.stroke(fray);
      }
    }
    g.globalAlpha = 1;

    // clumps of blades: one tone path per shade, every blade its own direction, length and weight
    const shades = ['rgba(196,178,124,0.55)', 'rgba(160,144,96,0.55)', 'rgba(112,100,62,0.5)', 'rgba(78,70,44,0.5)', 'rgba(96,96,58,0.45)'];
    const paths = shades.map(() => new Path2D());
    const C = 0.8;
    for (let gx = Math.floor((wx - 1) / C); gx * C < wx + CHUNK + 1; gx++) {
      for (let gy = Math.floor((wy - 1) / C); gy * C < wy + CHUNK + 1; gy++) {
        const h = hash32((gx * 73856093) ^ (gy * 19349663) ^ 9001);
        if ((h & 0xff) < 50) continue;
        const x = gx * C + ((h >>> 8) & 0xff) / 255 * C;
        const y = gy * C + ((h >>> 16) & 0xff) / 255 * C;
        const base = lie(x, y);
        const tn = tone(x, y);
        const blades = 3 + ((h >>> 24) & 7);
        for (let b = 0; b < blades; b++) {
          const hb = hash32(h + b * 40503);
          const a = base + ((hb & 0xff) / 255 - 0.5) * 1.3;
          const l = 0.12 + (((hb >>> 8) & 0xff) / 255) ** 2 * 0.5;
          const ox = ((((hb >>> 16) & 0xff) / 255) - 0.5) * 0.35;
          const oy = ((((hb >>> 24) & 0xff) / 255) - 0.5) * 0.35;
          // tone leans with the slow field: pale where it is high, dark and green where low
          const pick = Math.max(0, Math.min(4, Math.floor(((hb >>> 4) & 0xf) / 16 * 3 + (tn < -0.3 ? 2 : tn > 0.4 ? 0 : 1))));
          const p = paths[(hb >>> 28) & 7 ? pick : 4];
          p.moveTo(x + ox, y + oy);
          p.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        }
      }
    }
    g.lineCap = 'round';
    g.lineWidth = 0.05;
    paths.forEach((p, i) => {
      g.strokeStyle = shades[i];
      g.stroke(p);
    });
  }

  /**
   * Where cars run wide: two flattened tracks a car's track apart in the
   * straw outside the bends, wandering in and out, darker where the
   * straw is crushed and paler where it is bruised.
   */
  private wideTracks(g: CanvasRenderingContext2D, list: number[], half: number): void {
    const dark = [new Path2D(), new Path2D(), new Path2D()];
    const n = this.xs.length;
    for (const i of list) {
      const j = (i + 1) % n;
      const k = this.ks[i];
      const bend = Math.abs(k);
      if (bend < 0.22) continue;
      const side = -Math.sign(k);
      const s0 = i * STEP;
      const level = bend > 0.7 ? 2 : bend > 0.42 ? 1 : 0;
      // two cars' lines, each wandering on its own
      for (let line = 0; line < 2; line++) {
        const wander = (s: number) => half + 4.6 + line * 1.9 + Math.sin(s * 0.06 + line * 2.1) * 1.3 + Math.sin(s * 0.17 + line) * 0.4 + (bend - 0.22) * 2.2;
        for (const gauge of [-0.72, 0.72]) {
          const d0 = side * (wander(s0) + gauge);
          const d1 = side * (wander(s0 + STEP) + gauge);
          const ax = this.xs[i] - this.tys[i] * d0;
          const ay = this.ys[i] + this.txs[i] * d0;
          const bx = this.xs[j] - this.tys[j] * d1;
          const by = this.ys[j] + this.txs[j] * d1;
          // broken where the straw stood back up
          if ((hash32(i * 4 + line * 2 + (gauge > 0 ? 1 : 0) + 515) & 0xff) < 40) continue;
          dark[line ? Math.max(0, level - 1) : level].moveTo(ax, ay);
          dark[line ? Math.max(0, level - 1) : level].lineTo(bx, by);
        }
      }
    }
    g.lineCap = 'round';
    dark.forEach((p, level) => {
      g.globalAlpha = 0.14 + level * 0.07;
      g.strokeStyle = '#4a4129';
      g.lineWidth = 0.42;
      g.stroke(p);
      g.globalAlpha = 0.1 + level * 0.04;
      g.strokeStyle = PAL.strawPale;
      g.lineWidth = 0.12;
      g.stroke(p);
    });
    g.globalAlpha = 1;
  }

  private bake(c: HTMLCanvasElement, cx: number, cy: number): void {
    const g = c.getContext('2d')!;
    const R = this.res;
    const wx = cx * CHUNK;
    const wy = cy * CHUNK;
    const world = (gg: CanvasRenderingContext2D) => gg.setTransform(R, 0, 0, R, -wx * R + 1, -wy * R + 1);
    world(g);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const t = this.t;
    const half = t.width / 2;
    const inChunk = (x: number, y: number, m: number) => x > wx - m && x < wx + CHUNK + m && y > wy - m && y < wy + CHUNK + m;

    // dry straw from a tiled texture, then wide drifts of paler and darker growth and bare patches
    g.fillStyle = this.straw(g);
    g.fillRect(wx - 1, wy - 1, CHUNK + 2, CHUNK + 2);
    const drift = (cell: number, rMin: number, rMax: number, alpha: number, salt: number) => {
      const colours = [PAL.strawPale, PAL.strawDark, PAL.strawGreen, PAL.earth, PAL.strawPale];
      for (let gx = Math.floor((wx - rMax) / cell); gx * cell < wx + CHUNK + rMax; gx++) {
        for (let gy = Math.floor((wy - rMax) / cell); gy * cell < wy + CHUNK + rMax; gy++) {
          const h = hash32((gx * 73856093) ^ (gy * 19349663) ^ salt);
          const x = gx * cell + ((h & 0xff) / 255) * cell;
          const y = gy * cell + (((h >>> 8) & 0xff) / 255) * cell;
          const r = rMin + (((h >>> 16) & 0xff) / 255) * (rMax - rMin);
          g.globalAlpha = alpha;
          g.fillStyle = colours[(h >>> 24) % colours.length];
          blob(g, x, y, r, h, 11);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    };
    drift(13, 4, 9, 0.18, 101);
    this.strawField(g, wx, wy);
    // needle litter under the trees
    g.fillStyle = PAL.forestFloor;
    for (const tr of this.sc.trees) {
      if (!inChunk(tr.x, tr.y, tr.r * 1.4)) continue;
      g.globalAlpha = tr.birch ? 0.25 : 0.45;
      blob(g, tr.x, tr.y, tr.r * 1.1, hash32(Math.round(tr.x * 100) ^ Math.round(tr.y * 100)), 13);
      g.fill();
    }
    g.globalAlpha = 1;

    // the road and its edges, outside in: worn earth, the ditch, the verge, the gravel berm, the road
    if (this.bins.has(key(cx, cy))) {
      this.wideTracks(g, this.bins.get(key(cx, cy))!, half);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const band = (w: number, colour: string, alpha = 1) => {
        g.globalAlpha = alpha;
        g.strokeStyle = colour;
        g.lineWidth = w;
        g.stroke(this.centre);
      };
      // each edge feathered with a blur, so no band ends on a drawn line; the blur is
      // in pixels, so it is scaled by the bake's resolution
      const soft = (d: number, spread: number, colour: string, alpha = 1) => {
        g.shadowColor = colour;
        g.shadowBlur = spread * this.res;
        band(2 * (d - spread * 0.3), colour, alpha);
        g.shadowBlur = 0;
        g.shadowColor = 'transparent';
      };
      const list0 = this.bins.get(key(cx, cy))!;
      /**
       * Fray a band's outer edge: dabs of its colour pushed out past the edge
       * and pulled back from it, wandering slowly along the road, and blades
       * across the line, so the edge is a ragged seam and never a ruled line.
       */
      const fray = (d: number, colour: string, alpha: number, amp: number, salt: number) => {
        const dabs = new Path2D();
        const blades = new Path2D();
        for (const i of list0) {
          const sv = i * STEP;
          for (const side of [-1, 1]) {
            const h = hash32(i * 2 + (side > 0 ? 1 : 0) + salt * 7919);
            const wob = amp * (Math.sin(sv * 0.23 + salt + side) * 0.6 + Math.sin(sv * 0.71 + salt * 2) * 0.4);
            const nx = -this.tys[i] * side;
            const ny = this.txs[i] * side;
            const dd = d + wob * 0.6 + (((h & 0xff) / 255) - 0.5) * amp * 0.5;
            const r = amp * (0.35 + (((h >>> 8) & 0xff) / 255) * 0.5);
            const along = ((((h >>> 16) & 0xff) / 255) - 0.5) * STEP;
            blob(dabs, this.xs[i] + nx * dd + this.txs[i] * along, this.ys[i] + ny * dd + this.tys[i] * along, r, h, 9);
            for (let b = 0; b < 3; b++) {
              const hb = hash32(h + b * 977);
              const a = Math.atan2(ny, nx) + ((hb & 0xff) / 255 - 0.5) * 1.4;
              const at0 = d + ((((hb >>> 8) & 0xff) / 255) - 0.6) * amp;
              const l = amp * (0.4 + (((hb >>> 16) & 0xff) / 255) * 0.9);
              const al = ((((hb >>> 24) & 0xff) / 255) - 0.5) * STEP * 1.5;
              const x0 = this.xs[i] + nx * at0 + this.txs[i] * al;
              const y0 = this.ys[i] + ny * at0 + this.tys[i] * al;
              blades.moveTo(x0, y0);
              blades.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
            }
          }
        }
        g.globalAlpha = alpha;
        g.fillStyle = colour;
        g.fill(dabs);
        g.strokeStyle = colour;
        g.lineWidth = 0.06;
        g.lineCap = 'round';
        g.stroke(blades);
        g.globalAlpha = 1;
        g.lineCap = 'round';
      };
      soft(half + 3.9, 0.7, PAL.earth, 0.45);
      fray(half + 3.9, PAL.earth, 0.35, 0.9, 1);
      soft(half + 3.1, 0.35, PAL.ditch);
      fray(half + 3.1, PAL.ditch, 0.8, 0.55, 2);
      soft(half + 2.5, 0.4, PAL.ditchBottom, 0.6);
      soft(half + 2.05, 0.25, PAL.ditch);
      soft(half + 1.45, 0.3, PAL.verge);
      fray(half + 1.45, PAL.verge, 0.85, 0.45, 3);
      soft(half + 0.4, 0.25, PAL.berm);
      fray(half + 0.4, PAL.berm, 0.7, 0.35, 4);
      soft(half, 0.15, PAL.gravel);
      fray(half, PAL.gravel, 0.6, 0.3, 5);
      g.globalAlpha = 1;
      // tyres polish two lanes pale; a ridge of loose gravel between them
      g.lineCap = 'butt';
      g.globalAlpha = 0.16;
      g.strokeStyle = PAL.gravelPale;
      g.lineWidth = 1.6;
      for (const d of [-1.05, 1.05]) g.stroke(this.offset(d));
      g.globalAlpha = 1;
      const list = this.bins.get(key(cx, cy))!;
      const at = (i: number, d: number) => ({ x: this.xs[i] - this.tys[i] * d, y: this.ys[i] + this.txs[i] * d });
      // streaks along the lanes: polished pale, damp dark ruts, broken where gravel fills them
      const pale = new Path2D();
      const dark = new Path2D();
      const ridge = new Path2D();
      for (const i of list) {
        const tx = this.txs[i];
        const ty = this.tys[i];
        for (let k = 0; k < 6; k++) {
          const h = hash32(i * 6 + k + 31337);
          const lane = h & 1 ? 1 : -1;
          const jit = (((h >>> 1) & 0xff) / 255 - 0.5) * 2;
          const len = 0.6 + (((h >>> 9) & 0xff) / 255) * 2.2;
          const kind = (h >>> 17) % 5;
          const d = kind < 2 ? lane * (1.05 + jit * 0.55) : kind < 4 ? lane * (1.05 + (k & 1 ? 0.33 : -0.33) + jit * 0.08) : jit * 0.25;
          const p = at(i, d);
          const path = kind < 2 ? pale : kind < 4 ? dark : ridge;
          path.moveTo(p.x - tx * len * 0.5, p.y - ty * len * 0.5);
          path.lineTo(p.x + tx * len * 0.5, p.y + ty * len * 0.5);
        }
      }
      g.lineCap = 'round';
      g.globalAlpha = 0.22;
      g.strokeStyle = PAL.gravelPale;
      g.lineWidth = 0.32;
      g.stroke(pale);
      g.globalAlpha = 0.4;
      g.strokeStyle = PAL.rut;
      g.lineWidth = 0.17;
      g.stroke(dark);
      g.globalAlpha = 0.35;
      g.strokeStyle = PAL.berm;
      g.lineWidth = 0.3;
      g.stroke(ridge);
      g.globalAlpha = 1;

      // tufts across the seams: straw over the worn earth, the ditch lip and the verge's edge,
      // each a few blades of their own length leaning one loose way, never a fan
      const tufts = [new Path2D(), new Path2D(), new Path2D()];
      const seams = [half + 3.8, half + 3.1, half + 1.5, half + 0.3];
      for (const i of list) {
        for (const side of [-1, 1]) {
          for (let k = 0; k < 4; k++) {
            const h = hash32(i * 8 + k * 2 + (side > 0 ? 1 : 0) + 7777);
            if ((h & 0xff) < (k === 3 ? 170 : 70)) continue;
            const d = side * (seams[k] + ((((h >>> 8) & 0xff) / 255) - 0.5) * 0.8);
            const along = ((((h >>> 16) & 0xff) / 255) - 0.5) * STEP;
            const px = this.xs[i] - this.tys[i] * d + this.txs[i] * along;
            const py = this.ys[i] + this.txs[i] * d + this.tys[i] * along;
            const path = tufts[k === 0 ? 0 : k === 3 ? 2 : (h >>> 24) & 1 ? 1 : 2];
            const lean = ((h >>> 4) & 0xff) / 255 * Math.PI * 2;
            const n = 2 + ((h >>> 12) & 3);
            for (let b2 = 0; b2 < n; b2++) {
              const hb = hash32(h + b2 * 7919);
              const a2 = lean + ((hb & 0xff) / 255 - 0.5) * 0.9;
              const l = 0.1 + ((((hb >>> 8) & 0xff) / 255) ** 1.5) * 0.32;
              const ox = ((((hb >>> 16) & 0xff) / 255) - 0.5) * 0.12;
              path.moveTo(px + ox, py - ox);
              path.lineTo(px + ox + Math.cos(a2) * l, py - ox + Math.sin(a2) * l);
            }
          }
        }
      }
      g.lineCap = 'round';
      g.lineWidth = 0.04;
      g.globalAlpha = 0.6;
      g.strokeStyle = PAL.strawPale;
      g.stroke(tufts[0]);
      g.strokeStyle = PAL.straw;
      g.stroke(tufts[1]);
      g.strokeStyle = PAL.strawDark;
      g.stroke(tufts[2]);
      g.globalAlpha = 1;

      // the start line: a worn chequer in the gravel
      const sp = t.at(0);
      if (inChunk(sp.x, sp.y, half + 2)) {
        g.save();
        g.translate(sp.x, sp.y);
        g.rotate(Math.atan2(sp.ty, sp.tx));
        g.globalAlpha = 0.8;
        const cells = 8;
        const cw = t.width / cells;
        for (let i = 0; i < cells; i++) {
          for (let j = 0; j < 2; j++) {
            g.fillStyle = (i + j) % 2 ? '#1c1a16' : '#d6cfbb';
            g.fillRect(-cw + j * cw, -half + i * cw, cw, cw);
          }
        }
        g.restore();
        g.globalAlpha = 1;
      }

      // loose stones: everywhere on the road, thick on the berm and the verge, each with its own shadow
      const stoneTones = ['#544c42', '#8e8472', '#b4a890', '#6c6050'];
      const paths = stoneTones.map(() => new Path2D());
      const shadow = new Path2D();
      for (const i of list) {
        for (let k = 0; k < 12; k++) {
          const h = hash32(i * 12 + k + 99991);
          const u = (h & 0xffff) / 0xffff;
          let d: number;
          let s: number;
          if (k < 6) {
            d = (u - 0.5) * 2 * half;
            s = 0.04 + ((h >>> 16) & 0xf) / 15 * 0.05;
          } else {
            d = (u < 0.5 ? -1 : 1) * (half - 0.4 + Math.abs(u - 0.5) * 2 * 1.9);
            s = 0.05 + ((h >>> 16) & 0xf) / 15 * 0.11;
          }
          const along = (((h >>> 20) & 0xff) / 255 - 0.5) * STEP;
          const x = this.xs[i] - this.tys[i] * d + this.txs[i] * along;
          const y = this.ys[i] + this.txs[i] * d + this.tys[i] * along;
          if (!inChunk(x, y, 0.3)) continue;
          stone(shadow, x + s * 0.45, y + s * 0.35, s, h);
          stone(paths[(h >>> 28) & 3], x, y, s, h);
        }
      }
      g.fillStyle = 'rgba(20,16,12,0.5)';
      g.fill(shadow);
      paths.forEach((p, i) => {
        g.fillStyle = stoneTones[i];
        g.fill(p);
      });
    }

    // every static shadow as one path, all turning the same way so the fill is their
    // union: laid once at one alpha, overlaps never double
    const sh = this.shadows(cx, cy);
    g.globalAlpha = SHADOW_ALPHA;
    g.fillStyle = SHADOW_INK;
    g.fill(sh);
    g.globalAlpha = 1;

    // the marks already laid here
    const mk = this.marks;
    if (mk) g.drawImage(mk.c, (wx - mk.x) * mk.ppm, (wy - mk.y) * mk.ppm, CHUNK * mk.ppm, CHUNK * mk.ppm, wx, wy, CHUNK, CHUNK);

    // what stands beyond the cars' reach: the barn, the power poles, the crowd
    this.bakeStanding(g, inChunk);
  }

  private shadows(cx: number, cy: number): Path2D {
    const P = new Path2D();
    const sc = this.sc;
    const wx = cx * CHUNK;
    const wy = cy * CHUNK;
    // shadows fall toward +S only: a caster can be far up-sun of the chunk, never far down-sun
    const casts = (x: number, y: number, r: number, h: number) =>
      x > wx - r - SX * h && x < wx + CHUNK + r && y > wy - r - SY * h && y < wy + CHUNK + r;
    /** a polygon, turned clockwise if it is not, so every subpath winds the same way */
    const poly = (pts: number[]) => {
      let area = 0;
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
      }
      const at = (i: number) => (area >= 0 ? i : n - 1 - i);
      for (let i = 0; i < n; i++) {
        const k = at(i);
        if (i) P.lineTo(pts[k * 2], pts[k * 2 + 1]);
        else P.moveTo(pts[k * 2], pts[k * 2 + 1]);
      }
      P.closePath();
    };
    const disc = (x: number, y: number, r: number) => {
      P.moveTo(x + r, y);
      P.arc(x, y, r, 0, Math.PI * 2);
      P.closePath();
    };
    /** a thin upright thing from height h0 to h1: a quad along the sun with a foot */
    const line = (x: number, y: number, h0: number, h1: number, w: number) => {
      const nx = -SHADOW_Y * (w / 2);
      const ny = SHADOW_X * (w / 2);
      const x0 = x + SX * h0;
      const y0 = y + SY * h0;
      const x1 = x + SX * h1;
      const y1 = y + SY * h1;
      poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]);
      if (h0 === 0) disc(x, y, w / 2);
    };
    /** a horizontal bar between two points at a height */
    const bar = (ax: number, ay: number, bx: number, by: number, hgt: number, w: number) => {
      const dx = bx - ax;
      const dy = by - ay;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * (w / 2);
      const ny = (dx / l) * (w / 2);
      const ox = SX * hgt;
      const oy = SY * hgt;
      poly([ax + ox + nx, ay + oy + ny, bx + ox + nx, by + oy + ny, bx + ox - nx, by + oy - ny, ax + ox - nx, ay + oy - ny]);
    };
    const rect = (x: number, y: number, a: number, len: number, wid: number) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const hx = len / 2;
      const hy = wid / 2;
      poly([x - c * hx + s * hy, y - s * hx - c * hy, x + c * hx + s * hy, y + s * hx - c * hy, x + c * hx - s * hy, y + s * hx + c * hy, x - c * hx - s * hy, y - s * hx + c * hy]);
    };

    for (const tr of sc.trees) {
      if (!casts(tr.x, tr.y, tr.r, tr.h)) continue;
      const hh = hash32(Math.round(tr.x * 31) ^ (Math.round(tr.y * 57) * 3));
      if (tr.birch) {
        // a pale trunk's thin shadow, then a dappled crown
        line(tr.x, tr.y, 0, tr.h * 0.55, 0.24);
        for (let i = 0; i < 40; i++) {
          const h = hash32(hh + i * 977);
          const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
          const rr = Math.sqrt(((h >>> 16) & 0xff) / 255) * tr.r * 0.8;
          const k = tr.h * (0.5 + (((h >>> 24) & 0xff) / 255) * 0.45);
          const r = tr.r * (0.06 + (((h >>> 8) & 0xff) / 255) * 0.1);
          const x = tr.x + SX * k + Math.cos(a) * rr;
          const y = tr.y + SY * k + Math.sin(a) * rr;
          // a leaf-cluster's dapple: six points, lopsided and turned at random
          const pts: number[] = [];
          for (let j = 0; j < 6; j++) {
            const aj = (j / 6) * Math.PI * 2 + (h >>> 20);
            const rj = r * (0.5 + ((hash32(h + j * 31) & 0xff) / 255) * 1.1);
            pts.push(x + Math.cos(aj) * rj, y + Math.sin(aj) * rj);
          }
          poly(pts);
        }
      } else {
        // a spruce: a long tiered cone from the trunk to the apex's shadow
        const nx = -SHADOW_Y;
        const ny = SHADOW_X;
        const tiers = 9;
        const half: number[] = [];
        for (let i = 0; i <= tiers; i++) {
          const jag = i % 2 ? 0.7 : 1.05 + ((hash32(hh + i) & 0xff) / 255) * 0.2;
          half.push(tr.r * 0.9 * (1 - i / tiers) * jag);
        }
        const pts = [tr.x, tr.y];
        for (let side = 1; side >= -1; side -= 2) {
          for (let j = 0; j <= tiers; j++) {
            const i = side > 0 ? j : tiers - j;
            const hgt = tr.h * (0.12 + (0.88 * i) / tiers);
            pts.push(tr.x + SX * hgt + nx * half[i] * side, tr.y + SY * hgt + ny * half[i] * side);
          }
        }
        poly(pts);
        line(tr.x, tr.y, 0, tr.h * 0.15, 0.3);
      }
    }

    // the power line: poles, crossarms, three sagging wires
    const poleH = 8.5;
    sc.poles.forEach((p, i) => {
      const ax = Math.cos(p.a) * 1.1;
      const ay = Math.sin(p.a) * 1.1;
      if (casts(p.x, p.y, 1.2, poleH)) {
        line(p.x, p.y, 0, poleH, 0.26);
        bar(p.x - ax, p.y - ay, p.x + ax, p.y + ay, poleH, 0.14);
      }
      const q = sc.poles[i + 1];
      if (!q) return;
      for (const o of [-0.95, 0, 0.95]) {
        const ox = (ax / 1.1) * o;
        const oy = (ay / 1.1) * o;
        // the sag, as two straight halves dipping toward the ground
        const mx = (p.x + q.x) / 2 + ox - SX * 1.2;
        const my = (p.y + q.y) / 2 + oy - SY * 1.2;
        bar(p.x + ox, p.y + oy, mx, my, poleH, 0.05);
        bar(mx, my, q.x + ox, q.y + oy, poleH, 0.05);
      }
    });

    // the barn: walls to the eaves, then the gable narrowing to the ridge; the hulk beside it
    const b = sc.barn;
    if (casts(b.x, b.y, b.len, 7)) {
      const eaves = 3.6;
      const ridge = 6.4;
      for (let i = 0; i <= 16; i++) {
        const hgt = (i / 16) * ridge;
        const w = hgt <= eaves ? b.wid : b.wid * (1 - (hgt - eaves) / (ridge - eaves));
        rect(b.x + SX * hgt, b.y + SY * hgt, b.a, b.len, Math.max(0.2, w));
      }
      const hx = b.x + Math.cos(b.a) * 1 - Math.sin(b.a) * (b.wid / 2 + 2.6);
      const hy = b.y + Math.sin(b.a) * 1 + Math.cos(b.a) * (b.wid / 2 + 2.6);
      for (let i = 0; i <= 6; i++) {
        const hgt = (i / 6) * 1.1;
        rect(hx + SX * hgt, hy + SY * hgt, b.a + 0.4, 4, 1.7);
      }
    }

    // the crowd, their flags and the tape
    for (const f of sc.crowd) {
      if (!casts(f.x, f.y, 1, 3.5)) continue;
      line(f.x, f.y, 0, 1.75, 0.4);
      if (f.flag) {
        line(f.x + 0.3, f.y, 0, 3.4, 0.06);
        rect(f.x + 0.75 + SX * 3.4, f.y + 0.17 + SY * 3.4, 0, 0.9, 0.55);
      }
    }
    for (const row of sc.tape) {
      for (const p of row) if (casts(p.x, p.y, 1, 1)) line(p.x, p.y, 0, 1.0, 0.07);
      for (let i = 0; i + 1 < row.length; i++) bar(row[i].x, row[i].y, row[i + 1].x, row[i + 1].y, 0.95, 0.03);
    }

    // juniper and boulders
    for (const b of sc.shrubs) {
      if (!casts(b.x, b.y, b.r, 1.4)) continue;
      if (b.tuft) {
        // a grass clump: a thin, ragged shadow of a few blades
        const hh = hash32(b.v * 977 + Math.round(b.x * 13));
        for (let i = 0; i < 5; i++) {
          const o = ((hash32(hh + i) & 0xff) / 255 - 0.5) * b.r * 1.4;
          line(b.x - SHADOW_Y * o, b.y + SHADOW_X * o, 0, 0.35 + b.r * (0.6 + ((hash32(hh + i * 7) & 0xff) / 255) * 0.6), 0.06);
        }
        continue;
      }
      const hgt = b.rock ? b.r * 0.9 : 1.1 + b.r;
      const k = hgt * (b.rock ? 0.5 : 0.6);
      line(b.x, b.y, 0, k, b.r * (b.rock ? 1.7 : 1.1));
      disc(b.x + SX * k, b.y + SY * k, b.r * (b.rock ? 0.8 : 0.35));
    }

    // posts and bales: drawn each frame, but their shadows are ground
    for (const p of sc.props) {
      if (!casts(p.x, p.y, 1, 1.3)) continue;
      if (p.kind === 'bale') {
        // a standing cylinder: the disc swept along the sun
        line(p.x, p.y, 0, 1.25, p.n * 2);
        disc(p.x + SX * 1.25, p.y + SY * 1.25, p.n);
      } else line(p.x, p.y, 0, p.kind === 'km' ? 1.1 : 1.0, p.kind === 'km' ? 0.18 : 0.13);
    }
    return P;
  }

  private bakeStanding(g: CanvasRenderingContext2D, inChunk: (x: number, y: number, m: number) => boolean): void {
    const sc = this.sc;
    for (const b of sc.shrubs) {
      if (!inChunk(b.x, b.y, b.r + 0.2)) continue;
      const h = hash32(b.v * 7919 + Math.round(b.x * 10));
      if (b.tuft) {
        // a clump of tall dry grass: blades out from one root, paler at the tips, a dark heart
        const dark = new Path2D();
        const pale = new Path2D();
        const n = 14 + (h & 7);
        for (let i = 0; i < n; i++) {
          const hb = hash32(h + i * 2654435761);
          const a = ((hb & 0xffff) / 0xffff) * Math.PI * 2;
          const l = b.r * (0.5 + (((hb >>> 16) & 0xff) / 255) * 0.8);
          const bend = ((((hb >>> 24) & 0xff) / 255) - 0.5) * 0.6;
          const mx = b.x + Math.cos(a) * l * 0.55;
          const my = b.y + Math.sin(a) * l * 0.55;
          dark.moveTo(b.x, b.y);
          dark.lineTo(mx, my);
          pale.moveTo(mx, my);
          pale.lineTo(b.x + Math.cos(a + bend) * l, b.y + Math.sin(a + bend) * l);
        }
        g.lineCap = 'round';
        g.lineWidth = 0.05;
        g.strokeStyle = '#4c4630';
        g.stroke(dark);
        g.strokeStyle = (h >>> 3) & 1 ? PAL.strawPale : '#b8a878';
        g.stroke(pale);
        g.fillStyle = 'rgba(40,36,22,0.7)';
        blob(g, b.x, b.y, b.r * 0.25, h, 7);
        g.fill();
      } else if (b.rock) {
        // a glacial boulder: grey granite, lichen, a lit shoulder
        const p = new Path2D();
        blob(p, b.x, b.y, b.r, h, 9);
        g.fillStyle = '#77726a';
        g.fill(p);
        lit(g, p, b.r * 0.25, 'rgba(232,222,200,0.45)', 'rgba(20,16,12,0.5)');
        g.fillStyle = 'rgba(150,150,96,0.45)';
        blob(g, b.x + b.r * 0.2, b.y - b.r * 0.1, b.r * 0.3, h >>> 3, 7);
        g.fill();
      } else {
        // juniper: two or three ragged lobes, never a ball and never a star, each lit on its own
        const lobes = 2 + (h & 1);
        for (let i = 0; i < lobes; i++) {
          const a = (h >>> 3) / 1e8 + i * 2.1;
          const p = new Path2D();
          blob(p, b.x + Math.cos(a) * b.r * 0.4, b.y + Math.sin(a) * b.r * 0.4, b.r * (0.7 - i * 0.1), h + i * 101, 17);
          g.fillStyle = i ? '#243022' : '#1c261d';
          g.fill(p);
          lit(g, p, b.r * 0.16, 'rgba(92,102,66,0.5)', 'rgba(0,0,0,0.4)');
        }
      }
    }
    const b = sc.barn;
    if (inChunk(b.x, b.y, 12)) {
      // the hulk: a rally car left to rust
      const hx = b.x + Math.cos(b.a) * 1 - Math.sin(b.a) * (b.wid / 2 + 2.6);
      const hy = b.y + Math.sin(b.a) * 1 + Math.cos(b.a) * (b.wid / 2 + 2.6);
      const def = { ...CARS[CARS.length - 1], colour: '#7a4a2e' };
      const spr = carSprite(def, { faded: true, heading: b.a + 0.4 });
      const dmg = damageSprite(def, 3)!;
      g.save();
      g.translate(hx, hy);
      g.rotate(b.a + 0.4);
      const w = spr.width / SPRITE_PX;
      const h = spr.height / SPRITE_PX;
      g.drawImage(spr, -w / 2, -h / 2, w, h);
      g.drawImage(dmg, -w / 2, -h / 2, w, h);
      g.restore();

      // the barn roof: weathered tin over red-ochre boards, the half toward the sun lit
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.a);
      const L = b.len;
      const W = b.wid;
      // the ridge runs along the length; which half faces the sun
      const nSun = -(-Math.sin(b.a) * SHADOW_X + Math.cos(b.a) * SHADOW_Y);
      const litTop = nSun < 0;
      g.fillStyle = '#5a2e22';
      g.fillRect(-L / 2 - 0.1, -W / 2 - 0.1, L + 0.2, W + 0.2);
      g.fillStyle = litTop ? '#7c766a' : '#3d3a35';
      g.fillRect(-L / 2, -W / 2, L, W / 2);
      g.fillStyle = litTop ? '#3d3a35' : '#7c766a';
      g.fillRect(-L / 2, 0, L, W / 2);
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.05;
      g.beginPath();
      for (let x = -L / 2 + 0.3; x < L / 2; x += 0.3) {
        g.moveTo(x, -W / 2);
        g.lineTo(x, W / 2);
      }
      g.stroke();
      for (let i = 0; i < 14; i++) {
        const h = hash32(i * 4111 + 17);
        g.fillStyle = `rgba(110,62,30,${0.25 + ((h >>> 24) & 0xff) / 255 * 0.35})`;
        blob(g, -L / 2 + ((h & 0xff) / 255) * L, -W / 2 + (((h >>> 8) & 0xff) / 255) * W, 0.4 + ((h >>> 16) & 0xff) / 255 * 0.9, h, 8);
        g.fill();
      }
      g.fillStyle = '#26231f';
      g.fillRect(-L / 2, -0.08, L, 0.16);
      // a lean-to of red boards on the end
      g.fillStyle = faded('#8a3a28', 0.3);
      g.fillRect(L / 2, -W / 2 + 1, 2.4, W - 2);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      for (let y = -W / 2 + 1.25; y < W / 2 - 1; y += 0.25) {
        g.moveTo(L / 2, y);
        g.lineTo(L / 2 + 2.4, y);
      }
      g.stroke();
      g.restore();
    }

    // power poles: dark creosoted wood, a crossarm, pale insulators
    for (const p of sc.poles) {
      if (!inChunk(p.x, p.y, 2)) continue;
      const ax = Math.cos(p.a);
      const ay = Math.sin(p.a);
      g.strokeStyle = '#2a2118';
      g.lineWidth = 0.14;
      g.beginPath();
      g.moveTo(p.x - ax * 1.1, p.y - ay * 1.1);
      g.lineTo(p.x + ax * 1.1, p.y + ay * 1.1);
      g.stroke();
      g.fillStyle = '#3a2e22';
      g.fillRect(p.x - 0.15, p.y - 0.15, 0.3, 0.3);
      g.fillStyle = '#b8b4a6';
      for (const o of [-0.95, 0, 0.95]) g.fillRect(p.x + ax * o - 0.05, p.y + ay * o - 0.05, 0.1, 0.1);
    }

    // the tape, then the people behind it
    for (const row of sc.tape) {
      g.lineWidth = 0.06;
      g.setLineDash([0.4, 0.4]);
      for (const [colour, off] of [['#c8301e', 0], ['#d8d2c2', 0.4]] as const) {
        g.strokeStyle = colour;
        g.lineDashOffset = off;
        g.beginPath();
        row.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
      }
      g.setLineDash([]);
      g.lineDashOffset = 0;
      g.fillStyle = '#2a2420';
      for (const p of row) g.fillRect(p.x - 0.05, p.y - 0.05, 0.1, 0.1);
    }
    const heads = ['#c4a084', '#2a241e', '#4e3e30', '#a8846a', '#3a3a34', '#8a2a20'];
    for (const f of sc.crowd) {
      if (!inChunk(f.x, f.y, 1)) continue;
      const h = hash32(Math.round(f.x * 97) ^ Math.round(f.y * 89));
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.a);
      g.fillStyle = f.colour;
      g.beginPath();
      g.ellipse(0, 0, 0.15, 0.25, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,236,204,0.18)';
      g.beginPath();
      g.ellipse(-0.03, -0.04, 0.1, 0.18, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = heads[h % heads.length];
      g.beginPath();
      g.arc(0.03, 0, 0.11, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (f.flag) {
        // a flag on a pole, the cloth streaming downwind
        g.fillStyle = '#2a2420';
        g.fillRect(f.x + 0.25, f.y - 0.04, 0.08, 0.08);
        const fx = f.x + 0.3;
        const fy = f.y - 0.1;
        if (f.flag === 'fi') {
          g.fillStyle = '#ddd8ca';
          g.fillRect(fx, fy, 0.9, 0.55);
          g.fillStyle = '#2f4f8c';
          g.fillRect(fx + 0.25, fy, 0.14, 0.55);
          g.fillRect(fx, fy + 0.2, 0.9, 0.14);
        } else {
          g.fillStyle = '#a42a1c';
          g.fillRect(fx, fy, 0.9, 0.55);
        }
      }
    }
  }
}

/** Light a shape: a bright strip on the side toward the sun, a dark one away from it. */
function lit(g: CanvasRenderingContext2D, shape: Path2D, k: number, bright: string, dark: string): void {
  for (const [sgn, colour] of [[1, bright], [-1, dark]] as const) {
    g.save();
    g.clip(shape);
    const p = new Path2D();
    p.rect(-1e4, -1e4, 2e4, 2e4);
    // the shape moved down-sun leaves its up-sun edge uncovered, and the reverse
    p.addPath(shape, new DOMMatrix().translate(SHADOW_X * k * sgn, SHADOW_Y * k * sgn));
    g.fillStyle = colour;
    g.fill(p, 'evenodd');
    g.restore();
  }
}

/** A stone: a lopsided quad, never a square. */
function stone(p: Path2D, x: number, y: number, s: number, h: number): void {
  const a = ((h >>> 4) & 0xff) / 40;
  for (let i = 0; i < 4; i++) {
    const r = s * (0.45 + ((hash32(h + i) & 0xff) / 255) * 0.4);
    const px = x + Math.cos(a + i * 1.571) * r;
    const py = y + Math.sin(a + i * 1.571) * r;
    if (i) p.lineTo(px, py);
    else p.moveTo(px, py);
  }
  p.closePath();
}

function key(cx: number, cy: number): number {
  return (cx + 4096) * 8192 + (cy + 4096);
}

/** An irregular blob, never a circle: n points around a radius, jittered by the hash. */
function blob(g: CanvasRenderingContext2D | Path2D, x: number, y: number, r: number, h: number, n: number): void {
  if (!(g instanceof Path2D)) g.beginPath();
  for (let i = 0; i < n; i++) {
    const j = hash32(h + i * 374761393);
    const a = (i / n) * Math.PI * 2 + (h & 0xff) / 40;
    const rr = r * (0.65 + ((j & 0xff) / 255) * 0.5);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}
