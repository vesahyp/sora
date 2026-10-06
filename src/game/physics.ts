import RAPIER from '@dimforge/rapier3d-compat';
import type { Car, SimState } from './state';
import type { CarInput, Surface } from './types';
import { BOOST, DAMAGE, DAMAGE_PACE, OIL, SPIN_TIME, nitroFill, nitroTank } from './content/weapons';
import { enginePace } from './content/drivers';
import { SURFACES, type SurfaceDef } from './content/surfaces';
import { clamp, hurt, ram } from './harm';
import { CLEARANCE, G, HANDBRAKE_FROM, engineAt, lockAt, rigOf, type Rig } from './rig';
import { LANE_VERGE, type Track } from './track';

/**
 * The car model: Rapier's raycast vehicle (docs/adr/0005-rapier-cars.md).
 *
 * Each car is a rigid body with a mass, a centre of mass and three
 * moments of inertia, on four wheels. A wheel is a ray down from the
 * body: a spring and a damper hold the body up, and a tyre at the end
 * pushes on the ground. The tyre's side force grows with the slip
 * angle up to the friction coefficient times the wheel's load (the peak
 * slip angle sets the slope), and drive, braking and cornering share one
 * friction limit per wheel. The body pitches under braking and rolls in
 * a bend, so the loaded wheels press harder: that is the weight
 * transfer. Nothing here is a driving aid. The numbers are in rig.ts.
 *
 * The world: the ground is a triangle mesh along the road and the
 * shortcuts with the track's heights in it (rivers, crests), and the tree
 * line is a row of boxes. Cars meet each other and the trees through
 * Rapier's contacts; this file reads those contacts for the race's
 * damage and rams (harm.ts).
 *
 * The rest of the sim reads and writes a car's plain fields (x, y,
 * heading, vx, vy, yaw). A write between frames (a tow, a blast's kick,
 * a check placing a car) is seen at the start of the next frame and put
 * into the body.
 */

/** Rapier steps per sim frame: 120 Hz */
const SUB = 2;
/** m/s backwards, held pedal at a standstill */
const REVERSE_TOP = 5;
/** below this forward speed the tyre's slope is held, so rest is not a singularity */
const V_FLOOR = 3;
/** Rapier's side impulse removes this share of a wheel's sideways speed per step at stiffness 1 */
const SIDE_DAMPING = 0.2;
/** car against car and car against the trees: restitution and friction */
const CAR_BOUNCE = 0.2;
const CAR_FRICTION = 0.25;
const TREE_FRICTION = 0.12;
/** m: the radius of the body's edges: 0.3 let a car ride up onto another in a T-bone */
const BODY_ROUND = 0.1;
/** a landing harder than this, m/s down, costs damage */
const LAND_HURT = 7;
/** a spun car's tyres keep this share of their friction at the start of the spin */
const SPIN_GRIP = 0.35;

/** collision groups: what each thing is, and what it meets */
const GROUND = 0x1;
const WALL = 0x2;
const CAR = 0x4;
const WRECK = 0x8;
const groups = (member: number, filter: number) => (member << 16) | filter;
const CAR_GROUPS = groups(CAR, GROUND | WALL | CAR);
const WRECK_GROUPS = groups(WRECK, GROUND | WALL);
/** the wheels' rays see only the ground */
const RAY_GROUPS = groups(CAR, GROUND);

let ready = false;
/** Load Rapier's WASM. Once, before the first race; the sim cannot run without it. */
export async function initPhysics(): Promise<void> {
  if (ready) return;
  await RAPIER.init();
  ready = true;
}

/** A car's body in the world. */
interface Body {
  rig: Rig;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  vehicle: RAPIER.DynamicRayCastVehicleController;
  /** the plain fields as this file last wrote them, to see a write from outside */
  seen: { x: number; y: number; heading: number; vx: number; vy: number; yaw: number };
  /** m over the ground at rest: the height of the body's reference point, fixed for the race */
  origin: number;
  /** the wheels' static loads, N */
  loadF: number;
  loadR: number;
  wrecked: boolean;
}

export interface World {
  world: RAPIER.World;
  bodies: Body[];
  walls: Set<number>;
}

