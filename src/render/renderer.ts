import type { Car, SimState } from '../game/state';
import type { Track } from '../game/track';
import {
  birchSprite,
  carShadow,
  carSprite,
  coneSprite,
  fireSprite,
  crateSprite,
  damageSprite,
  damageStage,
  propSprite,
  puffSprite,
  spruceSprite,
  wheelLayout,
  SPRITE_PPM,
  SPRITE_PX,
  TREE_SPAN,
} from './sprites';
import { PICKUPS } from '../game/content/pickups';
import { GUN } from '../game/content/weapons';
import { buildScenery, type Scenery } from './scenery';
import { Ground } from './ground';
import { PAL, SHADOW_ALPHA, SHADOW_INK, SHADOW_PER_M, SHADOW_X, SHADOW_Y } from './look';

/**
 * Draws the world. North-up camera that follows the car and leads it a
 * little in the direction of travel, the Super Cars II view. A frame is
 * mostly drawImage: the ground and everything static on it is baked in
 * chunks (ground.ts), the sprites are cached (sprites.ts), and per frame
 * there are only the shadows of what moves, the cars, the air and the
 * marks. One low sun from the upper left lights all of it.
 * Dust is cosmetic and lives here, not in the sim.
 */
interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  /** 0 gravel dust, 1 straw dust, 2 black smoke, 3 grey smoke */
  tint: number;
}

const DUST_TINTS = ['176,160,128', '168,150,104', '30,26,24', '96,90,84'];
const DUST_MAX = 220;
/** the race numbers, player first */
const NUMBERS = [7, 23, 41, 12, 5, 66];

/** pixels per metre of the skid mark layer */
const MARK_PPM = 4;
/**
 * The camera's scale: a car is about a tenth of the screen's short side,
 * Death Rally's view, so the cars beside you and the gaps between them
 * are the picture. A 1.7 m car, so the short side shows about 17 m.
 */
