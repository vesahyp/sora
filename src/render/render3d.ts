import * as THREE from 'three';
import type { Car, SimState } from '../game/state';
import type { Track } from '../game/track';
import { RIVER } from '../game/track';
import { carPose } from '../game/physics';
import { PICKUPS } from '../game/content/pickups';
import { buildScenery, type Scenery } from './scenery';
import { PAL, faded } from './look';
import { Renderer } from './renderer';

/**
 * The 3D view (ADR 0006): the same Rapier world the sim runs, drawn with three.js. The ground is
 * the track's own heights (Track.groundAt), the roadside is the 2D view's scenery placed in 3D,
 * and each car is its body and four wheels where the physics has them: the body pitched and
 * rolled on its springs, each wheel at its spring's length below its mount, the front pair
 * steered, all four spinning. The camera follows behind the car (the chase view); the top view
 * is the 2D renderer (renderer.ts), picked on the title screen.
 *
 * The sim's world is y-down like the screen of the top view, so the scene is mirrored in y
 * (`root`): a right swing of the thumb is a right turn in both views.
 */

const FOV = 58;
/** the chase camera: metres behind the car, above the ground, and the point it looks at ahead */
const CHASE = { back: 6.2, up: 2.5, ahead: 9, lookUp: 0.2 };
/** how fast the camera swings round to the car's direction, per second */
const CAM_EASE = 4.5;
/** of the camera's direction, the share taken from the road ahead rather than the car: bends read before the car is in them */
const ROAD_LOOK = 0.35;
/** metres of road the camera looks down for that */
const ROAD_AHEAD = 16;
const FOG = { near: 70, far: 230 };

type Pool<T extends THREE.Object3D> = { items: T[]; make: () => T };

