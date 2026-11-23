import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { App } from './App';
import { useStore } from './state/store';
import { getLayers } from './state/layers';

// Read-only handle for automated browser tests and for curious teachers in DevTools.
(window as unknown as { posepilot: unknown }).posepilot = { getState: useStore.getState, getLayers };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
