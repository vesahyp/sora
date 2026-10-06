---
adr: 5
title: The cars run on Rapier's raycast vehicle, every parameter a named physical quantity
date: 2026-10-06
status: Accepted
deciders: Vesa
---

## Context

ADR 0003 gave the car a hand-written model: a bicycle model with a tyre
curve, then four arcade aids on top (caster, traction control, a rear
spin guard, yaw damping), then a layer that turned the thumb into a yaw
request (`yawMax`), then a scrub drag. Each one fixed the last playtest
and made the next one harder to read. Vesa played the build of
2026-10-06: the steering is limp and then reacts suddenly a moment
later. "This is not physics."

The knobs had no physical meaning (`YAW_ROOM`, `CASTER_FROM`, `SCRUB`,
`GUARD_GAIN`), so a driving problem could not be stated in terms that
point at a fix. He wants an existing engine, so that the talk is about
mass, weight transfer, tyre friction, inertia, angular velocity and
steering rate.

## Decision

**Rapier** (`@dimforge/rapier3d-compat`, WASM, deterministic) runs the
cars, every car alike: the player, the rivals, the wrecks.

- **A car is a 3D rigid body on four raycast wheels**, Rapier's
  `DynamicRayCastVehicleController` (a port of Bullet's raycast
  vehicle). Each wheel is a spring and a damper on a ray. Weight
  transfer is not a formula: the body pitches and rolls on its springs
  and the loaded wheels press harder.
- **The tyre** is Rapier's: the side force grows with the sideways
  speed at the contact (the side friction stiffness, which the car
  model sets each step from a named **peak slip angle**, so the force
  grows with the slip angle) up to the **friction coefficient** times
  the wheel's load, where it stays flat. Drive and side force share one
  friction limit per wheel.
- **The world is Rapier's**: the ground is a triangle mesh along the
  road, the verge and every shortcut lane, its height from
  `Track.groundAt` (rivers and crests); the tree line is a row of
  static boxes 4 m tall. Car against car and car against trees are
  Rapier contacts. The race reads the contacts for damage and rams.
- **Steering is a wheel angle with a rate limit.** The thumb gives a
  share of the lock; the wheel turns toward it at the steer rate. The
  lock falls with speed, the way a rack ratio and the driver's hands
  do. Nothing asks for yaw.
- **Removed**: the yaw request (`yawMax`, `YAW_ROOM`), the caster aid,
  traction control, the counter-steer and spin guard, yaw damping, the
  scrub drag, the pitch lag, and the model before 0003
  (`physics-old.ts`, `?physics=old`).
- The sim stays headless and fixed-step: Rapier steps at 120 Hz, two
  steps inside each 60 Hz `step()`.

Jolt (its WASM build) was the other candidate: its wheeled vehicle has
real tyre slip curves, an engine torque curve and a gearbox. It was not
taken: its JavaScript API needs manual memory management, it is a
larger download, and Rapier's model has the parameters the game needs.
Bullet's raycast vehicle (cannon-es, ammo.js) is the same model as
Rapier's in an older or heavier package.

### The parameters, stock Tauno

Every car derives its rig from its `CarDef` (`src/game/rig.ts`), so the
shop, the dealer and the rivals' `pace` keep working. The game's knobs
in `cars.ts` are honest now: `topSpeed` is the speed the car reaches.

