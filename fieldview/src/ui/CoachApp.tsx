import { useEffect, useState } from 'react';
import { useCtl } from './hooks';
import { StageView } from './StageView';
import { Transport } from './Transport';
import { CoachPanel } from './CoachPanel';
import { SoloPanel } from './SoloPanel';
import { CalibrationPanel } from './CalibrationPanel';
import { Editor } from './Editor';
import { LibraryPage } from './LibraryPanel';
import { SettingsPage } from './SettingsPage';
import { requestFullscreen } from './fullscreen';
import type { AppMode } from '../core/controller';
import type { Stage } from '../render/stage';

const TABS: { key: AppMode; label: string }[] = [
  { key: 'coach', label: 'Coach' },
  { key: 'solo', label: 'Solo' },
  { key: 'editor', label: 'Editor' },
  { key: 'library', label: 'Library' },
  { key: 'calibrate', label: 'Calibrate' },
  { key: 'settings', label: 'Settings' },
];

export function CoachApp() {
  const ctl = useCtl();
  const [mode, setModeState] = useState<AppMode>('coach');
  const [collapsed, setCollapsed] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [displays, setDisplays] = useState(0);
  const [help, setHelp] = useState(false);
  const setMode = (m: AppMode) => {
    ctl.mode = m;
    setModeState(m);
  };

  useEffect(() => {
    const id = setInterval(() => setDisplays(ctl.sync.connectedDisplays()), 1000);
    return () => clearInterval(id);
  }, [ctl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.repeat) return;
      if (e.code === 'KeyH' && mode !== 'editor') {
        setCollapsed((c) => !c);
        return;
      }
      if (e.code === 'KeyF' && (mode === 'coach' || mode === 'solo')) {
        requestFullscreen(document.documentElement);
        return;
      }
      if (ctl.handleKey(e.code, performance.timeOrigin + e.timeStamp)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl, mode]);

  const s = ctl.state;
  const showStage = mode === 'coach' || mode === 'solo' || mode === 'calibrate';
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <i /> FIELDVIEW
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={mode === t.key ? 'on' : ''}
              onClick={() => {
                if (ctl.session && t.key !== 'solo' && ctl.session.phase !== 'stopped') {
                  if (!confirm('A solo session is running. Stop it?')) return;
                  ctl.stopSession();
                }
                setMode(t.key);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <label className="inline" style={{ margin: 0 }} title="Hide labels, paths, play names and answers on the projector">
          <input type="checkbox" checked={s.evaluation} onChange={(e) => ctl.update({ evaluation: e.target.checked })} />
          Evaluation
        </label>
        <span className={`pill ${displays ? 'good' : ''}`} title="Projector windows connected">
          {displays ? `${displays} projector window${displays > 1 ? 's' : ''} synced` : 'No projector window'}
        </span>
        <button onClick={() => ctl.sync.openDisplay() ?? alert('The browser blocked the pop-up. Allow pop-ups for this page, then try again.')}>Open projector window</button>
        <button onClick={() => requestFullscreen(document.documentElement)} title="F">
          Fullscreen
        </button>
        {showStage && (
          <button onClick={() => setCollapsed((c) => !c)} title="H">
            {collapsed ? 'Show controls' : 'Hide controls'}
          </button>
        )}
        <button onClick={() => setHelp(true)}>?</button>
      </div>

      {showStage ? (
        <div className="main">
          <div className="stage-wrap">
            <StageView getState={() => ctl.state} getTime={() => ctl.now()} onStage={setStage} showHud={!s.evaluation && !collapsed} />
          </div>
          <div className={`side ${collapsed ? 'collapsed' : ''}`}>
            {mode === 'coach' && <CoachPanel stage={stage} onEdit={() => setMode('editor')} />}
            {mode === 'solo' && <SoloPanel onFocusMode={() => setCollapsed(true)} />}
            {mode === 'calibrate' && <CalibrationPanel />}
          </div>
        </div>
      ) : (
        <div style={{ minHeight: 0 }}>
          {mode === 'editor' && <Editor />}
          {mode === 'library' && <LibraryPage onOpen={() => setMode('coach')} />}
          {mode === 'settings' && <SettingsPage />}
        </div>
      )}
      {(mode === 'coach' || mode === 'editor') && !collapsed && <Transport />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 20 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2>Using FIELDVIEW with a projector</h2>
        <ol className="hint" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            Connect the projector and set your computer to <b>extend</b> (not mirror) the desktop.
          </li>
          <li>
            Click <b>Open projector window</b>. Drag that window onto the projector screen (or press Win+Shift+→ on Windows).
          </li>
          <li>
            In the projector window, <b>double-click</b> or press <b>F</b> for fullscreen. If fullscreen is blocked, use F11 (Windows) or Ctrl+Cmd+F (Mac).
          </li>
          <li>Run everything from this coach window — both windows follow one timeline. Key presses in the projector window (remote, pedal) are forwarded here.</li>
          <li>
            One screen only? Press <b>H</b> to hide the controls and <b>F</b> for fullscreen; press H again to bring the controls back.
          </li>
        </ol>
        <h3>Keys</h3>
        <p className="hint">
          Space / PgDn / → = play · next rep. PgUp / ← / R = exact replay. B / . = pause. 1–6 = answers in solo sessions. H = hide controls. F = fullscreen. Remap in Settings.
        </p>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