/** The track's world, then a body per car where createState put it, settled on its springs. */
export function buildWorld(track: Track, cars: Car[]): World {
  const world = new RAPIER.World({ x: 0, y: 0, z: -G });
  world.timestep = 1 / 60 / SUB;
  const walls = new Set<number>();
  buildGround(world, track);
  for (const box of wallBoxes(track)) {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.hl, 0.5, 2.5)
        .setTranslation(box.x, box.y, track.terrainAt(box.x, box.y) + 1.5)
        .setRotation(yawQuat(box.a))
        .setFriction(TREE_FRICTION)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(CAR_BOUNCE)
        .setCollisionGroups(groups(WALL, CAR | WRECK)),
    );
    walls.add(c.handle);
  }
  // under everything, so a car that finds a gap in the trees falls a little way and is towed
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 5000, 0.5).setTranslation(0, 0, -10).setCollisionGroups(groups(GROUND, CAR | WRECK)));
  const bodies = cars.map((c) => carBody(world, track, c));
  // let the springs take the weight before the lights
  for (let k = 0; k < 40; k++) {
    for (const b of bodies) {
      for (let i = 0; i < 4; i++) {
        b.vehicle.setWheelBrake(i, b.rig.brakeForce * world.timestep);
        b.vehicle.setWheelEngineForce(i, 0);
      }
      b.vehicle.updateVehicle(world.timestep, undefined, RAY_GROUPS);
    }
    world.step();
  }
  cars.forEach((c, i) => readBack(c, bodies[i], track, 0));
  return { world, bodies, walls };
}

/** Free the race's world: Rapier lives in WASM memory, which the garbage collector does not see. */
export function disposeWorld(w: World): void {
  w.world.free();
}

function yawQuat(a: number): RAPIER.Rotation {
  return { w: Math.cos(a / 2), x: 0, y: 0, z: Math.sin(a / 2) };
}

function headingOf(q: RAPIER.Rotation): number {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

/**
 * The ground: a strip of triangles along the lap, the road and the verge and a little past the
 * trees, on the track's ground grid (every metre, a quarter metre across the road for the ruts)
 * at the height groundAt gives; and a strip along every shortcut lane on the land under it.
 */
function buildGround(world: RAPIER.World, t: Track): void {
  const { ss, across } = t.groundGrid();
  strip(
    world,
    ss.map((s) => {
      const p = t.at(s);
      return across.map((d) => [p.x - p.ty * d, p.y + p.tx * d, t.groundAt(s, d)] as [number, number, number]);
    }),
    true,
  );
  for (const lane of t.lanes) {
    const w = lane.width / 2 + LANE_VERGE + 2;
    const rows: [number, number, number][][] = [];
    for (let u = 0; u <= lane.length; u += 1) {
      const p = lane.at(u);
      const z = t.laneGround(lane, u);
      rows.push([-w, 0, w].map((d) => [p.x - p.ty * d, p.y + p.tx * d, z] as [number, number, number]));
    }
    strip(world, rows, false);
  }
}

/** Triangles between consecutive rows of points, closed back to the first row on a lap. */
function strip(world: RAPIER.World, rows: [number, number, number][][], closed: boolean): void {
  const n = rows.length;
  const m = rows[0].length;
  const verts = new Float32Array(n * m * 3);
  rows.forEach((row, i) => row.forEach((p, j) => verts.set(p, (i * m + j) * 3)));
  const idx: number[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = i * m;
    const b = ((i + 1) % n) * m;
    for (let j = 0; j < m - 1; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
  }
  // the triangles face up, and their shared edges are smoothed over: without it a car sliding
  // sideways caught an edge with its body and rolled onto its roof at 28 km/h (tools/dbg/crawl1.ts)
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      // the tyres are rays with their own friction (the vehicle controller); this is only what the
      // body itself meets when it touches down, and it slides: a car shoved sideways in a T-bone
      // caught the ground with its sill and was tipped onto its side (tools/dbg/tbone.ts)
      .setFriction(0)
      .setCollisionGroups(groups(GROUND, CAR | WRECK)),
  );
}

/**
 * The tree line as boxes a metre thick: along both sides of the road at the verge's edge, and along
 * both sides of each shortcut lane at its own verge. A box is left out where it would stand in a
 * lane's mouth, or where the road comes back on itself closer than the verge.
 */
export function wallBoxes(t: Track): { x: number; y: number; a: number; hl: number }[] {
  const out: { x: number; y: number; a: number; hl: number }[] = [];
  const edge = t.width / 2 + t.verge;
  const STEP = 2;
  const inLaneMouth = (x: number, y: number) => {
    const l = t.laneAt(x, y);
    return !!l && l.dist < l.lane.width / 2 + LANE_VERGE + 0.5;
  };
  const push = (x0: number, y0: number, x1: number, y1: number) => {
    out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, a: Math.atan2(y1 - y0, x1 - x0), hl: Math.hypot(x1 - x0, y1 - y0) / 2 + 0.35 });
  };
  for (let s = 0; s < t.length; s += STEP) {
    const p = t.at(s);
    const q = t.at(s + STEP);
    for (const side of [-1, 1]) {
      const d = side * (edge + 0.5);
      const x0 = p.x - p.ty * d, y0 = p.y + p.tx * d;
      const x1 = q.x - q.ty * d, y1 = q.y + q.tx * d;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      if (inLaneMouth(mx, my)) continue;
      if (Math.abs(t.locate(mx, my).d) < edge) continue;
      push(x0, y0, x1, y1);
    }
  }
  for (const lane of t.lanes) {
    const edgeL = lane.width / 2 + LANE_VERGE + 0.5;
    for (let u = 0; u < lane.length; u += STEP) {
      const p = lane.at(u);
      const q = lane.at(Math.min(lane.length, u + STEP));
      for (const side of [-1, 1]) {
        const d = side * edgeL;
        const x0 = p.x - p.ty * d, y0 = p.y + p.tx * d;
        const x1 = q.x - q.ty * d, y1 = q.y + q.tx * d;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        if (Math.abs(t.locate(mx, my).d) < edge + 0.5) continue;
        const other = t.laneAt(mx, my);
        if (other && other.lane !== lane && other.dist < other.lane.width / 2 + LANE_VERGE) continue;
        push(x0, y0, x1, y1);
      }
    }
  }
  return out;
}

