import { useEffect, useRef } from 'react';
import { t, tr } from '../i18n';
import { cr, carFits, hasLicence, playerCar, currentCar, ownedCar, topClass, CLASS_RANK, type Save } from '../career/save';
import { CARS, CAR_BY_ID } from '../game/content/cars';
import { partsFor, partPrice, type PartKind } from '../game/content/parts';
import { EVENTS, type EventDef } from '../game/content/events';
import { LICENCES, type LicenceDef } from '../game/content/licences';
import { WEAPONS, canCarry, carried, type WeaponDef } from '../game/content/weapons';
import { LIVERIES, PAINTS, colourPrice, liveryPrice, painted } from '../game/content/paint';
import { TRACK_BY_ID } from '../game/content/tracks';
import { carPicture, type Load } from '../render/sprites';
import type { CarDef, Livery } from '../game/types';
import { fmt, recordKey, type Records } from '../records';
import { Lamps, MineIcon, MissileIcon, OilIcon } from './Dash';

/** The car, drawn big, as the sprite the race uses, with what the shop fitted and the armoury loaded. */
function CarPic({ car, size = 160, load }: { car: CarDef; size?: number; load?: Load }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * 0.5 * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const spr = carPicture(car, { load });
    const k = (size * 0.9) / spr.width;
    g.save();
    g.translate(size / 2, size * 0.25);
    g.rotate(-0.25);
    // a hard shadow toward the lower right, the same low sun as the race:
    // the sprite's own outline filled with shadow ink
    const sh = document.createElement('canvas');
    sh.width = spr.width;
    sh.height = spr.height;
    const sg = sh.getContext('2d')!;
    sg.drawImage(spr, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = 'rgba(18,14,22,0.55)';
    sg.fillRect(0, 0, sh.width, sh.height);
    g.save();
    g.rotate(0.25);
    g.translate(size * 0.03, size * 0.04);
    g.rotate(-0.25);
    g.drawImage(sh, (-spr.width * k) / 2, (-spr.height * k) / 2, spr.width * k, spr.height * k);
    g.restore();
    g.drawImage(spr, (-spr.width * k) / 2, (-spr.height * k) / 2, spr.width * k, spr.height * k);
    g.restore();
  }, [car, size, load?.missiles, load?.mines, load?.oil]);
  return <canvas ref={ref} style={{ width: size, height: size * 0.5 }} />;
}

function Stat({ label, v, max, up }: { label: string; v: number; max: number; up?: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <Lamps v={v / max} up={up !== undefined && up > v ? up / max : undefined} n={12} />
    </div>
  );
}

/** The car's name on a door plate, the class stencilled beside it. */
function RallyPlate({ car }: { car: CarDef }) {
  return (
    <div className="rallyplate">
      <span className="cls">{car.cls}</span>
      <b>{t(car.name)}</b>
    </div>
  );
}

const MAX = { topSpeed: 72, accel: 34, grip: 32, brake: 28 };

export function CarStats({ car, next }: { car: CarDef; next?: CarDef }) {
  return (
    <div className="stats">
      <Stat label={tr('Nopeus', 'Speed')} v={car.topSpeed} max={MAX.topSpeed} up={next?.topSpeed} />
      <Stat label={tr('Veto', 'Pull')} v={car.accel} max={MAX.accel} up={next?.accel} />
      <Stat label={tr('Pito', 'Grip')} v={car.grip} max={MAX.grip} up={next?.grip} />
      <Stat label={tr('Jarrut', 'Brakes')} v={car.brake} max={MAX.brake} up={next?.brake} />
    </div>
  );
}

function Top({ save, title, onBack }: { save: Save; title: string; onBack?: () => void }) {
  return (
    <div className="top">
      {onBack ? (
        <button className="btn back" data-ui onClick={onBack}>
          <svg className="glyph" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="3" fill="none" />
          </svg>
          {tr('Talli', 'Garage')}
        </button>
      ) : (
        <span />
      )}
      <h2>{title}</h2>
      <div className="credits">{cr(save.credits)}</div>
    </div>
  );
}

/** What this car takes into a race from the boot, for the picture. */
function loadOf(save: Save, car: CarDef): Load {
  return carried(car.cls, save);
}

