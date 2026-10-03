import { useEffect, useRef, useState } from 'react';
import { createState, type SimState } from '../game/state';
import { step, DT } from '../game/sim';
import { TRACK_BY_ID } from '../game/content/tracks';
import { CAR_BY_ID } from '../game/content/cars';
import { Renderer } from '../render/renderer';
import { InputController } from '../input/input';
import { audio } from '../audio';
import { botInput } from '../../tools/autoplayer';
import { fmt, track } from '../records';
import { tr } from '../i18n';

export interface RaceResult {
  trackId: string;
  carId: string;
  laps: number[];
}

interface Hud {
  lap: number;
  total: number;
  time: number;
  last: number | null;
  best: number | null;
  speed: number;
  hold: number;
  finished: boolean;
}

export function Game({ trackId, carId, laps, onEnd, onQuit }: { trackId: string; carId: string; laps: number; onEnd: (r: RaceResult) => void; onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimState | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [muted, setMuted] = useState(audio.muted);
  const endedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const s = createState(TRACK_BY_ID[trackId], CAR_BY_ID[carId], laps);
    simRef.current = s;
    (window as unknown as { __sim: SimState }).__sim = s;
    const renderer = new Renderer(canvas);
    s.view = renderer.view();
    const input = new InputController();
    input.attach(root);
    track('race_start', { track: trackId, car: carId });
    audio.unlock();
    audio.startEngine();

    let wake: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (wake = l)).catch(() => undefined);

    const onResize = () => {
      renderer.resize();
      s.view = renderer.view();
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    const params = new URLSearchParams(location.search);
    const bot = params.get('bot') === '1';
    const speed = Math.max(1, Number(params.get('speed') ?? 1));
    const perf = { frames: 0, ms: 0, worst: 0 };
    (window as unknown as { __perf: typeof perf }).__perf = perf;

    let lastCount = Math.ceil(s.hold);
    let finishedAt = -1;
    const publishHud = () => {
      setHud({
        lap: Math.min(s.lap, s.totalLaps),
        total: s.totalLaps,
        time: s.finished ? s.laps[s.laps.length - 1] : s.time - s.lapStart,
        last: s.laps.length ? s.laps[s.laps.length - 1] : null,
        best: s.laps.length ? Math.min(...s.laps) : null,
        speed: Math.max(0, s.car.speed),
        hold: s.hold,
        finished: s.finished,
      });
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t0 = performance.now();
      let dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (pausedRef.current) dt = 0;
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < 4 * speed) {
        const inp = bot ? botInput(s) : input.read();
        step(s, inp, DT);
        acc -= DT;
        n++;
        for (const name of s.sounds) audio.play(name);
        s.sounds.length = 0;
        const count = Math.ceil(s.hold);
        if (s.hold > 0 && count !== lastCount) {
          lastCount = count;
          audio.play('count');
        }
        if (s.finished && finishedAt < 0) {
          finishedAt = s.time;
          track('race_end', { track: trackId, car: carId, best: Math.round(Math.min(...s.laps) * 100) / 100, total: Math.round(s.laps.reduce((a, b) => a + b, 0) * 100) / 100 });
        }
        if (s.finished && s.time - finishedAt > 2.2 && !endedRef.current) {
          endedRef.current = true;
          onEnd({ trackId, carId, laps: s.laps.slice() });
        }
      }
      if (acc > DT * 4 * speed) acc = 0;
      renderer.draw(s, dt);
      audio.engineAt(Math.min(1, Math.max(0, s.car.speed) / s.car.def.topSpeed), s.car.slip);
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
      if (now - hudAt > 50) {
        hudAt = now;
        publishHud();
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
      input.detach();
      audio.stopEngine();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      void wake?.release();
    };
  }, [trackId, carId, laps, onEnd]);

  const pause = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
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
      {hud && (
        <div className="hud">
          <div className="lapno">
            {tr('Kierros', 'Lap')} <b>{hud.lap}</b>/{hud.total}
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
            <b>{Math.round(hud.speed * 3.6)}</b> km/h
          </div>
        </div>
      )}
      <button className="iconbtn pause" data-ui onClick={() => pause(true)} aria-label={tr('Tauko', 'Pause')}>
        II
      </button>
      <button className="iconbtn mute" data-ui onClick={toggleMute} aria-label={tr('Ääni', 'Sound')}>
        {muted ? '🔇' : '🔊'}
      </button>
      {count > 0 && (
        <div className="banner">
          <div className="t">{count}</div>
        </div>
      )}
      {hud && hud.hold <= 0 && hud.hold > -1 && (
        <div className="banner go">
          <div className="t">{tr('AJA!', 'GO!')}</div>
        </div>
      )}
      {hud?.finished && (
        <div className="banner">
          <div className="t">{tr('MAALI', 'FINISH')}</div>
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
