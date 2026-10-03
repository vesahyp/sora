import { useEffect, useState } from 'react';
import { Game, type RaceResult } from './ui/Game';
import { Title, Result } from './ui/Screens';
import { loadRecords, saveRace, recordKey, type Records } from './records';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { TRACKS } from './game/content/tracks';
import { CARS } from './game/content/cars';

type Screen = { kind: 'title' } | { kind: 'race'; trackId: string; carId: string } | { kind: 'result'; r: RaceResult; set: { lap: boolean; race: boolean } };

export const RACE_LAPS = 3;

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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.kind]);

  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const car = CARS[0];
  const start = () => setScreen({ kind: 'race', trackId, carId: car.id });

  switch (screen.kind) {
    case 'title':
      return <Title records={records} trackId={trackId} onTrack={setTrackId} carId={car.id} onPlay={start} />;
    case 'race':
      return (
        <Game
          key={`${screen.trackId}/${screen.carId}/${Date.now()}`}
          trackId={screen.trackId}
          carId={screen.carId}
          laps={RACE_LAPS}
          onEnd={(r) => {
            const set = saveRace(records, recordKey(r.trackId, r.carId), r.laps);
            setRecords({ ...records });
            setScreen({ kind: 'result', r, set });
          }}
          onQuit={() => setScreen({ kind: 'title' })}
        />
      );
    case 'result':
      return <Result r={screen.r} set={screen.set} records={records} onAgain={start} onMenu={() => setScreen({ kind: 'title' })} />;
  }
}