export function Garage({ save, onEvents, onShop, onPaint, onDealer, onLicences, onArmoury, onPick, onTitle }: { save: Save; onEvents: () => void; onShop: () => void; onPaint: () => void; onDealer: () => void; onLicences: () => void; onArmoury: () => void; onPick: (i: number) => void; onTitle: () => void }) {
  const car = playerCar(save);
  const owned = currentCar(save);
  const top = topClass(save);
  return (
    <div className="screen garage">
      <Top save={save} title={tr('Talli', 'Garage')} />
      <CarPic car={car} load={loadOf(save, car)} />
      <RallyPlate car={car} />
      <CarStats car={car} />
      {save.cars.length > 1 && (
        <div className="row owned">
          {save.cars.map((o, i) => (
            <button key={i} className={`chip${i === save.current ? ' on' : ''}`} aria-pressed={i === save.current} onClick={() => onPick(i)}>
              {t(CAR_BY_ID[o.carId].name)}
            </button>
          ))}
        </div>
      )}
      <div className="menu">
        <button className="btn primary big" data-track="garage-race" onClick={onEvents}>
          {tr('Kisat', 'Races')}
        </button>
        <button className="item" onClick={onShop}>
          {tr('Osakauppa', 'Parts shop')}
          <small>
            {Object.values(owned.parts).reduce((a, b) => a + b, 0)}/{partsFor(car.cls).length * 3}
          </small>
        </button>
        <button className="item" onClick={onPaint}>
          {tr('Maalaamo', 'Paint shop')}
          <small>
            <span className="swatch" style={{ background: car.colour }} />
          </small>
        </button>
        <button className="item" onClick={onArmoury}>
          {tr('Asevarasto', 'Armoury')}
          <small>
            <OilIcon /> {save.oil}
            {canCarry(top, 'mine') && (
              <>
                {' '}
                <MineIcon /> {save.mines}
              </>
            )}
            {canCarry(top, 'missile') && (
              <>
                {' '}
                <MissileIcon /> {save.missiles}
              </>
            )}
          </small>
        </button>
        <button className="item" onClick={onDealer}>
          {tr('Autokauppa', 'Dealer')}
          <small>{save.cars.length}/{CARS.length}</small>
        </button>
        <button className="item" onClick={onLicences}>
          {tr('Ajokortit', 'Licences')}
          <small>{['JM', 'C', ...save.licences].join(' ')}</small>
        </button>
        <button className="item quiet" onClick={onTitle}>
          {tr('Alkuun', 'Title')}
        </button>
      </div>
      <div className="small">
        {tr('Kisoja', 'Races')} {save.races}, {tr('voittoja', 'wins')} {save.wins}, {tr('romutettuja', 'wrecked')} {save.wrecks ?? 0}
      </div>
    </div>
  );
}

