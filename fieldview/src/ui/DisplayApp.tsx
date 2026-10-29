import { useEffect, useRef, useState } from 'react';
import { SyncClient } from '../sync/channel';
import type { SharedState } from '../core/state';
import { StageView } from './StageView';
import { requestFullscreen } from './fullscreen';

/**
 * Clean athlete display for the projector. Renders purely from the coach
 * window's shared state; forwards key presses (remote / pedal) back to it.
 */
export function DisplayApp() {
  const stateRef = useRef<SharedState | null>(null);
  const [connected, setConnected] = useState(false);
  const [tip, setTip] = useState(true);
  const [cursor, setCursor] = useState(true);
  const clientRef = useRef<SyncClient | null>(null);

  useEffect(() => {
    document.title = 'FIELDVIEW — Projector';
    const client = new SyncClient();
    clientRef.current = client;
    client.onState = (s) => {
      stateRef.current = s;
      setConnected(true);
    };
    client.hello();
    const helloTimer = setInterval(() => {
      if (!stateRef.current) client.hello();
    }, 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        requestFullscreen(document.documentElement);
        return;
      }
      if (e.code === 'Escape') return;
      e.preventDefault();
      if (!e.repeat) client.key(e);
    };
    window.addEventListener('keydown', onKey);
    const tipTimer = setTimeout(() => setTip(false), 6000);
    let mouseTimer = 0;
    const onMove = () => {
      setCursor(true);
      clearTimeout(mouseTimer);
      mouseTimer = window.setTimeout(() => setCursor(false), 2000);
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      clearInterval(helloTimer);
      clearTimeout(tipTimer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  let lastBeat = 0;
  return (
    <div className={`display ${cursor ? 'show-cursor' : ''}`} onDoubleClick={() => requestFullscreen(document.documentElement)}>
      {connected ? (
        <StageView
          getState={() => stateRef.current}
          onFrame={(stage) => {
            const now = performance.now();
            if (now - lastBeat > 100) {
              lastBeat = now;
              clientRef.current?.heartbeat(stage.stats.fps, stage.offscreen.length);
            }
          }}
        />
      ) : (
        <div className="display-help">
          <h2>FIELDVIEW projector display</h2>
          <p>Waiting for the coach window… Open this window from the coach screen with <b>“Open projector window”</b>.</p>
          <p className="hint">If you opened this page directly, keep the coach window open in the same browser.</p>
        </div>
      )}
      <div className="display-tip" style={{ opacity: tip ? 1 : 0 }}>
        Drag this window onto the projector, then <b>double-click</b> or press <b>F</b> for fullscreen.
      </div>
    </div>
  );
}
