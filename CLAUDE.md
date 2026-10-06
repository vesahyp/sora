# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page:
what the game is and how to play it. Code, architecture and process notes
live here. `ROADMAP.md` is forward-looking only. `docs/design.md` is the
design: what the game is meant to become; `docs/progression.md` the
career's shape: the classes, the weapons by class, the shop, the money
curve, the first five races. `docs/research/` holds what was read
before building: the mechanics people love in combat racers, and the
car physics model and how it is tuned. Read them before changing the
race, the car or the career.

## What this is

**Sora** is a top-down combat racer in the shape of Death Rally and
Super Cars II, with a career in the shape of Gran Turismo, for the
browser, phones first. One thumb steers, a tap is nitro, the pedal
brakes and swings the tail; the guns fire themselves. Cars slide, ram,
wreck each other and come back. Finnish gravel roads, nineties cars.
Four tracks, each with a river to jump and a crest, two of them short folk-class loops
of about 400 m, and a shortcut through the forest on the Kiviaho ones; four
classes with a car each and a wild buy beside it (a tractor, a monster
truck, a hearse), rivals in tractors, buses and plough lorries, a field of four with the bot driving the other
three, and a career that starts in jokamiesluokka (folk racing) in a
tired old saloon whose only weapon is the oil it leaks: credits from
results, a parts shop, an armoury, a dealer, and licence tests that
gate the upper classes; weapons and parts arrive by class (ADR 0004,
`docs/progression.md`). Sora is Finnish for gravel.

## Stack

The Räkkä architecture, copied from `hoyry`:

- **Vite + TypeScript + React.** React renders the menus, the HUD and the
  overlays. The game itself never goes through React.
- **Canvas 2D** for the game view. No engine. Sprites are drawn once with
  canvas paths and cached (`src/render/sprites.ts`). The road is one
  stroked path at road width. See `docs/adr/0001-canvas-2d.md`.
- **Rapier for the cars** (`@dimforge/rapier3d-compat`, WASM): a car is a
  3D rigid body on Rapier's raycast vehicle, four wheels on springs, and
  every number is a named physical quantity with a unit in
  `src/game/rig.ts` (`docs/adr/0005-rapier-cars.md` has the table). The
  ground is a triangle mesh along the road and the shortcuts with the
  rivers and crests in it, the tree line a row of boxes; cars meet each
  other and the trees as Rapier contacts (`src/game/physics.ts`). Each
  axle reads the surface under it. No driving aids: a handling problem
  is a change to a named parameter. The track is a smoothed closed polyline with a width
  (`src/game/track.ts`), queried by arc length.

## Where things live