/**
 * The car's body: a box with its mass at the centre of mass, four wheels, the rig's springs. The
 * body's own reference point is the middle of the wheelbase at the rig's centre-of-mass height
 * when the race starts, and stays there, so a rig changed mid-race (the tuning panel) moves the
 * centre of mass and the wheels against it without moving the car.
 */
function carBody(world: RAPIER.World, t: Track, c: Car): Body {
  const r = rigOf(c.def);
  const origin = r.comHeight;
  const loc = t.locate(c.x, c.y);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(c.x, c.y, t.groundAt(loc.s, loc.d) + origin + 0.02)
      .setRotation(yawQuat(c.heading))
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  const collider = world.createCollider(
    // rounded at every edge, as a car's bumpers and sills are: a square edge dug into a river's far
    // bank and stopped a car dead from 57 km/h (tools/dbg/splash.ts, 2026-10-06)
    RAPIER.ColliderDesc.roundCuboid(r.length / 2 - BODY_ROUND, r.width / 2 - BODY_ROUND, r.height / 2 - BODY_ROUND, BODY_ROUND)
      .setTranslation(0, 0, CLEARANCE + r.height / 2 - origin)
      .setDensity(0)
      .setFriction(CAR_FRICTION)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(CAR_BOUNCE)
      // the ground gives nothing back: a body that bottoms out on landing stops there
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setCollisionGroups(CAR_GROUPS),
    body,
  );
  const vehicle = world.createVehicleController(body);
  vehicle.indexUpAxis = 2;
  vehicle.setIndexForwardAxis = 0;
  // front left, front right, rear left, rear right; +y is the car's right on the screen. Placed by applyRig
  for (let i = 0; i < 4; i++) vehicle.addWheel({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: -1, z: 0 }, r.restLength, r.wheelRadius);
  const b: Body = { rig: r, origin, body, collider, vehicle, seen: { x: NaN, y: NaN, heading: NaN, vx: NaN, vy: NaN, yaw: NaN }, loadF: 0, loadR: 0, wrecked: false };
  applyRig(b, r);
  return b;
}

