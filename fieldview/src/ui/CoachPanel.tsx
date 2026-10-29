import { useEffect, useState } from 'react';
import { useCtl } from './hooks';
import type { Stage } from '../render/stage';
import { FORMATIONS, type Side } from '../data/formations';
import { MOTION_TYPES, quickDrill, type MotionType } from '../data/motionTemplates';
import type { Hash } from '../data/field';
import { physicalScreen, wideScaleFactor } from '../render/camera';
import { POSITION_EYE_HEIGHT, type ViewSettings } from '../core/state';
import type { ViewPosition } from '../data/schema';

export function fmtHeight(m: number) {
  const inches = m / 0.0254;
  return `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″ (${m.toFixed(2)} m)`;
}

export function CoachPanel({ stage, onEdit }: { stage: Stage | null; onEdit: () => void }) {
  const ctl = useCtl();
  const s = ctl.state;
  const drills = ctl.store.get().drills;
  const playlists = ctl.store.get().playlists;
  const d = s.drill;
  const [qb, setQb] = useState({ formation: 'doubles-11', strength: 'R' as Side, hash: 'M' as Hash, motion: 'across' as MotionType });
  const [qbError, setQbError] = useState<string | null>(null);
  const [offscreen, setOffscreen] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => setOffscreen(stage?.offscreen.map((o) => o.label) ?? []), 400);
    return () => clearInterval(id);
  }, [stage]);

  const setView = (p: Partial<ViewSettings>) => {
    ctl.update({ view: { ...s.view, ...p } });
    ctl.savePrefs();
  };
  const athleteId = s.view.defenderId ?? d.defense.athleteId;
  const athlete = d.defense.defenders.find((x) => x.id === athleteId);
  const screen = physicalScreen(s.calibration);
  const eye = s.view.eyeHeight ?? (s.view.mode === 'calibrated' ? screen.eyeHeight : POSITION_EYE_HEIGHT[(athlete?.position ?? 'LB') as ViewPosition]);
  const scale = wideScaleFactor(screen, s.view.wideFov);
  const pickPosition = (pos: ViewPosition) => {
    const cands = d.defense.defenders.filter((x) => x.position === pos);
    if (!cands.length) return;
    const i = cands.findIndex((x) => x.id === athleteId);
    const next = cands[(i + 1) % cands.length];
    setView({ defenderId: next.id === d.defense.athleteId ? null : next.id, dx: 0, ddepth: 0 });
  };
  const categories = [...new Set(drills.map((x) => x.category))];
  const correct = d.answers.choices.filter((c) => d.answers.correct.includes(c.id));
  const tally = ctl.coachResults.filter((r) => r.drillId === d.id);

  return (
    <div>
      <h2>Drill</h2>
      <select
        value={drills.some((x) => x.id === d.id) ? d.id : ''}
        onChange={(e) => {
          const nd = drills.find((x) => x.id === e.target.value);
          if (nd) {
            ctl.setPlaylist(null);
            ctl.loadDrill(nd, { seed: 1, keepView: false });
          }
        }}
      >
        {!drills.some((x) => x.id === d.id) && <option value="">{d.name} (unsaved)</option>}
        {categories.map((cat) => (
          <optgroup key={cat} label={cat}>
            {drills
              .filter((x) => x.category === cat)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <div className="row" style={{ marginTop: 6 }}>
        <select className="grow" style={{ width: 'auto' }} value={ctl.playlist?.id ?? ''} onChange={(e) => ctl.setPlaylist(playlists.find((p) => p.id === e.target.value) ?? null)}>
          <option value="">No playlist (repeat this drill)</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              Playlist: {p.name} ({p.drillIds.length})
            </option>
          ))}
        </select>
        <button onClick={onEdit}>Edit</button>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <span className="pill">{d.personnel} pers.</span>
        <span className="pill">{d.formationName}</span>
        <span className="pill">{d.motionName}</span>
        <span className="pill">Ball: {d.ball.hash === 'M' ? 'middle' : d.ball.hash === 'L' ? 'left hash' : 'right hash'}</span>
        {ctl.playlist && (
          <span className="pill good">
            {ctl.playlistIndex + 1}/{ctl.playlist.drillIds.length}
          </span>
        )}
      </div>
      {d.description && <p className="hint">{d.description}</p>}

      <details style={{ marginTop: 6 }}>
        <summary className="hint" style={{ cursor: 'pointer' }}>
          Quick build: formation · personnel · motion
        </summary>
        <div className="card" style={{ marginTop: 8 }}>
          <label>Formation / personnel</label>
          <select value={qb.formation} onChange={(e) => setQb({ ...qb, formation: e.target.value })}>
            {FORMATIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name} — {f.personnel} personnel
              </option>
            ))}
          </select>
          <div className="grid2">
            <div>
              <label>Strength (offense’s)</label>
              <div className="seg">
                {(['L', 'R'] as Side[]).map((x) => (
                  <button key={x} className={qb.strength === x ? 'on' : ''} onClick={() => setQb({ ...qb, strength: x })}>
                    {x === 'L' ? 'Left' : 'Right'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label>Ball on hash</label>
              <div className="seg">
                {(['L', 'M', 'R'] as Hash[]).map((x) => (
                  <button key={x} className={qb.hash === x ? 'on' : ''} onClick={() => setQb({ ...qb, hash: x })}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label>Motion / shift</label>
          <select value={qb.motion} onChange={(e) => setQb({ ...qb, motion: e.target.value as MotionType })}>
            {Object.entries(MOTION_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="primary"
              onClick={() => {
                const r = quickDrill(qb.formation, qb.strength, qb.hash, qb.motion);
                setQbError(r.error ?? null);
                ctl.setPlaylist(null);
                ctl.loadDrill(r.drill, { seed: 1, keepView: false, autoplay: true });
              }}
            >
              Load rep
            </button>
            <span className="hint">Answers for quick reps are blank — save it in the editor to add yours.</span>
          </div>
          {qbError && <p className="issue warning">{qbError}</p>}
        </div>
      </details>

      <h3>Viewpoint</h3>
      <div className="row">
        {(['LB', 'S', 'CB', 'EDGE'] as ViewPosition[]).map((p) => (
          <button key={p} className={athlete?.position === p ? 'on' : ''} onClick={() => pickPosition(p)} disabled={!d.defense.defenders.some((x) => x.position === p)}>
            {p}
          </button>
        ))}
        <select className="grow" style={{ width: 'auto' }} value={athleteId} onChange={(e) => setView({ defenderId: e.target.value === d.defense.athleteId ? null : e.target.value, dx: 0, ddepth: 0 })}>
          {d.defense.defenders.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} ({x.label}) {x.id === d.defense.athleteId ? '— drill default' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="grid2">
        <div>
          <label>
            Alignment {s.view.dx >= 0 ? '+' : ''}
            {s.view.dx.toFixed(1)} yd {s.view.dx === 0 ? '' : s.view.dx > 0 ? '(→ your right)' : '(← your left)'}
          </label>
          <input type="range" min={-6} max={6} step={0.5} value={s.view.dx} onChange={(e) => setView({ dx: Number(e.target.value) })} />
        </div>
        <div>
          <label>
            Depth {((athlete?.depth ?? 0) + s.view.ddepth).toFixed(1)} yd off the ball
          </label>
          <input type="range" min={-(athlete?.depth ?? 0) + 0.5} max={10} step={0.5} value={s.view.ddepth} onChange={(e) => setView({ ddepth: Number(e.target.value) })} />
        </div>
      </div>
      <label>Eye height {fmtHeight(eye)}</label>
      <div className="row">
        <input className="grow" style={{ width: 'auto' }} type="range" min={0.8} max={2.1} step={0.01} value={eye} onChange={(e) => setView({ eyeHeight: Number(e.target.value) })} />
        <button onClick={() => setView({ eyeHeight: null })} disabled={s.view.eyeHeight === null}>
          Auto
        </button>
      </div>
      {s.view.mode === 'calibrated' && s.view.eyeHeight !== null && Math.abs(s.view.eyeHeight - screen.eyeHeight) > 0.03 && (
        <p className="issue warning">Virtual eye height differs from the athlete’s measured eye height ({fmtHeight(screen.eyeHeight)}) — the field will no longer line up with the real floor.</p>
      )}

      <h3>View</h3>
      <div className="seg">
        <button className={s.view.mode === 'calibrated' ? 'on' : ''} onClick={() => setView({ mode: 'calibrated' })}>
          Calibrated View
        </button>
        <button className={s.view.mode === 'wide' ? 'on' : ''} onClick={() => setView({ mode: 'wide' })}>
          Wide Training View
        </button>
      </div>
      {s.view.mode === 'calibrated' ? (
        <p className="hint">
          True perspective for the athlete standing at the calibrated spot ({s.calibration.name}). Players outside the image are marked with edge arrows — spacing is never squeezed to fit.
        </p>
      ) : (
        <>
          <label>Horizontal field of view {s.view.wideFov.toFixed(0)}°</label>
          <div className="row">
            <input className="grow" style={{ width: 'auto' }} type="range" min={50} max={150} step={1} value={s.view.wideFov} onChange={(e) => setView({ wideFov: Number(e.target.value) })} />
            <button onClick={() => stage && setView({ wideFov: Math.round(stage.fitWideFov(ctl.now())) })}>Fit all 11</button>
          </div>
          <p className="hint">
            Wide view shows more of the formation by shrinking it: players appear at about <b>{Math.round(scale * 100)}%</b> of life size near the center of this screen (vs. Calibrated View). Spacing and depth relationships are unchanged.
          </p>
        </>
      )}
      <details>
        <summary className="hint" style={{ cursor: 'pointer' }}>
          Manual look {s.view.lookYaw !== 0 || s.view.lookPitch !== 0 ? '(active)' : ''}
        </summary>
        <label>Turn {s.view.lookYaw.toFixed(0)}°</label>
        <input type="range" min={-60} max={60} step={1} value={s.view.lookYaw} onChange={(e) => setView({ lookYaw: Number(e.target.value) })} />
        <label>Tilt {s.view.lookPitch.toFixed(0)}°</label>
        <input type="range" min={-30} max={20} step={1} value={s.view.lookPitch} onChange={(e) => setView({ lookPitch: Number(e.target.value) })} />
        <button onClick={() => setView({ lookYaw: 0, lookPitch: 0 })}>Reset look</button>
        {s.view.mode === 'calibrated' && (s.view.lookYaw !== 0 || s.view.lookPitch !== 0) && <p className="issue warning">Look offset active: the calibrated perspective is no longer exact.</p>}
      </details>
      {offscreen.length > 0 && (
        <p className="issue warning">
          Outside this view: {offscreen.join(', ')} {s.overlays.edgeIndicators ? '(edge arrows shown)' : ''}
        </p>
      )}

      <h3>Projector &amp; teaching overlays</h3>
      <label className="inline">
        <input type="checkbox" checked={s.evaluation} onChange={(e) => ctl.update({ evaluation: e.target.checked })} />
        <b>Evaluation mode</b> — hide labels, paths and answers
      </label>
      {(['labels', 'paths', 'los', 'edgeIndicators', 'showDefense'] as const).map((k) => (
        <label className="inline" key={k}>
          <input
            type="checkbox"
            checked={s.overlays[k]}
            disabled={s.evaluation && (k === 'labels' || k === 'paths' || k === 'los')}
            onChange={(e) => {
              ctl.update({ overlays: { ...s.overlays, [k]: e.target.checked } });
              ctl.savePrefs();
            }}
          />
          {{ labels: 'Player labels', paths: 'Motion / shift paths', los: 'Line of scrimmage', edgeIndicators: 'Off-screen edge arrows', showDefense: 'Show defensive teammates' }[k]}
        </label>
      ))}
      <label className="inline">
        <input
          type="checkbox"
          checked={s.huddle}
          onChange={(e) => {
            ctl.update({ huddle: e.target.checked });
            ctl.seek(0);
            ctl.savePrefs();
          }}
        />
        Show offense breaking the huddle and aligning
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={ctl.randomizeTiming}
          onChange={(e) => {
            ctl.randomizeTiming = e.target.checked;
            ctl.update({});
          }}
        />
        Randomize timing on “Next rep” (within the drill’s bounds)
      </label>
      <p className="hint">Rep seed {s.seed} — “Replay” repeats this exact rep.</p>

      <h3>Answer (coach only)</h3>
      <div className="card answer">
        <div className="hint">Call: {d.defense.call || '—'}</div>
        <div className="hint">Cue: {d.recognition.cue || '—'}</div>
        <div style={{ fontWeight: 800, margin: '6px 0' }}>{correct.map((c) => c.label).join(' / ')}</div>
        <div className="hint">{d.answers.explanation}</div>
        {d.answers.isExample && <span className="pill warn">Demonstration answer — edit it to match your system</span>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => ctl.revealAnswer()}>Reveal on projector</button>
        <button onClick={() => ctl.setAthleteOverlay({ kind: 'none' })} disabled={s.athlete.kind === 'none'}>
          Hide
        </button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="hint">Coach scoring (verbal call):</span>
        <button onClick={() => ctl.scoreCoachRep(true)}>✓ Right</button>
        <button onClick={() => ctl.scoreCoachRep(false)}>✗ Wrong</button>
        <span className="pill">
          {tally.filter((r) => r.correct).length}/{tally.length}
        </span>
      </div>
    </div>
  );
}
