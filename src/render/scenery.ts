import type { Track } from '../game/track';
import { hash32 } from '../game/rng';
import { SPRUCE_VARIANTS } from './sprites';

/**
 * The roadside, read off the track once: kilometre posts, reflector posts
 * in the corners, hay bales at the hairpins, a barn by the start, a power
 * line across the start straight and a crowd along it and at the
 * tightest hairpin. All cosmetic, so it lives in the renderer and never
 * touches the sim. Placement is a pure function of the track: the same
 * track always gets the same roadside.
 */
export interface Prop {
  kind: 'km' | 'reflector' | 'bale';
  x: number;
  y: number;
  /** heading of the road here, radians */
  a: number;
  /** the km post's number, the bale's size */
  n: number;
}

export interface Figure {
  x: number;
  y: number;
  /** faces the road */
  a: number;
  colour: string;
  /** a flag on a pole rather than a person */
  flag?: string;
}

export interface Pole {
  x: number;
  y: number;
  /** the crossarm's heading */
  a: number;
}

export interface Barn {
  x: number;
  y: number;
  a: number;
  len: number;
  wid: number;
}

export interface SceneTree {
  x: number;
  y: number;
  r: number;
  birch: boolean;
  /** metres tall, for the shadow */
  h: number;
  /** sprite variant */
  v: number;
}

/** Low things in the straw past the ditch: juniper, glacial boulders, clumps of tall grass. Baked into the ground. */
export interface Shrub {
  x: number;
  y: number;
  r: number;
  rock: boolean;
  /** a clump of tall dry grass rather than a juniper */
  tuft?: boolean;
  v: number;
}

export interface Scenery {
  props: Prop[];
  crowd: Figure[];
  /** spectator tape: pairs of stakes */
  tape: { x: number; y: number }[][];
  poles: Pole[];
  barn: Barn;
  trees: SceneTree[];
  shrubs: Shrub[];
}

const JACKETS = ['#3d3a2c', '#4a4f3a', '#2f3440', '#5a3a2c', '#24221e', '#6a6250', '#47505a', '#5c2f26', '#3a3a3a'];

