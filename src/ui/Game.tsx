import { useEffect, useRef, useState } from 'react';
import { createState, dispose, placeOf, standings, type Ammo, type Entry, type SimState } from '../game/state';
import { canCarry } from '../game/content/weapons';
import type { Text } from '../i18n';
import type { CarDef } from '../game/types';
import { step, DT, GAME_PACE } from '../game/sim';
import { TRACK_BY_ID } from '../game/content/tracks';
import { Renderer } from '../render/renderer';
import { InputController } from '../input/input';
import { audio } from '../audio';
import { botInput } from '../../tools/autoplayer';
import { fmt, track } from '../records';
import { t, tr } from '../i18n';
import { Lamps, MineIcon, MissileIcon, NoteArrow, OilIcon, PauseIcon, SoundIcon, WheelIcon } from './Dash';
import { nextNote, type PaceNote } from '../game/notes';
import { loadTuned, physicsReadout, saveTuned, tuningMode, type Tuned } from '../settings';
import { TuningPanel, tunedRig } from './Tuning';
import { lockAt, rigOf, type Rig } from '../game/rig';
import { rigInRace, setRigInRace } from '../game/physics';
import type { Car } from '../game/state';

/**
 * The physics readout (settings: Physics readout): what the player's car is doing, in the
 * engine's own terms. Speed, yaw rate, the wheel's angle against the lock at this speed, and
 * each tyre's slip angle, amber past its peak slip angle (the tyre is at its friction limit).
 */
function readout(c: Car, r: Rig): string {
  const f = (x: number, n = 2) => (x >= 0 ? ' ' : '') + x.toFixed(n);
  const slip = (i: number) => {
    const a = c.wheelSlip[i];
    const peak = i < 2 ? r.peakFront : r.peakRear;
    return `<span class="${Math.abs(a) > peak ? 'past' : ''}">${f(a)}</span>`;
  };
  return [
    `v     ${(Math.hypot(c.vx, c.vy) * 3.6).toFixed(0).padStart(4)} km/h`,
    `yaw   ${f(c.yaw)} rad/s`,
    `steer ${f(c.steerAngle)} / ${lockAt(r, c.speed).toFixed(2)} rad`,
    `slip  ${slip(0)} ${slip(1)}`,
    `      ${slip(2)} ${slip(3)} rad`,
    `body  ${f(c.slipAngle)} rad${c.air ? '  AIR' : ''}${c.braking ? '  BRAKE' : ''}`,
  ].join('\n');
}

export interface RaceResult {
  trackId: string;
  carId: string;
  laps: number[];
  /** race time at the flag */
  time: number;
  /** 0..100 at the flag */
  damage: number;
  /** what is left in the boot */
  missiles: number;
  mines: number;
  oil: number;
  /** the race's tally; credits off the road, from wreck bounties and from rams and oil that spun someone */
  wrecks: number;
  wrecked: number;
  cash: number;
  bounty: number;
  ramCash: number;
  /** 1-based finishing place */
  place: number;
  /** the field in finishing order; time is -1 for a car still out */
  order: { name: Text; colour: string; time: number; player: boolean }[];
}

interface Hud {
  place: number;
  field: number;
  damage: number;
  missiles: number;
  mines: number;
  oil: number;
  boost: number;
  boosting: boolean;
  heat: number;
  overheated: boolean;
  wreck: boolean;
  toasts: { text: string; colour: string; age: number }[];
  lap: number;
  total: number;
  time: number;
  last: number | null;
  best: number | null;
  speed: number;
  hold: number;
  finished: boolean;
  /** the co-driver's call for the next bend, or none on a straight */
  note: { dir: 1 | -1; grade: number; s: number } | null;
}

/**
 * The race screen. `car` is the player's car with its parts fitted;
 * `field` is the rest of the grid, empty for a licence test. The sim
 * runs here; React only draws the HUD and the overlays.
 */