export class Renderer3D {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 600);
  private sun: THREE.DirectionalLight;
  private map: Renderer;
  private w = 1;
  private h = 1;
  private trackFor: Track | null = null;
  private trackGroup = new THREE.Group();
  private cars: { group: THREE.Group; body: THREE.Mesh; wheels: THREE.Group[]; paint: THREE.MeshLambertMaterial; base: THREE.Color }[] = [];
  private carsFor: SimState | null = null;
  private camYaw = 0;
  private camInit = false;
  private pools: Record<string, Pool<THREE.Mesh>> = {};
  /** render time, ms, as the 2D renderer keeps it */
  stats = { avg: 0, worst: 0, frames: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
  ) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Color('#b9ab86');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, FOG.near, FOG.far);
    this.camera.up.set(0, 0, 1);
    this.root.scale.set(1, -1, 1);
    this.scene.add(this.root);
    this.root.add(this.trackGroup);
    this.scene.add(new THREE.HemisphereLight('#e8dcbc', '#3a3424', 1.6));
    // the low sun from the upper left of the top view, as look.ts has it
    this.sun = new THREE.DirectionalLight('#ffe2b0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -26;
    sc.right = sc.top = 26;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.map = new Renderer(overlay);
    this.resize();
  }

  fits(): boolean {
    return Math.round(this.canvas.clientWidth) === this.w && Math.round(this.canvas.clientHeight) === this.h;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.gl.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.map.resize();
  }

  /** world metres on screen, as the top view counts them (24 m on the short side), in the screen's shape */
  view(): { w: number; h: number } {
    const short = Math.min(this.w, this.h);
    return { w: (24 * this.w) / short, h: (24 * this.h) / short };
  }

  /** where a sim point lands on screen, css px */
  toScreen(x: number, y: number, z = 0): { x: number; y: number } {
    const v = new THREE.Vector3(x, -y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  draw(s: SimState, dt: number): void {
    const t0 = performance.now();
    this.ensureTrack(s.track);
    this.ensureCars(s);
    for (let i = 0; i < s.cars.length; i++) this.placeCar(s, i);
    this.drawThings(s);
    this.placeCamera(s, dt);
    this.gl.render(this.scene, this.camera);
    this.map.drawMapOnly(s);
    const ms = performance.now() - t0;
    this.stats.avg += (ms - this.stats.avg) * 0.05;
    this.stats.worst = Math.max(this.stats.worst, ms);
    this.stats.frames++;
  }

  dispose(): void {
    this.gl.dispose();
  }

  // ---- the track ----

  private ensureTrack(t: Track): void {
    if (this.trackFor === t) return;
    this.trackFor = t;
    this.trackGroup.clear();
    const sc = buildScenery(t);
    this.trackGroup.add(this.groundMesh(t), this.floorMesh(t), ...this.waterMeshes(t), this.startLine(t));
    this.trackGroup.add(...this.treeMeshes(sc), ...this.propMeshes(t, sc));
  }

  /** The road, the verge and the ground to the trees and a little past, at the track's heights, coloured by surface. */
  private groundMesh(t: Track): THREE.Mesh {
    const half = t.width / 2;
    const edge = half + t.verge;
    const across = [-(edge + 14), -(edge + 5), -edge, -(edge - 2), -(half + 1.5), -half, -half * 0.55, -half * 0.25, 0, half * 0.25, half * 0.55, half, half + 1.5, edge - 2, edge, edge + 5, edge + 14];
    const ss: number[] = [];
    for (let s = 0; s < t.length; s += 1.5) ss.push(s);
    for (const r of t.def.rivers ?? []) ss.push(r.s - 0.02, r.s + 0.02);
    ss.sort((a, b) => a - b);
    const n = ss.length;
    const m = across.length;
    const pos = new Float32Array(n * m * 3);
    const col = new Float32Array(n * m * 3);
    const c = new THREE.Color();
    const gravel = new THREE.Color(PAL.gravel);
    const gravelPale = new THREE.Color(PAL.gravelPale);
    const verge = new THREE.Color(PAL.verge);
    const straw = new THREE.Color(PAL.straw);
    const floor = new THREE.Color(PAL.forestFloor);
    const wet = new THREE.Color(PAL.wetBank);
    ss.forEach((s, i) => {
      const p = t.at(s);
      const water = t.surfaceAt(s, 0) === 'water';
      across.forEach((d, j) => {
        const k = (i * m + j) * 3;
        // past the trees the ground eases back to the forest floor's level
        const z = Math.abs(d) <= edge + 1 ? t.groundAt(s, d) : Math.abs(d) <= edge + 5 ? t.groundAt(s, d) * 0.5 : 0;
        pos[k] = p.x - p.ty * d;
        pos[k + 1] = p.y + p.tx * d;
        pos[k + 2] = z;
        const a = Math.abs(d);
        // the road pale and grey, the verge's berm darker, the straw yellow: the road's edge reads from behind the car
        if (water) c.copy(wet);
        else if (a < half * 0.4) c.copy(gravelPale);
        else if (a <= half) c.copy(gravelPale).lerp(gravel, 0.5);
        else if (a <= half + 1.5) c.copy(verge).multiplyScalar(0.8);
        else if (a <= edge) c.copy(straw).lerp(new THREE.Color(PAL.strawPale), 0.4);
        else c.copy(floor);
        // a little grain along the lap, so the eye reads speed off the ground
        const grain = 0.94 + 0.12 * (((Math.sin(s * 1.7 + d * 3.1) + Math.sin(s * 0.37 - d * 1.3)) / 4) + 0.5);
        col[k] = c.r * grain;
        col[k + 1] = c.g * grain;
        col[k + 2] = c.b * grain;
      });
    });
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * m;
      const b = ((i + 1) % n) * m;
      for (let j = 0; j < m - 1; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The forest floor under everything, a hair below the road's level. */
  private floorMesh(t: Track): THREE.Mesh {
    const b = t.bounds;
    const g = new THREE.PlaneGeometry(b.maxX - b.minX + 800, b.maxY - b.minY + 800);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: PAL.forestFloor }));
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, -0.06);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Each river's water: a sheet over its bed between the banks, running on under the trees. */
  private waterMeshes(t: Track): THREE.Mesh[] {
    return (t.def.rivers ?? []).map((r) => {
      const p = t.at(r.s + r.gap / 2);
      const g = new THREE.PlaneGeometry(r.gap + 1, (t.width / 2 + t.verge) * 2 + 40);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: PAL.waterLit, transparent: true, opacity: 0.82 }));
      mesh.position.set(p.x, p.y, RIVER.water + 0.25);
      mesh.rotation.z = Math.atan2(p.ty, p.tx);
      return mesh;
    });
  }

  private startLine(t: Track): THREE.Mesh {
    const p = t.at(0);
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 8;
    const g = cv.getContext('2d')!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#e6dfcc' : '#1d1b17';
      g.fillRect(x * 4, y * 4, 4, 4);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, t.width), new THREE.MeshLambertMaterial({ map: tex }));
    mesh.position.set(p.x, p.y, t.groundAt(0, 0) + 0.02);
    mesh.rotation.z = Math.atan2(p.ty, p.tx);
    return mesh;
  }

  /** Spruce as dark cones, birch as a pale trunk under a round crown: instanced, thousands in a few draws. */
  private treeMeshes(sc: Scenery): THREE.Object3D[] {
    const spruce = sc.trees.filter((t) => !t.birch);
    const birch = sc.trees.filter((t) => t.birch);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const out: THREE.Object3D[] = [];
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ color: PAL.spruce[2] }), spruce.length);
    spruce.forEach((t, i) => {
      const h = Math.max(4, t.h);
      m.compose(new THREE.Vector3(t.x, t.y, h / 2), q, new THREE.Vector3(t.r * 0.95, h, t.r * 0.95));
      cone.setMatrixAt(i, m);
    });
    cone.castShadow = true;
    out.push(cone);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 5), new THREE.MeshLambertMaterial({ color: PAL.birchBark }), birch.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: PAL.birchLeaf[1] }), birch.length);
    birch.forEach((t, i) => {
      const h = Math.max(5, t.h);
      m.compose(new THREE.Vector3(t.x, t.y, h * 0.35), q, new THREE.Vector3(1, h * 0.7, 1));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, t.y, h * 0.72), new THREE.Quaternion(), new THREE.Vector3(t.r, t.r, t.r * 1.2));
      crown.setMatrixAt(i, m);
    });
    crown.castShadow = true;
    out.push(trunk, crown);
    return out;
  }

  /** Bales, the crowd, the power line's poles and the barn. */
  private propMeshes(t: Track, sc: Scenery): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const m = new THREE.Matrix4();
    const ground = (x: number, y: number) => {
      const l = t.locate(x, y);
      return Math.abs(l.d) < t.width / 2 + t.verge + 1 ? t.groundAt(l.s, l.d) : 0;
    };
    const bales = sc.props.filter((p) => p.kind === 'bale');
    const bale = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 12), new THREE.MeshLambertMaterial({ color: PAL.strawPale }), bales.length);
    bales.forEach((p, i) => {
      const k = p.n / 0.68;
      m.compose(new THREE.Vector3(p.x, p.y, ground(p.x, p.y) + 0.62 * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, p.a)), new THREE.Vector3(k, k, k));
      bale.setMatrixAt(i, m);
    });
    bale.castShadow = true;
    out.push(bale);
    const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.9, 2, 6), new THREE.MeshLambertMaterial(), sc.crowd.length);
    const up = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    sc.crowd.forEach((f, i) => {
      m.compose(new THREE.Vector3(f.x, f.y, ground(f.x, f.y) + 0.75), up, new THREE.Vector3(1, 1, 1));
      people.setMatrixAt(i, m);
      people.setColorAt(i, new THREE.Color(f.flag ?? f.colour));
    });
    out.push(people);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.14, 8, 5), new THREE.MeshLambertMaterial({ color: '#3a3022' }), sc.poles.length);
    sc.poles.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, p.y, 4), up, new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(i, m);
    });
    pole.castShadow = true;
    out.push(pole);
    const b = sc.barn;
    const barn = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(b.len, b.wid, 3.2), new THREE.MeshLambertMaterial({ color: '#6a3a2a' }));
    walls.position.z = 1.6;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(b.wid * 0.72, b.wid * 0.72, b.len * 1.04, 3), new THREE.MeshLambertMaterial({ color: '#3d3830' }));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.position.z = 3.2 + b.wid * 0.18;
    barn.add(walls, roof);
    barn.position.set(b.x, b.y, 0);
    barn.rotation.z = b.a;
    walls.castShadow = roof.castShadow = true;
    out.push(barn);
    return out;
  }

  // ---- the cars ----

  private ensureCars(s: SimState): void {
    if (this.carsFor === s) return;
    for (const c of this.cars) this.root.remove(c.group);
    this.cars = s.cars.map((c, i) => this.carMesh(s, c, i));
    for (const c of this.cars) this.root.add(c.group);
    this.carsFor = s;
    this.camInit = false;
    // every shader built now, in the countdown, not on the first frame that needs it
    this.gl.compile(this.scene, this.camera);
  }

  /** A car: a body and a cabin in its colours on the physics' box, four wheels hung where the physics hangs them. */
  private carMesh(s: SimState, c: Car, i: number): Renderer3D['cars'][number] {
    const pose = carPose(s, i);
    const def = c.def;
    const group = new THREE.Group();
    const base = new THREE.Color(i === 0 ? def.colour : faded(def.colour, 0.2));
    const paint = new THREE.MeshLambertMaterial({ color: base.clone() });
    const accent = new THREE.MeshLambertMaterial({ color: def.accent });
    // the box the physics collides, from 0.25 m over the ground; the body's lower part, then the cabin
    const zBody = 0.25 - pose.origin;
    // drawn a little narrower than the physics' box, so the wheels stand out at the sides where they
    // can be seen to steer and to ride their springs
    const W = def.width * 0.78;
    const body = new THREE.Mesh(new THREE.BoxGeometry(def.length, W, 0.5), paint);
    body.position.z = zBody + 0.32;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.length * 0.48, W * 0.88, 0.42), accent);
    cabin.position.set(-def.length * 0.06, 0, zBody + 0.78);
    const dark = new THREE.MeshLambertMaterial({ color: '#2a3036' });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(def.length * 0.05, W * 0.8, 0.34), dark);
    glass.position.set(def.length * 0.19, 0, zBody + 0.76);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(def.length * 0.05, W * 0.8, 0.3), dark);
    rearGlass.position.set(-def.length * 0.31, 0, zBody + 0.76);
    const lamp = new THREE.MeshBasicMaterial({ color: '#b02018' });
    const tail = [-1, 1].map((side) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, W * 0.18, 0.12), lamp);
      l.position.set(-def.length / 2 - 0.01, side * W * 0.36, zBody + 0.42);
      return l;
    });
    body.castShadow = cabin.castShadow = true;
    group.add(body, cabin, glass, rearGlass, ...tail);
    const tyre = new THREE.MeshLambertMaterial({ color: '#1b1915' });
    const hub = new THREE.MeshLambertMaterial({ color: '#8a8478' });
    const wheels = pose.wheels.map((w) => {
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      const tread = new THREE.Mesh(new THREE.CylinderGeometry(w.radius, w.radius, 0.22, 14), tyre);
      // a cylinder stands on y: that is already the axle
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w.radius * 1.1, 0.24, w.radius * 0.3), hub);
      spin.add(tread, cap);
      tread.castShadow = true;
      pivot.add(spin);
      group.add(pivot);
      return pivot;
    });
    return { group, body, wheels, paint, base };
  }

  private placeCar(s: SimState, i: number): void {
    const c = s.cars[i];
    const m = this.cars[i];
    const pose = carPose(s, i);
    m.group.position.set(pose.x, pose.y, pose.z);
    m.group.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    pose.wheels.forEach((w, k) => {
      const pivot = m.wheels[k];
      pivot.position.set(w.x, w.y, w.z);
      pivot.rotation.set(0, 0, w.steer);
      // the wheel spins about its axle, the car's y
      pivot.children[0].rotation.y = w.spin;
    });
    // damage darkens the paint; a wreck is burnt black
    const dmg = c.wreck > 0 ? 1 : Math.min(1, c.damage / 100);
    m.paint.color.copy(m.base).lerp(new THREE.Color('#1a1712'), dmg * 0.7);
  }

  // ---- what lies on and flies over the road ----

  private pool(name: string, make: () => THREE.Mesh): Pool<THREE.Mesh> {
    let p = this.pools[name];
    if (!p) {
      p = this.pools[name] = { items: [], make };
    }
    return p;
  }

  /** Show n of a pool, making more as needed, and hide the rest; returns the shown ones. */
  private take(p: Pool<THREE.Mesh>, n: number): THREE.Mesh[] {
    while (p.items.length < n) {
      const it = p.make();
      this.root.add(it);
      p.items.push(it);
    }
    p.items.forEach((it, i) => (it.visible = i < n));
    return p.items.slice(0, n);
  }

  private ground(s: SimState, x: number, y: number): number {
    const l = s.track.locate(x, y);
    return s.track.groundAt(l.s, l.d);
  }

  private drawThings(s: SimState): void {
    const pick = s.pickups.filter((p) => p.gone <= 0);
    this.take(this.pool('pickup', () => new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ emissive: '#000' }))), pick.length).forEach((it, i) => {
      const p = pick[i];
      it.position.set(p.x, p.y, this.ground(s, p.x, p.y) + 0.9 + Math.sin(s.time * 3 + i) * 0.15);
      it.rotation.set(0.5, 0.3, s.time * 2 + i);
      (it.material as THREE.MeshLambertMaterial).color.set(PICKUPS[p.kind].colour);
      (it.material as THREE.MeshLambertMaterial).emissive.set(PICKUPS[p.kind].colour).multiplyScalar(0.35);
    });
    this.take(this.pool('oil', () => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), new THREE.MeshLambertMaterial({ color: '#0e0c0a', transparent: true, opacity: 0.8 }));
      return m;
    }), s.oils.length).forEach((it, i) => {
      const o = s.oils[i];
      it.position.set(o.x, o.y, this.ground(s, o.x, o.y) + 0.03);
    });
    this.take(this.pool('mine', () => new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.15, 10), new THREE.MeshLambertMaterial({ color: '#2b2a24', emissive: '#300' }))), s.mines.length).forEach((it, i) => {
      const o = s.mines[i];
      it.position.set(o.x, o.y, this.ground(s, o.x, o.y) + 0.08);
      it.rotation.x = Math.PI / 2;
    });
    this.take(this.pool('bullet', () => new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#ffd870' }))), s.bullets.length).forEach((it, i) => {
      const b = s.bullets[i];
      it.position.set(b.x, b.y, this.ground(s, b.x, b.y) + 0.9);
      it.rotation.set(0, 0, Math.atan2(b.vy, b.vx));
    });
    this.take(this.pool('missile', () => new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.18), new THREE.MeshLambertMaterial({ color: '#d8d0bc', emissive: '#f06020' }))), s.missiles.length).forEach((it, i) => {
      const m = s.missiles[i];
      it.position.set(m.x, m.y, this.ground(s, m.x, m.y) + 1);
      it.rotation.set(0, 0, m.heading);
    });
    const fxColour: Record<string, string> = { boom: '#ff8a3a', puff: '#8a8478', spark: '#ffd870', flash: '#ffffff', cash: '#e8c040', splash: '#c8cbbc' };
    this.take(this.pool('fx', () => new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))), s.fx.length).forEach((it, i) => {
      const f = s.fx[i];
      const big = f.kind === 'boom' ? 3.2 : f.kind === 'splash' ? 1.2 : f.kind === 'flash' ? 2 : 0.5;
      const k = big * (0.3 + f.age * 1.4);
      it.scale.set(k, k, k);
      it.position.set(f.x, f.y, this.ground(s, f.x, f.y) + 0.6 + f.age);
      const mat = it.material as THREE.MeshBasicMaterial;
      mat.color.set(f.colour ?? fxColour[f.kind]);
      mat.opacity = Math.max(0, 0.85 * (1 - f.age));
    });
  }

  // ---- the camera ----

  /**
   * Behind the car and above it, looking past it down the road. The camera's direction is the
   * car's direction of travel blended with the road's a little way ahead, eased, so a slide does
   * not whip the view round and a bend shows before the car turns into it.
   */
  private placeCamera(s: SimState, dt: number): void {
    const c = s.cars[0];
    const t = s.track;
    const v = Math.hypot(c.vx, c.vy);
    const travel = v > 3 ? Math.atan2(c.vy, c.vx) : c.heading;
    const ahead = t.at(c.s + ROAD_AHEAD + v * 0.4);
    const road = Math.atan2(ahead.y - c.y, ahead.x - c.x);
    let want = travel + wrap(road - travel) * ROAD_LOOK;
    if (!this.camInit) {
      this.camYaw = want;
      this.camInit = true;
    }
    want = this.camYaw + wrap(want - this.camYaw);
    this.camYaw += (want - this.camYaw) * (1 - Math.exp(-dt * CAM_EASE));
    const fx = Math.cos(this.camYaw);
    const fy = Math.sin(this.camYaw);
    const pose = carPose(s, 0);
    const gz = this.ground(s, c.x - fx * CHASE.back, c.y - fy * CHASE.back);
    const camZ = Math.max(pose.z, gz) + CHASE.up;
    const shake = s.shake > 0 ? s.shake * 0.25 : 0;
    // the sim's y is the scene's -y
    this.camera.position.set(c.x - fx * CHASE.back + (Math.random() - 0.5) * shake, -(c.y - fy * CHASE.back) + (Math.random() - 0.5) * shake, camZ);
    this.camera.lookAt(c.x + fx * CHASE.ahead, -(c.y + fy * CHASE.ahead), pose.z + CHASE.lookUp);
    // the sun's shadow box follows the car
    this.sun.position.set(c.x - 30, -(c.y - 30), 45);
    this.sun.target.position.set(c.x + fx * 8, -(c.y + fy * 8), 0);
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