/** Put a rig into a car's body and wheels: mass, centre of mass, inertia, wheel places, springs. */
function applyRig(b: Body, r: Rig): void {
  b.rig = r;
  const L = r.wheelbase;
  b.body.setAdditionalMassProperties(r.mass, { x: L * (r.frontWeight - 0.5), y: 0, z: r.comHeight - b.origin }, { x: r.rollInertia, y: r.pitchInertia, z: r.yawInertia }, { w: 1, x: 0, y: 0, z: 0 }, true);
  // the springs' static sag: each wheel carries a quarter of the weight
  const stiff = r.springRate / r.mass;
  const sag = G / (4 * stiff);
  const mount = r.wheelRadius + r.restLength - sag - b.origin;
  const places = [[L / 2, -r.track / 2], [L / 2, r.track / 2], [-L / 2, -r.track / 2], [-L / 2, r.track / 2]];
  for (let i = 0; i < 4; i++) {
    b.vehicle.setWheelChassisConnectionPointCs(i, { x: places[i][0], y: places[i][1], z: mount });
    b.vehicle.setWheelSuspensionRestLength(i, r.restLength);
    b.vehicle.setWheelRadius(i, r.wheelRadius);
    b.vehicle.setWheelSuspensionStiffness(i, stiff);
    b.vehicle.setWheelSuspensionCompression(i, r.damperCompression / r.mass);
    b.vehicle.setWheelSuspensionRelaxation(i, r.damperRebound / r.mass);
    b.vehicle.setWheelMaxSuspensionTravel(i, r.travel);
    b.vehicle.setWheelMaxSuspensionForce(i, r.maxSpringForce);
    b.vehicle.setWheelFrictionSlip(i, r.mu);
  }
  b.loadF = (r.mass * G * r.frontWeight) / 2;
  b.loadR = (r.mass * G * (1 - r.frontWeight)) / 2;
}

/** One wheel as a renderer draws it: its centre in the body's frame, its steer and spin, rad, whether it touches. */
export interface WheelPose {
  x: number;
  y: number;
  z: number;
  radius: number;
  steer: number;
  spin: number;
  contact: boolean;
}

/** A car's body and wheels as they are now: position, orientation, and each wheel on its spring. Read-only, for the 3D view. */
export function carPose(s: SimState, i: number): { x: number; y: number; z: number; q: RAPIER.Rotation; wheels: WheelPose[]; origin: number } {
  const b = s.world.bodies[i];
  const p = b.body.translation();
  const wheels: WheelPose[] = [];
  for (let k = 0; k < 4; k++) {
    const c = b.vehicle.wheelChassisConnectionPointCs(k)!;
    // the wheel hangs below its mount by the spring's length: the direction is straight down in the body
    const len = b.vehicle.wheelSuspensionLength(k) ?? b.rig.restLength;
    wheels.push({ x: c.x, y: c.y, z: c.z - len, radius: b.rig.wheelRadius, steer: b.vehicle.wheelSteering(k) ?? 0, spin: b.vehicle.wheelRotation(k) ?? 0, contact: b.vehicle.wheelIsInContact(k) });
  }
  return { x: p.x, y: p.y, z: p.z, q: b.body.rotation(), wheels, origin: b.origin };
}

/** The rig a car in the race is running on, and a new one for it, live: the tuning panel's way in. */
export function rigInRace(s: SimState, i: number): Rig {
  return s.world.bodies[i].rig;
}
export function setRigInRace(s: SimState, i: number, r: Rig): void {
  applyRig(s.world.bodies[i], r);
}

const bitten = new Map<string, SurfaceDef>();

/**
 * A surface under tyres that bite off the road (CarDef.offroad): grass, mud and water give back
 * that share of the grip, the top speed and the drag they take. Gravel, tarmac and ice are as
 * they are: a lug does nothing on ice.
 */
function bite(surface: Surface, offroad = 0): SurfaceDef {
  const sd = SURFACES[surface];
  if (offroad <= 0 || (sd.drag <= 0 && sd.top >= 1)) return sd;
  const key = `${surface}:${offroad}`;
  let out = bitten.get(key);
  if (!out) {
    const k = offroad;
    out = { ...sd, grip: sd.grip + (1 - sd.grip) * k, top: sd.top + (1 - sd.top) * k, drag: sd.drag * (1 - k) };
    bitten.set(key, out);
  }
  return out;
}

