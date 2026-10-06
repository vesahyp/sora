import { useState } from 'react';
import { tr } from '../i18n';
import type { Rig } from '../game/rig';
import { BUILD_NAME } from '../version';

/**
 * The tuning panel (title screen: Tuning mode): every number of the player's car model, live in
 * a race. A slider per number, grouped by system, in the unit the readout and ADR 0005 use, with
 * the default beside it. Changes reach the car at once (physics.ts, setRigInRace); Reset puts the
 * defaults back; Copy puts the changed set on the clipboard as JSON, to send back.
 */

type Key = keyof Rig | 'pace';

interface Param {
  key: Key;
  fi: string;
  en: string;
  /** shown unit, and how a stored SI value is shown in it */
  unit: string;
  show?: number;
  /** the slider's range in stored units: absolute, or, with `rel`, multiples of the default */
  min: number;
  max: number;
  rel?: boolean;
  step?: number;
}

interface Group {
  fi: string;
  en: string;
  params: Param[];
}

const GROUPS: Group[] = [
  { fi: 'Peli', en: 'Game', params: [{ key: 'pace', fi: 'Pelin tahti', en: 'Game pace', unit: '× real time', min: 0.5, max: 2, step: 0.05 }] },
  {
    fi: 'Kori ja paino',
    en: 'Body and weight',
    params: [
      { key: 'mass', fi: 'Massa', en: 'Mass', unit: 'kg', min: 0.3, max: 3, rel: true, step: 10 },
      { key: 'frontWeight', fi: 'Paino etuakselilla', en: 'Weight on the front axle', unit: 'share', min: 0.3, max: 0.7, step: 0.01 },
      { key: 'comHeight', fi: 'Painopisteen korkeus', en: 'Centre of mass height', unit: 'm', min: 0.1, max: 1, step: 0.01 },
      { key: 'yawInertia', fi: 'Hitausmomentti, kääntö', en: 'Yaw inertia', unit: 'kg·m²', min: 0.3, max: 3, rel: true, step: 10 },
      { key: 'pitchInertia', fi: 'Hitausmomentti, nyökkäys', en: 'Pitch inertia', unit: 'kg·m²', min: 0.3, max: 3, rel: true, step: 10 },
      { key: 'rollInertia', fi: 'Hitausmomentti, kallistus', en: 'Roll inertia', unit: 'kg·m²', min: 0.3, max: 3, rel: true, step: 5 },
    ],
  },
  {
    fi: 'Alusta',
    en: 'Chassis',
    params: [
      { key: 'wheelbase', fi: 'Akseliväli', en: 'Wheelbase', unit: 'm', min: 1, max: 4, step: 0.05 },
      { key: 'track', fi: 'Raideleveys', en: 'Track width', unit: 'm', min: 0.8, max: 2.5, step: 0.05 },
      { key: 'wheelRadius', fi: 'Pyörän säde', en: 'Wheel radius', unit: 'm', min: 0.15, max: 0.6, step: 0.01 },
    ],
  },
  {
    fi: 'Jousitus',
    en: 'Suspension',
    params: [
      { key: 'restLength', fi: 'Jousen lepopituus', en: 'Spring rest length', unit: 'm', min: 0.1, max: 0.6, step: 0.01 },
      { key: 'travel', fi: 'Joustovara', en: 'Suspension travel', unit: 'm', min: 0.05, max: 0.6, step: 0.01 },
      { key: 'springRate', fi: 'Jousivakio', en: 'Spring rate', unit: 'N/m', min: 0.2, max: 4, rel: true, step: 500 },
      { key: 'damperCompression', fi: 'Vaimennus, puristus', en: 'Damping, compression', unit: 'N·s/m', min: 0.1, max: 4, rel: true, step: 100 },
      { key: 'damperRebound', fi: 'Vaimennus, paluu', en: 'Damping, rebound', unit: 'N·s/m', min: 0.1, max: 4, rel: true, step: 100 },
      { key: 'maxSpringForce', fi: 'Jousen suurin voima', en: 'Most a spring pushes', unit: 'N', min: 0.2, max: 4, rel: true, step: 500 },
    ],
  },
  {
    fi: 'Renkaat',
    en: 'Tyres',
    params: [
      { key: 'mu', fi: 'Kitkakerroin, etu', en: 'Friction coefficient, front', unit: 'μ', min: 0.3, max: 3, step: 0.01 },
      { key: 'rearGrip', fi: 'Takarenkaiden kitka etuisiin', en: 'Rear friction against the front', unit: 'share', min: 0.5, max: 1.5, step: 0.01 },
      { key: 'peakFront', fi: 'Huippuluistokulma, etu', en: 'Peak slip angle, front', unit: 'rad', min: 0.02, max: 0.4, step: 0.005 },
      { key: 'peakRear', fi: 'Huippuluistokulma, taka', en: 'Peak slip angle, rear', unit: 'rad', min: 0.02, max: 0.4, step: 0.005 },
      { key: 'lockedGrip', fi: 'Lukitun renkaan kitka', en: 'Locked tyre friction', unit: 'share', min: 0.2, max: 1, step: 0.01 },
    ],
  },
  {
    fi: 'Moottori',
    en: 'Engine',
    params: [
      { key: 'engineForce', fi: 'Vetovoima', en: 'Drive force', unit: 'N', min: 0.2, max: 3, rel: true, step: 100 },
      { key: 'enginePower', fi: 'Teho', en: 'Power', unit: 'kW', show: 0.001, min: 0.2, max: 3, rel: true, step: 1000 },
      { key: 'topSpeed', fi: 'Huippunopeus', en: 'Top speed', unit: 'km/h', show: 3.6, min: 0.5, max: 2.5, rel: true, step: 0.25 },
      { key: 'frontDrive', fi: 'Vedon osuus edessä', en: 'Drive on the front', unit: 'share', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    fi: 'Jarrut',
    en: 'Brakes',
    params: [
      { key: 'brakeForce', fi: 'Jarruvoima', en: 'Brake force', unit: 'N', min: 0.2, max: 3, rel: true, step: 100 },
      { key: 'brakeFront', fi: 'Jarrutasapaino, etu', en: 'Brake balance, front', unit: 'share', min: 0, max: 1, step: 0.01 },
      { key: 'handbrakeForce', fi: 'Käsijarru', en: 'Handbrake force', unit: 'N', min: 0, max: 2, rel: true, step: 100 },
    ],
  },
  {
    fi: 'Ohjaus',
    en: 'Steering',
    params: [
      { key: 'maxSteer', fi: 'Suurin ohjauskulma', en: 'Max steer angle', unit: 'rad', min: 0.1, max: 0.9, step: 0.01 },
      { key: 'lockSlip', fi: 'Kulma vauhdissa, huippuluistoina', en: 'Lock at speed, in peak slips', unit: '×', min: 0.3, max: 3, step: 0.05 },
      { key: 'steerRate', fi: 'Ohjausnopeus', en: 'Steer rate', unit: 'rad/s', min: 1, max: 20, step: 0.5 },
    ],
  },
];

/** The rig with the changes on it. Top speed and power set the air's drag, as rig.ts does. */
export function tunedRig(base: Rig, changes: Record<string, number>): Rig {
  const r = { ...base, ...changes } as Rig;
  if ('topSpeed' in changes || 'enginePower' in changes) r.drag = r.enginePower / r.topSpeed ** 3;
  return r;
}

const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));

