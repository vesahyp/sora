import { useEffect, useState } from 'react';
import { Game, type RaceResult } from './ui/Game';
import { Title, Result } from './ui/Screens';
import { Garage, Events, Shop, Dealer, Licences, Armoury } from './ui/Garage';
import { loadRecords, saveRace, recordKey, track, type Records } from './records';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { loadSave, store, playerCar, currentCar, CLASS_RANK, type Save } from './career/save';
import { OPPONENTS } from './game/content/drivers';
import { EVENT_BY_ID, type EventDef } from './game/content/events';
import { LICENCE_BY_CLASS, type LicenceDef } from './game/content/licences';
import { CARS, CAR_BY_ID } from './game/content/cars';
import { partPrice, tuned, STOCK, type PartKind } from './game/content/parts';
import { REPAIR_SHARE, type WeaponDef } from './game/content/weapons';
import type { Entry } from './game/state';
import type { CarClass, CarDef, CarShape } from './game/types';

/** What the race was for: an event with prize money, or a licence test. */
export type Purpose = { kind: 'event'; id: string } | { kind: 'licence'; cls: CarClass };

type Screen =
  | { kind: 'title' }
  | { kind: 'garage' }
  | { kind: 'events' }
  | { kind: 'shop' }
  | { kind: 'dealer' }
  | { kind: 'licences' }
  | { kind: 'armoury' }
  | { kind: 'race'; purpose: Purpose; trackId: string; car: CarDef; field: Entry[]; laps: number }
  | { kind: 'result'; purpose: Purpose; r: RaceResult; set: { lap: boolean; race: boolean }; prize: number; repair: number; passed: boolean };

export default function App() {
  return (
    <ErrorBoundary>
      <Screens />
    </ErrorBoundary>
  );
}