```
src/
  game/               the simulation, no DOM anywhere in here
    types.ts          CarInput, TrackDef, CarDef
    state.ts          SimState, Car (with its grudges and the race's credits), Driver, createState (the grid), standings
    sim.ts            step(): the automatic guns, bullets, missiles, mines, oil slicks, pickups,
                        wrecks and respawns, the back-out for any car wedged nose first in the
                        trees and the tow for one stuck off the road (TOW_AFTER), lap counting;
                        hands the cars to the car model
    physics.ts        the car model on Rapier: the world (ground mesh, tree boxes), a body and four
                        raycast wheels per car, the engine, brakes, handbrake and each tyre's friction
                        per step, the contacts read for rams and tree hits, the plain fields written
                        back; a write to a car's fields from outside is put into its body next frame
    rig.ts            every car parameter as a physical quantity (kg, N, rad, m/s), derived from its
                        CarDef; lockAt (the lock at a speed), engineAt (force, then power)
    harm.ts           what a hit costs: damage, grudge, a blast's spin, a ram
    notes.ts          the co-driver: every bend on the lap as a pace note (direction, grade 1 hairpin
                        to 6 flat), and the next one for a car; the game loop shows it on the HUD
    track.ts          Track: smoothing, locate(x, y) -> (s, d), at(s), the forest,
                        surfaceAt(s, d) from the patches and the rivers, groundAt(s, d) from the
                        rivers' banks and the crests (RIVER, riverHeight);
                        Lane: a shortcut as the sim drives it, its own arc length u
    rng.ts            seeded RNG and hashes
    content/
      cars.ts         the class car per class (classCar(), the Tauno first), then the dealer's wild
                        buys (a Niva, a Valmet tractor, a monster truck, a hearse): the balance knobs, a price
      parts.ts        the shop: eight parts (nitro among them), three levels, each from a class; tuned(car, parts)
      paint.ts        the paint shop: the palette, the liveries on sale, their prices; painted(car, paint, livery)
      events.ts       the calendar: class, track, laps, prizes, how built the field is, what it carries
      licences.ts     the tests: one lap under a target, read off make balance
      weapons.ts      combat: the armoury's prices and the class each weapon arrives in, damage, gun,
                        missile, mine, oil, boost and ram numbers, the wreck bounty, the ram and oil credits
      pickups.ts      what lies on the road, how far apart, how fast it grows back
      rivals.ts       what each rival drives per class: their own body, size, colour, livery, number
                        and skill on the class car's numbers, bent by `pace` to the machine (vehicleDef,
                        rivalEntry), so the grid is four different vehicles, at least one not a car;
                        size and skill climb with the class
      drivers.ts      the opponents: a name, a colour and an aggression for the bot; PACING, Death Rally's catch-up:
                        sim.ts scales an opponent's engine by its gap to the player, the bot its corners,
                        both by catchUp(), skill squared;
                        GRUDGE, Burnout's hostility: what a ram, shot or wreck costs and how the bot uses it
      tracks.ts       the tracks: a centreline in metres, a width, a surface, rivers, crests, patches, shortcuts;
                        the two lenkki loops are the folk class's, the two full tracks C and up
      surfaces.ts     what each surface does to a tyre and a car: grip, peak, slide, drag, top
  career/save.ts      the save: credits, cars owned with parts and paint, licences; one object in localStorage
  render/
    look.ts           the one light: a low sun from the upper left; shadow direction and
                        length, the palette, the warm grade. Every other render file reads it
    ground.ts         the ground baked in 16 m chunks ahead of the camera: straw, ditch, verge,
                        gravel with ruts and stones, a river's banks, lip and water, a ford,
                        a crest's light, static shadows, skid marks stamped in
    scenery.ts        the roadside computed from the track: spruce, birch, juniper, boulders,
                        posts, bales, a barn, a power line, the crowds. Cosmetic, never in the sim
    renderer.ts       camera (24 m across, leading down the road) and shake, ground chunks, pickups, mines,
                        tracers, sights, cars with damage, the hit flash, smoke, sparks and shadows, wrecks,
                        nitro, dust and haze, minimap
    sprites.ts        procedural sprite cache: fifteen bodies in Hill Climb proportions lit per heading, the
                        machines (tractor, monster truck, plough lorry) built from their own parts,
                        liveries and numbers, every fitted part at every level and the weapons carried
                        (CarLook.load) on the car, damage stages, shadows,
                        trees and roadside objects
  input/input.ts      one thumb (drag to steer, tap for nitro), the pedal, keyboard
  ui/                 React: Game (loop + HUD), Screens (title, result), Garage (garage, races, shop, paint shop, dealer, licences),
                        Dash (the shared chrome: segmented lamps, inline SVG glyphs, the stencil-or-plain face() rule)
  styles.css          the chrome's look: palette tokens named after the frame (soot, gravel, straw, amber), grain,
                        the two bundled Big Shoulders faces in public/fonts (OFL)
  records.ts          localStorage best lap and best race; the tracker shim
  audio.ts            Web Audio synth: the engine note and the event beeps
  version.ts          build id and the newer-build check behind the update banner
  i18n.ts             the language: fi or en, tr() and t(), picked from the browser
  settings.ts         the title screen's switches (physics readout, tuning mode) and the tuning panel's saved
                        changes; Game.tsx draws the readout
  ui/Tuning.tsx       the tuning panel: a slider per rig number and the game pace, grouped by system, applied
                        live to the player's car (physics.ts, setRigInRace); reset, copy as JSON
tools/
  hand.ts             the thumb driver: a hand on a phone, headless. Heading error to thumb px through
                        input.ts's own curve, a reaction delay, a thumb's speed, tremor, brakes when a bend
                        looks too fast and now and then too late, goes round a car ahead, jumps a river;
                        skill 0..1. The playthrough injects this same class into the page; sim-check
                        and balance read the folk laps off it. It does not know the tyres' limit
  autoplayer.ts       the bot driver: a yaw rate turned into a wheel angle through the wheelbase, braking to
                        the speed a bend allows, a running-wide reflex, leaning on neighbours,
                        blocking, punting and waiting for whoever it holds a grudge against;
                        skill bites: a poor driver is slow, wobbles, brakes late and picks no fights
  physics-check.ts    npm run physics-check: the car model's promises as set pieces with numbers:
                        a straight line, full lock, a pedal stab, tree hits, car hits, a crest,
                        a river cleared flat out and dropped into at half speed, water
  sim-check.ts        npm run sim-check: the bot laps every track in the cars of the classes that race
                        there, asserts; asserts the field is on the player's screen and in the sights,
                        that aggression pays the player more than the road, and the career curve: the
                        hand with the hour's parts wins the first two folk races from every grid, is top
                        two in the next two and has a fight in the final; the bot is top two in C, does
                        not win every A
  balance.ts          npm run balance: lap times per car on its class's tracks, side by side; the folk
                        class by the hand too, stock and full, so the upgrade gap is read off a thumb
scripts/
  shots.mjs           phone screenshots with Playwright, the bot driving
  touch-check.mjs     drives the race by touch on an emulated phone: steer, brake, pause
  readout-shot.mjs    the physics readout switched on and shown in a race on the phone
  tuning-check.mjs    the tuning mode by touch on the phone: the panel opens, a slider reaches the running car,
                        copy as JSON, reset
  drive-log.mjs       set pieces by touch on an emulated phone, the physics logged frame by frame
  icon.mjs            render public/icon.svg to the PNG icons: 512, 192, the 180 iOS icon, a 32 favicon
  lineup.mjs          every vehicle in the game on one canvas to shots/lineup.png, a row per class,
                        the race's own sprites, the Tauno at five levels of damage, then a row per part
                        at levels 0-3, the armoury's load and the paints
  car-shots.mjs       every player car cropped out of the race on the phone layout, the bot driving,
                        into shots/cars/ and one sheet: four wheels on each, the front pair turned
  pwa-check.mjs       the install check: manifest, every icon at its size, the service worker, offline
  playthrough.mjs     the first hour by thumb: every folk race on an emulated iPhone in landscape, every
                        input a touch through input.ts, tools/hand.ts built and injected into the page
                        at the wheel (not the bot), parts bought between races; a video, a result sheet
                        and frame sheets per race, summary.md with the places and laps, and the rules of
                        a fun hour asserted at the end
infra/                Terraform: the tracking pixel host (S3 + CloudFront + logs), see TRACKING.md
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` may touch `window`,
   `document`, React or audio. Sounds are names pushed onto `state.sounds`;
   the game loop drains them into `audio.play`. Dust is cosmetic and lives
   in the renderer.
