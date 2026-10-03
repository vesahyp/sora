import { tr, t, lang, setLang } from '../i18n';
import { fmt, recordKey, type Records } from '../records';
import { BUILD_NAME } from '../version';
import type { RaceResult } from './Game';
import type { Purpose } from '../App';
import { TRACK_BY_ID } from '../game/content/tracks';
import { CAR_BY_ID } from '../game/content/cars';
import { EVENT_BY_ID } from '../game/content/events';
import { LICENCE_BY_CLASS } from '../game/content/licences';
import { cr, playerCar, type Save } from '../career/save';
import { UpdateBanner } from './Update';

export function Title({ save, onPlay }: { save: Save; onPlay: () => void }) {
  const car = playerCar(save);
  return (
    <div className="screen title">
      <UpdateBanner />
      <h1 className="logo">SORA</h1>
      <p className="tagline">{tr('Soraa, mutkia ja kello. Yksi peukalo ohjaa, kaasu on pohjassa.', 'Gravel, corners and a clock. One thumb steers, the throttle is down.')}</p>
      <div className="card">
        <div className="where">
          <b>{t(car.name)}</b> · {cr(save.credits)}
        </div>
        <div className="small">
          {save.races ? `${save.races} ${tr('kisaa', 'races')}, ${save.wins} ${tr('voittoa', 'wins')}` : tr('Ura alkaa tallista.', 'The career starts in the garage.')}
        </div>
      </div>
      <button className="btn primary big" data-track="title-drive" onClick={onPlay}>
        {save.races ? tr('Jatka', 'Continue') : tr('Aja', 'Drive')}
      </button>
      <p className="help">{tr('Vedä peukalolla sivulle: auto kääntyy. Toinen sormi jarruttaa.', 'Drag your thumb sideways to steer. A second finger brakes.')}</p>
      <div className="row">
        <button className="btn ghost" onClick={() => setLang(lang() === 'fi' ? 'en' : 'fi')}>
          {lang() === 'fi' ? 'English' : 'Suomeksi'}
        </button>
      </div>
      <div className="build">{BUILD_NAME}</div>
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
  return (
    <div className="screen result">
      <h2>{title}</h2>
      <div className="small">
        {where} · {t(TRACK_BY_ID[r.trackId].name)} · {t(CAR_BY_ID[r.carId].name)}
      </div>
      {licence ? (
        <div className="prize">
          {fmt(r.time)} <small>/ {fmt(LICENCE_BY_CLASS[purpose.cls]!.target)}</small>
          {repair > 0 && (
            <small>
              {' '}
              · {tr('korjaus', 'repair')} − {cr(repair)}
            </small>
          )}
        </div>
      ) : (
        <>
          <table className="order">
            <tbody>
              {r.order.map((d, i) => (
                <tr key={i} className={d.player ? 'me' : ''}>
                  <td className="pos">{i + 1}.</td>
                  <td>
                    <i style={{ background: d.colour }} /> {t(d.name)}
                  </td>
                  <td className="n">{d.time >= 0 ? fmt(d.time) : tr('ajaa vielä', 'still out')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tally">
            {tr('Romutit', 'You wrecked')} <b>{r.wrecks}</b> · {tr('romuna', 'wrecked')} <b>{r.wrecked}</b> · {tr('tieltä', 'from the road')} <b>{cr(r.cash)}</b>
          </div>
          <div className="prize">
            + {cr(prize + r.cash)}
            {repair > 0 && (
              <small>
                {' '}
                · {tr('korjaus', 'repair')} − {cr(repair)} ({Math.round(r.damage)}%)
              </small>
            )}
          </div>
        </>
      )}
      <table className="laps">
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
      {set.lap && <div className="record">{tr('Uusi kierrosrekordi!', 'New lap record!')}</div>}
      {!set.lap && <div className="small">{tr('Paras kierros', 'Best lap')} {fmt(records.bestLap[key])}</div>}
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
