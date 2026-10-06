import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initLang } from './i18n';
import { initPhysics } from './game/physics';

initLang();

// Offline play: the build writes sw.js next to the bundle with the list of
// files to keep (vite.config.ts). Production only, and only on an absolute
// base: the portal build is served from a folder we do not control.
if (import.meta.env.PROD && import.meta.env.BASE_URL.startsWith('/') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// the car model is Rapier's, in WASM: load it before the first screen (docs/adr/0005-rapier-cars.md)
void initPhysics().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