export function Game({ trackId, car, field, laps, ammo, onEnd, onQuit }: { trackId: string; car: CarDef; field: Entry[]; laps: number; ammo: Ammo; onEnd: (r: RaceResult) => void; onQuit: () => void }) {
  const carId = car.id;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const pedalRef = useRef<HTMLDivElement>(null);
  const steerRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const [showReadout] = useState(physicsReadout());
  const simRef = useRef<SimState | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  // the tuning mode (title screen): the panel, what it has changed, the game pace it sets
  const [tuningOn] = useState(tuningMode());
  const [tuneOpen, setTuneOpen] = useState(false);
  const [tuned, setTuned] = useState<Tuned>(() => loadTuned());
  const paceRef = useRef(tuningMode() ? (loadTuned().pace ?? GAME_PACE) : GAME_PACE);
  const [muted, setMuted] = useState(audio.muted);
  const endedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const s = createState(TRACK_BY_ID[trackId], car, laps, field, ammo);
    simRef.current = s;
    (window as unknown as { __sim: SimState }).__sim = s;
    const renderer = new Renderer(canvas);
    s.view = renderer.view();
    // for the scripts that crop a car out of the race (scripts/car-shots.mjs): toScreen()
    (window as unknown as { __renderer: Renderer }).__renderer = renderer;
    const input = new InputController();
    input.attach(root);
    (window as unknown as { __input: InputController }).__input = input;
    track('race_start', { track: trackId, car: carId });
    audio.unlock();
    audio.startEngine();

    let wake: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (wake = l)).catch(() => undefined);

    const circle = (el: HTMLElement | null) => {
      if (!el) return { x: -999, y: -999, r: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + 8 };
    };
    const layoutPedal = () => {
      input.pedal = circle(pedalRef.current);
    };
    const onResize = () => {
      renderer.resize();
      s.view = renderer.view();
      layoutPedal();
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    // a turn of the phone: iOS Safari fires resize while the canvas still measures the old
    // layout and sends nothing once it has settled, so size again a little later, twice
    const timers: number[] = [];
    const onTurn = () => {
      for (const ms of [60, 350]) timers.push(window.setTimeout(onResize, ms));
    };
    window.addEventListener('orientationchange', onTurn);
    screen.orientation?.addEventListener('change', onTurn);
    layoutPedal();

    const params = new URLSearchParams(location.search);
    const bot = params.get('bot') === '1';
    // ?speed=3 runs the bot at triple speed for screenshots; under 1 is slow motion, for a
    // script that drives by touch and cannot keep up with sixty frames a second
    // the game pace (sim.ts) on top: the world runs faster than the wall clock
    const scriptSpeed = Math.max(0.25, Number(params.get('speed') ?? 1));
    let speed = scriptSpeed * paceRef.current;
    (window as unknown as { __pace: number }).__pace = speed;
    // what the tuning panel changed last time, on the player's car from the lights
    if (tuningMode()) {
      const changes = loadTuned().cars[car.id];
      if (changes) setRigInRace(s, 0, tunedRig(rigOf(car), changes));
    }
    const perf = { frames: 0, ms: 0, worst: 0 };
    (window as unknown as { __perf: typeof perf }).__perf = perf;

    let lastCount = Math.ceil(s.hold);
    let finishedAt = -1;
    // the pace note, read off the track in the loop; a new one ticks
    let note: PaceNote | null = null;
    const callNote = () => {
      const me = s.cars[0];
      const next = s.finished || me.wreck > 0 ? null : nextNote(s.track, me.s, me.speed);
      if (next && next !== note && s.hold <= 0) audio.play('note');
      note = next;
    };
    const publishHud = () => {
      const me = s.cars[0];
      setHud({
        place: placeOf(s, me),
        field: s.cars.length,
        damage: me.damage,
        missiles: me.missiles,
        mines: me.mines,
        oil: me.oil,
        boost: me.boost,
        boosting: me.boosting > 0,
        heat: me.heat,
        overheated: me.overheated,
        wreck: me.wreck > 0,
        toasts: s.toasts.map((x) => ({ text: t(x.text), colour: x.colour, age: x.age })),
        lap: Math.min(me.lap, s.totalLaps),
        total: s.totalLaps,
        time: s.finished ? me.laps[me.laps.length - 1] : s.time - me.lapStart,
        last: me.laps.length ? me.laps[me.laps.length - 1] : null,
        best: me.laps.length ? Math.min(...me.laps) : null,
        speed: Math.max(0, me.speed),
        hold: s.hold,
        finished: s.finished,
        note: note && { dir: note.dir, grade: note.grade, s: note.s },
      });
    };
    const result = (): RaceResult => {
      const me = s.cars[0];
      const place = placeOf(s, me);
      // run the field home off screen, so the result has every time
      let guard = 0;
      while (s.cars.some((c) => c.finishedAt < 0) && guard++ < 120 * 60) step(s, s.cars.map((c) => botInput(s, c)), DT);
      return {
        trackId,
        carId,
        laps: me.laps.slice(),
        time: me.finishedAt,
        damage: me.damage,
        missiles: me.missiles,
        mines: me.mines,
        oil: me.oil,
        wrecks: me.wrecks,
        wrecked: me.wrecked,
        cash: me.cash,
        bounty: me.bounty,
        ramCash: me.ramCash,
        place,
        order: standings(s).map((c) => ({ name: c.driver.name, colour: c.driver.colour, time: c.finishedAt, player: c === me })),
      };
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // the belt to the braces above: whatever event was missed, a canvas that no longer
      // measures its size is resized before it is drawn
      if (!renderer.fits()) onResize();
      const t0 = performance.now();
      let dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pausedRef.current) dt = 0;
      speed = scriptSpeed * paceRef.current;
      (window as unknown as { __pace: number }).__pace = speed;
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < 4 * speed) {
        const inputs = s.cars.map((c, i) => (i === 0 && !bot ? input.read() : botInput(s, c)));
        step(s, inputs, DT);
        acc -= DT;
        n++;
        for (const name of s.sounds) if (name !== 'missile-far') audio.play(name);
        s.sounds.length = 0;
        const count = Math.ceil(s.hold);
        if (s.hold > 0 && count !== lastCount) {
          lastCount = count;
          audio.play('count');
        }
        if (s.finished && finishedAt < 0) {
          finishedAt = s.time;
          const me = s.cars[0];
          track('race_end', { track: trackId, car: carId, place: placeOf(s, me), wrecks: me.wrecks, wrecked: me.wrecked, best: Math.round(Math.min(...me.laps) * 100) / 100, total: Math.round(me.laps.reduce((a, b) => a + b, 0) * 100) / 100 });
        }
        if (s.finished && s.time - finishedAt > 2.2 && !endedRef.current) {
          endedRef.current = true;
          onEnd(result());
        }
      }
      if (acc > DT * 4 * speed) acc = 0;
      callNote();
      renderer.draw(s, dt);
      audio.engineAt(Math.min(1, Math.max(0, s.cars[0].speed) / s.cars[0].def.topSpeed), s.cars[0].slip);
      // the wheel ghost
      const w = wheelRef.current;
      if (w) {
        if (input.wheel.active) {
          w.style.display = 'block';
          w.style.left = `${input.wheel.x0}px`;
          w.style.top = `${input.wheel.y0}px`;
          (w.firstElementChild as HTMLElement).style.transform = `translate(calc(-50% + ${Math.max(-input.lock, Math.min(input.lock, input.wheel.x - input.wheel.x0))}px), -50%)`;
        } else w.style.display = 'none';
      }
      const pd = pedalRef.current;
      if (pd) {
        pd.classList.toggle('on', input.braking);
        pd.classList.toggle('rev', s.cars[0].speed < -0.3);
      }
      // the steering wheel turns with the car's wheel, a quarter turn at full lock
      const sw = steerRef.current;
      if (sw) {
        sw.style.transform = `translateX(-50%) rotate(${s.cars[0].steer * 90}deg)`;
        sw.classList.toggle('held', input.wheel.active);
      }
      if (now - hudAt > 50) {
        hudAt = now;
        publishHud();
        if (debugRef.current) debugRef.current.innerHTML = readout(s.cars[0], rigInRace(s, 0));
      }
      const ms = performance.now() - t0;
      perf.frames++;
      perf.ms += ms;
      if (ms > perf.worst) perf.worst = ms;
    };
    raf = requestAnimationFrame(frame);
    publishHud();

    return () => {
      cancelAnimationFrame(raf);
      dispose(s);
      input.detach();
      audio.stopEngine();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onTurn);
      screen.orientation?.removeEventListener('change', onTurn);
      for (const t of timers) clearTimeout(t);
      void wake?.release();
    };
  }, [trackId, car, field, laps, ammo, onEnd]);

  const pause = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  };
  const openTune = () => {
    pausedRef.current = true;
    setTuneOpen(true);
  };
  const closeTune = () => {
    pausedRef.current = paused;
    setTuneOpen(false);
  };
  const retune = (changes: Record<string, number>, pace: number) => {
    const next: Tuned = { pace, cars: { ...tuned.cars, [car.id]: changes } };
    setTuned(next);
    saveTuned(next);
    paceRef.current = pace;
    if (simRef.current) setRigInRace(simRef.current, 0, tunedRig(rigOf(car), changes));
  };
  const toggleMute = () => {
    audio.setMuted(!audio.muted);
    setMuted(audio.muted);
  };

  const count = hud && hud.hold > 0 ? Math.ceil(hud.hold) : 0;
  return (
    <div className="game" ref={rootRef}>
      <canvas ref={canvasRef} />
      <div className="wheel" ref={wheelRef}>
        <div />
      </div>
      <div className="pedal" ref={pedalRef}>
        <span>{tr('JARRU', 'BRAKE')}</span>
        <small>{tr('pidä: peruuta', 'hold: reverse')}</small>
      </div>
      <div className="steerwheel" ref={steerRef}>
        <WheelIcon />
      </div>
      {showReadout && <pre className="readout" ref={debugRef} />}
      <div className="nitrohint">{tr('napautus: nitro', 'tap: nitro')}</div>
      {hud && (
        <div className="hud">
          <div className="plate">
            <div className="place">
              <b>{hud.place}</b>/{hud.field}
            </div>
            <div className="lapno">
              <span>{tr('Kierros', 'Lap')}</span>
              <b>{hud.lap}</b>/{hud.total}
            </div>
          </div>
          <div className="clock">{fmt(hud.time)}</div>
          <div className="times">
            {hud.last !== null && (
              <span>
                {tr('Edellinen', 'Last')} <b>{fmt(hud.last)}</b>
              </span>
            )}
            {hud.best !== null && (
              <span>
                {tr('Paras', 'Best')} <b>{fmt(hud.best)}</b>
              </span>
            )}
          </div>
          <div className="speedo">
            <b>{Math.round(hud.speed * 3.6)}</b>
            <span>km/h</span>
          </div>
          <div className="gauges">
            <div className={`gauge${hud.damage > 60 ? ' bad' : ''}`}>
              <span>{tr('Vauriot', 'Damage')}</span>
              <Lamps n={8} v={hud.damage / 100} tone={hud.damage > 60 ? 'red' : 'amber'} />
            </div>
            <div className={`gauge${hud.boosting ? ' lit' : ''}`}>
              <span>{tr('Nitro', 'Nitro')}</span>
              <Lamps n={8} v={hud.boost} tone="bone" />
            </div>
            {car.gun > 0 && (
              <div className={`gauge${hud.overheated ? ' bad' : ''}`}>
                <span>{tr('Kk', 'MG')}</span>
                <Lamps n={8} v={hud.heat} tone={hud.overheated || hud.heat > 0.8 ? 'red' : 'amber'} />
              </div>
            )}
            <div className="ammo">
              {canCarry(car.cls, 'missile') && (
                <span className={hud.missiles ? '' : 'out'}>
                  <MissileIcon />
                  <b>{hud.missiles}</b>
                </span>
              )}
              {canCarry(car.cls, 'mine') && (
                <span className={hud.mines ? '' : 'out'}>
                  <MineIcon />
                  <b>{hud.mines}</b>
                </span>
              )}
              <span className={hud.oil ? '' : 'out'}>
                <OilIcon />
                <b>{hud.oil}</b>
              </span>
            </div>
          </div>
          {hud.note && (
            <div className={`pacenote g${hud.note.grade}`} key={hud.note.s} aria-label={`${hud.note.dir > 0 ? tr('oikea', 'right') : tr('vasen', 'left')} ${hud.note.grade}`}>
              <NoteArrow dir={hud.note.dir} grade={hud.note.grade} />
              <b>{hud.note.grade}</b>
              <span>{hud.note.dir > 0 ? tr('oikea', 'right') : tr('vasen', 'left')}</span>
            </div>
          )}
          <div className="toasts">
            {hud.toasts.map((x, i) => (
              <div key={i} className="tape" style={{ opacity: Math.min(1, (2.6 - x.age) * 2) }}>
                <i style={{ background: x.colour }} />
                {x.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="iconbtn pause" data-ui onClick={() => pause(true)} aria-label={tr('Tauko', 'Pause')}>
        <PauseIcon />
      </button>
      <button className={`iconbtn mute${muted ? ' off' : ''}`} data-ui onClick={toggleMute} aria-label={tr('Ääni', 'Sound')}>
        <SoundIcon off={muted} />
      </button>
      {tuningOn && (
        <button className="tune-btn" data-ui onClick={openTune}>
          {tr('SÄÄDÄ', 'TUNE')}
        </button>
      )}
      {tuneOpen && (
        <TuningPanel
          carId={car.id}
          base={rigOf(car)}
          basePace={GAME_PACE}
          changes={tuned.cars[car.id] ?? {}}
          pace={paceRef.current}
          onChange={retune}
          onClose={closeTune}
        />
      )}
      {count > 0 && (
        <div className="banner count" key={count}>
          <div className="t">{count}</div>
        </div>
      )}
      {hud && hud.hold <= 0 && hud.hold > -1 && (
        <div className="banner go">
          <div className="t">{tr('AJA!', 'GO!')}</div>
        </div>
      )}
      {hud?.wreck && !hud.finished && (
        <div className="banner wreck">
          <div className="t">{tr('ROMUNA', 'WRECKED')}</div>
        </div>
      )}
      {hud?.finished && (
        <div className="banner">
          <div className="t">{hud.place}.</div>
          <div className="s">{tr('MAALI', 'FINISH')}</div>
        </div>
      )}
      {paused && (
        <div className="overlay" data-ui>
          <h2>{tr('Tauko', 'Paused')}</h2>
          <button className="btn primary" onClick={() => pause(false)}>
            {tr('Jatka', 'Resume')}
          </button>
          <button className="btn" onClick={onQuit}>
            {tr('Lopeta', 'Quit')}
          </button>
        </div>
      )}
    </div>
  );
}
