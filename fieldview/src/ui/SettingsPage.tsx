import { useEffect, useState } from 'react';
import { useCtl, download, pickFile } from './hooks';
import type { CoachingRule, TeamSettings, Uniform } from '../data/schema';
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYMAP, prettyKey, type Action } from '../input/keymap';
import { clearGlb, getGlbInfo, loadGlb, onGlbChange } from '../render/glbPlayer';
import { putAsset } from '../data/assetDb';
import type { SessionRecord } from '../assess/session';

const UNIFORM_FIELDS: (keyof Omit<Uniform, 'name'>)[] = ['helmet', 'facemask', 'jersey', 'numbers', 'pants', 'socks', 'cleats'];

export function SettingsPage() {
  const ctl = useCtl();
  const team = ctl.store.get().team;
  const [capture, setCapture] = useState<Action | null>(null);
  const [glbMsg, setGlbMsg] = useState<string | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const off = onGlbChange(() => bump((x) => x + 1));
    return () => void off();
  }, []);
  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return setCapture(null);
      const km = { ...ctl.keymap };
      // a key belongs to one action at a time
      for (const a of ACTIONS) km[a] = km[a].filter((c) => c !== e.code);
      km[capture] = [...km[capture], e.code];
      ctl.setKeymap(km);
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capture, ctl]);

  const setUniform = (side: keyof TeamSettings, p: Partial<Uniform>) => ctl.store.saveTeam({ ...team, [side]: { ...team[side], ...p } });
  const q = ctl.state.quality;
  const setQ = (p: Partial<typeof q>) => {
    ctl.update({ quality: { ...q, ...p } });
    ctl.savePrefs();
  };
  const sessions = ctl.store.getJson<SessionRecord[]>('sessions', []);
  const rules = ctl.store.get().rules;
  const setRule = (id: string, p: Partial<CoachingRule>) => ctl.store.saveRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const glb = getGlbInfo();

  return (
    <div className="wide-page">
      <div className="cols">
        <div>
          <h2>Team &amp; uniforms</h2>
          {(['offense', 'defense'] as const).map((side) => (
            <div className="card" key={side} style={{ marginBottom: 10 }}>
              <label>{side === 'offense' ? 'Offense (scout team look)' : 'Defense (your teammates)'}</label>
              <input type="text" value={team[side].name} onChange={(e) => setUniform(side, { name: e.target.value || side })} />
              <div className="grid3" style={{ marginTop: 6 }}>
                {UNIFORM_FIELDS.map((f) => (
                  <label key={f} className="inline" style={{ margin: 0 }}>
                    <input className="swatch" type="color" value={team[side][f]} onChange={(e) => setUniform(side, { [f]: e.target.value })} />
                    {f}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="hint">Jersey numbers are set per player in the Drill Editor.</p>

          <h2>Rendering quality</h2>
          <div className="card">
            <label>Resolution scale {q.pixelRatio.toFixed(2)}× (lower = faster)</label>
            <input type="range" min={0.5} max={2} step={0.05} value={q.pixelRatio} onChange={(e) => setQ({ pixelRatio: Number(e.target.value) })} />
            <label className="inline">
              <input type="checkbox" checked={q.shadows} onChange={(e) => setQ({ shadows: e.target.checked })} /> Shadows
            </label>
            <label className="inline">
              <input type="checkbox" checked={q.detail === 'high'} onChange={(e) => setQ({ detail: e.target.checked ? 'high' : 'low' })} /> High texture filtering
            </label>
            <label className="inline">
              <input type="checkbox" checked={ctl.state.overlays.showDefense} onChange={(e) => ctl.update({ overlays: { ...ctl.state.overlays, showDefense: e.target.checked } })} /> Render defensive teammates
            </label>
            <p className="hint">To measure frame rate on this computer, use “Measure performance” at the bottom of the Coach tab.</p>
          </div>
        </div>

        <div>
          <h2>Remote / pedal / keyboard</h2>
          <p className="hint">Click “Add key”, then press the button on your presentation remote or foot pedal. Most remotes send PageDown / PageUp / B / F5.</p>
          <table className="results">
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a}>
                  <td>{ACTION_LABELS[a]}</td>
                  <td>
                    {ctl.keymap[a].map((c) => (
                      <span key={c} className="kbd" style={{ marginRight: 4, cursor: 'pointer' }} title="Click to remove" onClick={() => ctl.setKeymap({ ...ctl.keymap, [a]: ctl.keymap[a].filter((x) => x !== c) })}>
                        {prettyKey(c)} ✕
                      </span>
                    ))}
                  </td>
                  <td>
                    <button style={{ minHeight: 28 }} className={capture === a ? 'on' : ''} onClick={() => setCapture(capture === a ? null : a)}>
                      {capture === a ? 'Press a key…' : 'Add key'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => ctl.setKeymap(DEFAULT_KEYMAP)}>Reset to defaults</button>
            {ctl.lastKey && Date.now() - ctl.lastKey.at < 5000 && (
              <span className="pill">
                Last key: {prettyKey(ctl.lastKey.code)} → {ctl.lastKey.actions.join(', ')}
              </span>
            )}
          </div>

          <h2 style={{ marginTop: 22 }}>Athlete model (GLB / glTF)</h2>
          <div className="card">
            <p className="hint" style={{ marginTop: 0 }}>
              Built-in athletes are procedural (no licensing restrictions). You can load a licensed, rigged humanoid GLB; it is retargeted to the same animation. See ASSETS.md for the asset contract.
            </p>
            <div>
              Current: <b>{glb ? glb.name : 'Built-in procedural athlete'}</b>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  const f = await pickFile('.glb,.gltf,model/gltf-binary');
                  if (!f) return;
                  try {
                    const data = await f.arrayBuffer();
                    const r = await loadGlb(data.slice(0), f.name);
                    setGlbMsg(r.message);
                    if (r.ok) {
                      await putAsset('athlete', { name: f.name, data });
                      ctl.update({});
                    }
                  } catch (e) {
                    setGlbMsg('Could not load: ' + (e as Error).message);
                  }
                }}
              >
                Load GLB…
              </button>
              <button
                disabled={!glb}
                onClick={async () => {
                  clearGlb();
                  await putAsset('athlete', null);
                  ctl.update({});
                }}
              >
                Use built-in
              </button>
            </div>
            {glbMsg && <p className="hint">{glbMsg}</p>}
          </div>
        </div>

        <div>
          <h2>Coaching rules &amp; terminology</h2>
          <p className="hint">Your checks and terms. Link them to drills in the editor; they are exported with drill packages.</p>
          {rules.map((r) => (
            <div className="card" key={r.id} style={{ marginBottom: 8 }}>
              <div className="row">
                <input className="grow" style={{ width: 'auto', fontWeight: 700 }} type="text" value={r.name} onChange={(e) => setRule(r.id, { name: e.target.value || 'Rule' })} />
                <button className="danger" onClick={() => ctl.store.saveRules(rules.filter((x) => x.id !== r.id))}>
                  ✕
                </button>
              </div>
              <div className="grid2">
                <div>
                  <label>When we see</label>
                  <input type="text" value={r.trigger} onChange={(e) => setRule(r.id, { trigger: e.target.value })} />
                </div>
                <div>
                  <label>We check</label>
                  <input type="text" value={r.check} onChange={(e) => setRule(r.id, { check: e.target.value })} />
                </div>
              </div>
              <label>Notes</label>
              <input type="text" value={r.notes} onChange={(e) => setRule(r.id, { notes: e.target.value })} />
            </div>
          ))}
          <button onClick={() => ctl.store.saveRules([...rules, { id: `r-${Date.now().toString(36)}`, name: 'New rule', trigger: '', check: '', notes: '' }])}>+ Add rule</button>

          <h2 style={{ marginTop: 22 }}>Results</h2>
          <p className="hint">Recorded: submitted answers, key response time and completed reps. Verbal calls and physical movement are not sensed.</p>
          <div className="row">
            <button disabled={!sessions.length} onClick={() => download('fieldview-results.csv', toCsv(sessions), 'text/csv')}>
              Export CSV ({sessions.reduce((a, s) => a + s.results.length, 0)} reps)
            </button>
            <button
              className="danger"
              disabled={!sessions.length}
              onClick={() => {
                if (confirm('Delete all recorded session results?')) {
                  ctl.store.setJson('sessions', []);
                  ctl.update({});
                }
              }}
            >
              Clear results
            </button>
          </div>
          <table className="results" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Mode</th>
                <th>Correct</th>
                <th>Avg key time</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().slice(0, 15).map((s) => {
                const t = s.results.map((r) => r.responseMs).filter((x): x is number => x !== null);
                return (
                  <tr key={s.id}>
                    <td>
                      {new Date(s.startedAt).toLocaleString()} <span className="hint">{s.label}</span>
                    </td>
                    <td>{s.config.mode === 'choice' ? 'choices' : 'aloud (self-check)'}</td>
                    <td>
                      {s.results.filter((r) => r.correct).length}/{s.results.length}
                    </td>
                    <td>{t.length ? (t.reduce((a, b) => a + b, 0) / t.length / 1000).toFixed(2) + ' s' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function toCsv(sessions: SessionRecord[]): string {
  const rows = [['session', 'started', 'mode', 'rep', 'drill', 'seed', 'answer', 'correct', 'self_reported', 'response_ms']];
  for (const s of sessions)
    for (const r of s.results)
      rows.push([s.id, s.startedAt, r.mode, String(r.index + 1), r.drillName, String(r.seed), r.choiceLabel ?? '', r.correct === null ? '' : String(r.correct), String(r.selfReported), r.responseMs === null ? '' : String(Math.round(r.responseMs))]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}
