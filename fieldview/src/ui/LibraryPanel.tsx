import { useState } from 'react';
import { useCtl, download, pickFile } from './hooks';
import type { Playlist } from '../data/schema';

export function LibraryPage({ onOpen }: { onOpen: () => void }) {
  const ctl = useCtl();
  const { drills, playlists } = ctl.store.get();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [plName, setPlName] = useState('New playlist');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string[] } | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const shown = drills.filter((d) => (d.name + d.category + d.formationName + d.motionName + d.personnel).toLowerCase().includes(q.toLowerCase()));

  const movePl = (p: Playlist, i: number, dir: number) => {
    const ids = [...p.drillIds];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ctl.store.savePlaylist({ ...p, drillIds: ids });
  };

  return (
    <div className="wide-page">
      <div className="cols">
        <div>
          <h2>Drills ({drills.length})</h2>
          <input type="text" placeholder="Search name, formation, motion, personnel…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="list" style={{ marginTop: 8 }}>
            {shown.map((d) => (
              <div key={d.id} className={`item ${picked.includes(d.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={picked.includes(d.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, d.id] : picked.filter((x) => x !== d.id))} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div className="meta">
                    {d.category} · {d.personnel} · {d.formationName} · {d.motionName} · view {d.defense.athleteId}
                    {d.answers.isExample ? ' · example answer' : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    ctl.setPlaylist(null);
                    ctl.loadDrill(d, { seed: 1, keepView: false });
                    onOpen();
                  }}
                >
                  Run
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={() => setPicked(shown.map((d) => d.id))}>Select all</button>
            <button onClick={() => setPicked([])}>Clear</button>
            <button
              onClick={() => {
                if (confirm('Restore the 13 demonstration drills, playlists and example rules? Your own drills are kept; edited demo drills are reset.')) ctl.store.restoreDemos();
              }}
            >
              Restore demo drills
            </button>
          </div>
        </div>

        <div>
          <h2>Playlists</h2>
          <div className="card">
            <label>Create from {picked.length} selected drills</label>
            <div className="row">
              <input className="grow" style={{ width: 'auto' }} type="text" value={plName} onChange={(e) => setPlName(e.target.value)} />
              <button
                className="primary"
                disabled={!picked.length}
                onClick={() => {
                  ctl.store.savePlaylist({ id: `pl-${Date.now().toString(36)}`, name: plName || 'Playlist', drillIds: picked });
                  setPicked([]);
                }}
              >
                Create
              </button>
            </div>
          </div>
          {playlists.map((p) => (
            <div key={p.id} className="card" style={{ marginTop: 10 }}>
              <div className="row">
                <input className="grow" style={{ width: 'auto', fontWeight: 700 }} type="text" value={p.name} onChange={(e) => ctl.store.savePlaylist({ ...p, name: e.target.value || 'Playlist' })} />
                <button
                  onClick={() => {
                    ctl.setPlaylist(p);
                    onOpen();
                  }}
                >
                  Run
                </button>
                <button className="danger" onClick={() => ctl.store.deletePlaylist(p.id)}>
                  ✕
                </button>
              </div>
              <ol style={{ paddingLeft: 22, margin: '8px 0 0' }}>
                {p.drillIds.map((id, i) => (
                  <li key={id + i} style={{ fontSize: '0.86rem', margin: '3px 0' }}>
                    <span className="row" style={{ display: 'inline-flex' }}>
                      {drills.find((d) => d.id === id)?.name ?? <i>missing drill {id}</i>}
                      <button style={{ minHeight: 24, padding: '0 6px' }} onClick={() => movePl(p, i, -1)}>
                        ↑
                      </button>
                      <button style={{ minHeight: 24, padding: '0 6px' }} onClick={() => movePl(p, i, 1)}>
                        ↓
                      </button>
                      <button style={{ minHeight: 24, padding: '0 6px' }} disabled={p.drillIds.length <= 1} onClick={() => ctl.store.savePlaylist({ ...p, drillIds: p.drillIds.filter((_, k) => k !== i) })}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              {picked.length > 0 && (
                <button style={{ marginTop: 6 }} onClick={() => ctl.store.savePlaylist({ ...p, drillIds: [...p.drillIds, ...picked] })}>
                  + Add {picked.length} selected
                </button>
              )}
            </div>
          ))}
        </div>

        <div>
          <h2>Backup &amp; share</h2>
          <div className="card">
            <p className="hint" style={{ marginTop: 0 }}>
              A drill package is a validated JSON file with drills, playlists, coaching rules, calibration profiles and team colors.
            </p>
            <div className="row">
              <button className="primary" onClick={() => download(`fieldview-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ctl.store.exportPackage(), null, 2))}>
                Export everything
              </button>
              <button
                disabled={!picked.length}
                onClick={() => download(`fieldview-drills-${picked.length}.json`, JSON.stringify(ctl.store.exportPackage({ drillIds: picked, includeCalibrations: false }), null, 2))}
              >
                Export {picked.length} selected
              </button>
            </div>
            <label className="inline">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace drills with the same id when importing
            </label>
            <button
              onClick={async () => {
                const f = await pickFile('.json,application/json');
                if (!f) return;
                const r = ctl.store.importPackage(await f.text(), { overwrite });
                setImportMsg(r.ok ? { ok: true, text: [r.summary] } : { ok: false, text: r.errors });
              }}
            >
              Import package…
            </button>
            {importMsg && (
              <div style={{ marginTop: 8 }}>
                {importMsg.text.map((t, i) => (
                  <div key={i} className={`issue ${importMsg.ok ? 'info' : 'error'}`}>
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
