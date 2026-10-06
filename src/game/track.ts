import type { RiverDef, ShortcutDef, Surface, SurfacePatch, TrackDef } from './types';
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

/**
 * A shortcut lane as the sim drives it: the open polyline smoothed and
 * sampled like the road, with its own arc length `u` from the entry. It
 * answers where a point is along and off it (`locate`), where the lane is
 * at `u` (`at`), and how it bends ahead, the way the Track does for the
 * road; and it knows where it joins the lap (`entryS`, `exitS`).
 */
export class Lane {
  readonly pts: TrackPoint[] = [];
  readonly length: number;
  readonly width: number;
  readonly surface: Surface;
  /** arc length on the lap where the lane leaves the road and where it comes back */
  entryS = 0;
  exitS = 0;

  constructor(readonly def: ShortcutDef) {
    this.width = def.width;
    this.surface = def.surface;
    const P = def.points;
    const n = P.length;
    const per = 8;
    let s = 0;
    let prev: [number, number] | null = null;
    const at = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const x = catmull(p0[0], p1[0], p2[0], p3[0], t);
        const y = catmull(p0[1], p1[1], p2[1], p3[1], t);
        if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
        this.pts.push({ x, y, s, tx: 0, ty: 0 });
        prev = [x, y];
      }
    }
    const last = P[n - 1];
    s += Math.hypot(last[0] - prev![0], last[1] - prev![1]);
    this.pts.push({ x: last[0], y: last[1], s, tx: 0, ty: 0 });
    this.length = s;
    const m = this.pts.length;
    for (let i = 0; i < m; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(m - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      this.pts[i].tx = dx / l;
      this.pts[i].ty = dy / l;
    }
  }

  /** The nearest point of the lane to (x, y): arc length `u` along it, the distance off it, and the point itself. */
  locate(x: number, y: number): { u: number; dist: number; px: number; py: number } {
    let best = 0;
    let bestD = Infinity;
    const pts = this.pts;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // project onto the better of the two segments at the nearest sample
    let out = { u: pts[best].s, dist: Math.sqrt(bestD), px: pts[best].x, py: pts[best].y };
    for (const j of [best - 1, best + 1]) {
      if (j < 0 || j >= pts.length) continue;
      const a = pts[Math.min(best, j)];
      const b = pts[Math.max(best, j)];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const el = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / el));
      const px = a.x + ex * t;
      const py = a.y + ey * t;
      const dist = Math.hypot(x - px, y - py);
      if (dist < out.dist) out = { u: a.s + (b.s - a.s) * t, dist, px, py };
    }
    return out;
  }

  /** The lane's point and tangent at arc length u, held at the ends. */
  at(u: number): TrackPoint {
    const pts = this.pts;
    u = Math.max(0, Math.min(this.length, u));
    let i = Math.min(pts.length - 2, Math.floor((u / this.length) * (pts.length - 1)));
    while (i > 0 && pts[i].s > u) i--;
    while (i < pts.length - 2 && pts[i + 1].s <= u) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const t = b.s > a.s ? (u - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: u, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t };
  }

  /** How much the lane turns over the next `ahead` metres, radians, signed (positive is right). */
  curvatureAhead(u: number, ahead: number): number {
    const a = this.at(u);
    const b = this.at(u + ahead);
    return Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
  }
}

/** grass between a shortcut lane's edge and its trees, metres: the lane's own verge */
export const LANE_VERGE = 2;

