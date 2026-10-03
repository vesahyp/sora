---
adr: 2
title: The car is a bicycle model with saturating tyres
date: 2026-10-03
status: Accepted
deciders: Vesa
---

## Context

The first car model was a heading and a velocity with the sideways part
decaying at a "grip" rate, plus hand-written terms: yaw added from the
slide, speed thrown sideways by turning, a grip boost past a wide angle.
It let a car corner at two g, and once the terms for drifting went in,
a sliding car kept rotating on its own. Vesa's verdict on the phone:
donuts, and everything feels off.

## Decision

Replace the model with the standard one for games, Marco Monster's
"Car Physics for Games": velocity in the car's frame, a slip angle per
axle from the lateral velocity and the yaw rate, a cornering force per
axle that grows with the slip angle and saturates at the tyre's grip
times its load, yaw from the torque the two axles make about the centre
of gravity, load moved to the front under braking, and a friction
circle so braking and driving cost cornering grip. Drive and braking
are capped by what the tyres can transmit. At walking pace the yaw rate
blends to the kinematic bicycle, so rest is not a singularity.

The tyre curve is linear to a peak slip angle and flat past it: no drop,
so a slide is forgiving and never pumps itself.

Grip is about two g, arcade, well above real gravel: at 1.2 g the car
read as understeering on the phone, because its limit was the push,
not its balance. The behaviour, not the absolute number, is what reads
as real: a car that plows when asked too much, a tail that comes round
under braking, a slide that settles.

## Consequences

- Oversteer, understeer and the tail swing under braking come out of
  the physics. Nothing in `sim.ts` adds yaw by hand.
- The bot steers by the yaw rate it wants, turned into a wheel angle
  through the wheelbase, and brakes to the speed a bend allows from grip
  and radius. It also brakes when it is running wide. It drives at the
  limit of a model it only approximates, so the off-road bar in
  `sim-check` is 10%.
- The licence targets were re-read off `make balance`.
- `turnRate` on a car is the steering lock now, `grip` the tyres'
  acceleration limit, `brake` capped by grip; the `tools/dbg/trace.ts`
  step-response trace is how a change to the model is read.