/** What the driver and the race ask of a car this frame. */
interface Ask {
  throttle: number;
  pedal: number;
  /** multipliers on the engine's top speed and its pull: damage, the pacing, the nitro */
  top: number;
  pull: number;
  /** share of the tyres' friction left after a hit spun the car */
  loose: number;
}

export function advance(s: SimState, inputs: CarInput[], dt: number): void {
  const w = s.world;
  const h = dt / SUB;
  s.cars.forEach((c, i) => takeWrites(c, w.bodies[i], s.track));
  const asks = s.cars.map((c, i) => ask(s, c, inputs[i], dt));
  // the surface under each axle, once a frame
  const under = s.cars.map((c) => surfaces(s.track, c));
  for (const c of s.cars) c.hit = 0;
  const air = s.cars.map((c) => c.air);
  const vzBefore = s.cars.map((c) => c.vz);
  for (let k = 0; k < SUB; k++) {
    s.cars.forEach((c, i) => drive(c, w.bodies[i], asks[i], under[i], h));
    const before = w.bodies.map((b) => ({ v: b.body.linvel(), w: b.body.angvel() }));
    w.world.step();
    contacts(s, before);
  }
  s.cars.forEach((c, i) => {
    readBack(c, w.bodies[i], s.track, dt, under[i]);
    if (air[i] && !c.air) land(s, c, vzBefore[i], under[i].here.splash === true);
    // water thrown up behind a car driving through it
    const v = Math.hypot(c.vx, c.vy);
    if (under[i].here.splash && !c.air && v > 4 && s.time * 20 - Math.floor(s.time * 20) < 0.34) {
      s.fx.push({ kind: 'splash', x: c.x - Math.cos(c.heading) * c.def.length * 0.4, y: c.y - Math.sin(c.heading) * c.def.length * 0.4, age: 0 });
      if (c === s.cars[0] && v > 8 && Math.random() < 0.15) s.sounds.push('splash');
    }
    if (c.wreck > 0) return;
    // drifting fills the tank
    if (Math.abs(c.slipAngle) > 0.2 && Math.abs(c.speed) > 9 && c.spin <= 0 && !c.air) c.boost = Math.min(1, c.boost + BOOST.perDriftSecond * nitroFill(c.def) * dt);
  });
}

/** A write from outside since the last frame goes into the body: a teleport, or a kick to the velocity. */
function takeWrites(c: Car, b: Body, t: Track): void {
  const seen = b.seen;
  if (c.x !== seen.x || c.y !== seen.y || c.heading !== seen.heading) {
    const loc = t.locate(c.x, c.y);
    b.body.setTranslation({ x: c.x, y: c.y, z: t.groundAt(loc.s, loc.d) + b.origin + 0.02 }, true);
    b.body.setRotation(yawQuat(c.heading), true);
    b.body.setLinvel({ x: c.vx, y: c.vy, z: 0 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: c.yaw }, true);
  } else if (c.vx !== seen.vx || c.vy !== seen.vy || c.yaw !== seen.yaw) {
    const v = b.body.linvel();
    const a = b.body.angvel();
    b.body.setLinvel({ x: c.vx, y: c.vy, z: v.z }, true);
    b.body.setAngvel({ x: a.x, y: a.y, z: c.yaw }, true);
  }
  // a wreck burns where it stopped and the others drive through its smoke
  const wrecked = c.wreck > 0;
  if (wrecked !== b.wrecked) {
    b.wrecked = wrecked;
    b.collider.setCollisionGroups(wrecked ? WRECK_GROUPS : CAR_GROUPS);
  }
}

