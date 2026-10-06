---
adr: 3
title: Cars are rigid boxes with impulses, on a tyre that lets go smoothly
date: 2026-10-03
status: Superseded by 0005
deciders: Vesa
---

## Context

ADR 0002 gave the car a bicycle model, and Vesa played it over several
rounds on the phone and was not happy with the collisions or the
driving. A scripted drive by touch on an emulated phone
(`make drive-log PHYSICS=old`) showed what was wrong:

- **Trees stopped the car dead.** The tree line was a clamp that kept
  60% of the speed for every frame the car touched it: a 15 degree
  glancing hit at 90 km/h lost 43% in one frame and stopped the car
  within half a second.
- **Cars were 3 m circles on 4 m bodies.** Two cars side by side with
  1.2 m of air between them were in contact for a second; nose into a
  door they overlapped by 0.9 m. A hit traded speed along the line
  between the centres and never turned a car; a hard one added a fixed
  5 rad/s kick on the yaw.
- **A sideways car stopped in one frame.** Below 5 m/s forward the
  model killed half the sideways speed every step, so a spin ended in a
  halt, from 10 m/s to nothing.
- **Grip switched.** The tyre was linear to its peak and flat past it,
  and the road edge cut the grip from 1 to 0.45 in one step.
- **A pedal stab at half lock spun the car** to 4.5 rad/s, with
  nothing to stop the rotation.

Vesa also wants jumps, river crossings and more on the tracks next, so
the new model had to carry a height and a surface from the start.

## Decision

A new model in `src/game/physics.ts`, run at three substeps a frame
(180 Hz) inside the fixed 60 Hz step:

- **Rigid bodies.** A car is a box with a mass and a yaw inertia. Car
  against car is box against box (separating axes), resolved with an
  impulse at the contact point with restitution and friction, so a hit
  off the middle turns the other car and momentum is kept. The tree
  line is pushed back the same way at the corner that went in, with
  low friction, so a glancing car slides along the trees.
- **The tyre lets go smoothly.** Force rises to a peak and falls to a
  share of it past the peak (`slide`, per surface). Each axle has one
  budget for drive, braking and cornering. The pedal at speed takes
  most of the rear's side grip (the handbrake).
- **Four arcade aids, because the thumb has no throttle:** caster (a
  free wheel swings to where the front axle is going, so a slide let
  go of straightens), traction control (drive fades as the rear slides
  past its peak), a rear spin guard (a tail far out bites again) and
  yaw damping while the rear is past its peak. Without them, a held
  slide on an always-open throttle became a spin.
- **Surfaces are data** (`content/surfaces.ts`): gravel, tarmac, grass,
  mud, water, ice, each a grip, a peak, a slide, a drag and a top
  speed. A track lists patches of another surface by arc length
  (`TrackDef.patches`), and each axle reads the surface under it.
- **A height axis.** A track lists jumps (`TrackDef.jumps`); a car that
  leaves a lip flies, with no grip or steering, and lands with a bounce
  that scrubs the sideways speed it came down with.

The old model stays in `src/game/physics-old.ts` for one release, at
`?physics=old`, so the two can be compared on a phone.

## Consequences

- `tools/physics-check.ts` asserts the promises: a straight line holds,
  full lock slides and recovers, a pedal stab turns a corner and comes
  back, a glancing hit keeps 80% of the speed, bodies never sink into
  each other, a jump flies, water drags. `make check` runs it.
- A missile's spin cost twice the ground on the new model, because a
  car carries a spin on saturated tyres; the kick is 3 rad/s here and 5
  on the old one, measured to cost the same (`tools/dbg/spin.ts`).
- The race spread out until the catch-up was raised (`PACING.engine.push`
  0.2, `corner.push` 0.4). `sim-check` now runs every grid order, six
  races, because three left one track's result to chance.
- Delete `physics-old.ts`, `SimState.physics`, the `?physics=old`
  branch and the old half of `harm.spin` in the release after.
