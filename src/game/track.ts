import type { TrackDef } from './types';
import { hash32 } from './rng';

/**
 * Track geometry. The definition is a coarse closed polyline; this smooths
 * it (Catmull-Rom, a few samples per segment) into `pts`, and answers the
 * two questions the sim and the bot ask: where on the lap is this car
 * (`locate`), and where is the road at this distance along the lap
 * (`at`). Both work on arc length `s` in metres, 0 at the start line.
 */
export interface TrackPoint {
  x: number;
  y: number;
  /** arc length from the start line */
  s: number;
  /** unit tangent */
  tx: number;
  ty: number;
}

export interface Located {
  /** arc length along the lap */
  s: number;
  /** signed distance from the centreline, positive to the right of travel */
  d: number;
  /** index of the nearest sample */
  i: number;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
  kind: number;
}

export class Track {
  readonly pts: TrackPoint[] = [];
  readonly length: number;
  readonly width: number;
  /** grass between the road edge and the trees, metres */
  readonly verge = 7;
  readonly trees: Tree[] = [];
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  private cell = 20;
  private grid = new Map<number, number[]>();

  constructor(readonly def: TrackDef) {
    this.width = def.width;
    const P = def.points;
    const n = P.length;
    const per = 8;
    let s = 0;
    let prev: [number, number] | null = null;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n];
      const p1 = P[i];
      const p2 = P[(i + 1) % n];
      const p3 = P[(i + 2) % n];
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const x = catmull(p0[0], p1[0], p2[0], p3[0], t);
        const y = catmull(p0[1], p1[1], p2[1], p3[1], t);
        if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
        this.pts.push({ x, y, s, tx: 0, ty: 0 });
        prev = [x, y];
      }
    }
    const first = this.pts[0];
    this.length = s + Math.hypot(first.x - prev![0], first.y - prev![1]);
    const m = this.pts.length;
    for (let i = 0; i < m; i++) {
      const a = this.pts[(i - 1 + m) % m];
      const b = this.pts[(i + 1) % m];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      this.pts[i].tx = dx / l;
      this.pts[i].ty = dy / l;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const pad = 90;
    this.bounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    for (let i = 0; i < m; i++) {
      const p = this.pts[i];
      const key = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell));
      const list = this.grid.get(key);
      if (list) list.push(i); else this.grid.set(key, [i]);
    }
    this.plantTrees();
  }

  private key(cx: number, cy: number): number {
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  /** Nearest centreline sample to a point, by the cell grid, falling back to a full scan far from the road. */
  locate(x: number, y: number): Located {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let r = 1; r <= 2 && best < 0; r++) {
      for (let i = cx - r; i <= cx + r; i++) {
        for (let j = cy - r; j <= cy + r; j++) {
          const list = this.grid.get(this.key(i, j));
          if (!list) continue;
          for (const k of list) {
            const p = this.pts[k];
            const d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < bestD) { bestD = d; best = k; }
          }
        }
      }
    }
    if (best < 0) {
      for (let k = 0; k < this.pts.length; k++) {
        const p = this.pts[k];
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    return this.refine(best, x, y);
  }

  /** Project onto the segment at the nearest sample for a smooth s and d. */
  private refine(i: number, x: number, y: number): Located {
    const m = this.pts.length;
    const p = this.pts[i];
    const dx = x - p.x;
    const dy = y - p.y;
    // along-track component tells which neighbour segment the point is on
    const along = dx * p.tx + dy * p.ty;
    const j = along >= 0 ? (i + 1) % m : (i - 1 + m) % m;
    const q = this.pts[j];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const el = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / el));
    const px = p.x + ex * t;
    const py = p.y + ey * t;
    const segLen = Math.sqrt(el);
    let s = along >= 0 ? p.s + segLen * t : p.s - segLen * t;
    if (along >= 0 && j === 0) s = p.s + segLen * t; // last sample to the start line
    s = ((s % this.length) + this.length) % this.length;
    const tx = along >= 0 ? ex / segLen : -ex / segLen;
    const ty = along >= 0 ? ey / segLen : -ey / segLen;
    // right of travel is (-ty, tx) with y down
    const d = (x - px) * -ty + (y - py) * tx;
    return { s, d, i };
  }

  /** The centreline point and tangent at arc length s. */
  at(s: number): TrackPoint {
    s = ((s % this.length) + this.length) % this.length;
    const pts = this.pts;
    // samples are roughly evenly spaced: guess, then walk
    let i = Math.min(pts.length - 1, Math.floor((s / this.length) * pts.length));
    while (i > 0 && pts[i].s > s) i--;
    while (i < pts.length - 1 && pts[i + 1].s <= s) i++;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const bs = i === pts.length - 1 ? this.length : b.s;
    const t = bs > a.s ? (s - a.s) / (bs - a.s) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t };
  }

  /** How much the road turns over the next `ahead` metres, radians, signed (positive is right). */
  curvatureAhead(s: number, ahead: number): number {
    const a = this.at(s);
    const b = this.at(s + ahead);
    return Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
  }

  /** Deterministic forest outside the verge; the renderer culls by view. */
  private plantTrees(): void {
    const step = 9;
    const { minX, minY, maxX, maxY } = this.bounds;
    const edge = this.width / 2 + this.verge;
    for (let gx = Math.floor(minX / step); gx * step < maxX; gx++) {
      for (let gy = Math.floor(minY / step); gy * step < maxY; gy++) {
        const h = hash32((gx * 73856093) ^ (gy * 19349663) ^ 7);
        if ((h & 0xff) < 40) continue;
        const x = gx * step + ((h >>> 8) & 0xff) / 255 * step;
        const y = gy * step + ((h >>> 16) & 0xff) / 255 * step;
        const near = this.locate(x, y);
        if (Math.abs(near.d) < edge + 1) continue;
        this.trees.push({ x, y, r: 2.6 + ((h >>> 24) & 0xff) / 255 * 2.4, kind: (h >>> 4) & 3 });
      }
    }
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
