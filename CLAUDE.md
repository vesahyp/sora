# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page:
what the game is and how to play it. Code, architecture and process notes
live here. `ROADMAP.md` is forward-looking only. `docs/design.md` is the
design: what the game is meant to become.

## What this is

**Sora** is a top-down arcade racer in the shape of Super Cars II, with a
career in the shape of Gran Turismo, for the browser, phones first. One
thumb steers; the throttle is always on; a second finger brakes. Finnish
gravel roads, nineties cars. Today it is one car, two tracks, and a field of
four: the player and three cars the bot drives. Sora is Finnish for gravel.

## Stack

The Räkkä architecture, copied from `hoyry`:

- **Vite + TypeScript + React.** React renders the menus, the HUD and the
  overlays. The game itself never goes through React.
- **Canvas 2D** for the game view. No engine. Sprites are drawn once with
  canvas paths and cached (`src/render/sprites.ts`). The road is one
  stroked path at road width. See `docs/adr/0001-canvas-2d.md`.
- **No physics library.** The car is a heading and a velocity with an
  arcade slip model (`src/game/sim.ts`). The track is a smoothed closed
  polyline with a width (`src/game/track.ts`), queried by arc length.

## Where things live

```
src/
  game/               the simulation, no DOM anywhere in here
    types.ts          CarInput, TrackDef, CarDef
    state.ts          SimState, Car, Driver, createState (the grid), standings
    sim.ts            step(): the car model, car contact, grass, trees, lap counting
    track.ts          Track: smoothing, locate(x, y) -> (s, d), at(s), the forest
    rng.ts            seeded RNG and hashes
    content/
      cars.ts         the cars: the balance knobs
      drivers.ts      the opponents: a name, a colour, a skill for the bot
      tracks.ts       the tracks: a centreline in metres, a width, a surface
  render/
    renderer.ts       camera, grass, road, dust, car, trees, minimap
    sprites.ts        procedural sprite cache
  input/input.ts      one thumb (drag sideways to steer, second finger brakes) and keyboard
  ui/                 React: Game (loop + HUD), Screens (title, result)
  records.ts          localStorage best lap and best race; the tracker shim
  audio.ts            Web Audio synth: the engine note and the event beeps
  version.ts          build id and the newer-build check behind the update banner
  i18n.ts             the language: fi or en, tr() and t(), picked from the browser
tools/
  autoplayer.ts       the bot driver: lookahead steering, braking for corners
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
   new car is a `CarDef`. Balance changes are number changes in `content/`.
4. **The bot is the opponent.** `tools/autoplayer.ts` drives the checks,
   the screenshots and, once there are opponents, the other cars. A change
   to it changes the race, so keep it readable.
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
- **Balance with `make balance`.** The bot is a floor, not a player: a
  human who looks through the corner beats it. A change that moves the
  bot's lap moves the human's too, in the same direction.
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
