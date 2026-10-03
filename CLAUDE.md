# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page:
what the game is and how to play it. Code, architecture and process notes
live here. `ROADMAP.md` is forward-looking only. `docs/design.md` is the
design: what the game is meant to become. `docs/research/` holds what
was read before building: the mechanics people love in combat racers,
and the car physics model and how it is tuned. Read them before
changing the race or the car.

## What this is

**Sora** is a top-down combat racer in the shape of Death Rally and
Super Cars II, with a career in the shape of Gran Turismo, for the
browser, phones first. One thumb steers, a tap is nitro, the pedal
brakes and swings the tail; the guns fire themselves. Cars slide, ram,
wreck each other and come back. Finnish gravel roads, nineties cars. Two tracks, three cars in three classes, a field of
four with the bot driving the other three, missiles and oil slicks with
damage that costs a repair, and a career: credits from results, a parts
shop, an armoury, a dealer, and licence tests that gate the classes.
Sora is Finnish for gravel.

## Stack

The Räkkä architecture, copied from `hoyry`:

- **Vite + TypeScript + React.** React renders the menus, the HUD and the
  overlays. The game itself never goes through React.
- **Canvas 2D** for the game view. No engine. Sprites are drawn once with
  canvas paths and cached (`src/render/sprites.ts`). The road is one
  stroked path at road width. See `docs/adr/0001-canvas-2d.md`.
- **No physics library.** The car is the bicycle model with saturating
  tyres, weight transfer and a friction circle (`src/game/sim.ts`,
  `docs/adr/0002-bicycle-model.md`). The track is a smoothed closed
  polyline with a width (`src/game/track.ts`), queried by arc length.

## Where things live

```
src/
  game/               the simulation, no DOM anywhere in here
    types.ts          CarInput, TrackDef, CarDef
    state.ts          SimState, Car, Driver, createState (the grid), standings
    sim.ts            step(): the bicycle model, nitro, the automatic guns, bullets,
                        missiles, mines, pickups, ramming, wrecks and respawns, lap counting
    track.ts          Track: smoothing, locate(x, y) -> (s, d), at(s), the forest
    rng.ts            seeded RNG and hashes
    content/
      cars.ts         the cars, one per class: the balance knobs, a price
      parts.ts        the shop: four parts, three levels, tuned(car, parts)
      events.ts       the calendar: class, track, laps, prizes, how built the field is
      licences.ts     the tests: one lap under a target, read off make balance
      weapons.ts      combat: the armoury's prices, damage, gun, missile, mine, boost and ram numbers
      pickups.ts      what lies on the road, how far apart, how fast it grows back
      drivers.ts      the opponents: a name, a colour, a skill for the bot
      tracks.ts       the tracks: a centreline in metres, a width, a surface
  career/save.ts      the save: credits, cars owned with parts, licences; one object in localStorage
  render/
    renderer.ts       camera and shake, grass, road, skid marks, pickups, mines, tracers,
                        sights, cars and wrecks, nitro flame, bursts, trees, minimap
    sprites.ts        procedural sprite cache: three car bodies (hatch, coupe, rally), trees
  input/input.ts      one thumb (drag to steer, tap for nitro), the pedal, keyboard
  ui/                 React: Game (loop + HUD), Screens (title, result), Garage (garage, races, shop, dealer, licences)
  records.ts          localStorage best lap and best race; the tracker shim
  audio.ts            Web Audio synth: the engine note and the event beeps
  version.ts          build id and the newer-build check behind the update banner
  i18n.ts             the language: fi or en, tr() and t(), picked from the browser
tools/
  autoplayer.ts       the bot driver: yaw-rate steering through the wheelbase, braking to
                        the speed a bend allows, a running-wide reflex, leaning on neighbours
  sim-check.ts        npm run sim-check: the bot laps every track in every car, asserts
  balance.ts          npm run balance: lap times per car, side by side
scripts/
  shots.mjs           phone screenshots with Playwright, the bot driving
  touch-check.mjs     drives the race by touch on an emulated phone: steer, brake, pause
  icon.mjs            render public/icon.svg to the PNG icons
infra/                Terraform: the tracking pixel host (S3 + CloudFront + logs), see TRACKING.md
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` may touch `window`,
   `document`, React or audio. Sounds are names pushed onto `state.sounds`;
   the game loop drains them into `audio.play`. Dust is cosmetic and lives
   in the renderer.
2. **Fixed step.** The sim runs at `DT = 1/60`; the render loop accumulates
   real time and calls `step` a whole number of times. Never pass a frame
   delta into `step`.
3. **Content is data.** A new track is a list of points in `tracks.ts`. A
   new car is a `CarDef`, a new race an `EventDef`. Balance changes are
   number changes in `content/`. A part's effect is one line in `tuned()`.
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
- **Before committing:** `make check` (typecheck, build, sim-check) must
  pass. `sim-check` prints the bot's laps first; read them when you touched
  the car, the track or the bot.
- **Physics changes are read off `tools/dbg/trace.ts`** (gitignored, see
  the ADR): a step response at constant steer, then the bot's lap with
  the moments it leaves the road. Build it like the tools:
  `npx vite build --ssr tools/dbg/trace.ts --outDir .sim-check && node .sim-check/trace.js`.
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
- `make plan` and `make apply` for `infra/`: the tracking pixel host. The
  game learns its URL only from the build environment (`VITE_PIXEL_URL`):
  `make env` writes `.env.local` from the Terraform output for builds
  here, and the Pages deploy reads a GitHub repository variable of the
  same name. A clone or fork without them builds a game that beacons
  nowhere. Never put the URL in a committed file. `TRACKING.md` has the
  events and the setup.
- When a change alters what the player sees or does, update `README.md` in
  player words.
