# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Playtest the new car model on a phone against the old one**
  (https://vesahyp.github.io/sora/?physics=old). The questions: does a
  slide feel like weight and grip letting go, does the pedal stab turn
  a hairpin, does a glancing tree hit slide along, do hits push and turn
  cars. The knobs are the constants at the top of `src/game/physics.ts`
  and `content/surfaces.ts`; `make drive-log` and `tools/dbg/matrix.ts`
  read a change before it is felt.
- **Delete the old car model in the release after**: `physics-old.ts`,
  `SimState.physics`, the `?physics=old` branch in `Game.tsx` and
  `sim.ts`, the old kick in `harm.spin`, and `PHYSICS=` in `drive-log`.

- **Playtest by hand on a phone, again.** The race was rebuilt (start
  last, a paced field with grudges, a 6 m road, a close camera) and so
  was the look. The questions now: does it feel like Death Rally, is
  the field close enough or too close, and the frame rate on a device:
  the frame draws in about 11 ms portrait in headless Chromium, a chunk
  bake takes 5 to 11 ms, and the first frame about 700 ms during the
  countdown. Knobs: `PACING` and `GRUDGE` in `drivers.ts`, `CARS_ACROSS`
  in `renderer.ts`.
- The look, what is still short: the birch crowns are too yellow-green
  and their limbs too stark, the spruce reads as a dark bush more than
  a conifer, the hurt-engine smoke leaves a row of spots, the haze
  overlay does not move with the shake, the ditch edge scallops.
- **Playtest by hand on a phone.** The bot is the only driver so far.
  The questions: does the car now feel like a car, does braking into a
  bend bring the tail round the way it should, is the nitro burst long
  enough to matter, and do the guns read as yours. The knobs are in
  `cars.ts` (grip, lock), `sim.ts` (the constants at the top) and
  `weapons.ts`. If it still pushes, say in which phase: on turn-in
  (lock and yaw inertia), through the bend (grip and the rear's share),
  or on the throttle out (the rear's cost in the friction circle). Each
  is a different number, and `tools/dbg/handling.ts` measures it.
- Show the grudge on the HUD: Burnout's arrow over a car that has it in
  for you. The number is in state (`Car.grudge`).

## Track features

What to put on the roads next, each one data in `tracks.ts` on the
surfaces and the height the car model already has (ADR 0003):

- **Jumps.** A kicker across the road (`TrackDef.jumps`): take it
  straight and fast and you fly far and land clean, take it crooked
  and the landing scrubs your speed; no steering in the air, so the
  line is chosen before the lip.
- **Fords.** A stretch of shallow water (`patches`, `water`): heavy
  drag and a splash, less grip, so the fast line crosses it short and
  straight and a car that drifts into it loses the race there.
- **Bridges.** A narrow deck over the river, a car and a half wide,
  with rails that are walls: the dry line is quick but one car at a
  time, the ford beside it is slow but wide, and the pack splits.
- **Narrow gates.** Two posts or a barn's doorway on the road, a car
  and a half apart: a place to block, to be punted into the post, and
  to get through first.
- **Shortcuts.** A gap in the forest across the inside of a hairpin,
  on mud or grass: shorter, slower underfoot, and a gamble when the
  field is on your bumper.
- **Hazards.** Ice on a shaded bend, a mud hole on the line, a log
  pile at the edge that is a wall: each a surface or an obstacle that
  punishes the lazy line and rewards the driver who saw it.

## Later

- Balance the career's length: how many races from the Kortteli to a
  built Kiila. A bot that plays the whole career (race, buy the best
  part, repeat) and reports races to each class is the tool; the prize
  table in `events.ts` and the prices in `cars.ts` and `parts.ts` are
  the knobs; `make balance` gives the lap gaps.
- Sell a car back at the dealer; a used-car column with cheaper worn cars.
- More tracks; tracks reused across classes with a different car.
- Reverse layouts of the two tracks as cheap extra events.
- Spikes and a ram plate as armour's look; a rear missile.
- Boost pads and jumps on the road (Death Rally's acceleration zones).
- The rest of what the research found and Sora has not taken: a market
  with bad ideas in it (sabotage, rocket fuel, a loan shark), a league
  of drivers that moves on its own between races, a harpoon. See
  `docs/research/combat-racer-mechanics.md`.
- Two players on one phone, a thumb each, the Räkkä pattern.
- The clavesa rollup of the pixel logs and the `?stats` board (Räkkä's
  `analytics/` and `StatsScreen`), then global lap records in DynamoDB
  behind one Lambda, the Räkkä way.
- itch.io and Newgrounds: the portal kit from Räkkä (`docs/portals.md`
  there): a relative-path build, the iframe check, English store images,
  records read through the CloudFront cache, two beacons a race.
