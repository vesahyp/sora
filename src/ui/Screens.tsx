import { useState } from 'react';
import { tr, t, lang, setLang } from '../i18n';
import { fmt, recordKey, type Records } from '../records';
import { BUILD_NAME } from '../version';
import type { RaceResult } from './Game';
import type { Purpose } from '../App';
import { TRACK_BY_ID } from '../game/content/tracks';
import { CAR_BY_ID } from '../game/content/cars';
import { EVENT_BY_ID } from '../game/content/events';
import { LICENCE_BY_CLASS } from '../game/content/licences';
import { cr, hasProgress, playerCar, type Save } from '../career/save';
import { UpdateBanner } from './Update';
import { face } from './Dash';
import { cameraView, physicsReadout, setCameraView, setPhysicsReadout, setTuningMode, tuningMode } from '../settings';

export function Title({ save, onPlay, onReset }: { save: Save; onPlay: () => void; onReset: () => void }) {
  const [asking, setAsking] = useState(false);
  const [readout, setReadout] = useState(physicsReadout());
  const [tuning, setTuning] = useState(tuningMode());
  const [view, setView] = useState(cameraView());
  const car = playerCar(save);
  const fi = lang() === 'fi';
  return (
    <div className="screen title">
      <UpdateBanner />
      <div className="logoplate">
        {/* the one thing that says where: a sun-faded Finnish flag, cropped to a strip */}
        <div className="flag" aria-hidden />
        <h1 className="logo">SORA</h1>
        <p className="tagline">{tr('Soraa, mutkia ja kello. Yksi peukalo ohjaa, kaasu on pohjassa.', 'Gravel, corners and a clock. One thumb steers, the throttle is down.')}</p>
      </div>
      <div className="dashplate">
        <div className="cell">
          <small>{tr('Auto', 'Car')}</small>
          <b>{t(car.name)}</b>
        </div>
        <div className="cell num">
          <small>{tr('Rahat', 'Credits')}</small>
          <b>{cr(save.credits)}</b>
        </div>
        <div className="foot">{save.races ? `${save.races} ${tr('kisaa', 'races')}, ${save.wins} ${tr('voittoa', 'wins')}` : tr('Ura alkaa tallista.', 'The career starts in the garage.')}</div>
      </div>
      <button className="btn primary big wide" data-track="title-drive" onClick={onPlay}>
        {save.races ? tr('Jatka', 'Continue') : tr('Aja', 'Drive')}
      </button>
      <p className="help">{tr('Vedä peukalolla sivulle: auto kääntyy. Toinen sormi jarruttaa.', 'Drag your thumb sideways to steer. A second finger brakes.')}</p>
      <div className="langs" role="group" aria-label={tr('Kieli', 'Language')}>
        <button className={fi ? 'on' : ''} aria-pressed={fi} aria-label="Suomeksi" onClick={() => setLang('fi')}>
          FI
        </button>
        <button className={fi ? '' : 'on'} aria-pressed={!fi} aria-label="English" onClick={() => setLang('en')}>
          EN
        </button>
      </div>
      <button
        className="btn ghost wide camera-toggle"
        data-track="title-camera"
        onClick={() => {
          const next = view === 'chase' ? 'top' : 'chase';
          setCameraView(next);
          setView(next);
        }}
      >
        {tr('Kamera', 'Camera')}: {view === 'chase' ? tr('auton takana, 3D', 'behind the car, 3D') : tr('ylhäältä', 'from above')}
      </button>
      <div className="dev-toggles">
      <button
        className={`btn ghost readout-toggle${readout ? ' on' : ''}`}
        aria-pressed={readout}
        data-track="title-readout"
        onClick={() => {
          setPhysicsReadout(!readout);
          setReadout(!readout);
        }}
      >
        {tr('Fysiikkalukemat', 'Physics readout')}: {readout ? tr('päällä', 'on') : tr('pois', 'off')}
      </button>
      <button
        className={`btn ghost readout-toggle${tuning ? ' on' : ''}`}
        aria-pressed={tuning}
        data-track="title-tuning"
        onClick={() => {
          setTuningMode(!tuning);
          setTuning(!tuning);
        }}
      >
        {tr('Säätötila', 'Tuning mode')}: {tuning ? tr('päällä', 'on') : tr('pois', 'off')}
      </button>
      </div>
      {hasProgress(save) && (
        <button className="btn ghost newcareer" data-track="title-newcareer" onClick={() => setAsking(true)}>
          {tr('Uusi ura', 'New career')}
        </button>
      )}
      <div className="build">{BUILD_NAME}</div>
      {asking && (
        <div className="overlay" role="alertdialog" aria-labelledby="newcareer-h" data-ui>
          <h2 id="newcareer-h">{tr('Uusi ura?', 'New career?')}</h2>
          <p className="help">
            {tr(
              `Poistuu: ${save.cars.length} autoa, ${cr(save.credits)}, osat ja maalaukset, ajokortit ja ${save.races} kisan tulokset. Ura alkaa alusta Taunolla. Asetukset ja ennätykset säilyvät.`,
              `Lost: ${save.cars.length} ${save.cars.length === 1 ? 'car' : 'cars'}, ${cr(save.credits)}, parts and paint, licences and the results of ${save.races} ${save.races === 1 ? 'race' : 'races'}. The career starts again in the Tauno. Settings and records stay.`,
            )}
          </p>
          <button className="btn primary" autoFocus data-track="newcareer-no" onClick={() => setAsking(false)}>
            {tr('Ei, jatka uraa', 'No, keep my career')}
          </button>
          <button className="btn danger" data-track="newcareer-yes" onClick={onReset}>
            {tr('Kyllä, aloita alusta', 'Yes, start over')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Result({ r, purpose, prize, repair, passed, set, records, onAgain, onMenu }: { r: RaceResult; purpose: Purpose; prize: number; repair: number; passed: boolean; set: { lap: boolean; race: boolean }; records: Records; onAgain: () => void; onMenu: () => void }) {
  const key = recordKey(r.trackId, r.carId);
  const total = r.laps.reduce((a, b) => a + b, 0);
  const best = Math.min(...r.laps);
  const licence = purpose.kind === 'licence';
  const placeWord = [tr('Voitto!', 'Winner!'), tr('Toinen', 'Second'), tr('Kolmas', 'Third'), tr('Neljäs', 'Fourth')][r.place - 1] ?? `${r.place}.`;
  const title = licence ? (passed ? tr('Ajokortti on sinun!', 'Licence earned!') : tr('Ei riittänyt', 'Not enough')) : placeWord;
  const where = purpose.kind === 'event' ? t(EVENT_BY_ID[purpose.id].name) : t(LICENCE_BY_CLASS[purpose.cls]!.name);
  const net = prize + r.bounty + r.ramCash + r.cash - repair;
  // the receipt: every line that moved the credits, the zero lines left off
  const lines: [string, number][] = [
    [tr(`Palkinto, ${r.place}. sija`, `Prize, place ${r.place}`), prize],
    [tr(`Romutuksista (${r.wrecks})`, `Wrecks (${r.wrecks})`), r.bounty],
    [tr('Töytäisyistä', 'Rams'), r.ramCash],
    [tr('Tieltä', 'Off the road'), r.cash],
    [tr(`Korjaus (${Math.round(r.damage)}%)`, `Repair (${Math.round(r.damage)}%)`), -repair],
  ];
  return (
    <div className="screen result">
      <div className="sheethead">
        <h2 className={face(title)}>{title}</h2>
        {set.lap && <div className={`stamp record ${face(tr('Uusi kierrosrekordi', 'New lap record'))}`}>{tr('Uusi kierrosrekordi', 'New lap record')}</div>}
        <div className="small">
          {where}, {t(TRACK_BY_ID[r.trackId].name)}, {t(CAR_BY_ID[r.carId].name)}
        </div>
      </div>
      {licence ? (
        <div className="prize">
          {fmt(r.time)} <small>/ {fmt(LICENCE_BY_CLASS[purpose.cls]!.target)}</small>
          {passed && <span className="stamp">{tr('Hyväksytty', 'Passed')}</span>}
        </div>
      ) : (
        <table className="sheet order">
          <thead>
            <tr>
              <th className="pos">{tr('Sija', 'Pos')}</th>
              <th>{tr('Kuljettaja', 'Driver')}</th>
              <th className="n">{tr('Aika', 'Time')}</th>
            </tr>
          </thead>
          <tbody>
            {r.order.map((d, i) => (
              <tr key={i} className={d.player ? 'me' : ''}>
                <td className="pos">{i + 1}</td>
                <td>
                  <i style={{ background: d.colour }} />
                  {t(d.name)}
                </td>
                <td className="n">{d.time >= 0 ? fmt(d.time) : tr('ajaa vielä', 'still out')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="receipt">
        {lines
          .filter(([, v]) => v !== 0)
          .map(([label, v]) => (
            <div key={label} className="line">
              <span>{label}</span>
              <b>{v < 0 ? `\u2212 ${cr(-v)}` : `+ ${cr(v)}`}</b>
            </div>
          ))}
        <div className="line sum">
          <span>{tr('Tilille', 'To the account')}</span>
          <b>{net < 0 ? `\u2212 ${cr(-net)}` : `+ ${cr(net)}`}</b>
        </div>
        {!licence && (
          <div className="meta">
            {tr('Romutit', 'You wrecked')} {r.wrecks}, {tr('sinut romutettiin', 'you were wrecked')} {r.wrecked}
          </div>
        )}
      </div>
      <table className="sheet laps">
        <tbody>
          {r.laps.map((l, i) => (
            <tr key={i} className={l === best ? 'best' : ''}>
              <td>
                {tr('Kierros', 'Lap')} {i + 1}
              </td>
              <td className="n">{fmt(l)}</td>
            </tr>
          ))}
          {r.laps.length > 1 && (
            <tr className="total">
              <td>{tr('Yhteensä', 'Total')}</td>
              <td className="n">{fmt(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {!set.lap && (
        <div className="small best">
          {tr('Paras kierros', 'Best lap')} {fmt(records.bestLap[key])}
        </div>
      )}
      <div className="row">
        <button className="btn primary" onClick={onAgain}>
          {tr('Uudestaan', 'Again')}
        </button>
        <button className="btn" onClick={onMenu}>
          {tr('Talli', 'Garage')}
        </button>
      </div>
    </div>
  );
}
