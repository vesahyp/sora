# Car physics for a top-down arcade racer

Research notes, 2026-10-03, for Sora. The question was: the car did
donuts and felt off; what is the standard model, and how is it tuned
for an arcade feel. ADR 0002 records what was decided.

## The model everyone uses

Marco Monster's "Car Physics for Games" (2000) is the reference every
game forum points at. The 2D part is the **bicycle model**: the two
front wheels are one wheel at the front axle, the two rear wheels one
at the rear.

State: position, heading θ, velocity in the car's frame (v_long
forward, v_lat sideways), yaw rate ω.

Slip angles, with b the distance from the centre of gravity (CG) to
the front axle, c to the rear, δ the steering angle:

    α_front = atan2(v_lat + ω·b, |v_long|) − δ
    α_rear  = atan2(v_lat − ω·c, |v_long|)

Lateral force per axle: linear in the slip angle at small angles,
`F = C_α · α` (C_α the cornering stiffness), capped at the friction
limit `μ · F_z` where F_z is the load on that axle. A flat cap past the
peak is forgiving; Pacejka's curve drops past the peak, which is
realistic and less forgiving.

Loads: static `F_zf = (c/L)·W`, `F_zr = (b/L)·W` for wheelbase L = b +
c. Longitudinal acceleration a shifts load by `(h/L)·M·a` from one
axle to the other, h the CG height: braking loads the front and
lightens the rear, which is why a car oversteers under braking.

Equations of motion in the car frame:

    a_lat  = (F_rear + F_front·cos δ) / M − v_long·ω
    a_long = (F_drive − F_brake − F_drag − F_front·sin δ) / M + v_lat·ω
    ω'     = (F_front·cos δ·b − F_rear·c) / I_z

I_z is the yaw inertia, for a box `M·(length² + width²)/12`.

Longitudinal: drive force from the engine, drag `−C_d·v·|v|`,
rolling resistance `−C_rr·v`, braking a constant force against the
heading. Drive and braking cannot exceed what the tyres transmit:
`μ·F_z` on the driven or braked axle.

**Friction circle**: a tyre has one budget. What it spends lengthwise
(drive, brake) it does not have sideways. Combined use beyond the
limit scales both down. This is what makes trail-braking a skill and
full throttle out of a hairpin loosen the rear on a rear-driven car.

## Numerical notes

- The slip angle formulas divide by `v_long`; at rest they blow up.
  Floor the denominator at walking pace and blend the yaw rate to the
  **kinematic bicycle** `ω = v·tan δ / L` below a few m/s. Papers on
  numerically stable bicycle models do the same with a sigmoid.
- Euler at 60 Hz is fine for an arcade car if forces are capped; the
  original article suggests RK4 for stiffer setups.
- Clamp engine rpm to a minimum so the car moves from rest.

## Tuning for feel

From the forum threads and the arcade implementations found:

- **Understeer vs oversteer is the front/rear grip balance.** More
  rear grip than front (road cars, by setup) pushes at the limit and is
  stable. Equal or less rear grip rotates and needs catching. Game
  cars usually sit a touch loose, so turn-in feels alive, with a
  spin-guard: past a wide slip angle the rear bites again (a rising
  curve past the peak, or an assist), so holding full lock settles at
  an angle rather than spinning out.
- **Counter-steer must work on its own.** In the bicycle model it does:
  steering into the slide reduces the front slip angle, the front force
  drops, the yaw torque flips sign. Assists on top: a counter-steer
  helper when the stick is released, a drift-hold that scales the
  target angle with throttle.
- **Handbrake** cuts rear grip (to a third or less) and brakes the
  rear; released, the rear bites and the car fires along its heading.
  The handbrake-cornering papers note hairpins can be taken without
  counter-steer after release.
- **Throttle loosens the rear** on a rear-driven car through the
  friction circle; lifting winds the slide down. Weight transfer gives
  the rest: brake, the tail comes; power, the nose lifts and pushes.
