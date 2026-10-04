# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Vesa's own phone playtest of the first hour.** The scripted thumb
  (`make playthrough`, 2026-10-04) has answered what a script can: the
  Tauno holds the road by thumb (5 to 15% of a race off it), a thumb
  laps Kiviaho in 34 to 38 s stock and under 30 with the ram bar and
  tyres, the first race is close, the next three are won clearly and
  the final is lost or won by tenths to Marko, the river is cleared and
  landed on the road, nobody sits stuck. What only a hand can answer:
  is the Tauno fun to slide or merely safe now that the wheel asks for
  yaw, does a nudge feel like a correction, is the oil read on screen
  before it is driven over, is the co-driver's arrow looked at, does
  the pace feel quick or twitchy, does the crest lift the field in a
  way that is fun, the frame rate on the device. Knobs: `YAW_ROOM` in
  `sim.ts`, `COUNTER` in `physics.ts`, the response curve in
  `input.ts`, the grips in `cars.ts`, `fieldSkill` in `events.ts`,
  `OIL` in `weapons.ts`, `CARS_ACROSS` and `LEAD_*` in `renderer.ts`.
  Then the shortcut by hand: is a second a lap the right gain for a
  lane that narrow, and should Marko take it too (`laneFor` in
  `autoplayer.ts`).
- **The thumb driver is a model, and a floor.** `scripts/playthrough.mjs`
  steers by heading error with a reaction delay and never brakes to
  rotate the car; a real thumb uses the pedal to swing the tail into
  the hairpin and would lap quicker. Teach it the pedal stab, then the
  shortcut, then read the hour again.
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
- **C is a coin toss for the bot player.** Over 48 C races (the six
  grids with a hair of skill changed, `tools/dbg/grid2.ts`) the default
  bot finishes top two 62% of the time with the wild cast, 52% with the
  field before it; a mine or a wreck on lap one costs the rest, so
  `sim-check` holds two in three over both tracks. The bot passes poorly
  in a pack; a better bot driver would make the career curve checkable
  to the second.
- **Playtest the wild cast** (2026-10-04): does the tractor's shove and
  the monster truck's throw feel fair or cheap, is the bus a fun wall or
  a wall, does anyone buy the hearse. Knobs: `pace`, `massScale`,
  `offroad` and `spinOnShunt` in `rivals.ts`, the wild buys in
  `cars.ts`, the root of the mass in `harm.ts`'s `ram`.
- The whole Kiviaho hairpin is 70 m across and the camera 24 m: the
  approach shows the entry and the turn, the arrow the rest. A zoom
  that widens with speed or into a hairpin is the next knob if the
  phone playtest says the hairpin still surprises.
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
  brow. A car carries `z`, `vz` and `air`; it leaves the ground when
  the ground falls away faster than gravity can follow, has no grip and
  no steering in the air, and lands with a bounce that scrubs the
  sideways speed; a rising bank catches it without a bounce, and water
  swallows the landing in spray. Cars more than 0.9 m apart in height
  pass over each other. The renderer lifts a car in the air, sinks it
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
  where the ford was, a flight landed off the bending road).
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