export class Track {
  readonly pts: TrackPoint[] = [];
  readonly length: number;
  readonly width: number;
  /** grass between the road edge and the trees, metres */
  readonly verge = 7;
  readonly trees: Tree[] = [];
  /** the shortcuts, as lanes the sim can drive */
  readonly lanes: Lane[] = [];
  readonly bounds: { minX: number; minY: number; maxX: number; maxY: number };
  private cell = 20;
  private grid = new Map<number, number[]>();
  /** the track's patches and its rivers' water, as patches */
  readonly patches: SurfacePatch[];
  /** the patches that touch each TILE metres of the lap, for surfaceAt */
  private tiles: SurfacePatch[][] = [];

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
    const nt = Math.ceil(this.length / TILE);
    for (let k = 0; k < nt; k++) this.tiles.push([]);
    // a river's water is a patch like a ford's, across the road and the verge, from the lip over the gap
    this.patches = [...(def.patches ?? []), ...(def.rivers ?? []).map((r): SurfacePatch => ({ surface: 'water', s: r.s, to: r.s + r.gap }))];
    for (const p of this.patches) {
      for (let a = p.s; a < p.to; a += TILE) this.tiles[Math.floor((((a % this.length) + this.length) % this.length) / TILE)].push(p);
      const last = this.tiles[Math.floor((((p.to - 0.01) % this.length) + this.length) % this.length / TILE)];
      if (!last.includes(p)) last.push(p);
    }
    this.profiles();
    for (const sc of def.shortcuts ?? []) {
      const lane = new Lane(sc);
      lane.entryS = this.locate(sc.points[0][0], sc.points[0][1]).s;
      lane.exitS = this.locate(sc.points[sc.points.length - 1][0], sc.points[sc.points.length - 1][1]).s;
      this.lanes.push(lane);
    }
    this.plantTrees();
  }

  /** The nearest lane to a point and where the point is against it, or null without shortcuts. */
  laneAt(x: number, y: number): { lane: Lane; u: number; dist: number; px: number; py: number } | null {
    let best: { lane: Lane; u: number; dist: number; px: number; py: number } | null = null;
    for (const lane of this.lanes) {
      const l = lane.locate(x, y);
      if (!best || l.dist < best.dist) best = { lane, ...l };
    }
    return best;
  }

  /** Inside a shortcut lane, its verge included: on its surface, walled by its trees. */
  inLane(x: number, y: number): Lane | null {
    const l = this.laneAt(x, y);
    return l && l.dist <= l.lane.width / 2 + LANE_VERGE ? l.lane : null;
  }

  /** In a river that crosses the road, between the tree lines: nothing grows or stands there. */
  inRiver(x: number, y: number): boolean {
    if (!this.patches.some((p) => p.surface === 'water' && !p.d)) return false;
    const loc = this.locate(x, y);
    return Math.abs(loc.d) < this.width / 2 + this.verge && this.surfaceAt(loc.s, loc.d) === 'water';
  }

  /**
   * The surface at (s, d): a patch if one covers the spot, else the road's
   * surface on it and grass off it. With the world point too, a shortcut
   * lane's surface where the point is inside one.
   */
  surfaceAt(s: number, d: number, x?: number, y?: number): Surface {
    if (x !== undefined && y !== undefined && this.lanes.length) {
      const lane = this.inLane(x, y);
      if (lane) return lane.surface;
    }
    s = ((s % this.length) + this.length) % this.length;
    for (const p of this.tiles[Math.floor(s / TILE)] ?? []) {
      if (!inSpan(s, p.s, p.to, this.length)) continue;
      if (p.d && (d < p.d[0] || d > p.d[1])) continue;
      return p.surface;
    }
    return Math.abs(d) <= this.width / 2 ? this.def.surface : 'grass';
  }

  /**
   * The ground's height at (s, d), metres (ADR 0006): the land's hills along the lap, the bend's
   * bank across the road and the verge, a river's banks and water and a crest's brow on top, and on
   * the gravel road its bumps and the two ruts worn where the wheels run.
   */
  groundAt(s: number, d: number): number {
    const L = this.length;
    s = ((s % L) + L) % L;
    let h = this.hillAt(s);
    const edge = this.width / 2 + this.verge;
    // the bank: the outside of a bend higher, linear across the road and the verge
    h -= this.bankTan(s) * Math.max(-edge, Math.min(edge, d));
    for (const r of this.def.rivers ?? []) {
      const x = ((((s - (r.s - RIVER.ramp)) % L) + L) % L);
      if (x >= RIVER.ramp + r.gap + RIVER.out) continue;
      return h + riverHeight(r, x);
    }
    for (const c of this.def.crests ?? []) {
      const x = ((((s - (c.s - c.len / 2)) % L) + L) % L);
      if (x < c.len) h += (c.h * (1 - Math.cos((2 * Math.PI * x) / c.len))) / 2;
    }
    if (Math.abs(d) < this.width / 2 + 1) h += this.roughAt(s, d);
    return h;
  }

  /** The land's height along the lap, m: the hills, read off a profile laid down once a metre. */
  hillAt(s: number): number {
    const p = this.hills;
    const L = this.length;
    const x = ((((s % L) + L) % L) / L) * p.length;
    const i = Math.floor(x);
    const f = x - i;
    return p[i % p.length] * (1 - f) + p[(i + 1) % p.length] * f;
  }

  /** The bank's slope across the road at s: positive banks the right side of travel down. */
  bankTan(s: number): number {
    const p = this.banks;
    if (!p.length) return 0;
    const L = this.length;
    const x = ((((s % L) + L) % L) / L) * p.length;
    const i = Math.floor(x);
    const f = x - i;
    return p[i % p.length] * (1 - f) + p[(i + 1) % p.length] * f;
  }

  /** The gravel's own surface: bumps a few metres long and the two ruts, m. Only on the road. */
  roughAt(s: number, d: number): number {
    const b = this.def.bumps ?? 0;
    const r = this.def.ruts ?? 0;
    let h = 0;
    if (b) h += (b / 2) * (0.6 * Math.sin(s * 1.9 + Math.sin(d * 1.7) * 2) * Math.cos(d * 1.3 + s * 0.7) + 0.4 * Math.sin(s * 0.83 + d * 2.3));
    // two ruts a car's track apart, where every wheel has run since spring
    if (r) for (const at of [-RUT_AT, RUT_AT]) h -= r * Math.exp(-(((d - at) / RUT_WIDTH) ** 2));
    return h;
  }

  /**
   * Where the land is, anywhere: the ground on the road and the verge, a shortcut lane's own ground
   * inside one, the hills' height in the forest.
   */
  terrainAt(x: number, y: number): number {
    const l = this.locate(x, y);
    if (Math.abs(l.d) <= this.width / 2 + this.verge + 1) return this.groundAt(l.s, l.d);
    const lane = this.laneAt(x, y);
    if (lane && lane.dist <= lane.lane.width / 2 + LANE_VERGE + 2) return this.laneGround(lane.lane, lane.u);
    return this.hillAt(l.s);
  }

  /**
   * A shortcut lane's ground at u: from the ground where it leaves the road to the ground where it
   * comes back, eased at both ends. The land's own height under a lane jumped where the nearest
   * stretch of road changed from one leg of a hairpin to the other.
   */
  laneGround(lane: Lane, u: number): number {
    const a = lane.at(0);
    const b = lane.at(lane.length);
    const la = this.locate(a.x, a.y);
    const lb = this.locate(b.x, b.y);
    const ha = this.groundAt(la.s, la.d);
    const hb = this.groundAt(lb.s, lb.d);
    const k = Math.max(0, Math.min(1, u / lane.length));
    return ha + (hb - ha) * k * k * (3 - 2 * k);
  }

  /** The grid the ground is laid on, by both the physics and the 3D view: s every metre and at the rivers' lips, d finer on the road. */
  groundGrid(): { ss: number[]; across: number[] } {
    if (this.grid0) return this.grid0;
    const ss: number[] = [];
    for (let s = 0; s < this.length; s += 1) ss.push(s);
    for (const r of this.def.rivers ?? []) ss.push(r.s - 0.02, r.s + 0.02);
    const sorted = [...new Set(ss.map((s) => ((s % this.length) + this.length) % this.length))].sort((a, b) => a - b);
    const half = this.width / 2;
    const edge = half + this.verge;
    const across: number[] = [-(edge + 2), -edge, -(edge + half + 1.5) / 2, -(half + 1.5)];
    // the road and a metre either side at a quarter metre where it has ruts and bumps (half a metre
    // wide), else in eight steps: a test oval 160 m wide at a quarter metre crashed Rapier's mesh builder
    const fine = this.def.bumps || this.def.ruts ? 0.25 : (half + 1.5) / 4;
    for (let d = -(half + 1.5) + fine; d < half + 1.5 - 1e-6; d += fine) across.push(Math.round(d * 100) / 100);
    across.push(half + 1.5, (edge + half + 1.5) / 2, edge, edge + 2);
    this.grid0 = { ss: sorted, across };
    return this.grid0;
  }
  private grid0: { ss: number[]; across: number[] } | null = null;

  /** The hills, once a metre, and the bank, once a metre: laid down when the track is built. */
  private profiles(): void {
    const L = this.length;
    const n = Math.max(1, Math.round(L));
    this.hills = new Float32Array(n);
    for (const hl of this.def.hills ?? []) {
      for (let i = 0; i < n; i++) {
        const s = (i / n) * L;
        const x = ((((s - (hl.s - hl.len / 2)) % L) + L) % L);
        if (x < hl.len) this.hills[i] += (hl.h * (1 - Math.cos((2 * Math.PI * x) / hl.len))) / 2;
      }
    }
    const bank = this.def.bank ?? 0;
    this.banks = new Float32Array(bank ? n : 0);
    if (bank) {
      // the bend's curvature over 12 m, signed, eased over 20 m so the bank rolls in and out
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const s = (i / n) * L;
        const k = this.curvatureAhead(s - 6, 12) / 12;
        raw[i] = Math.tan(Math.max(-1, Math.min(1, k / BANK_FULL_AT)) * bank);
      }
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = -10; j <= 10; j++) sum += raw[(i + j + n) % n];
        this.banks[i] = sum / 21;
      }
    }
  }
  private hills = new Float32Array(1);
  private banks = new Float32Array(0);

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
    const edge = this.width / 2 + this.verge;
    // The wall first: the physics stops a car at `edge` from the road and at a lane's verge
    // (physics.ts, treeContacts), so a tree stands on every metre of that line. Without this
    // row the first trees began a metre further out with gaps between them, and a car sat
    // "stuck on open grass" against a wall nothing showed.
    const row = (x: number, y: number, r: number, seed: number) => {
      if (this.inRiver(x, y)) return;
      this.trees.push({ x, y, r, kind: seed & 3 });
    };
    const WALL_STEP = 2.6;
    for (let s = 0; s < this.length; s += WALL_STEP) {
      const p = this.at(s);
      const h = hash32(Math.round(s * 7919) ^ 0x5bd1);
      const r = 1.7 + ((h >>> 8) & 0xff) / 255 * 0.6;
      for (const side of [-1, 1]) {
        const d = side * (edge + r * 0.55);
        const x = p.x - p.ty * d;
        const y = p.y + p.tx * d;
        // not across a lane's mouth, and not where the road doubles back on itself
        const lane = this.laneAt(x, y);
        if (lane && lane.dist < lane.lane.width / 2 + LANE_VERGE + r) continue;
        if (Math.abs(this.locate(x, y).d) < edge) continue;
        row(x, y, r, h >>> 4);
      }
    }
    for (const lane of this.lanes) {
      for (let u = 0; u < lane.length; u += WALL_STEP) {
        const p = lane.at(u);
        const h = hash32(Math.round(u * 6007) ^ 0x1f3d);
        const r = 1.6 + ((h >>> 8) & 0xff) / 255 * 0.5;
        for (const side of [-1, 1]) {
          const d = side * (lane.width / 2 + LANE_VERGE + r * 0.55);
          const x = p.x - p.ty * d;
          const y = p.y + p.tx * d;
          if (Math.abs(this.locate(x, y).d) < edge + r) continue;
          const other = this.laneAt(x, y);
          if (other && other.dist < other.lane.width / 2 + LANE_VERGE) continue;
          row(x, y, r, h >>> 4);
        }
      }
    }
    // then the forest behind it, dense enough that it reads as forest, not a park
    const step = 4.5;
    const { minX, minY, maxX, maxY } = this.bounds;
    for (let gx = Math.floor(minX / step); gx * step < maxX; gx++) {
      for (let gy = Math.floor(minY / step); gy * step < maxY; gy++) {
        const h = hash32((gx * 73856093) ^ (gy * 19349663) ^ 7);
        if ((h & 0xff) < 40) continue;
        const x = gx * step + ((h >>> 8) & 0xff) / 255 * step;
        const y = gy * step + ((h >>> 16) & 0xff) / 255 * step;
        const near = this.locate(x, y);
        if (Math.abs(near.d) < edge + 1) continue;
        // the gap in the forest a shortcut runs through
        const lane = this.laneAt(x, y);
        if (lane && lane.dist < lane.lane.width / 2 + LANE_VERGE + 1) continue;
        this.trees.push({ x, y, r: 1.8 + ((h >>> 24) & 0xff) / 255 * 1.6, kind: (h >>> 4) & 3 });
      }
    }
  }
}

