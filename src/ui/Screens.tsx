import { tr, t, lang, setLang } from '../i18n';
import { fmt, recordKey, type Records } from '../records';
import { BUILD_NAME } from '../version';
import type { RaceResult } from './Game';
import { TRACK_BY_ID } from '../game/content/tracks';
import { CAR_BY_ID } from '../game/content/cars';
import { UpdateBanner } from './Update';

export function Title({ records, trackId, carId, onPlay }: { records: Records; trackId: string; carId: string; onPlay: () => void }) {
  const best = records.bestLap[recordKey(trackId, carId)];
  return (
    <div className="screen title">
      <UpdateBanner />
      <h1 className="logo">SORA</h1>
      <p className="tagline">{tr('Soraa, mutkia ja kello. Yksi peukalo ohjaa, kaasu on pohjassa.', 'Gravel, corners and a clock. One thumb steers, the throttle is down.')}</p>
      <div className="card">
        <div className="where">
          <b>{t(TRACK_BY_ID[trackId].name)}</b> · {t(CAR_BY_ID[carId].name)}
        </div>
        <div className="small">{best ? `${tr('Paras kierros', 'Best lap')} ${fmt(best)}` : tr('Ei vielä aikaa', 'No time yet')}</div>
      </div>
      <button className="btn primary big" onClick={onPlay}>
        {tr('Aja', 'Drive')}
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

export function Result({ r, set, records, onAgain, onMenu }: { r: RaceResult; set: { lap: boolean; race: boolean }; records: Records; onAgain: () => void; onMenu: () => void }) {
  const key = recordKey(r.trackId, r.carId);
  const total = r.laps.reduce((a, b) => a + b, 0);
  const best = Math.min(...r.laps);
  return (
    <div className="screen result">
      <h2>{tr('Maalissa', 'Finished')}</h2>
      <div className="small">
        {t(TRACK_BY_ID[r.trackId].name)} · {t(CAR_BY_ID[r.carId].name)}
      </div>
      <table className="laps">
        <tbody>
          {r.laps.map((l, i) => (
            <tr key={i} className={l === best ? 'best' : ''}>
              <td>{tr('Kierros', 'Lap')} {i + 1}</td>
              <td className="n">{fmt(l)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>{tr('Yhteensä', 'Total')}</td>
            <td className="n">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
      {set.lap && <div className="record">{tr('Uusi kierrosrekordi!', 'New lap record!')}</div>}
      {set.race && <div className="record">{tr('Uusi kisarekordi!', 'New race record!')}</div>}
      {!set.lap && <div className="small">{tr('Paras kierros', 'Best lap')} {fmt(records.bestLap[key])}</div>}
      <div className="row">
        <button className="btn primary" onClick={onAgain}>
          {tr('Uudestaan', 'Again')}
        </button>
        <button className="btn" onClick={onMenu}>
          {tr('Valikko', 'Menu')}
        </button>
      </div>
    </div>
  );
}
