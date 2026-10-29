import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './ui/styles.css';
import { DebugView } from './ui/DebugView';
import { DisplayApp } from './ui/DisplayApp';
import { CoachApp } from './ui/CoachApp';
import { CtlContext } from './ui/hooks';
import { Controller } from './core/controller';
import { getAsset } from './data/assetDb';
import { loadGlb } from './render/glbPlayer';

function route() {
  const h = location.hash;
  if (h.startsWith('#/display')) return 'display';
  if (h.startsWith('#/debug')) return 'debug';
  return 'coach';
}

let controller: Controller | null = null;

function Root() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const on = () => setR(route());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (r === 'display') return <DisplayApp />;
  if (r === 'debug') return <DebugView />;
  controller ??= new Controller();
  (window as unknown as { __ctl: Controller }).__ctl = controller;
  return (
    <CtlContext.Provider value={controller}>
      <CoachApp />
    </CtlContext.Provider>
  );
}

// Restore a user-loaded GLB athlete (if any) before first render.
(async () => {
  try {
    const a = await getAsset('athlete');
    if (a) await loadGlb(a.data.slice(0), a.name);
  } catch (e) {
    console.warn('Could not restore athlete model', e);
  }
  createRoot(document.getElementById('root')!).render(<Root />);
})();

// Offline support: cache the app shell after the first visit (http/https only).
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
}