/**
 * A river's shape along the lap (RiverDef): the near bank's climb in metres, the water's level
 * under the road, the far bank's climb back out in metres.
 */
export const RIVER = { ramp: 12, water: -0.6, out: 8 };

/**
 * The height at x metres from the foot of a river's near bank. The climb steepens toward the
 * lip, so the car leaves it rising, the way a bank thrown up by a road does; the far bank is a
 * plain slope a car in the water drives up.
 */
export function riverHeight(r: RiverDef, x: number): number {
  if (x < 0) return 0;
  if (x < RIVER.ramp) return r.bank * (x / RIVER.ramp) ** 2;
  if (x < RIVER.ramp + r.gap) return RIVER.water;
  const k = (x - RIVER.ramp - r.gap) / RIVER.out;
  return k < 1 ? RIVER.water * (1 - k) ** 2 : 0;
}

/** m off the centreline where the two ruts run, and their half width */
const RUT_AT = 0.75;
const RUT_WIDTH = 0.28;
/** curvature, rad/m, at which a bend is banked fully: a 20 m radius */
const BANK_FULL_AT = 1 / 20;

/** metres of lap per tile of the surface lookup */
const TILE = 4;
/** how far past the tree line a river is drawn, metres: it runs on under the trees, which stay the wall */
export const RIVER_REACH = 24;

function inSpan(s: number, from: number, to: number, length: number): boolean {
  const a = ((s - from) % length + length) % length;
  return a < to - from;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