2. **Fixed step.** The sim runs at `DT = 1/60`; the render loop accumulates
   real time and calls `step` a whole number of times. Never pass a frame
   delta into `step`. The loop runs the sim at `GAME_PACE` (1.25) sim
   seconds per real second, so the race reads at an arcade pace; every
   number, check and record is in sim seconds. The car model steps Rapier `SUB` times a frame
   (120 Hz); that is inside `physics.ts` and nothing outside sees it.
   Rapier's WASM is loaded once (`initPhysics()`, before the first
   screen and at the top of every tool), and a race's world is freed
   with `dispose(s)` when the race is done.
3. **Content is data.** A new track is a list of points in `tracks.ts`,
   its rivers, crests and shortcuts beside it. A new car is a `CarDef`,
   a rival's vehicle a `Vehicle` in `rivals.ts`, a new race an
   `EventDef`. Balance changes are number changes in `content/`. A
   part's effect is one line in `tuned()`; what a class can buy and
   carry is a `from` on the part or the weapon.
4. **The bot is the opponent.** `tools/autoplayer.ts` drives the checks,
   the screenshots and the other cars, guns included. A change to it
   changes the race, so keep it readable. `sim-check` races it armed and
   asserts everyone still finishes, then unarmed and asserts the order
   follows skill.
5. **Arc length is the coordinate.** The sim and the bot ask the track
   where a point is as `(s, d)`: metres along the lap and metres from the
   centreline. Anything that needs "ahead" or "off the road" uses those,
   never screen or world axes.
6. **Two languages in the game, English in the code.** Every player-facing
   string exists in Finnish and English (`src/i18n.ts`): UI strings as
   `tr(fi, en)`, content as `L(fi, en)`. Names of cars and tracks stay
   Finnish in both. Identifiers, comments and docs are English.

## Workflow