function Screens() {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [records, setRecords] = useState<Records>(() => loadRecords());
  const [save, setSave] = useState<Save>(() => loadSave());
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.kind]);

  const update = (f: (s: Save) => void) => {
    const s = { ...save };
    f(s);
    setSave(store(s));
  };

  const enter = (e: EventDef) => {
    const fieldCar = CARS.find((c) => c.cls === e.cls)!;
    // the class car's numbers under the other bodies, so the pack is not four of a kind
    const shapes: CarShape[] = ['coupe', 'rally', 'hatch'];
    // the field shoots back from the second event of a class on, more as the cars get built
    const built = Object.values(e.fieldParts).reduce((a, b) => a + b, 0);
    const field: Entry[] = OPPONENTS.map((driver, i) => ({ driver, car: { ...tuned(fieldCar, e.fieldParts), shape: shapes[(i + CLASS_RANK[e.cls]) % 3] }, missiles: 1 + Math.round(built / 3), mines: 1 + Math.round(built / 4) }));
    setScreen({ kind: 'race', purpose: { kind: 'event', id: e.id }, trackId: e.trackId, car: playerCar(save), field, laps: e.laps });
  };
  const take = (l: LicenceDef) => {
    setScreen({ kind: 'race', purpose: { kind: 'licence', cls: l.cls }, trackId: l.trackId, car: playerCar(save), field: [], laps: 1 });
  };
  const again = (purpose: Purpose) => {
    if (purpose.kind === 'event') enter(EVENT_BY_ID[purpose.id]);
    else take(LICENCE_BY_CLASS[purpose.cls]!);
  };

  switch (screen.kind) {
    case 'title':
      return <Title save={save} onPlay={() => setScreen({ kind: 'garage' })} />;
    case 'garage':
      return (
        <Garage
          save={save}
          onEvents={() => setScreen({ kind: 'events' })}
          onShop={() => setScreen({ kind: 'shop' })}
          onDealer={() => setScreen({ kind: 'dealer' })}
          onLicences={() => setScreen({ kind: 'licences' })}
          onArmoury={() => setScreen({ kind: 'armoury' })}
          onPick={(i) => update((s) => (s.current = i))}
          onTitle={() => setScreen({ kind: 'title' })}
        />
      );
    case 'events':
      return <Events save={save} records={records} onPick={enter} onBack={() => setScreen({ kind: 'garage' })} />;
    case 'shop':
      return (
        <Shop
          save={save}
          onBuy={(kind: PartKind) =>
            update((s) => {
              const o = currentCar(s);
              const price = partPrice(CAR_BY_ID[o.carId], kind, o.parts);
              if (price === null || price > s.credits) return;
              s.credits -= price;
              s.cars = s.cars.map((c, i) => (i === s.current ? { ...c, parts: { ...c.parts, [kind]: c.parts[kind] + 1 } } : c));
              track('buy_part', { car: o.carId, part: kind, level: o.parts[kind] + 1, price });
            })
          }
          onBack={() => setScreen({ kind: 'garage' })}
        />
      );
    case 'dealer':
      return (
        <Dealer
          save={save}
          onBuy={(car) =>
            update((s) => {
              if (s.cars.some((o) => o.carId === car.id) || car.price > s.credits) return;
              s.credits -= car.price;
              s.cars = [...s.cars, { carId: car.id, parts: { ...STOCK } }];
              s.current = s.cars.length - 1;
              track('buy_car', { car: car.id, price: car.price });
            })
          }
          onBack={() => setScreen({ kind: 'garage' })}
        />
      );
    case 'licences':
      return <Licences save={save} onTake={take} onBack={() => setScreen({ kind: 'garage' })} />;
    case 'armoury':
      return (
        <Armoury
          save={save}
          onBuy={(w: WeaponDef) =>
            update((s) => {
              const have = w.id === 'missile' ? s.missiles : s.mines;
              if (have >= w.max || w.price > s.credits) return;
              s.credits -= w.price;
              if (w.id === 'missile') s.missiles++;
              else s.mines++;
              track('buy_ammo', { weapon: w.id, price: w.price });
            })
          }
          onBack={() => setScreen({ kind: 'garage' })}
        />
      );
    case 'race':
      return (
        <Game
          key={`${screen.trackId}/${screen.car.id}/${Date.now()}`}
          trackId={screen.trackId}
          car={screen.car}
          field={screen.field}
          laps={screen.laps}
          ammo={{ missiles: save.missiles, mines: save.mines }}
          onEnd={(r) => {
            const set = saveRace(records, recordKey(r.trackId, r.carId), r.laps);
            setRecords({ ...records });
            const purpose = screen.purpose;
            let prize = 0;
            let passed = false;
            // the boot comes back as it was left, and the car gets fixed
            const repair = Math.round((CAR_BY_ID[r.carId].price * REPAIR_SHARE * (r.damage / 100)) / 10) * 10;
            if (purpose.kind === 'event') {
              const e = EVENT_BY_ID[purpose.id];
              prize = e.prizes[r.place - 1] ?? 0;
              update((s) => {
                s.credits += prize + r.cash - repair;
                s.missiles = r.missiles;
                s.mines = r.mines;
                s.races++;
                s.wrecks = (s.wrecks ?? 0) + r.wrecks;
                if (r.place === 1) s.wins++;
                s.results = { ...s.results, [e.id]: Math.min(s.results[e.id] ?? 99, r.place) };
              });
            } else {
              const l = LICENCE_BY_CLASS[purpose.cls]!;
              passed = r.time >= 0 && r.time <= l.target;
              update((s) => {
                s.credits += r.cash - repair;
                s.missiles = r.missiles;
                s.mines = r.mines;
                if (passed && !s.licences.includes(l.cls)) s.licences = [...s.licences, l.cls];
              });
            }
            setScreen({ kind: 'result', purpose, r, set, prize, repair, passed });
          }}
          onQuit={() => setScreen({ kind: 'garage' })}
        />
      );
    case 'result':
      return <Result r={screen.r} purpose={screen.purpose} prize={screen.prize} repair={screen.repair} passed={screen.passed} set={screen.set} records={records} onAgain={() => again(screen.purpose)} onMenu={() => setScreen({ kind: 'garage' })} />;
  }
}