export function TuningPanel({
  carId,
  base,
  basePace,
  changes,
  pace,
  onChange,
  onClose,
}: {
  carId: string;
  base: Rig;
  basePace: number;
  changes: Record<string, number>;
  pace: number;
  onChange: (changes: Record<string, number>, pace: number) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState('');
  const value = (k: Key) => (k === 'pace' ? pace : (changes[k] ?? (base[k as keyof Rig] as number)));
  const def = (k: Key) => (k === 'pace' ? basePace : (base[k as keyof Rig] as number));
  const set = (k: Key, v: number) => {
    if (k === 'pace') onChange(changes, v);
    else {
      const next = { ...changes };
      if (Math.abs(v - def(k)) < 1e-9) delete next[k];
      else next[k] = v;
      onChange(next, pace);
    }
  };
  const r = tunedRig(base, changes);
  const json = JSON.stringify({ car: carId, build: BUILD_NAME, pace, changed: changes, rig: r }, null, 2);
  const copy = () => {
    navigator.clipboard?.writeText(json).then(
      () => setCopied(tr('Kopioitu leikepöydälle', 'Copied to the clipboard')),
      () => setCopied(tr('Kopioi alla oleva teksti', 'Copy the text below')),
    ) ?? setCopied(tr('Kopioi alla oleva teksti', 'Copy the text below'));
  };
  return (
    <div className="tuning" data-ui role="dialog" aria-label={tr('Säätötila', 'Tuning mode')}>
      <div className="tuning-bar">
        <b>{tr('Säätö', 'Tuning')}: {carId}</b>
        <span className="tuning-derived">
          {tr('kiihtyvyys', 'pull')} {fmt(r.engineForce / r.mass)} m/s² · {tr('täysi voima', 'full force to')} {fmt((r.enginePower / r.engineForce) * 3.6)} km/h · {tr('pito', 'grip')} {fmt(r.mu)} g
        </span>
        <button className="btn ghost" onClick={() => onChange({}, basePace)}>
          {tr('Oletukset', 'Reset to defaults')}
        </button>
        <button className="btn ghost" onClick={copy}>
          {tr('Kopioi JSON', 'Copy JSON')}
        </button>
        <button className="btn primary" onClick={onClose}>
          {tr('Aja', 'Drive')}
        </button>
      </div>
      {copied && (
        <div className="tuning-copied">
          {copied}
          <textarea readOnly value={json} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <div className="tuning-groups">
        {GROUPS.map((g) => (
          <fieldset key={g.en}>
            <legend>{tr(g.fi, g.en)}</legend>
            {g.params.map((p) => {
              const d = def(p.key);
              const min = p.rel ? d * p.min : p.min;
              const max = p.rel ? Math.max(d * p.max, min + (p.step ?? 0.01)) : p.max;
              const v = value(p.key);
              const k = p.show ?? 1;
              const changed = Math.abs(v - d) > 1e-9;
              return (
                <label key={p.key} className={changed ? 'changed' : ''}>
                  <span className="name">{tr(p.fi, p.en)}</span>
                  <span className="val">
                    {fmt(v * k)} {p.unit} <small>({tr('oletus', 'default')} {fmt(d * k)})</small>
                  </span>
                  <input type="range" min={min} max={max} step={p.step ?? 0.01} value={v} onChange={(e) => set(p.key, Number(e.currentTarget.value))} />
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