export function buildScenery(t: Track): Scenery {
  const half = t.width / 2;
  const limit = half + t.verge;
  const props: Prop[] = [];
  const crowd: Figure[] = [];
  const tape: { x: number; y: number }[][] = [];
  const poles: Pole[] = [];
  /** places the trees must leave alone: centre and radius */
  const clear: { x: number; y: number; r: number }[] = [];
  const side = (s: number, d: number) => {
    const p = t.at(s);
    // right of travel is (-ty, tx) with y down
    return { x: p.x - p.ty * d, y: p.y + p.tx * d, a: Math.atan2(p.ty, p.tx) };
  };

  // kilometre posts every hundred metres on the right, numbered in hundreds
  for (let s = 100, n = 1; s < t.length - 20; s += 100, n++) {
    const q = side(s, half + 1.4);
    props.push({ kind: 'km', x: q.x, y: q.y, a: q.a, n });
  }

  // reflector posts along the straights too, now and then, either side
  for (let s = 20, n = 0; s < t.length - 10; s += 38, n++) {
    if (Math.abs(t.curvatureAhead(s - 8, 16)) >= 0.42) continue;
    const q = side(s, (n & 1 ? 1 : -1) * (half + 1.1));
    props.push({ kind: 'reflector', x: q.x, y: q.y, a: q.a, n: 0 });
  }

  // corners: reflector posts on the outside, bales at the apex of the tightest ones
  const turn = (s: number) => t.curvatureAhead(s - 8, 16);
  for (let s = 0; s < t.length; s += 7) {
    const k = turn(s);
    if (Math.abs(k) < 0.42) continue;
    const q = side(s, -Math.sign(k) * (half + 1.1));
    props.push({ kind: 'reflector', x: q.x, y: q.y, a: q.a, n: 0 });
  }
  const apexes: { s: number; k: number }[] = [];
  for (let s = 0; s < t.length; s += 2) {
    const k = Math.abs(t.curvatureAhead(s - 12, 24));
    if (k < 1.0) continue;
    if (k >= Math.abs(t.curvatureAhead(s - 14, 24)) && k >= Math.abs(t.curvatureAhead(s - 10, 24))) apexes.push({ s, k });
  }
  for (const ap of apexes) {
    const sign = -Math.sign(t.curvatureAhead(ap.s - 12, 24));
    for (let i = -2; i <= 2; i++) {
      const h = hash32(Math.round(ap.s) * 31 + i);
      const q = side(ap.s + i * 2.6, sign * (half + 2.3 + ((h & 0xff) / 255) * 0.6));
      props.push({ kind: 'bale', x: q.x, y: q.y, a: q.a + ((h >>> 8) & 0xff) / 255, n: 0.62 + ((h >>> 16) & 0xff) / 255 * 0.12 });
    }
  }

  // a crowd: rows of people behind tape, beyond where a car can reach
  const crowdAt = (s0: number, s1: number, sign: number, salt: number) => {
    const d0 = limit + 0.9;
    const row: { x: number; y: number }[] = [];
    for (let s = s0; s <= s1; s += 3) {
      const q = side(s, sign * (limit + 0.4));
      row.push({ x: q.x, y: q.y });
    }
    tape.push(row);
    let i = 0;
    for (let s = s0; s <= s1; s += 0.8) {
      for (let r = 0; r < 3; r++, i++) {
        const h = hash32(salt * 7919 + i);
        if ((h & 0xff) < 70 + r * 50) continue;
        const d = sign * (d0 + r * 0.95 + ((h >>> 8) & 0xff) / 255 * 0.5);
        const q = side(s + (((h >>> 16) & 0xff) / 255 - 0.5) * 0.6, d);
        const flag = ((h >>> 24) & 0x1f) === 0 ? (((h >>> 5) & 1) ? 'fi' : 'red') : undefined;
        crowd.push({ x: q.x, y: q.y, a: q.a + (sign > 0 ? -Math.PI / 2 : Math.PI / 2) + (((h >>> 12) & 0xff) / 255 - 0.5) * 0.9, colour: JACKETS[(h >>> 20) % JACKETS.length], flag });
      }
    }
    for (let s = s0 - 2; s <= s1 + 2; s += 3) {
      const q = side(s, sign * (d0 + 1.4));
      clear.push({ x: q.x, y: q.y, r: 3.4 });
    }
  };
  // the start straight on the left, and the tightest hairpin on its outside
  crowdAt(-14, 30, -1, 1);
  if (apexes.length) {
    const top = apexes.reduce((a, b) => (b.k > a.k ? b : a));
    crowdAt(top.s - 10, top.s + 10, -Math.sign(t.curvatureAhead(top.s - 12, 24)), 2);
  }

  // the barn: weathered red ochre, end-on to the road just before the line, left side
  const bq = side(-38, -(limit + 7));
  const barn: Barn = { x: bq.x, y: bq.y, a: bq.a, len: 11, wid: 7 };
  clear.push({ x: bq.x, y: bq.y, r: 9 });

  // the power line: along the start straight on the right, poles every 30 m, its
  // corridor cut through the forest behind the first trees
  const a0 = side(-30, limit + 12);
  const a1 = side(70, limit + 12);
  const dx = a1.x - a0.x;
  const dy = a1.y - a0.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  for (let u = -60; u <= len + 60; u += 30) {
    const x = a0.x + ux * u;
    const y = a0.y + uy * u;
    if (Math.abs(t.locate(x, y).d) < limit + 0.5) continue;
    poles.push({ x, y, a: Math.atan2(uy, ux) + Math.PI / 2 });
  }
  const nearLine = (x: number, y: number) => {
    const px = x - a0.x;
    const py = y - a0.y;
    const u = px * ux + py * uy;
    return u > -75 && u < len + 75 && Math.abs(px * -uy + py * ux) < 4.5;
  };

  // juniper and boulders in the straw past the ditch, where the camera sees them
  const shrubs: Shrub[] = [];
  for (let s = 0; s < t.length; s += 2.5) {
    for (const sign of [-1, 1]) {
      const h = hash32(Math.round(s * 4) * 2 + (sign > 0 ? 1 : 0) + 55555);
      const roll = h & 0xff;
      if (roll > 70) continue;
      const rock = roll < 14;
      const d = sign * (half + (rock ? 6.2 : 4.4) + (((h >>> 8) & 0xff) / 255) * 2.6);
      const q = side(s + (((h >>> 16) & 0xff) / 255 - 0.5) * 2, d);
      if (clear.some((c) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 < c.r * c.r) || t.inRiver(q.x, q.y)) continue;
      shrubs.push({ x: q.x, y: q.y, r: rock ? 0.35 + ((h >>> 24) & 0xff) / 255 * 0.6 : 0.4 + ((h >>> 24) & 0xff) / 255 * 0.5, rock, v: (h >>> 4) & 7 });
    }
  }

  // life just past the worn earth, inside the frame on a phone held upright: grass clumps,
  // young juniper, half-buried stones. All low enough to drive over; the sim never sees them
  for (let s = 0; s < t.length; s += 1.6) {
    for (const sign of [-1, 1]) {
      const h = hash32(Math.round(s * 5) * 2 + (sign > 0 ? 1 : 0) + 77001);
      const roll = h & 0xff;
      if (roll > 72) continue;
      const tuft = roll < 36;
      const rock = !tuft && roll < 52;
      const d = sign * (half + 3.5 + (((h >>> 8) & 0xff) / 255) * 2.2);
      const q = side(s + (((h >>> 16) & 0xff) / 255 - 0.5) * 1.4, d);
      if (clear.some((c) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 < c.r * c.r) || t.inRiver(q.x, q.y)) continue;
      const k = ((h >>> 24) & 0xff) / 255;
      shrubs.push({ x: q.x, y: q.y, r: tuft ? 0.3 + k * 0.25 : rock ? 0.18 + k * 0.28 : 0.25 + k * 0.2, rock, tuft, v: (h >>> 4) & 7 });
    }
  }

  // the forest: spruce, and birch where the light gets in at the edge
  const trees: SceneTree[] = [];
  for (const tr of t.trees) {
    if (nearLine(tr.x, tr.y)) continue;
    if (clear.some((c) => (tr.x - c.x) ** 2 + (tr.y - c.y) ** 2 < (c.r + tr.r * 0.6) ** 2)) continue;
    const h = hash32(Math.round(tr.x * 13) * 7349 + Math.round(tr.y * 7));
    const edge = Math.abs(t.locate(tr.x, tr.y).d) < limit + 6;
    const birch = tr.kind === 2 ? edge || (h & 3) === 0 : tr.kind === 3 && edge && (h & 1) === 0;
    // spruce in three ages, so a stand never reads as one tree stamped: young, grown, old
    const age = birch ? 1 : [0.62, 1, 1, 1.28][(h >>> 10) & 3];
    const r = birch ? tr.r * 0.82 : tr.r * 0.86 * age;
    trees.push({ x: tr.x, y: tr.y, r, birch, h: birch ? r * 3 : r * 3.3, v: birch ? (h >>> 4) & 3 : (h >>> 4) % SPRUCE_VARIANTS });
  }
  // the taller drawn last, so a crown never sits under a smaller one
  trees.sort((p, q) => p.h - q.h);
  return { props: props.filter((p) => !t.inRiver(p.x, p.y)), crowd, tape, poles, barn, trees, shrubs };
}