/** The once-a-frame part: the wheel's target, the nitro, the engine's pace, the countdown of a spin. */
function ask(s: SimState, c: Car, input: CarInput, dt: number): Ask {
  if (c.wreck > 0) {
    c.steerWant = 0;
    return { throttle: 0, pedal: 1, top: 0, pull: 0, loose: 1 };
  }
  const def = c.def;
  const done = c.finishedAt >= 0;
  c.steerWant = clamp(input.steer, -1, 1);
  // damage costs pull and top speed; an opponent's engine is also paced to the player (PACING)
  const pace = (1 - DAMAGE_PACE * (c.damage / 100)) * enginePace(s, c);
  if (c.spin > 0) c.spin -= dt;
  if (c.slick > 0) c.slick -= dt;
  const spinning = c.spin > 0;
  if (input.boost && !done && !spinning && c.boost > 0.05 && c.boosting <= 0) {
    const tank = nitroTank(def);
    c.boosting = Math.min(tank * BOOST.burst, c.boost * tank);
    if (c === s.cars[0]) s.sounds.push('nitro');
  }
  const boosting = c.boosting > 0;
  if (boosting) {
    c.boosting -= dt;
    c.boost = Math.max(0, c.boost - dt / nitroTank(def));
  }
  return {
    throttle: done || spinning ? 0 : clamp(input.throttle, 0, 1),
    pedal: done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1),
    top: pace * (boosting ? BOOST.top : 1),
    pull: pace * (boosting ? BOOST.accel : 1),
    loose: spinning ? 1 - (1 - SPIN_GRIP) * clamp(c.spin / SPIN_TIME, 0, 1) : 1,
  };
}

interface Under {
  front: SurfaceDef;
  rear: SurfaceDef;
  here: SurfaceDef;
  name: Surface;
}

/** What each axle stands on, and the middle of the car. */
function surfaces(t: Track, c: Car): Under {
  const loc = t.locate(c.x, c.y);
  const road = t.at(loc.s);
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  const L = c.def.length * 0.31;
  const along = fx * road.tx + fy * road.ty;
  const across = fx * -road.ty + fy * road.tx;
  const name = t.surfaceAt(loc.s, loc.d, c.x, c.y);
  return {
    front: bite(t.surfaceAt(loc.s + L * along, loc.d + L * across, c.x + fx * L, c.y + fy * L), c.def.offroad),
    rear: bite(t.surfaceAt(loc.s - L * along, loc.d - L * across, c.x - fx * L, c.y - fy * L), c.def.offroad),
    here: bite(name, c.def.offroad),
    name,
  };
}

/** One Rapier step's orders to a car: the wheel, the engine, the brakes, each tyre's friction, the air. */
function drive(c: Car, b: Body, a: Ask, u: Under, h: number): void {
  const r = b.rig;
  const v = b.body.linvel();
  const heading = headingOf(b.body.rotation());
  const fwd = v.x * Math.cos(heading) + v.y * Math.sin(heading);
  // the wheel turns toward the thumb's share of the lock, at the steer rate
  const target = c.steerWant * lockAt(r, fwd);
  c.steerAngle += clamp(target - c.steerAngle, -r.steerRate * h, r.steerRate * h);
  // the engine: full force at low speed, then its power; the surface caps the top speed
  const topShare = a.top * Math.min(u.front.top, u.rear.top);
  let drive = a.throttle > 0 ? engineAt(r, fwd, r.engineForce * a.pull, r.enginePower * topShare ** 3) * a.throttle : 0;
  let brakeF = 0;
  let brakeR = 0;
  let handbrake = false;
  if (a.pedal > 0) {
    if (fwd > 0.4) {
      brakeF = r.brakeForce * r.brakeFront * a.pedal;
      brakeR = r.brakeForce * (1 - r.brakeFront) * a.pedal;
      // at speed the pedal also locks the rear wheels, the handbrake: a locked tyre slides, and a
      // sliding tyre has less friction than a rolling one (lockedGrip), so in a bend the tail swings
      if (fwd > HANDBRAKE_FROM) {
        handbrake = true;
        brakeR = r.handbrakeForce * a.pedal;
      }
    } else if (fwd > -REVERSE_TOP) drive = -r.engineForce * 0.5 * a.pedal;
  } else if (fwd < -0.4 && a.throttle <= 0) brakeF = brakeR = r.brakeForce * 0.25;
  c.braking = handbrake;
  const oiled = c.slick > 0;
  const vs = Math.max(Math.abs(fwd), V_FLOOR);
  for (let i = 0; i < 4; i++) {
    const isFront = i < 2;
    const sd = isFront ? u.front : u.rear;
    let mu = r.mu * (isFront ? 1 : r.rearGrip) * sd.grip * a.loose;
    if (oiled) mu *= isFront ? OIL.grip : OIL.rearGrip;
    if (!isFront && handbrake) mu *= 1 - (1 - r.lockedGrip) * a.pedal;
    b.vehicle.setWheelFrictionSlip(i, mu);
    // the side stiffness that puts the tyre's friction limit at its peak slip angle, from its static load
    const peak = (isFront ? r.peakFront : r.peakRear) * (sd.peak / SURFACES.gravel.peak);
    const load = isFront ? b.loadF : b.loadR;
    b.vehicle.setWheelSideFrictionStiffness(i, Math.min(1, (mu * load * h) / (SIDE_DAMPING * r.mass * peak * vs)));
    b.vehicle.setWheelSteering(i, isFront ? c.steerAngle : 0);
    const share = isFront ? r.frontDrive : 1 - r.frontDrive;
    b.vehicle.setWheelEngineForce(i, (drive * share) / 2);
    b.vehicle.setWheelBrake(i, ((isFront ? brakeF : brakeR) / 2) * h);
  }
  // the air's drag on the speed, and water's and mud's on the whole car
  const sp = Math.hypot(v.x, v.y);
  const pull = r.drag * sp + (c.air ? 0 : u.here.drag * r.mass);
  b.body.resetForces(false);
  b.body.addForce({ x: -pull * v.x, y: -pull * v.y, z: 0 }, true);
  b.vehicle.updateVehicle(h, undefined, RAY_GROUPS);
}

