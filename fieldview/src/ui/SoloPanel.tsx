import { useState } from 'react';
import { useCtl } from './hooks';
import { DEFAULT_SESSION, type SessionConfig, type SessionRecord } from '../assess/session';
import { prettyKey } from '../input/keymap';

export function SoloPanel({ onFocusMode }: { onFocusMode: () => void }) {
  const ctl = useCtl();
  const { drills, playlists } = ctl.store.get();
  const [cfg, setCfg] = useState<SessionConfig>(() => ({
    ...DEFAULT_SESSION,
    ...ctl.store.getJson<Partial<SessionConfig>>('soloConfig', {}),
    drillIds: ctl.store.getJson<Partial<SessionConfig>>('soloConfig', {}).drillIds?.filter((id) => drills.some((d) => d.id === id)) ?? playlists[0]?.drillIds ?? [],
  }));
  const set = (p: Partial<SessionConfig>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    ctl.store.setJson('soloConfig', { ...next, exact: undefined });
  };
  const sess = ctl.session;
  const k = (a: keyof typeof ctl.keymap) => ctl.keymap[a].map(prettyKey).join(' / ') || '—';
  const history = ctl.store.getJson<SessionRecord[]>('sessions', []).slice(-5).reverse();
  const num = (key: keyof SessionConfig, label: string, min: number, max: number, step = 1) => (
    <div>
      <label>{label}</label>
      <input type="number" min={min} max={max} step={step} value={cfg[key] as number} onChange={(e) => set({ [key]: Math.max(min, Math.min(max, Number(e.target.value))) } as Partial<SessionConfig>)} />
    </div>
  );

  if (sess && sess.phase !== 'stopped') {
    const r = sess.record.results;
    return (
      <div>
        <h2>Session running</h2>
        <div className="card">
          <div>
            Rep {Math.min(sess.index + 1, sess.queue.length)} of {sess.queue.length} · phase: <b>{sess.phase}</b>
          </div>
          <div className="hint">
            {r.filter((x) => x.correct).length} correct of {r.length} answered
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="danger" onClick={() => ctl.stopSession()}>
            Stop session
          </button>
          <button onClick={onFocusMode}>Hide controls</button>
        </div>
        <KeyHelp k={k} mode={cfg.mode} />
      </div>
    );
  }

  return (
    <div>
      <h2>Solo session</h2>
      <p className="hint">The athlete runs the whole session with a keyboard, presentation remote or foot pedal. No coach needed.</p>
      <label>Drill set</label>
      <select
        value=""
        onChange={(e) => {
          const p = playlists.find((x) => x.id === e.target.value);
          if (p) set({ drillIds: p.drillIds.filter((id) => drills.some((d) => d.id === id)) });
        }}
      >
        <option value="">Load a playlist…</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.drillIds.length})
          </option>
        ))}
      </select>
      <div className="list" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
        {drills.map((d) => (
          <label className="inline" key={d.id} style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={cfg.drillIds.includes(d.id)}
              onChange={(e) => set({ drillIds: e.target.checked ? [...cfg.drillIds, d.id] : cfg.drillIds.filter((x) => x !== d.id) })}
            />
            <span style={{ fontSize: '0.86rem' }}>{d.name}</span>
          </label>
        ))}
      </div>
      <h3>Response</h3>
      <div className="seg">
        <button className={cfg.mode === 'choice' ? 'on' : ''} onClick={() => set({ mode: 'choice' })}>
          Recognition test (choices)
        </button>
        <button className={cfg.mode === 'aloud' ? 'on' : ''} onClick={() => set({ mode: 'aloud' })}>
          Call it aloud
        </button>
      </div>
      <p className="hint">
        {cfg.mode === 'choice'
          ? 'Athlete presses the key for the coach-defined answer. Accuracy and key response time are recorded.'
          : 'Athlete calls the check out loud, presses advance to reveal, then self-checks. Self-checks are recorded as athlete-reported.'}
      </p>
      <h3>Reps &amp; timing</h3>
      <div className="grid3">
        {num('reps', 'Reps', 1, 200)}
        {num('restSec', 'Rest (s)', 0, 120)}
        {num('answerWindowSec', 'Answer window (s)', 1, 30)}
        {num('feedbackSec', 'Feedback (s)', 1, 30)}
        {num('countdownSec', 'Countdown (s)', 0, 10)}
      </div>
      <label className="inline">
        <input type="checkbox" checked={cfg.randomOrder} onChange={(e) => set({ randomOrder: e.target.checked })} /> Randomize drill order
      </label>
      <label className="inline">
        <input type="checkbox" checked={cfg.randomTiming} onChange={(e) => set({ randomTiming: e.target.checked })} /> Randomize timing (within each drill’s coach-set bounds)
      </label>
      <label className="inline">
        <input type="checkbox" checked={cfg.showPostSnap} onChange={(e) => set({ showPostSnap: e.target.checked })} /> Play the snap and first steps during feedback
      </label>
      <label className="inline">
        <input type="checkbox" checked={cfg.autoAdvance} onChange={(e) => set({ autoAdvance: e.target.checked })} /> Auto-advance after feedback
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="primary big"
          disabled={!cfg.drillIds.length}
          onClick={() => {
            ctl.update({ evaluation: true });
            ctl.startSession({ ...cfg, exact: undefined });
          }}
        >
          Start session ▶
        </button>
      </div>
      <KeyHelp k={k} mode={cfg.mode} />
      {history.length > 0 && (
        <>
          <h3>Recent sessions</h3>
          <table className="results">
            <tbody>
              {history.map((h) => {
                const right = h.results.filter((r) => r.correct).length;
                const times = h.results.map((r) => r.responseMs).filter((x): x is number => x !== null);
                const missed = h.results.filter((r) => r.correct === false || (r.correct === null && h.config.mode === 'choice'));
                return (
                  <tr key={h.id}>
                    <td>{new Date(h.startedAt).toLocaleString()}</td>
                    <td>
                      {right}/{h.results.length}
                    </td>
                    <td>{times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2) + ' s' : '—'}</td>
                    <td>
                      <button
                        disabled={!missed.length}
                        onClick={() => {
                          ctl.update({ evaluation: true });
                          ctl.startSession({ ...h.config, exact: missed.map((m) => ({ drillId: m.drillId, seed: m.seed })), reps: missed.length, label: 'Repeat missed' });
                        }}
                      >
                        Repeat {missed.length} missed
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint">Accuracy and time are from key presses only. Verbal calls and physical movement are not measured.</p>
        </>
      )}
    </div>
  );
}

function KeyHelp({ k, mode }: { k: (a: 'answer1' | 'advance' | 'replay' | 'pause' | 'gotIt' | 'missed') => string; mode: string }) {
  return (
    <>
      <h3>Controls</h3>
      <table className="results">
        <tbody>
          {mode === 'choice' && (
            <tr>
              <td>Answer 1–6</td>
              <td>{k('answer1')} … (1–6)</td>
            </tr>
          )}
          <tr>
            <td>Start / reveal / next</td>
            <td>{k('advance')}</td>
          </tr>
          <tr>
            <td>Replay rep / repeat missed</td>
            <td>{k('replay')}</td>
          </tr>
          <tr>
            <td>Pause</td>
            <td>{k('pause')}</td>
          </tr>
          {mode === 'aloud' && (
            <tr>
              <td>Self-check got it / missed</td>
              <td>
                {k('gotIt')} or {k('advance')} / {k('missed')} or {k('replay')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">Remap keys (for a presentation remote or foot pedal) in Settings.</p>
    </>
  );
}
