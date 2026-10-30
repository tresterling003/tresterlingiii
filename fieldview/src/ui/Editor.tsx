import { useEffect, useMemo, useRef, useState } from 'react';
import { useCtl, download } from './hooks';
import { Diagram, type Sel } from './Diagram';
import { StageView } from './StageView';
import type { DefenderSpec, Drill, Movement, PlayerSpec } from '../data/schema';
import { DECISION_POINTS, DrillSchema, MOVEMENT_KINDS, POSITIONS, ROLES, STANCES } from '../data/schema';
import { buildFormation, exampleDefense, FORMATIONS, type Side } from '../data/formations';
import type { Hash } from '../data/field';
import { validateDrill } from '../sim/validate';
import { compileTimeline } from '../sim/timeline';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function Editor() {
  const ctl = useCtl();
  const [draft, setDraft] = useState<Drill>(() => clone(ctl.state.drill));
  const [sel, setSel] = useState<Sel>(null);
  const [activeMove, setActiveMove] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tpl, setTpl] = useState({ formation: 'doubles-11', strength: 'R' as Side });
  const saved = ctl.store.get().drills.find((d) => d.id === draft.id);
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(draft);
  const parsed = DrillSchema.safeParse(draft);

  // live 3D preview: push the draft into the authoritative timeline (debounced)
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!parsed.success) return;
      const t = ctl.now();
      ctl.loadDrill(parsed.data, { seed: 1 });
      ctl.seek(Math.min(t, ctl.timeline.duration));
    }, 120);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const issues = useMemo(() => {
    if (!parsed.success) return parsed.error.issues.slice(0, 8).map((i) => ({ level: 'error' as const, message: `${i.path.join('.')}: ${i.message}` }));
    try {
      return validateDrill(parsed.data, compileTimeline(parsed.data, 1));
    } catch (e) {
      return [{ level: 'error' as const, message: String(e) }];
    }
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Drill>) => setDraft((d) => ({ ...d, ...p }));
  const setPlayer = (id: string, p: Partial<PlayerSpec>) => setDraft((d) => ({ ...d, players: d.players.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  const setDef = (id: string, p: Partial<DefenderSpec>) => setDraft((d) => ({ ...d, defense: { ...d.defense, defenders: d.defense.defenders.map((q) => (q.id === id ? { ...q, ...p } : q)) } }));
  const setMove = (id: string, p: Partial<Movement>) => setDraft((d) => ({ ...d, movements: d.movements.map((m) => (m.id === id ? { ...m, ...p } : m)) }));

  const selPlayer = sel?.kind === 'off' ? draft.players.find((q) => q.id === sel.id) : undefined;
  const selDef = sel?.kind === 'def' ? draft.defense.defenders.find((q) => q.id === sel.id) : undefined;
  const moveFocusId = activeMove ?? (sel?.kind === 'wp' ? sel.moveId : null);
  const focusMove = draft.movements.find((m) => m.id === moveFocusId);
  const playerForMoves = selPlayer?.id ?? focusMove?.playerId;

  const lastPointOf = (pid: string, beforeKind: Movement['kind']): { x: number; y: number } => {
    const p = draft.players.find((q) => q.id === pid)!;
    const pre = draft.movements.filter((m) => m.playerId === pid && m.kind !== 'postsnap');
    if (beforeKind === 'postsnap' || !pre.length) return pre.length ? pre[pre.length - 1].path.at(-1)! : { x: p.x, y: p.y };
    return pre[pre.length - 1].path.at(-1)!;
  };

  const addMovement = (kind: Movement['kind']) => {
    if (!playerForMoves) return;
    const id = `m-${Date.now().toString(36)}`;
    const from = lastPointOf(playerForMoves, kind);
    const m: Movement = {
      id,
      playerId: playerForMoves,
      kind,
      start: kind === 'postsnap' ? 0 : Math.max(1, draft.movements.filter((x) => x.playerId === playerForMoves && x.kind !== 'postsnap').length ? 1 : 1.5),
      anchor: kind === 'postsnap' ? 'snap' : 'rep',
      path: [{ x: from.x, y: from.y }],
      speed: kind === 'shift' ? 3.5 : kind === 'motion' ? 4.5 : 6,
      curve: 'smooth',
      noStop: false,
      endFacing: kind === 'postsnap' ? undefined : 0,
    };
    setDraft((d) => ({ ...d, movements: [...d.movements, m] }));
    setActiveMove(id);
    setDrawing(true);
  };

  const savedFormations = ctl.store.get().formations;
  const applyTemplate = () => {
    if (!confirm('Replace the offense with this formation? Movements will be cleared.')) return;
    const saved = savedFormations.find((f) => f.id === tpl.formation);
    if (saved) {
      const players = clone(saved.players);
      set({ players, movements: [], personnel: saved.personnel, formationName: saved.name, defense: { ...draft.defense, defenders: exampleDefense(players) } });
      return;
    }
    const players = buildFormation(tpl.formation, draft.ball.hash, tpl.strength);
    const f = FORMATIONS.find((x) => x.key === tpl.formation)!;
    set({ players, movements: [], personnel: f.personnel, formationName: `${f.name} ${tpl.strength === 'R' ? 'Right' : 'Left'}`, defense: { ...draft.defense, defenders: exampleDefense(players) } });
  };
  const saveFormation = () => {
    const name = prompt('Name this formation', draft.formationName || 'My formation');
    if (!name) return;
    ctl.store.saveFormation({ id: `f-${Date.now().toString(36)}`, name, personnel: draft.personnel, players: clone(draft.players) });
    setMsg('Formation saved');
    setTimeout(() => setMsg(null), 2000);
  };

  const save = (asNew: boolean) => {
    let d = draft;
    if (asNew || d.id.startsWith('quick-')) d = { ...d, id: `drill-${Date.now().toString(36)}`, name: asNew && saved ? `${d.name} (copy)` : d.name };
    const r = DrillSchema.safeParse(d);
    if (!r.success) {
      setMsg('Fix the errors before saving.');
      return;
    }
    ctl.store.saveDrill(r.data);
    setDraft(clone(r.data));
    setMsg('Saved');
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="editor">
      <div className="editor-left">
        <div className="diagram">
          <Diagram
            drill={draft}
            timeline={ctl.timeline}
            getTime={() => ctl.now()}
            sel={sel}
            activeMove={activeMove}
            drawing={drawing}
            onSelect={(s) => {
              setSel(s);
              if (s?.kind === 'wp') setActiveMove(s.moveId);
              else if (s?.kind === 'off') setActiveMove(draft.movements.find((m) => m.playerId === s.id)?.id ?? null);
            }}
            onMovePlayer={(id, p) => setPlayer(id, { x: p.x, y: p.y })}
            onMoveDefender={(id, p) => setDef(id, { x: p.x, depth: -p.y })}
            onMoveWaypoint={(mid, i, p) => setDraft((d) => ({ ...d, movements: d.movements.map((m) => (m.id === mid ? { ...m, path: m.path.map((q, k) => (k === i ? p : q)) } : m)) }))}
            onAddWaypoint={(p) => {
              if (!activeMove) return;
              setDraft((d) => ({
                ...d,
                movements: d.movements.map((m) => {
                  if (m.id !== activeMove) return m;
                  // the first click replaces the placeholder start point
                  const fresh = m.path.length === 1 && Math.hypot(m.path[0].x - lastPointOf(m.playerId, m.kind).x, m.path[0].y - lastPointOf(m.playerId, m.kind).y) < 1e-6;
                  return { ...m, path: fresh ? [p] : [...m.path, p] };
                }),
              }));
            }}
            onFinishPath={() => setDrawing(false)}
          />
          <div className="tools">
            {drawing ? (
              <>
                <span className="pill warn">Click to add path points · double-click to finish</span>
                <button onClick={() => setDrawing(false)}>Done</button>
                <button
                  onClick={() => focusMove && focusMove.path.length > 1 && setMove(focusMove.id, { path: focusMove.path.slice(0, -1) })}
                >
                  Undo point
                </button>
              </>
            ) : (
              <span className="pill">Drag players, defenders and path points · select a player to add motion</span>
            )}
          </div>
        </div>
        <div className="preview3d">
          <StageView getState={() => ctl.state} getTime={() => ctl.now()} />
        </div>
      </div>
      <div className="editor-right">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            Drill editor {dirty && <span className="pill warn">unsaved</span>}
          </h2>
          <button className="primary" onClick={() => save(false)}>
            Save
          </button>
          <button onClick={() => save(true)}>Save as new</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={() => saved && setDraft(clone(saved))} disabled={!saved}>
            Revert
          </button>
          <button onClick={() => download(`${draft.id}.fieldview.json`, JSON.stringify(ctl.store.exportPackage({ drillIds: [draft.id], includeCalibrations: false, includeTeam: false }), null, 2))} disabled={!saved}>
            Export drill
          </button>
          <button
            className="danger"
            disabled={!saved}
            onClick={() => {
              if (confirm(`Delete "${draft.name}"?`)) {
                ctl.store.deleteDrill(draft.id);
                const next = ctl.store.get().drills[0];
                if (next) setDraft(clone(next));
              }
            }}
          >
            Delete
          </button>
          {msg && <span className="pill good">{msg}</span>}
        </div>
        {issues.length > 0 && (
          <div className="card" style={{ marginTop: 10 }}>
            {issues.map((i, k) => (
              <div key={k} className={`issue ${i.level}`}>
                {i.level === 'error' ? '⛔' : i.level === 'warning' ? '⚠️' : 'ℹ️'} {i.message}
              </div>
            ))}
          </div>
        )}

        <h3>Drill</h3>
        <label>Name</label>
        <input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid2">
          <div>
            <label>Category</label>
            <input type="text" value={draft.category} onChange={(e) => set({ category: e.target.value })} />
          </div>
          <div>
            <label>Personnel</label>
            <input type="text" value={draft.personnel} onChange={(e) => set({ personnel: e.target.value })} />
          </div>
          <div>
            <label>Formation name</label>
            <input type="text" value={draft.formationName} onChange={(e) => set({ formationName: e.target.value })} />
          </div>
          <div>
            <label>Motion name</label>
            <input type="text" value={draft.motionName} onChange={(e) => set({ motionName: e.target.value })} />
          </div>
        </div>
        <label>Description</label>
        <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="grid3">
          <div>
            <label>Ball on own</label>
            <input type="number" min={1} max={99} value={draft.ball.yardLine} onChange={(e) => set({ ball: { ...draft.ball, yardLine: Number(e.target.value) } })} />
          </div>
          <div>
            <label>Hash</label>
            <select value={draft.ball.hash} onChange={(e) => set({ ball: { ...draft.ball, hash: e.target.value as Hash } })}>
              <option value="L">Left</option>
              <option value="M">Middle</option>
              <option value="R">Right</option>
            </select>
          </div>
          <div>
            <label>Post-snap</label>
            <select value={draft.postSnap} onChange={(e) => set({ postSnap: e.target.value as Drill['postSnap'] })}>
              <option value="pass">Pass set</option>
              <option value="run-left">Run (your left)</option>
              <option value="run-right">Run (your right)</option>
              <option value="none">Freeze at snap</option>
            </select>
          </div>
          <div>
            <label>Snap time (s)</label>
            <input type="number" step={0.1} min={0.5} value={draft.snapTime} onChange={(e) => set({ snapTime: Number(e.target.value) })} />
          </div>
          <div>
            <label>Snap random +min</label>
            <input type="number" step={0.1} value={draft.snapJitter[0]} onChange={(e) => set({ snapJitter: [Number(e.target.value), draft.snapJitter[1]] })} />
          </div>
          <div>
            <label>Snap random +max</label>
            <input type="number" step={0.1} value={draft.snapJitter[1]} onChange={(e) => set({ snapJitter: [draft.snapJitter[0], Number(e.target.value)] })} />
          </div>
        </div>

        <h3>Formation template</h3>
        <div className="row">
          <select className="grow" style={{ width: 'auto' }} value={tpl.formation} onChange={(e) => setTpl({ ...tpl, formation: e.target.value })}>
            <optgroup label="Built-in">
              {FORMATIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name} ({f.personnel})
                </option>
              ))}
            </optgroup>
            {savedFormations.length > 0 && (
              <optgroup label="Saved formations">
                {savedFormations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.personnel})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="seg">
            {(['L', 'R'] as Side[]).map((x) => (
              <button key={x} className={tpl.strength === x ? 'on' : ''} onClick={() => setTpl({ ...tpl, strength: x })}>
                {x}
              </button>
            ))}
          </div>
          <button onClick={applyTemplate}>Apply</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={saveFormation}>Save current formation</button>
          {savedFormations.some((f) => f.id === tpl.formation) && (
            <button className="danger" onClick={() => ctl.store.deleteFormation(tpl.formation)}>
              Delete saved formation
            </button>
          )}
        </div>

        <h3>Offensive player {selPlayer ? `· ${selPlayer.label}` : ''}</h3>
        {!selPlayer && <p className="hint">Click a player on the diagram.</p>}
        {selPlayer && (
          <div className="card">
            <div className="grid3">
              <div>
                <label>Label</label>
                <input type="text" value={selPlayer.label} onChange={(e) => setPlayer(selPlayer.id, { label: e.target.value })} />
              </div>
              <div>
                <label>Number</label>
                <input type="number" min={0} max={99} value={selPlayer.number} onChange={(e) => setPlayer(selPlayer.id, { number: Math.max(0, Math.min(99, Math.round(Number(e.target.value)))) })} />
              </div>
              <div>
                <label>Role</label>
                <select value={selPlayer.role} onChange={(e) => setPlayer(selPlayer.id, { role: e.target.value as PlayerSpec['role'] })}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>x (yd)</label>
                <input type="number" step={0.25} value={selPlayer.x} onChange={(e) => setPlayer(selPlayer.id, { x: Number(e.target.value) })} />
              </div>
              <div>
                <label>Depth (yd)</label>
                <input type="number" step={0.25} min={0} value={selPlayer.y} onChange={(e) => setPlayer(selPlayer.id, { y: Number(e.target.value) })} />
              </div>
              <div>
                <label>Facing (°)</label>
                <input type="number" step={5} value={selPlayer.facing} onChange={(e) => setPlayer(selPlayer.id, { facing: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid2">
              <div>
                <label>Stance</label>
                <select value={selPlayer.stance} onChange={(e) => setPlayer(selPlayer.id, { stance: e.target.value as PlayerSpec['stance'] })}>
                  {STANCES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>&nbsp;</label>
                <label className="inline">
                  <input type="checkbox" checked={selPlayer.onLine} onChange={(e) => setPlayer(selPlayer.id, { onLine: e.target.checked })} /> On the line
                </label>
              </div>
            </div>
          </div>
        )}

        <h3>Movement {playerForMoves ? `· ${draft.players.find((q) => q.id === playerForMoves)?.label}` : ''}</h3>
        {playerForMoves && (
          <div className="row">
            <button onClick={() => addMovement('motion')}>+ Motion</button>
            <button onClick={() => addMovement('shift')}>+ Shift</button>
            <button onClick={() => addMovement('postsnap')}>+ Post-snap</button>
          </div>
        )}
        <div className="list" style={{ marginTop: 6 }}>
          {draft.movements
            .filter((m) => !playerForMoves || m.playerId === playerForMoves)
            .map((m) => (
              <div key={m.id} className={`item ${m.id === activeMove ? 'on' : ''}`} onClick={() => setActiveMove(m.id)}>
                <span className="grow">
                  {draft.players.find((q) => q.id === m.playerId)?.label} · {m.kind} · {m.path.length} pts
                </span>
                <span className="meta">
                  {m.anchor === 'snap' ? `snap${m.start >= 0 ? '+' : ''}${m.start}` : `${m.start}s`} · {m.speed} yd/s
                </span>
              </div>
            ))}
        </div>
        {focusMove && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="grid3">
              <div>
                <label>Kind</label>
                <select value={focusMove.kind} onChange={(e) => setMove(focusMove.id, { kind: e.target.value as Movement['kind'], anchor: e.target.value === 'postsnap' ? 'snap' : focusMove.anchor })}>
                  {MOVEMENT_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Start (s)</label>
                <input type="number" step={0.1} value={focusMove.start} onChange={(e) => setMove(focusMove.id, { start: Number(e.target.value) })} />
              </div>
              <div>
                <label>Timed from</label>
                <select value={focusMove.anchor} disabled={focusMove.kind === 'postsnap'} onChange={(e) => setMove(focusMove.id, { anchor: e.target.value as Movement['anchor'] })}>
                  <option value="rep">Start of rep</option>
                  <option value="snap">The snap (− = before)</option>
                </select>
              </div>
              <div>
                <label>Speed (yd/s)</label>
                <input type="number" step={0.1} min={0.5} max={11} value={focusMove.speed} onChange={(e) => setMove(focusMove.id, { speed: Number(e.target.value) })} />
              </div>
              <div>
                <label>Path</label>
                <select value={focusMove.curve} onChange={(e) => setMove(focusMove.id, { curve: e.target.value as Movement['curve'] })}>
                  <option value="smooth">Curved</option>
                  <option value="straight">Straight</option>
                </select>
              </div>
              <div>
                <label>End facing (°)</label>
                <input type="number" step={5} value={focusMove.endFacing ?? ''} placeholder="—" onChange={(e) => setMove(focusMove.id, { endFacing: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div>
                <label>Hold facing (°)</label>
                <input type="number" step={5} value={focusMove.holdFacing ?? ''} placeholder="face travel" onChange={(e) => setMove(focusMove.id, { holdFacing: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div>
                <label>Random start +min</label>
                <input type="number" step={0.1} value={focusMove.jitter?.[0] ?? 0} onChange={(e) => setMove(focusMove.id, { jitter: [Number(e.target.value), focusMove.jitter?.[1] ?? 0] })} />
              </div>
              <div>
                <label>Random start +max</label>
                <input type="number" step={0.1} value={focusMove.jitter?.[1] ?? 0} onChange={(e) => setMove(focusMove.id, { jitter: [focusMove.jitter?.[0] ?? 0, Number(e.target.value)] })} />
              </div>
            </div>
            <label className="inline">
              <input type="checkbox" checked={focusMove.noStop} onChange={(e) => setMove(focusMove.id, { noStop: e.target.checked })} /> Still moving at the snap (jet / orbit — does not stop)
            </label>
            <div className="row">
              <button onClick={() => setDrawing(true)}>Add points</button>
              <button onClick={() => setMove(focusMove.id, { path: [focusMove.path[0]] })}>Clear path</button>
              <button
                className="danger"
                onClick={() => {
                  setDraft((d) => ({ ...d, movements: d.movements.filter((m) => m.id !== focusMove.id) }));
                  setActiveMove(null);
                  setDrawing(false);
                }}
              >
                Delete movement
              </button>
            </div>
            <p className="hint">Facing: 0° = toward the defense, 90° = toward your right, −90° = toward your left. A shift must settle 1 s before the snap.</p>
          </div>
        )}

        <h3>Defense &amp; athlete</h3>
        <label>Starting defensive call</label>
        <input type="text" value={draft.defense.call} onChange={(e) => set({ defense: { ...draft.defense, call: e.target.value } })} />
        <label>Athlete position</label>
        <select value={draft.defense.athleteId} onChange={(e) => set({ defense: { ...draft.defense, athleteId: e.target.value } })}>
          {draft.defense.defenders.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id} ({d.label})
            </option>
          ))}
        </select>
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={() => set({ defense: { ...draft.defense, defenders: exampleDefense(draft.players) } })}>Re-align example defense to formation</button>
        </div>
        {selDef && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="grid3">
              <div>
                <label>Label</label>
                <input type="text" value={selDef.label} onChange={(e) => setDef(selDef.id, { label: e.target.value })} />
              </div>
              <div>
                <label>x (yd)</label>
                <input type="number" step={0.25} value={selDef.x} onChange={(e) => setDef(selDef.id, { x: Number(e.target.value) })} />
              </div>
              <div>
                <label>Depth (yd)</label>
                <input type="number" step={0.25} min={0} value={selDef.depth} onChange={(e) => setDef(selDef.id, { depth: Number(e.target.value) })} />
              </div>
              <div>
                <label>Stance</label>
                <select value={selDef.stance} onChange={(e) => setDef(selDef.id, { stance: e.target.value as DefenderSpec['stance'] })}>
                  <option value="three-point">three-point</option>
                  <option value="two-point">two-point</option>
                  <option value="lb">lb</option>
                  <option value="db">db</option>
                </select>
              </div>
              <div>
                <label>View group</label>
                <select value={selDef.position ?? ''} onChange={(e) => setDef(selDef.id, { position: (e.target.value || undefined) as DefenderSpec['position'] })}>
                  <option value="">—</option>
                  {POSITIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <h3>Recognition</h3>
        <label>Recognition cue (what the athlete should see)</label>
        <textarea value={draft.recognition.cue} onChange={(e) => set({ recognition: { ...draft.recognition, cue: e.target.value } })} />
        <div className="grid3">
          <div>
            <label>Decision point</label>
            <select value={draft.recognition.decisionPoint} onChange={(e) => set({ recognition: { ...draft.recognition, decisionPoint: e.target.value as Drill['recognition']['decisionPoint'] } })}>
              {DECISION_POINTS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Custom time (s)</label>
            <input
              type="number"
              step={0.1}
              disabled={draft.recognition.decisionPoint !== 'custom'}
              value={draft.recognition.decisionTime ?? ''}
              onChange={(e) => set({ recognition: { ...draft.recognition, decisionTime: Number(e.target.value) } })}
            />
          </div>
          <div>
            <label>&nbsp;</label>
            <label className="inline">
              <input type="checkbox" checked={draft.recognition.freeze} onChange={(e) => set({ recognition: { ...draft.recognition, freeze: e.target.checked } })} /> Freeze
            </label>
          </div>
        </div>

        <h3>Answers</h3>
        {draft.answers.choices.map((c, i) => (
          <div className="row" key={c.id} style={{ marginBottom: 6 }}>
            <input
              type="checkbox"
              title="Correct / accepted answer"
              checked={draft.answers.correct.includes(c.id)}
              onChange={(e) =>
                set({ answers: { ...draft.answers, correct: e.target.checked ? [...draft.answers.correct, c.id] : draft.answers.correct.filter((x) => x !== c.id) } })
              }
            />
            <span className="kbd">{i + 1}</span>
            <input
              className="grow"
              style={{ width: 'auto' }}
              type="text"
              value={c.label}
              onChange={(e) => set({ answers: { ...draft.answers, choices: draft.answers.choices.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) } })}
            />
            <button
              disabled={draft.answers.choices.length <= 1}
              onClick={() => set({ answers: { ...draft.answers, choices: draft.answers.choices.filter((x) => x.id !== c.id), correct: draft.answers.correct.filter((x) => x !== c.id) } })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          disabled={draft.answers.choices.length >= 6}
          onClick={() => set({ answers: { ...draft.answers, choices: [...draft.answers.choices, { id: `c${Date.now().toString(36)}`, label: 'New answer' }] } })}
        >
          + Add choice
        </button>
        <p className="hint">Tick every accepted answer. Up to 6 choices map to keys 1–6.</p>
        <label>Coaching explanation (shown after the rep)</label>
        <textarea value={draft.answers.explanation} onChange={(e) => set({ answers: { ...draft.answers, explanation: e.target.value } })} />
        <label className="inline">
          <input type="checkbox" checked={draft.answers.isExample} onChange={(e) => set({ answers: { ...draft.answers, isExample: e.target.checked } })} /> Mark as a demonstration example (not our rule yet)
        </label>
        <label>Linked coaching rules</label>
        <div className="list">
          {ctl.store.get().rules.map((r) => (
            <label className="inline" key={r.id} style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={draft.answers.ruleIds.includes(r.id)}
                onChange={(e) => set({ answers: { ...draft.answers, ruleIds: e.target.checked ? [...draft.answers.ruleIds, r.id] : draft.answers.ruleIds.filter((x) => x !== r.id) } })}
              />
              <span style={{ fontSize: '0.86rem' }}>
                {r.name} <span className="hint">— {r.check}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