| Parameter | Unit | Tauno | From |
|---|---|---|---|
| Mass | kg | 1250 | `mass` × 1000 |
| Centre of mass height | m over the ground | 0.30 | constant |
| Weight on the front axle | share | 0.50 | constant |
| Yaw inertia | kg·m² | 1066 | box: m (L² + W²) / 12 |
| Pitch inertia | kg·m² | 980 | box, 1 m tall |
| Roll inertia | kg·m² | 294 | box, 1 m tall |
| Wheelbase | m | 1.80 | 0.62 × length |
| Track width | m | 1.15 | 0.85 × width |
| Wheel radius | m | 0.28 | constant |
| Suspension rest length | m | 0.30 | constant |
| Suspension travel | m | 0.30 | constant |
| Spring rate | N/m per wheel | 37 500 | 30 per kg of car |
| Damping, compression / rebound | N·s/m per wheel | 7500 / 6250 | 6 / 5 per kg |
| Most a spring pushes | N per wheel | 36 800 | 3 × the car's weight |
| Tyre friction coefficient μ | | 1.33 | `grip` / g, times the surface's `grip` |
| Peak slip angle, front / rear | rad | 0.13 / 0.07 | the surface's `peak`; the rear is stiffer |
| Engine force | N | 12 500 | m × `accel`, at the rear wheels |
| Engine power | kW | 87 | engine force × 0.3 × top speed |
| Air drag | N·s²/m² | 7.1 | power / top speed³ |
| Top speed | km/h | 83 | `topSpeed`, emerges from power and drag |
| Brake force | N | 12 500 | m × `brake`, 60% on the front |
| Handbrake force | N on the rear wheels | 13 000 | the pedal above 6 m/s: 0.8 × the force that locks them |
| Locked-tyre friction | share of μ | 0.85 | a sliding tyre's friction against a rolling one's |
| Max steer angle | rad | 0.44 | `turnRate` × 0.17 |
| Lock at speed | m/s that halves it | 28 | constant |
| Steer rate | rad/s | 5 | constant |

The live values are in `src/game/rig.ts`; the title screen has a
switch for the physics readout, an overlay that shows the speed, the yaw rate, the steer angle and
the slip angle of each wheel while driving.

## Consequences

- A handling complaint is now a sentence with a number in it: the rear
  lets go at 0.07 rad, the steer rate is 5 rad/s, the lock at 80 km/h
  is 0.2 rad. `tools/physics-check.ts` holds the promises in those
  terms, among them that the yaw rate follows the wheel within a fifth
  of a second and does not overshoot into a spin.
- The game's scripts grow from 0.14 MB to 1.2 MB gzipped: Rapier's WASM
  ships inside the script as text (the `-compat` build), so it works the
  same in the browser, the service worker's cache and Node. The plain
  build with a separate `.wasm` file would be about half that, at the
  cost of a WASM loader in Vite. The game starts once Rapier has loaded
  (`initPhysics()`).
- Rapier worlds live in WASM memory. A race frees its world when it
  ends (`dispose(s)`); the checks, which run hundreds of races, do too.
- The tyre is flat past its peak: a slide holds its force and does not
  fall off, so there is no snap, and also no drop in grip that a skilled
  driver could feel and catch. A tyre curve with a falloff would need
  Jolt or our own tyre on top of Rapier's body.
- The career curve, the licence targets and the bot were tuned on the
  old model. They are re-read on this one (`make balance`,
  `sim-check`, `make playthrough`) in the same change. Without a spin
  guard a thumb that meets the pack or a slick loses a race it would
  win nine times in ten, so `sim-check` holds the folk events as rates
  over twelve races each, as it already held C.
- A body can come to rest where no wheel touches: on a river's lip with
  its wheels over the water. The marshals tow any car that has gone
  nowhere for 6 s, on the road or off it.
- ADR 0003's rigid-body contacts, surfaces and heights carry over as
  data; its tyre and its aids are superseded by this record.

## Update 2026-10-06

Vesa played the first Rapier build: "Still understeer". In his
screenshot the Tauno was on the grass verge at 59 km/h, the wheel at
0.11 of the 0.24 rad the lock allowed there. The car holds 1.19 g on
gravel at that speed whatever the axle balance (a skidpad sweep of the
rear tyres' friction, the weight split and the rear's peak slip angle,
`tools/dbg/skidpad.ts`), but with the lock halving at 20 m/s a thumb
reached that limit only at 70% of its swing. The lock now halves at
28 m/s: a 30% swing turns at 0.76 g instead of 0.66, the limit comes at
half a swing, and a pedal stab at half lock turns the car 1.4 rad, a
hairpin's worth, as the old model did. 35 m/s turned a stab into a spin.
