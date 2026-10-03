import type { SimState } from '../game/state';
import type { Track } from '../game/track';
import { carSprite, treeSprite, SPRITE_PPM } from './sprites';
import { hash32 } from '../game/rng';

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
}

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

    // dust
    this.stepDust(s, dt);
    for (const d of this.dust) {
      const k = d.age / d.life;
      g.fillStyle = `rgba(190,175,140,${(1 - k) * 0.55})`;
      g.beginPath();
      g.arc(d.x, d.y, d.r * (0.6 + k * 1.6), 0, Math.PI * 2);
      g.fill();
    }

    // the cars, the player last so it is never hidden: shadow, then the sprite
    for (let i = s.cars.length - 1; i >= 0; i--) {
      const car = s.cars[i];
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
      g.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
      g.restore();
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

  private stepDust(s: SimState, dt: number): void {
    for (const c of s.cars) {
      const spd = Math.hypot(c.vx, c.vy);
      const want = s.hold > 0 ? 0 : (c.onRoad ? Math.abs(c.slip) * 0.8 + spd * 0.06 : spd * 0.25) * dt * 8;
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