export function Events({ save, records, onPick, onBack }: { save: Save; records: Records; onPick: (e: EventDef) => void; onBack: () => void }) {
  const car = playerCar(save);
  return (
    <div className="screen list">
      <Top save={save} title={tr('Kisat', 'Races')} onBack={onBack} />
      <div className="cards">
        {EVENTS.map((e) => {
          const licence = hasLicence(save, e.cls);
          const fits = carFits(car, e.cls);
          const open = licence && fits;
          const best = save.results[e.id];
          const lap = records.bestLap[recordKey(e.trackId, car.id)];
          return (
            <button key={e.id} className={`card event${open ? '' : ' locked'}`} disabled={!open} onClick={() => onPick(e)}>
              <div className="ic">{e.cls}</div>
              <div className="body">
                <div className="name">
                  {t(e.name)}
                  {best && <span className="stamp">{best === 1 ? tr('Voitto', 'Won') : `${best}.`}</span>}
                </div>
                <div className="desc">
                  {t(TRACK_BY_ID[e.trackId].name)}, {e.laps} {tr('kierrosta', 'laps')}, {tr('voittajalle', 'to the winner')} <b className="num">{cr(e.prizes[0])}</b>
                </div>
                <div className="desc sub">
                  {!licence ? tr(`Vaatii ${e.cls}-ajokortin`, `Needs the ${e.cls} licence`) : !fits ? tr(`Autosi luokka on ${car.cls}: liian hyvä tähän`, `Your car is class ${car.cls}: too much for this`) : lap ? `${tr('Paras kierroksesi', 'Your best lap')} ${fmt(lap)}` : tr('Ei vielä ajettu', 'Not driven yet')}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Shop({ save, onBuy, onBack }: { save: Save; onBuy: (kind: PartKind) => void; onBack: () => void }) {
  const owned = currentCar(save);
  const base = CAR_BY_ID[owned.carId];
  const car = ownedCar(owned);
  return (
    <div className="screen list">
      <Top save={save} title={tr('Osakauppa', 'Parts shop')} onBack={onBack} />
      <CarPic car={car} load={loadOf(save, car)} />
      <div className="carname small">{t(base.name)}</div>
      <CarStats car={car} />
      <div className="cards">
        {partsFor(base.cls).map((p) => {
          const lvl = owned.parts[p.kind];
          const price = partPrice(base, p.kind, owned.parts);
          const can = price !== null && price <= save.credits;
          return (
            <button key={p.kind} className={`card part${price === null ? ' done' : can ? '' : ' locked'}`} disabled={price === null || !can} onClick={() => onBuy(p.kind)}>
              <div className="ic">
                {lvl}
                <small>/3</small>
              </div>
              <div className="body">
                <div className="name">
                  {t(p.name)}
                  {price === null ? <span className="stamp">{tr('Täysi', 'Maxed')}</span> : <span className="lvl">{cr(price)}</span>}
                </div>
                <div className="desc">{price === null ? t(p.levels[2]) : t(p.levels[lvl])}</div>
                <div className="desc sub">{t(p.effect)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The paint shop: a colour and a livery for the car out of the garage,
 * each bought once and then free to switch back to; the car's own red and
 * livery are free. The picture shows the car as it stands, parts and all.
 */
export function Paint({ save, onColour, onLivery, onBack }: { save: Save; onColour: (id: string) => void; onLivery: (kind: Livery) => void; onBack: () => void }) {
  const owned = currentCar(save);
  const base = CAR_BY_ID[owned.carId];
  const car = ownedCar(owned);
  const cp = colourPrice(base);
  const lp = liveryPrice(base);
  const wearing = owned.paint ?? 'red';
  const pattern = owned.livery ?? base.livery;
  // the car's own livery heads the list when the shop does not lay it (a stripe, primer)
  const kinds: { kind: Livery; name: string }[] = [
    ...(LIVERIES.some((l) => l.kind === base.livery) ? [] : [{ kind: base.livery, name: tr('Oma kuvio', 'Its own') }]),
    ...LIVERIES.map((l) => ({ kind: l.kind, name: t(l.name) })),
  ];
  return (
    <div className="screen list">
      <Top save={save} title={tr('Maalaamo', 'Paint shop')} onBack={onBack} />
      <CarPic car={car} load={loadOf(save, car)} />
      <div className="carname small">{t(base.name)}</div>
      <p className="help">{tr(`Väri ${cr(cp)}, kuvio ${cr(lp)}. Kerran ostettuun pääsee takaisin ilmaiseksi.`, `A colour ${cr(cp)}, a livery ${cr(lp)}. Once bought, you can switch back for free.`)}</p>
      <div className="cards">
        {PAINTS.map((p) => {
          const have = p.id === 'red' || (owned.paints ?? []).includes(p.id);
          const on = wearing === p.id;
          const can = have || cp <= save.credits;
          return (
            <button key={p.id} className={`card part${on ? ' done' : can ? '' : ' locked'}`} disabled={on || !can} aria-pressed={on} onClick={() => onColour(p.id)}>
              <div className="ic" style={{ background: `linear-gradient(135deg, ${p.colour} 62%, ${p.accent ?? base.accent} 62%)` }} />
              <div className="body">
                <div className="name">
                  {t(p.name)}
                  {on ? <span className="stamp">{tr('Päällä', 'On')}</span> : have ? <span className="lvl">{tr('Omistat', 'Owned')}</span> : <span className="lvl">{cr(cp)}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="cards">
        {kinds.map((l) => {
          const have = l.kind === base.livery || (owned.liveries ?? []).includes(l.kind);
          const on = pattern === l.kind;
          const can = have || lp <= save.credits;
          return (
            <button key={l.kind} className={`card dealer${on ? ' done' : can ? '' : ' locked'}`} disabled={on || !can} aria-pressed={on} onClick={() => onLivery(l.kind)}>
              <div className="pic">
                <CarPic car={painted(base, owned.paint, l.kind)} size={96} />
              </div>
              <div className="body">
                <div className="name">
                  {l.name}
                  {on ? <span className="stamp">{tr('Päällä', 'On')}</span> : have ? <span className="lvl">{tr('Omistat', 'Owned')}</span> : <span className="lvl">{cr(lp)}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Dealer({ save, onBuy, onBack }: { save: Save; onBuy: (car: CarDef) => void; onBack: () => void }) {
  const mine = playerCar(save);
  return (
    <div className="screen list">
      <Top save={save} title={tr('Autokauppa', 'Dealer')} onBack={onBack} />
      <p className="help">{tr('Vanha auto jää talliin. Luokka kertoo, mihin kisoihin autolla pääsee.', 'Your old car stays in the garage. The class says which races the car may enter.')}</p>
      <div className="cards">
        {/* by class, the class car first and its wild buys after it */}
        {[...CARS].sort((a, b) => CLASS_RANK[a.cls] - CLASS_RANK[b.cls]).map((c) => {
          const owned = save.cars.some((o) => o.carId === c.id);
          const can = !owned && c.price <= save.credits;
          const above = CLASS_RANK[c.cls] > CLASS_RANK[mine.cls];
          return (
            <button key={c.id} className={`card dealer${owned ? ' done' : can ? '' : ' locked'}`} disabled={owned || !can} onClick={() => onBuy(c)}>
              <div className="pic">
                <CarPic car={c} size={96} />
              </div>
              <div className="body">
                <div className="name">
                  <span>
                    <span className="cls">{c.cls}</span> {t(c.name)}
                  </span>
                  {owned ? <span className="stamp">{tr('Omistat', 'Owned')}</span> : <span className="lvl">{cr(c.price)}</span>}
                </div>
                <div className="desc">{t(c.blurb)}</div>
                {above && !owned && <div className="desc sub">{tr(`Luokan ${c.cls} kisat vaativat ${c.cls}-ajokortin`, `Class ${c.cls} races need the ${c.cls} licence`)}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Licences({ save, onTake, onBack }: { save: Save; onTake: (l: LicenceDef) => void; onBack: () => void }) {
  return (
    <div className="screen list">
      <Top save={save} title={tr('Ajokortit', 'Licences')} onBack={onBack} />
      <p className="help">{tr('Yksi kierros yksin omalla autollasi, kello käy lähdöstä. Alle rajan ja kortti on sinun.', 'One lap alone in your own car, the clock runs from the start. Under the limit and the licence is yours.')}</p>
      <div className="cards">
        {LICENCES.map((l) => {
          const have = save.licences.includes(l.cls);
          return (
            <button key={l.cls} className={`card licence${have ? ' done' : ''}`} onClick={() => onTake(l)}>
              <div className="ic">{l.cls}</div>
              <div className="body">
                <div className="name">
                  {t(l.name)}
                  {have ? <span className="stamp">{tr('Suoritettu', 'Passed')}</span> : <span className="lvl">{fmt(l.target)}</span>}
                </div>
                <div className="desc">{t(l.desc)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Armoury({ save, onBuy, onBack }: { save: Save; onBuy: (w: WeaponDef) => void; onBack: () => void }) {
  const top = topClass(save);
  return (
    <div className="screen list">
      <Top save={save} title={tr('Asevarasto', 'Armoury')} onBack={onBack} />
      <p className="help">{tr('Ostetaan kappaleittain, ja mitä jää, se jää seuraavaan kisaan. Aseet laukeavat itsestään, kun auto on ihan takana tai tähtäimessä. Auto kantaa vain luokkansa aseet: öljyä jokkiksesta, miinoja C-luokasta, ohjuksia B-luokasta. Konekivääri on osakaupan osa.', 'Bought by the shot; what is left stays for the next race. Weapons fire themselves, when a car is right behind or in the sights. A car carries only its class\'s weapons: oil from JM, mines from C, missiles from B. The machine gun is a part in the shop.')}</p>
      <div className="cards">
        {WEAPONS.filter((w) => canCarry(top, w.id)).map((w) => {
          const have = w.id === 'missile' ? save.missiles : w.id === 'mine' ? save.mines : save.oil;
          const full = have >= w.max;
          const can = !full && w.price <= save.credits;
          return (
            <button key={w.id} className={`card part${full ? ' done' : can ? '' : ' locked'}`} disabled={!can} onClick={() => onBuy(w)}>
              <div className="ic">
                {have}
                <small>/{w.max}</small>
              </div>
              <div className="body">
                <div className="name">
                  <span>
                    {w.id === 'missile' ? <MissileIcon /> : w.id === 'mine' ? <MineIcon /> : <OilIcon />} {t(w.name)}
                  </span>
                  {full ? <span className="stamp">{tr('Täynnä', 'Full')}</span> : <span className="lvl">{`${cr(w.price)} / ${tr('kpl', 'each')}`}</span>}
                </div>
                <div className="desc">{t(w.desc)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