- **Steering lock falls with speed**: full lock at a standstill, a
  fraction at speed, or the front saturates at once and the car plows.
- **Yaw inertia** sets how fast the nose follows the wheel. Too much
  and the car feels like a boat; too little and it twitches.
- **A flat tyre curve past the peak** is the arcade choice: a slide
  never "falls off a cliff". Pacejka with a drop is the sim choice.
- **Grip in g**: real gravel 0.6 to 0.8, road tyres on tarmac about 1,
  race tyres 1.3 to 1.5. The feel of realism comes from behaviour, not
  the absolute number; an arcade game runs a little over one g on
  gravel and nobody minds.
- **The bot has to drive the model**: steer by the yaw rate it wants
  through the wheelbase (`δ = atan(ω·L/v)`), brake to `v = sqrt(a_lat·r)`
  for the bend ahead, and brake when running wide. A bot that steers
  by heading error gain alone slams the lock and plows.

## What Sora settled on (2026-10-03)

Measured with the handling table (`tools/dbg/handling.ts`: yaw rate
against the kinematic bicycle, lateral g, rear slip, body angle, at set
speeds and steers):

- Rear grip 0.9 of the front, CG in the middle, yaw inertia 0.75 of a
  box. At 15 m/s and a third of lock the Kortteli turns at the kinematic
  rate, 1.2 g, with the rear just past its peak: neutral, with the tail
  working. The first cut had the rear at 1.08, and that car pushed.
- The throttle's cost in the friction circle lands on the rear only, the
  brakes' mostly on the front: power loosens the rear, braking loads the
  nose and brings the tail.
- Grip 20 to 26 m/s² by class: about two g, arcade, after 1.25 g still
  read as "mental understeer" on the phone. The limit, not the balance,
  was the push: at 1.2 g a car at 72 km/h cannot turn tighter than 34 m
  and the hairpins are 16 m. Death Rally cars turn on a dime; a real
  model with arcade grip gives that without the donuts.
- Steering lock halves at 50 m/s rather than 32, so there is wheel left
  at speed.
- The bot needs counter-steer to drive it: steer into a rear slip past
  the peak, hold a third throttle rather than brake while the tail is
  out. Without that it spun every car with a loose rear.

## Measuring instead of feeling

A step response at constant steer and speed tells more than a lap:
the yaw rate the car settles at against the kinematic `v·tan δ / L`
is the understeer gradient (below 1 pushes, above 1 rotates), the time
to settle is the inertia, and the slip angle at the rear tells whether
the tail is out. Sora keeps this in `tools/dbg/trace.ts`.

## Sources

- Car Physics for Games, Marco Monster (mirror):
  https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html
- Marco Monster's car physics, RMGI blog:
  https://rmgi.blog/marco-monsters-car-physics.html
- Numerically stable dynamic bicycle model for discrete-time control:
  https://arxiv.org/pdf/2011.09612
- Car simulation: Pacejka, slip angle and oversteer, GameDev.net:
  https://gamedev.net/forums/topic/552549-car-simulation-pacejka-slip-angle-and-oversteer/4554896/
- Handbrake physics on a car game, GameDev.net:
  https://www.gamedev.net/forums/topic/662720-handbrake-physics-on-a-car-game/
- FWD vehicle drifting control: the handbrake-cornering technique:
  https://skoge.folk.ntnu.no/prost/proceedings/cdc-ecc-2011/data/papers/1769.pdf
- Vehicle Physics Pro, miscellaneous topics explained:
  https://vehiclephysics.com/advanced/misc-topics-explained/
- Programming vehicles in games, Wassimulator:
  https://wassimulator.com/blog/programming/programming_vehicles_in_games.html
- A top-down racer's grip, drift and weight transfer notes:
  https://github.com/nicolas-found42/topdown-racer/issues/8