/** The plain fields from the body, for the race, the bot and the renderer. */
function readBack(c: Car, b: Body, t: Track, dt: number, u?: Under): void {
  const p = b.body.translation();
  const v = b.body.linvel();
  const av = b.body.angvel();
  const heading = headingOf(b.body.rotation());
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const fwd = v.x * fx + v.y * fy;
  const lat = v.x * -fy + v.y * fx;
  if (dt > 0) c.ax = (fwd - (c.vx * fx + c.vy * fy)) / dt;
  c.x = p.x;
  c.y = p.y;
  c.heading = heading;
  c.vx = v.x;
  c.vy = v.y;
  c.yaw = av.z;
  c.z = p.z - b.origin;
  c.vz = v.z;
  let contact = 0;
  for (let i = 0; i < 4; i++) {
    if (!b.vehicle.wheelIsInContact(i)) {
      c.wheelSlip[i] = 0;
      continue;
    }
    contact++;
    // the slip angle: where the tyre's contact patch goes against where the wheel points
    const cp = b.vehicle.wheelContactPoint(i)!;
    const pv = b.body.velocityAtPoint(cp);
    const vx = pv.x;
    const vy = pv.y;
    const a = heading + (i < 2 ? c.steerAngle : 0);
    const wf = vx * Math.cos(a) + vy * Math.sin(a);
    const wl = vx * -Math.sin(a) + vy * Math.cos(a);
    c.wheelSlip[i] = Math.hypot(wf, wl) > 0.5 ? Math.atan2(wl, Math.abs(wf)) : 0;
  }
  c.air = contact === 0;
  c.steer = b.rig.maxSteer > 0 ? c.steerAngle / b.rig.maxSteer : 0;
  c.slipAngle = Math.abs(fwd) > 1 ? Math.atan2(lat, Math.abs(fwd)) : 0;
  const peakF = b.rig.peakFront * ((u?.front.peak ?? SURFACES.gravel.peak) / SURFACES.gravel.peak);
  const peakR = b.rig.peakRear * ((u?.rear.peak ?? SURFACES.gravel.peak) / SURFACES.gravel.peak);
  c.slipF = (c.wheelSlip[0] + c.wheelSlip[1]) / 2 / peakF;
  c.slipR = (c.wheelSlip[2] + c.wheelSlip[3]) / 2 / peakR;
  c.sliding = !c.air && Math.abs(fwd) > 2 && (Math.abs(c.slipF) > 1.3 || Math.abs(c.slipR) > 1.3);
  const loc = t.locate(c.x, c.y);
  c.onRoad = Math.abs(loc.d) <= t.width / 2;
  if (u) c.surface = u.name;
  b.seen = { x: c.x, y: c.y, heading: c.heading, vx: c.vx, vy: c.vy, yaw: c.yaw };
}