- `make dev` (http://localhost:5173, also on the LAN for a phone).
- **Before committing:** `make check` (typecheck, build, physics-check,
  sim-check) must pass. `sim-check` prints the bot's laps first; read them
  when you touched the car, the track or the bot.
- **Physics changes are read, then felt.** `make drive-log` drives set
  pieces by touch on an emulated phone and prints speed, yaw, slip,
  contacts and body overlap. `physics-check` holds the numbers. A sweep
  changes a rig parameter through `rigTweaks` (`rig.ts`) and reads the
  result; the local tools in `tools/dbg/` (gitignored) are the sweeps:
  `resp.ts` (a thumb step at a speed: the yaw rate over time), `pedal.ts`
  (the pedal in a bend, and the hand's laps), `curve.ts` (the first
  races as a new player). Build one like the tools:
  `npx vite build --ssr tools/dbg/resp.ts --outDir .sim-check-dbg && node .sim-check-dbg/resp.js`.
- **The physics readout** (title screen: Physics readout) shows the
  speed, the yaw rate, the wheel's angle against the lock and each
  tyre's slip angle live in the race; `make playthrough` records with it
  on. Talk about the handling in its numbers. **The tuning mode** (title
  screen: Tuning mode) adds a TUNE button in the race: every rig number
  and the game pace on a slider, live on the player's car, and Copy JSON
  to send the set back. A set that comes back is read into `rig.ts` (or
  `cars.ts` for one car) and checked like any other change. Run `make
  tuning-check` after touching the panel or `applyRig`.
- **A handling or balance change is proved by thumb, on video.** `make playthrough`
  plays the first hour on an emulated phone with a hand that is not the bot
  (`scripts/playthrough.mjs`: a reaction delay, a thumb that moves at a thumb's
  speed, a margin it does not know) and leaves a video and frame sheets per race
  in `shots/playthrough/`. Read the sheets before claiming a change is felt: the
  bot laps 30 s where that thumb laps 35, and a dozen fixes checked only against
  the bot left the game playing badly (2026-10-04). `RACES=jm-kiviaho` for one race.
  The same hand drives headless in `tools/hand.ts` (`sim-check`'s folk checks,
  `make balance`'s folk rows), so a folk-class number is tuned in seconds and
  the video is the proof, not the search. On a loaded machine (the nightly
  cron sweep ran the page at 10 frames a second, 2026-10-06) run it with
  `SPEED=0.5`: the sim in slow motion, the hand's clock in sim time, so
  the thumb keeps its rate; the video is then slow motion. Build a sweep
  in `tools/dbg/` before touching a rig parameter.
- **A track feature is checked before it is driven.** `sim-check` jumps
  every river with every class car and asserts it is cleared every lap,
  lands every flight (a crest's too) on the road, drives every shortcut
  with the bot told to take it (`BotTuning.shortcuts`) and asserts the
  time the lane saves, and asserts no car in any armed race sits off the
  road going nowhere longer than `TOW_AFTER`. `physics-check` holds the
  river's numbers (cleared flat out, dropped into at half speed, driven
  out of) and the crest's (a fast car flies, a slow one is lifted).
  `make drive-log` adds the first river by touch.
- **Balance with `make balance`.** It prints the bot's laps per car, stock
  and fully built, on the tracks its class races, and the hand's for the
  folk car. The bot is a floor, not a player: a human who looks through
  the corner beats it. A change that moves the bot's lap moves the
  human's too, in the same direction. C, B and A should sit about 10%
  apart stock, and a full car should reach the next class's stock pace;
  the folk car is slow on purpose and races its own loops, so JM to C is
  a bigger step. The licence targets are read off this table.
- Deploy is automatic: every push to `main` builds and publishes to GitHub
  Pages (`.github/workflows/deploy.yml`) at https://vesahyp.github.io/sora/.
- Screenshots come from `make shots` (Playwright, iPhone emulation, the
  bot driving), never from a hand-held browser. `?bot=1&speed=3` makes the
  bot drive at triple speed for scripts. `make touch-check` drives the race
  by touch; run it when you touched `input.ts` or the HUD buttons.
  `make rotate-check` turns the phone mid-race and in the menus with
  iOS's late layout played in; run it when you touched the canvas
  sizing, the resize path or the dash layout.
- **Every vehicle reads apart.** `make lineup` draws every vehicle in the
  game, stock and built, on one canvas (`shots/lineup.png`). Look at it
  after touching `sprites.ts`, `cars.ts` or `rivals.ts`: two vehicles
  that could be confused at a glance are a bug. `sim-check` laps every
  rival's vehicle alone, so a new footprint is checked on the road.
  `make car-shots` crops every player car out of the race itself
  (`shots/cars/sheet.png`): the lineup draws the garage's picture, which
  lays its own front wheels, while the race draws the front pair in the
  renderer so they steer, and that pair ran with a wheel under the body
  until someone cropped the race (2026-10-06). Run it after touching
  `renderer.ts`'s car drawing.
- **The game installs as an app.** `public/manifest.webmanifest` and the
  icons are hand-written; `vite.config.ts` writes `sw.js` into the build
  with the list of that build's files, so the game opens offline and a new
  deploy is a new cache. `make pwa-check` runs the install check against
  the live site (`URL=` for a preview). Run it after touching the
  manifest, the icons, `index.html`'s head or the service worker plugin.
- `make plan` and `make apply` for `infra/`: the tracking pixel host. The
  game learns its URL only from the build environment (`VITE_PIXEL_URL`):
  `make env` writes `.env.local` from the Terraform output for builds
  here, and the Pages deploy reads a GitHub repository variable of the
  same name. A clone or fork without them builds a game that beacons
  nowhere. Never put the URL in a committed file. `TRACKING.md` has the
  events and the setup.
- When a change alters what the player sees or does, update `README.md` in
  player words.
