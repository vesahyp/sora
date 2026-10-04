# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Delete the old car model in the next release.** Vesa played the
  new one (2026-10-03) and it is better, so `?physics=old` has done its
  job. Remove `src/game/physics-old.ts`, `SimState.physics` and the
  `physics` argument of `createState`, the `?physics=old` read in
  `Game.tsx`, the branches on `s.physics` in `sim.ts` (`advanceOld`,
  the wreck that stops dead) and `harm.ts` (the 5 rad/s kick in
  `spin`, the yaw kick passed to `ram`), case 9 in
  `tools/physics-check.ts`, `PHYSICS=` in the Makefile and
  `scripts/drive-log.mjs`, and the `?physics=old` lines in `README.md`
  and `CLAUDE.md`. ADR 0003 already says so.
- **Playtest the race by hand on a phone.** The questions: does it feel
  like Death Rally, is the field close enough or too close, and the
  frame rate on a device: the frame draws in about 11 ms portrait in
  headless Chromium, a chunk bake takes 5 to 11 ms, and the first frame
  about 700 ms during the countdown. Knobs: `PACING` and `GRUDGE` in
  `drivers.ts`, `CARS_ACROSS` in `renderer.ts`.
- The look, what is still short: the birch crowns are too yellow-green
  and their limbs too stark, the spruce reads as a dark bush more than
  a conifer, the hurt-engine smoke leaves a row of spots, the haze
  overlay does not move with the shake, the ditch edge scallops.
- Show the grudge on the HUD: Burnout's arrow over a car that has it in
  for you. The number is in state (`Car.grudge`).

## Heights and surfaces: what is built

The car model (`src/game/physics.ts`, ADR 0003) already carries what
the track features below need. All of it is data in `tracks.ts`:

- **Surfaces** (`content/surfaces.ts`): gravel, tarmac, grass, mud,
  water, ice, each a grip, a tyre peak, a slide share, a drag, a top
  speed share, and `splash`. A track's road is gravel or tarmac
  (`TrackDef.surface`); off the road is grass. `TrackDef.patches` lays
  another surface from `s` to `to` metres along the lap, optionally
  only across `d: [from, to]` metres off the centreline. Each axle
  reads the surface under it (`Track.surfaceAt`, looked up in 4 m tiles).
- **Height** (`TrackDef.jumps`): a kicker rises over `len` metres to
  `h` at `s` and drops straight back (`Track.groundAt`). A car carries
  `z`, `vz` and `air`; in the air it has no grip and no steering, and
  it lands with a bounce that scrubs the sideways speed. Cars more than
  0.9 m apart in height pass over each other. The renderer lifts a car
  in the air and leaves its shadow on the ground.
- **Drawn** (`src/render/ground.ts`, `bakeFeatures`): a water patch
  across the whole road as a river that runs on under the trees,
  shallow over the road, and each kicker as planks, a lit lip and the
  drop's shadow. `splash` fx and the `splash` and `land` sounds exist.
- **On a track:** Kiviaho has a 0.6 m kicker with its lip at 45 m on
  the start straight and a 9 m ford at 340 m on the sweeper.
- **Checked:** `tools/physics-check.ts` flies a 1.2 m kicker, holds
  that full lock does nothing in the air, that a crooked landing costs
  more than a straight one, that water drags and splashes, and that ice
  slides where gravel grips.

## Heights and surfaces: what is left

- **Drawing for the other surfaces.** Mud, ice and a tarmac patch work
  in the sim but `bakeFeatures` draws only water across the road and
  kickers. A patch with `d` (part of the road) is not drawn at all.
- **Ground that is not a kicker.** `groundAt` knows only ramps with a
  sheer drop. Crests, dips, a landing ramp and a bridge deck over water
  need a height profile along `s`, and a bridge needs the car's height
  to decide whether it is on the deck or in the river.
- **Walls that are not the tree line.** The only wall is the forest at
  `width / 2 + verge`. Gates, bridge rails, log piles and the inside of
  a shortcut need obstacles in the sim: boxes or circles that
  `treeContacts` (an impulse at the corner that went in) can push
  against, and a renderer for them.
- **The river is a wall at the tree line.** Cars cannot drive down the
  river past the forest edge, though it is drawn running on under the
  trees. Fine for a ford; a river to drive along would need its own
  corridor.
- **The bot does not know features.** It slows for bends only, so it
  crosses the ford flat out and takes the kicker at whatever speed it
  has. It still laps Kiviaho clean (0.2 s slower than without the
  ford), but a shortcut or a bridge will need the bot to see it.
- **The minimap** shows neither the kicker nor the ford.

## Track features

What to put on the roads next, each one built on the heights and
surfaces above. Jumps and fords are data today; the rest needs what is
listed as left:

- **Jumps** on every track (Kiviaho's start straight has the first).
  A kicker across the road (`TrackDef.jumps`): take it
  straight and fast and you fly far and land clean, take it crooked
  and the landing scrubs your speed; no steering in the air, so the
  line is chosen before the lip.
- **Fords** on every track (Kiviaho's sweeper has the first). A
  stretch of shallow water (`patches`, `water`): heavy
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