/** Touching down: damage on a hard landing, the sound and the shake for the player, spray in water. */
function land(s: SimState, c: Car, vz: number, wet: boolean): void {
  const impact = -vz;
  if (wet) {
    for (let k = 0; k < 4; k++) s.fx.push({ kind: 'splash', x: c.x + Math.cos(c.heading + k * 1.6) * 1.2, y: c.y + Math.sin(c.heading + k * 1.6) * 1.2, age: 0 });
    if (c === s.cars[0]) s.sounds.push('splash');
  }
  if (impact > LAND_HURT) hurt(s, c, DAMAGE.tree * Math.min(1, (impact - LAND_HURT) / 6), c.lastHitBy);
  if (c === s.cars[0] && impact > 2) {
    s.sounds.push('land');
    s.shake = Math.max(s.shake, Math.min(0.5, impact / 18));
  }
}

/**
 * The race reads Rapier's contacts: two cars touching is a ram (harm.ts) at the speed they closed
 * at before the step; a car against the trees costs damage past 3 m/s into them.
 */
function contacts(s: SimState, before: { v: RAPIER.Vector; w: RAPIER.Vector }[]): void {
  const w = s.world;
  const cars = s.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.wreck > 0) continue;
    const ba = w.bodies[i];
    w.world.contactPairsWith(ba.collider, (other) => {
      if (w.walls.has(other.handle)) {
        w.world.contactPair(ba.collider, other, (m, flipped) => {
          if (m.numSolverContacts() === 0) return;
          const n = m.normal();
          const sgn = flipped ? -1 : 1;
          const p = m.solverContactPoint(0)!;
          // the closing speed into the trees at the contact point, before the step
          const bv = before[i];
          const pa = ba.body.translation();
          const vx = bv.v.x - bv.w.z * (p.y - pa.y);
          const vy = bv.v.y + bv.w.z * (p.x - pa.x);
          const hit = (vx * n.x + vy * n.y) * sgn;
          a.hit = 1;
          if (hit > 3) {
            hurt(s, a, DAMAGE.tree * Math.min(1, hit / 12), a.lastHitBy);
            s.fx.push({ kind: 'spark', x: p.x, y: p.y, age: 0 });
          }
          if (a === cars[0] && hit > 2) {
            s.sounds.push('hit');
            s.shake = Math.max(s.shake, Math.min(0.5, hit / 20));
          }
        });
        return;
      }
      const j = w.bodies.findIndex((b) => b.collider.handle === other.handle);
      if (j <= i) return;
      const b = cars[j];
      if (b.wreck > 0) return;
      w.world.contactPair(ba.collider, other, (m, flipped) => {
        if (m.numSolverContacts() === 0) return;
        const n = m.normal();
        const sgn = flipped ? -1 : 1;
        const nx = n.x * sgn;
        const ny = n.y * sgn;
        const p = m.solverContactPoint(0)!;
        const closing = (before[i].v.x - before[j].v.x) * nx + (before[i].v.y - before[j].v.y) * ny;
        if (closing > 0) ram(s, i, j, closing, nx, ny, p.x, p.y, (victim) => (victim.spin = Math.max(victim.spin, SPIN_TIME * 0.6)));
        else a.hit = b.hit = 1;
      });
    });
  }
}

/** the four corners of the car's body, front right first */
function corners(c: Car): [number, number][] {
  const fx = Math.cos(c.heading);
  const fy = Math.sin(c.heading);
  const hl = c.def.length / 2;
  const hw = c.def.width / 2;
  return [
    [c.x + fx * hl - fy * hw, c.y + fy * hl + fx * hw],
    [c.x + fx * hl + fy * hw, c.y + fy * hl - fx * hw],
    [c.x - fx * hl + fy * hw, c.y - fy * hl - fx * hw],
    [c.x - fx * hl - fy * hw, c.y - fy * hl + fx * hw],
  ];
}

/** How deep two cars' footprints overlap, by separating axes, or null when apart. For the checks. */
export function overlap(a: Car, b: Car): { depth: number } | null {
  const A = corners(a);
  const B = corners(b);
  let depth = Infinity;
  for (const car of [a, b]) {
    for (const [ux, uy] of [
      [Math.cos(car.heading), Math.sin(car.heading)],
      [-Math.sin(car.heading), Math.cos(car.heading)],
    ]) {
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A) {
        const d = p[0] * ux + p[1] * uy;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const p of B) {
        const d = p[0] * ux + p[1] * uy;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      const o = Math.min(maxA - minB, maxB - minA);
      if (o <= 0) return null;
      depth = Math.min(depth, o);
    }
  }
  return { depth };
}