const CARS_ACROSS = 10;
const CAR_WIDTH = 1.7;
/** seconds of travel the camera looks ahead of the car */
const LEAD = 0.35;

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
  /** dust puffs a second, smoothed: how thick the haze hangs */
  private activity = 0;
  private roadPath: Path2D | null = null;
  private roadFor: Track | null = null;
  private scenery: Scenery | null = null;
  private ground: Ground | null = null;
  /** skid marks, drawn once and kept: a canvas over the track's bounds at MARK_PPM; the ground copies from it */
  private marksG: CanvasRenderingContext2D | null = null;
  private lastWheel: { x: number; y: number }[][] = [];
  /** the air over the frame: haze, the evening grade and the vignette in one small canvas */
  private air: HTMLCanvasElement | null = null;
  private airFor = -1;
  /** render time, ms: a smoothed average and the worst since the last read, for the dev readout */
  stats = { avg: 0, worst: 0, frames: 0 };

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
    const short = Math.min(this.w, this.h);
    this.ppm = Math.max(16, Math.min(40, short / (CAR_WIDTH * CARS_ACROSS)));
    this.airFor = -1;
  }

  view(): { w: number; h: number } {
    return { w: this.w / this.ppm, h: this.h / this.ppm };
  }

  /** where a world point lands on screen, css px */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.camX) * this.ppm + this.w / 2, y: (y - this.camY) * this.ppm + this.h / 2 };
  }

  private ensureTrack(t: Track): void {
    if (this.roadFor === t) return;
    this.roadFor = t;
    const b = t.bounds;
    const m = document.createElement('canvas');
    m.width = Math.ceil((b.maxX - b.minX) * MARK_PPM);
    m.height = Math.ceil((b.maxY - b.minY) * MARK_PPM);
    this.marksG = m.getContext('2d');
    this.lastWheel = [];
    const path = new Path2D();
    t.pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    this.roadPath = path;
    this.scenery = buildScenery(t);
    this.ground = new Ground(t, this.scenery);
    this.ground.marks = { c: m, ppm: MARK_PPM, x: b.minX, y: b.minY };
  }

  draw(s: SimState, dt: number): void {
    const t0 = performance.now();
    const g = this.g;
    const c = s.cars[0];
    const t = s.track;
    this.ensureTrack(t);
    const sc = this.scenery!;
    // camera: lead the car a little in the direction of travel
    const tx = c.x + c.vx * LEAD;
    const ty = c.y + c.vy * LEAD;
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
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // the shake: a jolt that dies with s.shake
    const shakeX = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 14 : 0;
    const shakeY = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 14 : 0;
    g.translate(shakeX, shakeY);

    // world space
    g.save();
    g.translate(this.w / 2, this.h / 2);
    g.scale(this.ppm, this.ppm);
    g.translate(-this.camX, -this.camY);
    const halfW = this.w / 2 / this.ppm + 1;
    const halfH = this.h / 2 / this.ppm + 1;
    const visible = (x: number, y: number, r = 6) => Math.abs(x - this.camX) < halfW + r && Math.abs(y - this.camY) < halfH + r;

    // skid marks: laid into the layer and straight into the baked ground, then the ground,
    // the start line and every static shadow, all baked
    this.layMarks(s);
    this.ground!.draw(g, this.ppm * this.dpr, this.camX - halfW, this.camY - halfH, this.camX + halfW, this.camY + halfH, this.camX + c.vx * 1.2, this.camY + c.vy * 1.2);

    // the shadows of what moves, laid at the same alpha as the baked ones
    g.globalAlpha = SHADOW_ALPHA;
    for (const car of s.cars) {
      if (!visible(car.x, car.y)) continue;
      const sh = carShadow(car.def, car.heading);
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.heading);
      g.drawImage(sh.img, sh.x, sh.y, sh.w, sh.h);
      g.restore();
    }
    g.fillStyle = SHADOW_INK;
    const sx = SHADOW_X * SHADOW_PER_M;
    const sy = SHADOW_Y * SHADOW_PER_M;
    for (const p of s.pickups) {
      if (p.gone > 0 || !visible(p.x, p.y)) continue;
      g.beginPath();
      g.moveTo(p.x - 0.6, p.y - 0.6);
      g.lineTo(p.x + 0.6, p.y - 0.6);
      g.lineTo(p.x + 0.6 + sx * 0.7, p.y - 0.6 + sy * 0.7);
      g.lineTo(p.x + 0.6 + sx * 0.7, p.y + 0.6 + sy * 0.7);
      g.lineTo(p.x - 0.6 + sx * 0.7, p.y + 0.6 + sy * 0.7);
      g.lineTo(p.x - 0.6, p.y + 0.6);
      g.closePath();
      g.fill();
    }
    for (const m of s.missiles) {
      g.beginPath();
      g.ellipse(m.x + sx * 1.2, m.y + sy * 1.2, 0.8, 0.22, m.heading, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // the headlights' throw on the gravel, ahead of every running car
    const cone = coneSprite();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    for (const car of s.cars) {
      if (car.wreck > 0 || !visible(car.x, car.y, 10)) continue;
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.heading);
      g.drawImage(cone, car.def.length / 2 - 0.2, -2.6, 10, 5.2);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // posts and bales by the road
    for (const p of sc.props) {
      if (!visible(p.x, p.y, 2)) continue;
      const ps = propSprite(p.kind);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      const k = p.kind === 'bale' ? p.n / 0.68 : 1;
      g.drawImage(ps.img, (-ps.size / 2) * k, (-ps.size / 2) * k, ps.size * k, ps.size * k);
      g.restore();
    }

    // pickups: stencilled steel boxes
    for (const p of s.pickups) {
      if (p.gone > 0 || !visible(p.x, p.y)) continue;
      const def = PICKUPS[p.kind];
      const img = crateSprite(p.kind, def.colour);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(Math.sin(p.x * 3.1 + p.y) * 0.3);
      g.drawImage(img, -0.8, -0.8, 1.6, 1.6);
      g.restore();
    }

    // mines: a dark disc with a red eye
    for (const m of s.mines) {
      if (!visible(m.x, m.y)) continue;
      g.fillStyle = '#24201c';
      g.beginPath();
      g.arc(m.x, m.y, 0.85, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,236,204,0.25)';
      g.lineWidth = 0.08;
      g.beginPath();
      g.arc(m.x, m.y, 0.8, Math.PI * 0.9, Math.PI * 1.6);
      g.stroke();
      g.fillStyle = Math.sin(s.time * 8) > 0 ? PAL.danger : '#5a120a';
      g.beginPath();
      g.arc(m.x, m.y, 0.26, 0, Math.PI * 2);
      g.fill();
    }

    // the auto-fire cone: two thin dashed edges and a ticked arc, under the cars
    const me = s.cars[0];
    if (me.wreck <= 0 && s.hold <= 0) {
      const r = GUN.range * 0.6;
      const a0 = me.heading - GUN.cone;
      const a1 = me.heading + GUN.cone;
      g.strokeStyle = me.target >= 0 ? 'rgba(230,220,196,0.55)' : 'rgba(230,220,196,0.22)';
      g.lineWidth = 0.07;
      g.setLineDash([0.9, 0.7]);
      g.beginPath();
      g.moveTo(me.x + Math.cos(a0) * 2.5, me.y + Math.sin(a0) * 2.5);
      g.lineTo(me.x + Math.cos(a0) * r, me.y + Math.sin(a0) * r);
      g.moveTo(me.x + Math.cos(a1) * 2.5, me.y + Math.sin(a1) * 2.5);
      g.lineTo(me.x + Math.cos(a1) * r, me.y + Math.sin(a1) * r);
      g.stroke();
      g.setLineDash([0.08, 0.9]);
      g.lineWidth = 0.5;
      g.beginPath();
      g.arc(me.x, me.y, r, a0, a1);
      g.stroke();
      g.setLineDash([]);
    }

    // the cars, the player last so it is never hidden
    for (let i = s.cars.length - 1; i >= 0; i--) {
      const car = s.cars[i];
      if (!visible(car.x, car.y)) continue;
      if (car.wreck > 0) {
        this.drawWreck(car, i, s.time, dt);
        continue;
      }
      this.drawCar(car, i);
    }

    // tracers: hot and saturated, a glow and a core
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,170,60,0.35)';
    g.lineWidth = 0.42;
    g.beginPath();
    for (const b of s.bullets) {
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,240,170,0.95)';
    g.lineWidth = 0.14;
    g.stroke();

    // missiles: a dart with a flame
    for (const m of s.missiles) {
      g.save();
      g.translate(m.x, m.y);
      g.rotate(m.heading);
      g.fillStyle = `rgba(255,${150 + Math.random() * 80},40,0.85)`;
      g.beginPath();
      g.moveTo(-0.9, 0);
      g.lineTo(-2.2 - Math.random() * 0.8, 0.35);
      g.lineTo(-2.2 - Math.random() * 0.8, -0.35);
      g.closePath();
      g.fill();
      g.fillStyle = '#8a857a';
      g.fillRect(-0.9, -0.2, 1.6, 0.4);
      g.fillStyle = 'rgba(255,236,204,0.4)';
      g.fillRect(-0.9, -0.2, 1.6, 0.08);
      g.fillStyle = '#2a2622';
      g.beginPath();
      g.moveTo(0.7, -0.2);
      g.lineTo(1.15, 0);
      g.lineTo(0.7, 0.2);
      g.closePath();
      g.fill();
      g.restore();
    }

    // smoke out of a hurt engine, from the bonnet
    for (const car of s.cars) {
      if (car.damage < 50 || car.wreck > 0 || s.hold > 0) continue;
      const n = car.damage > 78 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() > dt * 16) continue;
        const fwd = car.def.length * 0.3;
        this.puff(car.x + Math.cos(car.heading) * fwd, car.y + Math.sin(car.heading) * fwd, car.vx * 0.3 + (Math.random() - 0.5), car.vy * 0.3 + (Math.random() - 0.5), 1.6, 0.6, car.damage > 78 ? 2 : 3);
      }
    }

    // bursts: the fire stays saturated
    for (const f of s.fx) {
      const k = f.age;
      if (f.kind === 'boom') {
        // the fireball, a dark shock ring, then smoke that hangs
        const r = 1.6 + Math.sqrt(k) * 5;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.max(0, 1 - k * 1.2);
        g.drawImage(fireSprite(), f.x - r, f.y - r, r * 2, r * 2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.strokeStyle = `rgba(40,30,22,${(1 - k) * 0.45})`;
        g.lineWidth = 0.35;
        g.beginPath();
        g.arc(f.x, f.y, 2 + k * 9, 0, Math.PI * 2);
        g.stroke();
        if (k < 0.15 && Math.random() < 0.5) this.puff(f.x + (Math.random() - 0.5) * 2, f.y + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 3, 1.6, 2);
      } else if (f.kind === 'puff') {
        g.globalAlpha = (1 - k) * 0.6;
        const img = puffSprite(DUST_TINTS[0]);
        const r = 1 + k * 3;
        g.drawImage(img, f.x - r, f.y - r, r * 2, r * 2);
        g.globalAlpha = 1;
      } else if (f.kind === 'spark') {
        if (k > 0.35) continue;
        g.strokeStyle = `rgba(255,220,120,${1 - k / 0.35})`;
        g.lineWidth = 0.07;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + f.x * 3;
          g.moveTo(f.x, f.y);
          g.lineTo(f.x + Math.cos(a) * k * 4.5, f.y + Math.sin(a) * k * 4.5);
        }
        g.stroke();
      } else if (f.kind === 'flash') {
        g.strokeStyle = f.colour ?? PAL.hud;
        g.globalAlpha = (1 - k) * 0.8;
        g.lineWidth = 0.18;
        const r = 1 + k * 4;
        g.strokeRect(f.x - r, f.y - r, r * 2, r * 2);
        g.globalAlpha = 1;
      } else {
        // cash: the sign rises, stencilled
        g.fillStyle = `rgba(240,200,90,${1 - k})`;
        g.font = 'bold 2.2px "Arial Black", Impact, sans-serif';
        g.textAlign = 'center';
        g.fillText('$', f.x, f.y - k * 4);
      }
    }

    // dust that hangs
    this.stepDust(s, dt);
    for (const d of this.dust) {
      const k = d.age / d.life;
      const a = (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.4)) * (d.tint >= 2 ? 0.55 : 0.32);
      if (a < 0.03) continue;
      const r = d.r * (0.7 + k * 1.9);
      if (!visible(d.x, d.y, r)) continue;
      g.globalAlpha = a;
      g.drawImage(puffSprite(DUST_TINTS[d.tint]), d.x - r, d.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;

    // trees over the cars: they are taller
    for (const tr of sc.trees) {
      if (!visible(tr.x, tr.y, tr.r)) continue;
      const img = tr.birch ? birchSprite(tr.v) : spruceSprite(tr.v);
      const r = tr.r * TREE_SPAN;
      g.drawImage(img, tr.x - r, tr.y - r, r * 2, r * 2);
    }
    // the wires overhead
    g.strokeStyle = 'rgba(20,16,12,0.8)';
    g.lineWidth = 0.05;
    g.beginPath();
    for (let i = 0; i + 1 < sc.poles.length; i++) {
      const p = sc.poles[i];
      const q = sc.poles[i + 1];
      if (!visible((p.x + q.x) / 2, (p.y + q.y) / 2, 20)) continue;
      for (const o of [-0.95, 0, 0.95]) {
        const ax = Math.cos(p.a) * o;
        const ay = Math.sin(p.a) * o;
        g.moveTo(p.x + ax, p.y + ay);
        g.lineTo(q.x + ax, q.y + ay);
      }
    }
    g.stroke();
    g.restore();

    // the air: haze that thickens with the pack's dust, the evening grade and a vignette,
    // one upscaled drawImage, rebuilt only when the haze moves a step
    this.activity += (0 - this.activity) * (1 - Math.exp(-dt * 0.6));
    const haze = Math.round(Math.min(0.12, 0.02 + this.activity * 0.0008) * 100);
    if (haze !== this.airFor) this.buildAir(haze / 100);
    g.drawImage(this.air!, -20, -20, this.w + 40, this.h + 40);

    // the sights on top of the air, so they stay sharp
    if (me.target >= 0 && me.wreck <= 0) {
      g.save();
      g.translate(this.w / 2, this.h / 2);
      g.scale(this.ppm, this.ppm);
      g.translate(-this.camX, -this.camY);
      this.drawSights(s.cars[me.target], Math.min(1, me.lockTime / 0.5));
      g.restore();
    }

    this.drawMinimap(s);
    const ms = performance.now() - t0;
    this.stats.frames++;
    this.stats.avg += (ms - this.stats.avg) * 0.05;
    this.stats.worst = Math.max(this.stats.worst, ms);
    if (import.meta.env.DEV) (window as unknown as { __render: unknown }).__render = { ...this.stats, bake: this.ground!.lastBake };
  }

  private buildAir(haze: number): void {
    this.airFor = Math.round(haze * 100);
    // a quarter of the screen: the gradients are smooth, so the upscale costs nothing
    const w = Math.max(8, Math.round((this.w + 40) / 4));
    const h = Math.max(8, Math.round((this.h + 40) / 4));
    const c = this.air ?? document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(178,160,124,${haze})`;
    g.fillRect(0, 0, w, h);
    // the grade: warm where the sun comes from, cool and dark where it goes
    const grade = g.createLinearGradient(0, 0, w, h);
    grade.addColorStop(0, 'rgba(255,170,90,0.16)');
    grade.addColorStop(0.5, 'rgba(200,140,80,0.05)');
    grade.addColorStop(1, 'rgba(40,30,60,0.2)');
    g.fillStyle = grade;
    g.fillRect(0, 0, w, h);
    const rad = Math.hypot(w, h) / 2;
    const vig = g.createRadialGradient(w / 2, h / 2, rad * 0.45, w / 2, h / 2, rad);
    vig.addColorStop(0, 'rgba(12,8,6,0)');
    vig.addColorStop(1, 'rgba(12,8,6,0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
    this.air = c;
  }

  private drawCar(car: Car, i: number): void {
    const g = this.g;
    const L = car.def.length;
    const W = car.def.width;
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.heading);
    // the front wheels, turned with the steering, under the body
    const wh = wheelLayout(car.def);
    const k = 1 / SPRITE_PPM;
    const fx = wh.frontX * k + (wh.wl * k) / 2 - L / 2;
    const ang = car.steer * 0.55;
    g.fillStyle = '#121110';
    for (const y of [-wh.out * k + (wh.ww * k) / 2 - W / 2, (W - wh.ww + wh.out) * k + (wh.ww * k) / 2 - W / 2]) {
      g.save();
      g.translate(fx, y);
      g.rotate(ang);
      g.fillRect((-wh.wl * k) / 2, (-wh.ww * k) / 2, wh.wl * k, wh.ww * k);
      g.restore();
    }
    const spr = carSprite(car.def, { number: NUMBERS[i % NUMBERS.length], faded: i > 0, heading: car.heading, livery: i });
    const sw = spr.width / SPRITE_PX;
    const sh = spr.height / SPRITE_PX;
    g.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
    const dmg = damageSprite(car.def, damageStage(car.damage));
    if (dmg) g.drawImage(dmg, -sw / 2, -sh / 2, sw, sh);
    if (car.boosting > 0) {
      // the nitro flame out of the back, and the air shimmering behind it
      const len = 1.6 + Math.random() * 1.4;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(90,170,255,0.8)';
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
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(255,240,220,0.12)';
      g.lineWidth = 0.18;
      g.beginPath();
      const ph = performance.now() / 40;
      for (let j = 0; j < 3; j++) {
        const y0 = (j - 1) * 0.3;
        g.moveTo(-L / 2 - len, y0);
        for (let x = 0.5; x <= 2.5; x += 0.5) g.lineTo(-L / 2 - len - x, y0 + Math.sin(ph + x * 3 + j) * 0.15);
      }
      g.stroke();
    }
    g.restore();
  }

  /** A wreck: the body charred black, fire on it, black smoke rising. */
  private drawWreck(car: Car, i: number, time: number, dt: number): void {
    const g = this.g;
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.heading);
    const def = { ...car.def, colour: '#2a2420' };
    const spr = carSprite(def, { faded: true, heading: car.heading });
    const w = spr.width / SPRITE_PX;
    const h = spr.height / SPRITE_PX;
    g.drawImage(spr, -w / 2, -h / 2, w, h);
    g.drawImage(damageSprite(def, 3)!, -w / 2, -h / 2, w, h);
    g.restore();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const a = time * 9 + k * 2.1 + i;
      g.fillStyle = `rgba(255,${110 + Math.sin(a) * 50},30,${0.6 + Math.sin(a * 1.7) * 0.2})`;
      g.beginPath();
      g.arc(car.x + Math.cos(a) * 0.8, car.y + Math.sin(a * 1.3) * 0.6, 0.9 + Math.sin(a * 2) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    if (Math.random() < dt * 22) this.puff(car.x, car.y, (Math.random() - 0.5) * 1.5 + 0.4, -1.2 - Math.random(), 2.4, 1.2, 2);
  }

  /** Four corner brackets that close on the target as the lock builds; amber when it holds. */
  private drawSights(o: Car, k: number): void {
    const g = this.g;
    const m = 3.2 - k * 0.9;
    const arm = 0.9;
    const corners = (lw: number) => {
      g.lineWidth = lw;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(o.x + sx * m, o.y + sy * (m - arm));
        g.lineTo(o.x + sx * m, o.y + sy * m);
        g.lineTo(o.x + sx * (m - arm), o.y + sy * m);
      }
      g.stroke();
    };
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(10,8,6,0.55)';
    corners(0.26);
    g.strokeStyle = k >= 1 ? PAL.warn : PAL.hud;
    corners(0.11);
    if (k >= 1) {
      g.lineWidth = 0.08;
      g.beginPath();
      g.moveTo(o.x - 0.5, o.y);
      g.lineTo(o.x + 0.5, o.y);
      g.moveTo(o.x, o.y - 0.5);
      g.lineTo(o.x, o.y + 0.5);
      g.stroke();
    }
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
          const style = c.onRoad ? 'rgba(52,42,32,0.32)' : 'rgba(48,44,26,0.42)';
          this.ground!.markLine(prev.x, prev.y, x, y, style, 0.3);
          g.strokeStyle = style;
          g.lineWidth = 0.3 * MARK_PPM;
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

  private puff(x: number, y: number, vx: number, vy: number, life: number, r: number, tint: number): void {
    if (this.dust.length >= DUST_MAX) return;
    this.dust.push({ x, y, vx, vy, age: 0, life, r, tint });
  }

  private stepDust(s: SimState, dt: number): void {
    for (const c of s.cars) {
      if (c.wreck > 0) continue;
      const spd = Math.hypot(c.vx, c.vy);
      const want = s.hold > 0 ? 0 : (c.onRoad ? Math.abs(c.slip) * 0.8 + spd * 0.04 + (c.sliding ? 4 : 0) : spd * 0.18 + 2.5) * dt * 5;
      let n = Math.floor(want);
      if (Math.random() < want - n) n++;
      this.activity += n;
      const fx = Math.cos(c.heading);
      const fy = Math.sin(c.heading);
      for (let i = 0; i < n; i++) {
        const back = -c.def.length * 0.45;
        const side = (Math.random() - 0.5) * c.def.width;
        this.puff(
          c.x + fx * back - fy * side,
          c.y + fy * back + fx * side,
          c.vx * 0.2 + (Math.random() - 0.5) * 2.5,
          c.vy * 0.2 + (Math.random() - 0.5) * 2.5,
          1.8 + Math.random() * 1.6,
          (c.onRoad ? 0.7 : 0.9) + Math.random() * 0.6,
          c.onRoad ? 0 : 1,
        );
      }
    }
    // the air is still but not dead: dust slows, drifts a little with the evening breeze
    const drag = Math.exp(-dt * 1.6);
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.age += dt;
      d.vx = d.vx * drag + 0.35 * dt;
      d.vy = d.vy * drag + 0.1 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.age >= d.life) {
        this.dust[i] = this.dust[this.dust.length - 1];
        this.dust.pop();
      }
    }
  }

  /** The minimap: a steel plate with corner ticks, the road in a thin off-white line. */
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
    const m = 6;
    g.fillStyle = 'rgba(18,16,12,0.5)';
    g.fillRect(x0 - m, y0 - m, size + m * 2, size + m * 2);
    g.strokeStyle = PAL.hud;
    g.lineWidth = 1;
    g.beginPath();
    const tick = 7;
    for (const [cx, cy, dx, dy] of [
      [x0 - m, y0 - m, 1, 1],
      [x0 + size + m, y0 - m, -1, 1],
      [x0 + size + m, y0 + size + m, -1, -1],
      [x0 - m, y0 + size + m, 1, -1],
    ]) {
      g.moveTo(cx + 0.5 * dx, cy + tick * dy);
      g.lineTo(cx + 0.5 * dx, cy + 0.5 * dy);
      g.lineTo(cx + tick * dx, cy + 0.5 * dy);
    }
    g.stroke();
    g.save();
    g.translate(x0, y0);
    g.scale(k, k);
    g.translate(-(b.minX + pad), -(b.minY + pad));
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(10,8,6,0.6)';
    g.lineWidth = 4 / k;
    g.stroke(this.roadPath!);
    g.strokeStyle = PAL.hud;
    g.lineWidth = 1.5 / k;
    g.stroke(this.roadPath!);
    // the start line, a short bar across
    const sp = t.at(0);
    g.lineWidth = 2 / k;
    g.beginPath();
    g.moveTo(sp.x + sp.ty * 6, sp.y - sp.tx * 6);
    g.lineTo(sp.x - sp.ty * 6, sp.y + sp.tx * 6);
    g.stroke();
    for (let i = s.cars.length - 1; i >= 1; i--) {
      const car = s.cars[i];
      const r = 2.6 / k;
      g.fillStyle = car.wreck > 0 ? '#3a3430' : car.def.colour;
      g.fillRect(car.x - r, car.y - r, r * 2, r * 2);
      g.strokeStyle = 'rgba(10,8,6,0.8)';
      g.lineWidth = 1 / k;
      g.strokeRect(car.x - r, car.y - r, r * 2, r * 2);
    }
    // the player: a red arrowhead pointing where it drives
    const me = s.cars[0];
    const r = 5.5 / k;
    g.save();
    g.translate(me.x, me.y);
    g.rotate(me.heading);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.7, -r * 0.65);
    g.lineTo(-r * 0.35, 0);
    g.lineTo(-r * 0.7, r * 0.65);
    g.closePath();
    g.fillStyle = me.def.colour;
    g.fill();
    g.strokeStyle = PAL.hud;
    g.lineWidth = 1.2 / k;
    g.stroke();
    g.restore();
    g.restore();
  }
}
