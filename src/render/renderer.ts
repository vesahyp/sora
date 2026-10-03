import type { SimState } from '../game/state';
import type { Track } from '../game/track';
import { carSprite, treeSprite, wheelLayout, SPRITE_PPM } from './sprites';
import { hash32 } from '../game/rng';
import { PICKUPS } from '../game/content/pickups';
import { GUN } from '../game/content/weapons';

/**
 * Draws the world. North-up camera that follows the car and leads it a
 * little in the direction of travel, the Super Cars II view. The road is
 * one stroked path at road width, so a new track draws itself. Dust is
 * cosmetic and lives here, not in the sim.
 */
interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  /** black smoke rather than dust */
  dark?: boolean;
}

/** pixels per metre of the skid mark layer */
const MARK_PPM = 3;

export class Renderer {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** css px per metre */
  ppm = 11;
  private camX = 0;
  private camY = 0;
  private camInit = false;
  private dust: Dust[] = [];
  private grass: CanvasPattern | null = null;
  private roadPath: Path2D | null = null;
  private roadFor: Track | null = null;
  private rutL: Path2D | null = null;
  private rutR: Path2D | null = null;
  /** skid marks, drawn once and kept: a canvas over the track's bounds at MARK_PPM */
  private marks: HTMLCanvasElement | null = null;
  private marksG: CanvasRenderingContext2D | null = null;
  private lastWheel: { x: number; y: number }[][] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // the road should be about a quarter of the short side
    const short = Math.min(this.w, this.h);
    this.ppm = Math.max(8, Math.min(14, short / 36));
  }

  view(): { w: number; h: number } {
    return { w: this.w / this.ppm, h: this.h / this.ppm };
  }

  /** where a world point lands on screen, css px */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.camX) * this.ppm + this.w / 2, y: (y - this.camY) * this.ppm + this.h / 2 };
  }

  private ensureRoad(t: Track): void {
    if (this.roadFor === t) return;
    this.roadFor = t;
    const b = t.bounds;
    const m = document.createElement('canvas');
    m.width = Math.ceil((b.maxX - b.minX) * MARK_PPM);
    m.height = Math.ceil((b.maxY - b.minY) * MARK_PPM);
    this.marks = m;
    this.marksG = m.getContext('2d');
    this.lastWheel = [];
    const path = new Path2D();
    const l = new Path2D();
    const r = new Path2D();
    const off = t.width * 0.22;
    t.pts.forEach((p, i) => {
      if (i === 0) {
        path.moveTo(p.x, p.y);
        l.moveTo(p.x - p.ty * -off, p.y + p.tx * -off);
        r.moveTo(p.x - p.ty * off, p.y + p.tx * off);
      } else {
        path.lineTo(p.x, p.y);
        l.lineTo(p.x - p.ty * -off, p.y + p.tx * -off);
        r.lineTo(p.x - p.ty * off, p.y + p.tx * off);
      }
    });
    path.closePath();
    l.closePath();
    r.closePath();
    this.roadPath = path;
    this.rutL = l;
    this.rutR = r;
  }

  private ensureGrass(): void {
    if (this.grass) return;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4c7a2e';
    g.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 260; i++) {
      const h = hash32(i * 2654435761 + 11);
      const x = (h & 0xff) / 255 * 96;
      const y = ((h >>> 8) & 0xff) / 255 * 96;
      const k = ((h >>> 16) & 0xff) / 255;
      g.fillStyle = k < 0.5 ? 'rgba(30,60,20,0.35)' : 'rgba(150,190,80,0.25)';
      g.fillRect(x, y, 2 + k * 3, 1.5 + k * 2);
    }
    this.grass = this.g.createPattern(c, 'repeat');
  }

  draw(s: SimState, dt: number): void {
    const g = this.g;
    const c = s.cars[0];
    const t = s.track;
    this.ensureRoad(t);
    this.ensureGrass();
    // camera: lead the car by half a second of travel
    const lead = 0.55;
    const tx = c.x + c.vx * lead;
    const ty = c.y + c.vy * lead;
    if (!this.camInit) {
      this.camX = tx;
      this.camY = ty;
      this.camInit = true;
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // the shake: a jolt that dies with s.shake
    const shakeX = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 14 : 0;
    const shakeY = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 14 : 0;
    g.translate(shakeX, shakeY);
    // grass, the whole screen
    g.save();
    const ps = this.ppm / 12;
    g.scale(ps, ps);
    g.translate(((-this.camX * this.ppm + this.w / 2) / ps) % 96, ((-this.camY * this.ppm + this.h / 2) / ps) % 96);
    g.fillStyle = this.grass!;
    g.fillRect(-96, -96, this.w / ps + 192, this.h / ps + 192);
    g.restore();

    // world space
    g.save();
    g.translate(this.w / 2, this.h / 2);
    g.scale(this.ppm, this.ppm);
    g.translate(-this.camX, -this.camY);
    const halfW = this.w / 2 / this.ppm + 6;
    const halfH = this.h / 2 / this.ppm + 6;
    const visible = (x: number, y: number) => Math.abs(x - this.camX) < halfW && Math.abs(y - this.camY) < halfH;

    // the road: verge, edge, gravel, ruts
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#5d7a37';
    g.lineWidth = t.width + 3.2;
    g.stroke(this.roadPath!);
    g.strokeStyle = '#8a7a5e';
    g.lineWidth = t.width + 0.9;
    g.stroke(this.roadPath!);
    g.strokeStyle = t.def.surface === 'gravel' ? '#b9a98a' : '#5a5a5e';
    g.lineWidth = t.width;
    g.stroke(this.roadPath!);
    g.strokeStyle = 'rgba(90,75,50,0.22)';
    g.lineWidth = 1.1;
    g.stroke(this.rutL!);
    g.stroke(this.rutR!);
    // start line
    const sp = t.at(0);
    g.save();
    g.translate(sp.x, sp.y);
    g.rotate(Math.atan2(sp.ty, sp.tx));
    const cells = 6;
    const cw = t.width / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
        g.fillRect(-1.2 + j * 1.2, -t.width / 2 + i * cw, 1.2, cw);
      }
    }
    g.restore();

    // skid marks: lay this frame's, then paint the layer
    this.layMarks(s);
    if (this.marks) g.drawImage(this.marks, t.bounds.minX, t.bounds.minY, this.marks.width / MARK_PPM, this.marks.height / MARK_PPM);

    // pickups: a disc with a glyph, bobbing
    for (const p of s.pickups) {
      if (p.gone > 0 || !visible(p.x, p.y)) continue;
      const def = PICKUPS[p.kind];
      const bob = Math.sin(s.time * 4 + p.x) * 0.15;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(p.x, p.y + 0.4, 1.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = def.colour;
      g.beginPath();
      g.arc(p.x, p.y + bob, 1.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 0.2;
      g.stroke();
      g.fillStyle = '#1a1612';
      g.font = 'bold 1.6px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText({ cash: '$', nitro: 'N', wrench: '+', missile: '^', mine: 'o' }[p.kind], p.x, p.y + bob + 0.1);
    }

    // mines: a dark disc with a red eye
    for (const m of s.mines) {
      if (!visible(m.x, m.y)) continue;
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.arc(m.x, m.y, 0.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = Math.sin(s.time * 8) > 0 ? '#ff3020' : '#701008';
      g.beginPath();
      g.arc(m.x, m.y, 0.3, 0, Math.PI * 2);
      g.fill();
    }

    // bullets: tracers
    g.strokeStyle = 'rgba(255,230,120,0.9)';
    g.lineWidth = 0.22;
    g.lineCap = 'round';
    for (const b of s.bullets) {
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      g.stroke();
    }

    // dust
    this.stepDust(s, dt);
    for (const d of this.dust) {
      const k = d.age / d.life;
      g.fillStyle = d.dark ? `rgba(40,36,34,${(1 - k) * 0.6})` : `rgba(190,175,140,${(1 - k) * 0.55})`;
      g.beginPath();
      g.arc(d.x, d.y, d.r * (0.6 + k * 1.6), 0, Math.PI * 2);
      g.fill();
    }

    // the player's sights: a ring on the car in the cone, filling as the lock holds
    const me = s.cars[0];
    if (me.target >= 0 && me.wreck <= 0) {
      const o = s.cars[me.target];
      const k = Math.min(1, me.lockTime / 0.5);
      g.strokeStyle = `rgba(255,${k < 1 ? 230 : 80},60,0.9)`;
      g.lineWidth = 0.3;
      g.setLineDash(k < 1 ? [0.8, 0.6] : []);
      g.beginPath();
      g.arc(o.x, o.y, 2.8, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // the cone, faint, so the auto-fire reads
    if (me.wreck <= 0 && s.hold <= 0) {
      g.fillStyle = `rgba(255,220,120,${me.target >= 0 ? 0.1 : 0.04})`;
      g.beginPath();
      g.moveTo(me.x, me.y);
      g.arc(me.x, me.y, GUN.range * 0.6, me.heading - GUN.cone, me.heading + GUN.cone);
      g.closePath();
      g.fill();
    }

    // the cars, the player last so it is never hidden: shadow, then the sprite
    for (let i = s.cars.length - 1; i >= 0; i--) {
      const car = s.cars[i];
      if (car.wreck > 0) {
        // a wreck: the body, charred, and fire on it
        g.save();
        g.translate(car.x, car.y);
        g.rotate(car.heading);
        g.globalAlpha = 0.6;
        g.filter = 'brightness(0.35)';
        const w = carSprite(car.def);
        g.drawImage(w, -w.width / SPRITE_PPM / 2, -w.height / SPRITE_PPM / 2, w.width / SPRITE_PPM, w.height / SPRITE_PPM);
        g.filter = 'none';
        g.globalAlpha = 1;
        g.restore();
        for (let k = 0; k < 3; k++) {
          const a = s.time * 9 + k * 2.1 + i;
          g.fillStyle = `rgba(255,${120 + Math.sin(a) * 60},30,${0.7 + Math.sin(a * 1.7) * 0.2})`;
          g.beginPath();
          g.arc(car.x + Math.cos(a) * 0.8, car.y + Math.sin(a * 1.3) * 0.6, 0.9 + Math.sin(a * 2) * 0.3, 0, Math.PI * 2);
          g.fill();
        }
        if (Math.random() < dt * 20) this.dust.push({ x: car.x, y: car.y, vx: (Math.random() - 0.5) * 1.5, vy: -1.5 - Math.random(), age: 0, life: 1.4, r: 1, dark: true });
        continue;
      }
      const spr = carSprite(car.def);
      const sw = spr.width / SPRITE_PPM;
      const sh = spr.height / SPRITE_PPM;
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.heading);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(-0.1, 0.25, car.def.length * 0.5, car.def.width * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      // the front wheels, turned with the steering, under the body
      const wh = wheelLayout(car.def);
      const k = 1 / SPRITE_PPM;
      const L = car.def.length;
      const W = car.def.width;
      const fx = wh.frontX * k + (wh.wl * k) / 2 - L / 2;
      const ang = car.steer * 0.55;
      g.fillStyle = '#1a1612';
      for (const y of [-wh.out * k + (wh.ww * k) / 2 - W / 2, (W - wh.ww + wh.out) * k + (wh.ww * k) / 2 - W / 2]) {
        g.save();
        g.translate(fx, y);
        g.rotate(ang);
        g.fillRect((-wh.wl * k) / 2, (-wh.ww * k) / 2, wh.wl * k, wh.ww * k);
        g.restore();
      }
      g.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
      if (car.boosting > 0) {
        // the nitro flame out of the back
        const len = 1.6 + Math.random() * 1.4;
        g.fillStyle = `rgba(120,200,255,0.85)`;
        g.beginPath();
        g.moveTo(-L / 2, -0.35);
        g.lineTo(-L / 2 - len, 0);
        g.lineTo(-L / 2, 0.35);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.moveTo(-L / 2, -0.15);
        g.lineTo(-L / 2 - len * 0.5, 0);
        g.lineTo(-L / 2, 0.15);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // missiles: a dart with a flame
    for (const m of s.missiles) {
      g.save();
      g.translate(m.x, m.y);
      g.rotate(m.heading);
      g.fillStyle = `rgba(255,${150 + Math.random() * 80},40,0.8)`;
      g.beginPath();
      g.moveTo(-0.9, 0);
      g.lineTo(-2.2 - Math.random() * 0.8, 0.35);
      g.lineTo(-2.2 - Math.random() * 0.8, -0.35);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8e4d8';
      g.fillRect(-0.9, -0.22, 1.6, 0.44);
      g.fillStyle = '#c8352a';
      g.beginPath();
      g.moveTo(0.7, -0.22);
      g.lineTo(1.2, 0);
      g.lineTo(0.7, 0.22);
      g.closePath();
      g.fill();
      g.restore();
    }

    // smoke from a damaged car
    for (const c of s.cars) {
      if (c.damage < 40 || s.hold > 0) continue;
      const n = c.damage > 75 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() > dt * 14) continue;
        const back = -c.def.length * 0.3;
        this.dust.push({ x: c.x + Math.cos(c.heading) * back, y: c.y + Math.sin(c.heading) * back, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5 - 1, age: 0, life: 1.1, r: 0.7, dark: c.damage > 75 });
      }
    }

    // bursts
    for (const f of s.fx) {
      const k = f.age;
      if (f.kind === 'boom') {
        g.fillStyle = `rgba(255,${200 - k * 150},40,${(1 - k) * 0.9})`;
        g.beginPath();
        g.arc(f.x, f.y, 1.5 + k * 6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = `rgba(40,30,20,${(1 - k) * 0.7})`;
        g.lineWidth = 0.6;
        g.beginPath();
        g.arc(f.x, f.y, 2 + k * 9, 0, Math.PI * 2);
        g.stroke();
      } else if (f.kind === 'puff') {
        g.fillStyle = `rgba(230,220,200,${(1 - k) * 0.6})`;
        g.beginPath();
        g.arc(f.x, f.y, 0.8 + k * 3, 0, Math.PI * 2);
        g.fill();
      } else if (f.kind === 'spark') {
        if (k > 0.35) continue;
        g.strokeStyle = `rgba(255,230,140,${1 - k / 0.35})`;
        g.lineWidth = 0.15;
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + f.x * 3;
          g.beginPath();
          g.moveTo(f.x, f.y);
          g.lineTo(f.x + Math.cos(a) * k * 9, f.y + Math.sin(a) * k * 9);
          g.stroke();
        }
      } else if (f.kind === 'flash') {
        g.strokeStyle = f.colour ?? '#fff';
        g.globalAlpha = (1 - k) * 0.8;
        g.lineWidth = 0.4;
        g.beginPath();
        g.arc(f.x, f.y, 1 + k * 4, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      } else {
        // cash: the sign rises
        g.fillStyle = `rgba(255,216,112,${1 - k})`;
        g.font = 'bold 2.4px sans-serif';
        g.textAlign = 'center';
        g.fillText('$', f.x, f.y - k * 4);
      }
    }

    // trees over the car: they are taller
    for (const tr of t.trees) {
      if (!visible(tr.x, tr.y)) continue;
      const img = treeSprite(tr.kind);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.arc(tr.x + 0.7, tr.y + 0.9, tr.r, 0, Math.PI * 2);
      g.fill();
      g.drawImage(img, tr.x - tr.r, tr.y - tr.r, tr.r * 2, tr.r * 2);
    }
    g.restore();

    this.drawMinimap(s);
  }

  /** Two lines a car, from the rear wheels, while it slides, brakes hard or sits on grass. */
  private layMarks(s: SimState): void {
    const g = this.marksG;
    if (!g) return;
    const b = s.track.bounds;
    s.cars.forEach((c, i) => {
      const last = (this.lastWheel[i] ??= []);
      const marking = c.wreck <= 0 && (c.sliding || c.handbrake || !c.onRoad) && Math.hypot(c.vx, c.vy) > 3;
      const fx = Math.cos(c.heading);
      const fy = Math.sin(c.heading);
      const back = -c.def.length * 0.3;
      const half = c.def.width * 0.42;
      for (let w = 0; w < 2; w++) {
        const side = w ? half : -half;
        const x = c.x + fx * back - fy * side;
        const y = c.y + fy * back + fx * side;
        const prev = last[w];
        if (marking && prev && Math.hypot(x - prev.x, y - prev.y) < 3) {
          g.strokeStyle = c.onRoad ? 'rgba(60,45,30,0.35)' : 'rgba(40,60,25,0.45)';
          g.lineWidth = 0.32 * MARK_PPM;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo((prev.x - b.minX) * MARK_PPM, (prev.y - b.minY) * MARK_PPM);
          g.lineTo((x - b.minX) * MARK_PPM, (y - b.minY) * MARK_PPM);
          g.stroke();
        }
        last[w] = { x, y };
      }
    });
  }

  private stepDust(s: SimState, dt: number): void {
    for (const c of s.cars) {
      if (c.wreck > 0) continue;
      const spd = Math.hypot(c.vx, c.vy);
      const want = s.hold > 0 ? 0 : (c.onRoad ? Math.abs(c.slip) * 1.2 + spd * 0.06 + (c.sliding ? 6 : 0) : spd * 0.25 + 3) * dt * 8;
      let n = Math.floor(want);
      if (Math.random() < want - n) n++;
      for (let i = 0; i < n && this.dust.length < 240; i++) {
        const back = -c.def.length * 0.45;
        const side = (Math.random() - 0.5) * c.def.width;
        const fx = Math.cos(c.heading);
        const fy = Math.sin(c.heading);
        this.dust.push({
          x: c.x + fx * back - fy * side,
          y: c.y + fy * back + fx * side,
          vx: c.vx * 0.15 + (Math.random() - 0.5) * 2,
          vy: c.vy * 0.15 + (Math.random() - 0.5) * 2,
          age: 0,
          life: 0.7 + Math.random() * 0.6,
          r: 0.5 + Math.random() * 0.5,
        });
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.age >= d.life) {
        this.dust[i] = this.dust[this.dust.length - 1];
        this.dust.pop();
      }
    }
  }

  private drawMinimap(s: SimState): void {
    const g = this.g;
    const t = s.track;
    const b = t.bounds;
    const size = Math.min(96, this.w * 0.26);
    const pad = 90;
    const bw = b.maxX - b.minX - pad * 2;
    const bh = b.maxY - b.minY - pad * 2;
    const k = size / Math.max(bw, bh);
    const x0 = this.w - size - 12;
    const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
    const y0 = sat + 56;
    g.save();
    g.translate(x0, y0);
    g.scale(k, k);
    g.translate(-(b.minX + pad), -(b.minY + pad));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 9 / k;
    g.stroke(this.roadPath!);
    g.strokeStyle = 'rgba(240,230,200,0.9)';
    g.lineWidth = 5 / k;
    g.stroke(this.roadPath!);
    for (let i = s.cars.length - 1; i >= 0; i--) {
      const car = s.cars[i];
      g.fillStyle = car.def.colour;
      g.beginPath();
      g.arc(car.x, car.y, (i === 0 ? 5 : 3.5) / k, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = i === 0 ? '#fff' : 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.5 / k;
      g.stroke();
    }
    g.restore();
  }
}
