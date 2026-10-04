# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Playtest the jokkis start on the phone** (2026-10-04): is the Tauno
  fun to slide, does the oil read on screen and pay, is the first race
  won in a few tries and does the Kortteli feel earned. Knobs: the
  Tauno in `cars.ts`, `OIL` in `weapons.ts`, the prizes in
  `events.ts`, `START_CREDITS` in `save.ts`. Then the shortcut by
  hand: is a second a lap the right gain for a lane that narrow, and
  should Marko take it too (`laneFor` in `autoplayer.ts`).
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
- **Playtest the new start on the phone** (2026-10-04): the camera at
  24 m across with the lead down the road, the co-driver's arrow, the
  tiny JM cars and a crap JM field. The questions: can the road be read
  now, does the arrow get looked at or ignored, is the first race won
  by a margin that feels earned rather than handed over, does damage
  read in the race, and the frame rate on a device with more ground on
  screen. Knobs: `CARS_ACROSS` and `LEAD_*` in `renderer.ts`, `WARN`
  and `GRADE_R` in `notes.ts`, the skills in `rivals.ts`, `WOBBLE` and
  `LATE` in `autoplayer.ts`, `FUMBLE` and `GUN.spray` in `weapons.ts`,
  `DAMAGE_AT` in `sprites.ts`.
- **C is a coin toss for the bot player.** With the field at skill 0.5
  to 0.6 the default bot finishes top two in 10 of 12 C races; a mine
  or a wreck on lap one costs the rest. The bot passes poorly in a pack
  and can sit in the trees; a better bot driver would make the career
  curve checkable to the second.
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
- **Height** (`TrackDef.jumps`): a kicker rises over `len` metres to
  `h` at `s` and drops straight back (`Track.groundAt`). A car carries
  `z`, `vz` and `air`; in the air it has no grip and no steering, and
  it lands with a bounce that scrubs the sideways speed. Cars more than
  0.9 m apart in height pass over each other. The renderer lifts a car
  in the air and leaves its shadow on the ground.
- **Shortcuts** (`TrackDef.shortcuts`): a lane through the forest along
  an open polyline, with a width and a surface. `Track.lanes` drives
  it: the walls are the union of the road's verge and the lanes'
  (`physics.ts`, `treeContacts`), the surface under an axle is the
  lane's inside it, the trees are not planted in it, the ground bakes
  it as a worn two-track, the minimap dashes it. The bot drives a lane
  (`autoplayer.ts`, `laneFor`): told to, or as the best driver when it
  is well behind the player; any bot that finds itself in one drives
  it to the end.
- **Drawn** (`src/render/ground.ts`, `bakeFeatures`): a water patch
  across the whole road as a river that runs on under the trees,
  shallow over the road, and each kicker as planks, a lit lip and the
  drop's shadow. `splash` fx and the `splash` and `land` sounds exist.
- **On the tracks:** Kiviaho has a 0.9 m kicker on the start straight,
  a 0.7 m one on the diagonal, a ford after the first sweeper and the
  grass shortcut across the hairpin; Hirvisuo a 0.8 m kicker on the
  straight and a ford in the esses.
- **Checked:** `tools/physics-check.ts` flies a 1.2 m kicker, holds
  that full lock does nothing in the air, that a crooked landing costs
  more than a straight one, that water drags and splashes, and that ice
  slides where gravel grips. `sim-check` flies every kicker with every
  car at racing speed and lands it on the road, crosses every ford,
  and drives every shortcut: it must save time and not a free lap.
  `make drive-log` takes the first kicker by touch on a phone.

## Heights and surfaces: what is left

- **Drawing for the other surfaces.** Mud, ice and a tarmac patch work
  in the sim but `bakeFeatures` draws only water across the road and
  kickers. A patch with `d` (part of the road) is not drawn at all.
- **Ground that is not a kicker.** `groundAt` knows only ramps with a
  sheer drop. Crests, dips, a landing ramp and a bridge deck over water
  need a height profile along `s`, and a bridge needs the car's height
  to decide whether it is on the deck or in the river.
- **Walls that are not the tree line.** The only walls are the forest
  at `width / 2 + verge` and a lane's trees. Gates, bridge rails, log
  piles need obstacles in the sim: boxes or circles that `treeContacts`
  (an impulse at the corner that went in) can push against, and a
  renderer for them.
- **The river is a wall at the tree line.** Cars cannot drive down the
  river past the forest edge, though it is drawn running on under the
  trees. Fine for a ford; a river to drive along would need its own
  corridor.
- **The bot does not know fords or kickers.** It slows for bends only,
  so it crosses the ford flat out and takes the kicker at whatever
  speed it has, which the checks show is fine on these tracks.
- **The minimap** shows the shortcuts but neither the kickers nor the
  fords.

## Track features

What to put on the roads next, each one built on the heights and
surfaces above:

- **Bridges.** A narrow deck over the river, a car and a half wide,
  with rails that are walls: the dry line is quick but one car at a
  time, the ford beside it is slow but wide, and the pack splits.
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
