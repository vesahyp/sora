# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Vesa's phone playtest of the Rapier car** (ADR 0005, 2026-10-06,
  after "the steering is limp and then suddenly reacts. This is not
  physics"). The scripted thumb says: the yaw rate reaches 63% of its
  turn 0.07 s after the thumb moves, at any swing; the hand laps
  Kiviahon lenkki in 25 to 26 s stock as before. What only a hand can
  answer, in the readout's terms: is the lock at speed right (0.22 rad at
  70 km/h, `lockHalf`), does the turn-in at a full swing (the yaw peaks a
  third over what the car then holds) read as bite or as a twitch, is the
  pedal's tail swing enough (`handbrakeForce`, 0.8 of what locks the
  rear: a stab at 80 km/h turns the Tauno 0.5 rad, held with the thumb
  1.2; at the full lock it was a snap the thumb made more than once a
  race),
  does the car feel heavy enough (`mass`,
  `comHeight`, `yawInertia`). Every knob is in `src/game/rig.ts`.
  The scripted thumb's open problem: it brakes mid-hairpin without
  knowing the pedal swings the tail, so one attempt in about seven
  spins into the inside trees and fails the playthrough's off-road and
  tow rules (2026-10-06, Hirvisuon lenkki's hairpin at 43 km/h). Teach
  `tools/hand.ts` to brake before the bend, not in it, before reading
  the hour's off-road numbers as the car's.
- **C, B and A lap within 0.3 s of the old model** on Rapier (`make
  balance`), and every car answers the thumb the same way: the Kortteli
  at 130 km/h may feel twitchy where the Tauno feels right. Playtest
  the first C race in the stock Kortteli before touching anything; the
  knobs are `lockHalf` in `rig.ts` and `CURVE` in `input.ts`. The step from JM to C is also now a car half again as
  fast on tracks twice as long: if that is too much at once, slow the
  Kortteli a tenth (`cars.ts`) and the licence targets follow
  (`make balance`, `licences.ts`).
- **The upgrade gap on the folk car is 10 to 12% of a lap** (stock 25.3
  against full 23.1 by the hand, 24.2 against 21.4 by the bot, `make
  balance`). The pull and the top speed are the felt part (+27% and
  +15%, with the engine fading toward its top the terminal speed goes 80
  to 95 km/h). If the step should be bigger, the knob is the per-level
  effect in `tuned()` (`parts.ts`), which is shared by every class, so
  read the C to A ladder in `make balance` after.
- **The thumb driver is a model, and a floor.** `tools/hand.ts` steers
  by heading error with a reaction delay, goes round a car ahead, jumps
  a river, and never brakes to rotate the car; a real thumb uses the
  pedal to swing the tail into the hairpin and would lap quicker. Teach
  it the pedal stab, then the shortcut, then read the hour again.
- **C is a coin toss for the bot player.** Over 48 C races (the six
  grids with a hair of skill changed, `tools/dbg/grid2.ts`) the default
  bot finishes top two 62% of the time with the wild cast, 52% with the
  field before it; a mine or a wreck on lap one costs the rest. The
  scrub (2026-10-06) took another slice: over 36 C races the rate went
  from 72% to 58%, and neither a slower field (0.8 to 0.9 of its skill)
  nor a narrower corner margin on the bot bought it back, so `sim-check`
  now runs the twelve C races three times over and holds half. The bot
  passes poorly in a pack and is the one the field goes for; a better
  bot driver, one that lifts when the front scrubs instead of holding
  the ask, would make the career curve checkable to the second, and
  would say whether a thumb that has learnt the car loses the same
  slice. The hand's own folk curve is intact: it wins the first four
  folk races from every grid and the final by a second, against fields
  slowed to 0.6, 0.75 and 0.85 of their skill in the last three.
- **Playtest the wild cast** (2026-10-04): does the tractor's shove and
  the monster truck's throw feel fair or cheap, is the bus a fun wall or
  a wall, does anyone buy the hearse. Knobs: `pace`, `massScale`,
  `offroad` and `spinOnShunt` in `rivals.ts`, the wild buys in
  `cars.ts`, the root of the mass in `harm.ts`'s `ram`.
- The whole Kiviaho hairpin is 70 m across and the camera 24 m: the
  approach shows the entry and the turn, the arrow the rest. A zoom
  that widens with speed or into a hairpin is the next knob if the
  phone playtest says the hairpin still surprises. The folk loops'
  hairpins are tighter still (radius 15 to 20 m) at half the speed.
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
- **Height** (`Track.groundAt`), a profile along `s` across the road
  and the verge. A river (`TrackDef.rivers`: `s`, `gap`, `bank`): the
  road climbs a bank over `RIVER.ramp` metres, steepening to `bank` at
  the lip, the ground drops to the water (`RIVER.water`, under the road)
  for `gap` metres, and the far bank climbs back over `RIVER.out`
  metres, steep at the water and flattening toward the road; its water
  is a patch. A crest (`TrackDef.crests`: `s`, `len`, `h`): a smooth
  brow. Since ADR 0005 the heights are Rapier's ground mesh: a car on
  its springs leaves the ground when it falls away faster than gravity
  can follow, has no grip in the air (no wheel touches), pitches nose
  down off a lip it leaves slowly, and lands on its springs; its body's
  edges are rounded so a nose dropped into a river rides up the far
  bank. Cars are boxes a metre tall, so one high enough passes over
  another. The renderer lifts a car in the air, sinks it
  in the river and throws its shadow by its height over the ground.
- **Shortcuts** (`TrackDef.shortcuts`): a lane through the forest along
  an open polyline, with a width and a surface. `Track.lanes` drives
  it: the walls are the union of the road's verge and the lanes'
  (`physics.ts`, `treeContacts`), the surface under an axle is the
  lane's inside it, the trees are not planted in it, the ground bakes
  it as a worn two-track, the minimap dashes it. The bot drives a lane
  (`autoplayer.ts`, `laneFor`): told to, or as the best driver when it
  is well behind the player; any bot that finds itself in one drives
  it to the end.
- **Drawn** (`src/render/ground.ts`, `bakeFeatures`): a river's near
  bank as bare earth either side of a road that pales toward a worn
  lip, the drop's shadow on the water, deep water that runs on under
  the trees, the far bank wet where it comes out; a water patch (a
  ford) shallow over the road; a crest as the light on its two slopes.
  The minimap marks a river with a bar of water. `splash` fx and the
  `splash`, `land` and `tow` sounds exist.
- **On the tracks:** Kiviaho has a 0.9 m crest on the start straight, a
  12 m river with a 0.45 m bank after the first sweeper (where the ford
  was) and the grass shortcut across the hairpin, and nothing that
  throws a car into the hairpin; Hirvisuo a 0.9 m crest on the straight
  and the same river on the long bottom straight (s 560: in the esses,
  where the ford was, a flight landed off the bending road). The folk
  loops (2026-10-05) have the same crest on their start straights and an
  8 m river each, sized to the slow Tauno: the stock car clears it at
  60 km/h and lands 11 m past the lip, a crawl drops in; Kiviahon lenkki
  has a grass shortcut across its hairpin that saves 1.6 s a lap.
- **Stuck:** any car not a metre along in 1.5 s with its nose at the
  trees reverses on its own for a second, the wheel turned to bring the
  nose round to the road (`sim.ts`, `rescue`); a car off the road and
  not 8 m along the lap in 4 s is towed back on facing forward.
- **Checked:** `tools/physics-check.ts` flies a crest fast and only
  lifts a slow car over it, holds that full lock does nothing in the
  air, that a crooked landing costs more than a straight one, that the
  Tauno flat out clears a river onto the road and at half speed drops
  in, splashes and drives out, that water drags and splashes, and that
  ice slides where gravel grips. `sim-check` jumps every river every
  lap with every class car, lands every flight on the road, drives
  every shortcut (it must save time and not a free lap), and asserts
  no car in any armed race is stalled off the road over `TOW_AFTER`.
  `make drive-log` takes the first river by touch on a phone.

## Heights and surfaces: what is left

- **Drawing for the other surfaces.** Mud, ice and a tarmac patch work
  in the sim but `bakeFeatures` draws only water, river banks and
  crests. A patch with `d` (part of the road) is not drawn at all.
- **Ground across the road.** `groundAt` ignores `d`: a bank or a crest
  spans the road and the verge alike. A camber, a ditch with depth or a
  bridge deck over the river (where the car's height decides deck or
  water) need it.
- **Walls that are not the tree line.** The only walls are the forest
  at `width / 2 + verge` and a lane's trees. Gates, bridge rails, log
  piles need obstacles in the sim: boxes or circles that `treeContacts`
  (an impulse at the corner that went in) can push against, and a
  renderer for them.
- **The river is a wall at the tree line.** Cars cannot drive down the
  river past the forest edge, though it is drawn running on under the
  trees. Fine for a ford; a river to drive along would need its own
  corridor.
- **The bot does not know rivers or crests.** It slows for bends only
  and takes a lip at whatever speed it has, which the checks show
  clears both rivers in every class car. A damaged or paced-down rival
  can fall in; it drives out.
- **A flight is straight.** The road keeps bending under a car in the
  air, so a river or a crest needs a straight after it; a car on
  nitro flies far enough to land on the verge on Kiviaho's diagonal.

## Track features

What to put on the roads next, each one built on the heights and
surfaces above:

- **Bridges.** A narrow deck over the river, a car and a half wide,
  with rails that are walls: the dry line is quick but one car at a
  time, the river beside it is slow but wide, and the pack splits.
- **Narrow gates.** Two posts or a barn's doorway on the road, a car
  and a half apart: a place to block, to be punted into the post, and
  to get through first.
- **A mud hole in a shortcut**, so the lane is a gamble underfoot too:
  a patch along a lane needs `SurfacePatch` to speak lane arc length.
- **Hazards.** Ice on a shaded bend, a mud hole on the line, a log
  pile at the edge that is a wall: each a surface or an obstacle that
  punishes the lazy line and rewards the driver who saw it.
- **A shortcut on Hirvisuo**, once Kiviaho's has been driven by hand.

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
- Boost pads on the road (Death Rally's acceleration zones).
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
