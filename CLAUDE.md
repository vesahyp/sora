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
Two tracks with a river to jump, a crest and a shortcut through the forest, four
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
- **No physics library.** A car is a rigid box on two axles (the
  bicycle model) with a tyre that lets go smoothly, weight transfer and
  a friction circle; cars and the tree line meet through impulses at the
  contact point (`src/game/physics.ts`, `docs/adr/0003-rigid-body-cars.md`).
  Each axle reads the surface under it, and a car has a height: the
  ground rises and falls along the lap (river banks, crests) and a car
  fast enough leaves it. The track is a smoothed closed polyline with a width
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
    physics.ts        the car model: the tyres, the aids, height and landing, box-against-box
                        and tree contacts by impulse, in SUB substeps a frame
    physics-old.ts    the model before 2026-10-03, at ?physics=old for one release. Delete after
    harm.ts           what a hit costs, for both models: damage, grudge, a blast's spin, a ram
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
      parts.ts        the shop: seven parts, three levels, each from a class; tuned(car, parts)
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
      tracks.ts       the tracks: a centreline in metres, a width, a surface, rivers, crests, patches, shortcuts
      surfaces.ts     what each surface does to a tyre and a car: grip, peak, slide, drag, top
  career/save.ts      the save: credits, cars owned with parts, licences; one object in localStorage
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
                        liveries and numbers, the fitted parts on the car, damage stages, shadows,
                        trees and roadside objects
  input/input.ts      one thumb (drag to steer, tap for nitro), the pedal, keyboard
  ui/                 React: Game (loop + HUD), Screens (title, result), Garage (garage, races, shop, dealer, licences),
                        Dash (the shared chrome: segmented lamps, inline SVG glyphs, the stencil-or-plain face() rule)
  styles.css          the chrome's look: palette tokens named after the frame (soot, gravel, straw, amber), grain,
                        the two bundled Big Shoulders faces in public/fonts (OFL)
  records.ts          localStorage best lap and best race; the tracker shim
  audio.ts            Web Audio synth: the engine note and the event beeps
  version.ts          build id and the newer-build check behind the update banner
  i18n.ts             the language: fi or en, tr() and t(), picked from the browser
tools/
  autoplayer.ts       the bot driver: yaw-rate steering through the wheelbase, braking to
                        the speed a bend allows, a running-wide reflex, leaning on neighbours,
                        blocking, punting and waiting for whoever it holds a grudge against;
                        skill bites: a poor driver is slow, wobbles, brakes late and picks no fights
  physics-check.ts    npm run physics-check: the car model's promises as set pieces with numbers:
                        a straight line, full lock, a pedal stab, tree hits, car hits, a crest,
                        a river cleared flat out and dropped into at half speed, water
  sim-check.ts        npm run sim-check: the bot laps every track in every car, asserts;
                        asserts the field is on the player's screen and in the sights, that
                        aggression pays the player more than the road, and the career curve:
                        the bot player wins every JM race, is top two in C, does not win every A
  balance.ts          npm run balance: lap times per car, side by side
scripts/
  shots.mjs           phone screenshots with Playwright, the bot driving
  touch-check.mjs     drives the race by touch on an emulated phone: steer, brake, pause
  drive-log.mjs       set pieces by touch on an emulated phone, the physics logged frame by frame
  icon.mjs            render public/icon.svg to the PNG icons: 512, 192, the 180 iOS icon, a 32 favicon
  lineup.mjs          every vehicle in the game on one canvas to shots/lineup.png, a row per class,
                        the race's own sprites, and the Tauno at five levels of damage
  pwa-check.mjs       the install check: manifest, every icon at its size, the service worker, offline
infra/                Terraform: the tracking pixel host (S3 + CloudFront + logs), see TRACKING.md
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` may touch `window`,
   `document`, React or audio. Sounds are names pushed onto `state.sounds`;
   the game loop drains them into `audio.play`. Dust is cosmetic and lives
   in the renderer.
2. **Fixed step.** The sim runs at `DT = 1/60`; the render loop accumulates
   real time and calls `step` a whole number of times. Never pass a frame
   delta into `step`. The car model cuts each step into `SUB` substeps of
   its own; that is inside `physics.ts` and nothing outside sees it.
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
  contacts and body overlap (`PHYSICS=old` for the old model).
  `physics-check` holds the numbers. The local tools in `tools/dbg/`
  (gitignored) are the sweeps: `matrix.ts` (full lock, half lock, a
  pedal stab, per car), `fight.ts` (the race's view and fight over six
  grid orders), `spin.ts` (the ground a blast costs). Build one like
  the tools: `npx vite build --ssr tools/dbg/matrix.ts --outDir .sim-check && node .sim-check/matrix.js`.
- `?physics=old` plays the old car model, for one release, to compare.
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
  and fully built, per track. The bot is a floor, not a player: a human
  who looks through the corner beats it. A change that moves the bot's
  lap moves the human's too, in the same direction. The classes should
  sit about 10% apart stock, and a full car should reach the next class's
  stock pace. The licence targets are read off this table.
- Deploy is automatic: every push to `main` builds and publishes to GitHub
  Pages (`.github/workflows/deploy.yml`) at https://vesahyp.github.io/sora/.
- Screenshots come from `make shots` (Playwright, iPhone emulation, the
  bot driving), never from a hand-held browser. `?bot=1&speed=3` makes the
  bot drive at triple speed for scripts. `make touch-check` drives the race
  by touch; run it when you touched `input.ts` or the HUD buttons.
- **Every vehicle reads apart.** `make lineup` draws every vehicle in the
  game, stock and built, on one canvas (`shots/lineup.png`). Look at it
  after touching `sprites.ts`, `cars.ts` or `rivals.ts`: two vehicles
  that could be confused at a glance are a bug. `sim-check` laps every
  rival's vehicle alone, so a new footprint is checked on the road.
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
