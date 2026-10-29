import { useEffect, useState } from 'react';
import { useCtl } from './hooks';
import type { Calibration } from '../data/schema';
import { CalibrationSchema, UNITS } from '../data/schema';
import { calibrationReference, checkCalibration, physicalScreen, screenFov } from '../render/camera';
import { fromMeters, toMeters, type LengthUnit } from '../core/units';

const FIELDS: { key: keyof Calibration; label: string; help: string }[] = [
  { key: 'imageWidth', label: 'Projected image width', help: 'Measure the lit image edge to edge on the wall.' },
  { key: 'imageHeight', label: 'Projected image height', help: 'Top edge to bottom edge of the lit image.' },
  { key: 'bottomEdge', label: 'Bottom edge above floor', help: 'Floor to the bottom of the lit image.' },
  { key: 'distance', label: 'Athlete distance from screen', help: 'Floor mark where the athlete stands, straight to the wall.' },
  { key: 'eyeHeight', label: 'Athlete eye height', help: 'Floor to eyes, in the stance the athlete will use.' },
  { key: 'offsetX', label: 'Horizontal offset from center', help: '+ if the athlete stands right of the image center (facing the wall).' },
];

export function CalibrationPanel() {
  const ctl = useCtl();
  const store = ctl.store;
  const active = store.activeCalibration();
  const [draft, setDraft] = useState<Calibration>(active);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setDraft(store.activeCalibration()), [store, active.id]);
  useEffect(() => {
    // live preview on the stage (and projector) while editing
    if (CalibrationSchema.safeParse(draft).success) ctl.update({ calibration: draft });
  }, [draft, ctl]);
  useEffect(() => {
    ctl.update({ scene: 'calibration' });
    return () => ctl.update({ scene: 'drill', calibration: store.activeCalibration() });
  }, [ctl, store]);

  const valid = CalibrationSchema.safeParse(draft);
  const checks = valid.success ? checkCalibration(draft) : [];
  const ref = valid.success ? calibrationReference(draft) : null;
  const fov = valid.success ? screenFov(physicalScreen(draft)) : null;
  const u = draft.unit;
  const conv = (unit: LengthUnit) => {
    const f = (v: number) => Math.round(fromMeters(toMeters(v, u), unit) * 100) / 100;
    setDraft({ ...draft, unit, imageWidth: f(draft.imageWidth), imageHeight: f(draft.imageHeight), bottomEdge: f(draft.bottomEdge), distance: f(draft.distance), eyeHeight: f(draft.eyeHeight), offsetX: f(draft.offsetX) });
  };

  return (
    <div>
      <h2>Projector calibration</h2>
      <p className="hint">
        Measurements describe the <b>physical room</b> only. They are kept separate from the virtual alignment (which defender, depth, eye height on the field). The projector shows the calibration scene while this tab is open.
      </p>
      <div className="row">
        <select className="grow" style={{ width: 'auto' }} value={active.id} onChange={(e) => store.setActiveCalibration(e.target.value)}>
          {store.get().calibrations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button onClick={() => setDraft({ ...draft, id: `cal-${Date.now().toString(36)}`, name: `${draft.name} copy` })}>New</button>
        <button className="danger" onClick={() => store.deleteCalibration(active.id)}>
          Delete
        </button>
      </div>
      <label>Profile name</label>
      <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <label>Units</label>
      <div className="seg">
        {UNITS.map((x) => (
          <button key={x} className={u === x ? 'on' : ''} onClick={() => conv(x)}>
            {x}
          </button>
        ))}
      </div>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label>
            {f.label} ({u})
          </label>
          <input type="number" step="any" value={draft[f.key] as number} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} />
          <div className="hint">{f.help}</div>
        </div>
      ))}
      <label>Display resolution (pixels)</label>
      <div className="row">
        <input style={{ width: 100 }} type="number" value={draft.resolutionW} onChange={(e) => setDraft({ ...draft, resolutionW: Math.round(Number(e.target.value)) })} />
        ×
        <input style={{ width: 100 }} type="number" value={draft.resolutionH} onChange={(e) => setDraft({ ...draft, resolutionH: Math.round(Number(e.target.value)) })} />
        <button
          onClick={() =>
            setDraft({ ...draft, resolutionW: Math.round(window.screen.width * devicePixelRatio), resolutionH: Math.round(window.screen.height * devicePixelRatio) })
          }
          title="Run this on the projector screen (e.g. from the projector window) to read its resolution"
        >
          Use this screen
        </button>
      </div>
      <div className="hint">Aspect ratio {(draft.resolutionW / draft.resolutionH).toFixed(3)}. Measured image aspect {(draft.imageWidth / draft.imageHeight).toFixed(3)}.</div>
      {!valid.success && <p className="issue error">Enter positive numbers for every measurement.</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="primary"
          disabled={!valid.success}
          onClick={() => {
            store.saveCalibration(draft);
            setMsg('Saved. This profile is now active.');
            setTimeout(() => setMsg(null), 2500);
          }}
        >
          Save profile
        </button>
        <button onClick={() => setDraft(store.activeCalibration())}>Revert</button>
        {msg && <span className="pill good">{msg}</span>}
      </div>

      {checks.length > 0 && (
        <>
          <h3>Checks</h3>
          {checks.map((c, i) => (
            <div key={i} className={`issue ${c.level === 'warn' ? 'warning' : 'info'}`}>
              {c.message}
            </div>
          ))}
        </>
      )}
      {ref && fov && (
        <>
          <h3>Verify with a tape measure</h3>
          <div className="card">
            <p className="hint" style={{ marginTop: 0 }}>
              With the projector showing this scene fullscreen, measure on the wall (from the floor):
            </p>
            <table className="results">
              <tbody>
                <tr>
                  <td>Orange horizon line</td>
                  <td>
                    <b>{ref.horizon.toFixed(1)}</b> {u} — exactly the athlete’s eye height
                  </td>
                </tr>
                <tr>
                  <td>Base of the 6-ft pole</td>
                  <td>
                    <b>{ref.poleBase.toFixed(1)}</b> {u}
                  </td>
                </tr>
                <tr>
                  <td>Top of the 6-ft pole</td>
                  <td>
                    <b>{ref.poleTop.toFixed(1)}</b> {u}
                  </td>
                </tr>
                <tr>
                  <td>Pole height on the wall</td>
                  <td>
                    <b>{ref.poleHeightOnWall.toFixed(1)}</b> {u} (virtual pole {(ref.refDistance / 0.9144).toFixed(1)} yd ahead)
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">If these are off, re-measure the image size, bottom edge and distance. If the horizon is off but the pole is right, the eye height is wrong.</p>
          </div>
        </>
      )}
      <h3>Setup steps</h3>
      <ol className="hint" style={{ paddingLeft: 18 }}>
        <li>Set the projector to its native resolution; turn off digital zoom; square the image (minimal keystone).</li>
        <li>Mark the athlete’s standing spot on the floor (tape). Measure everything from that spot.</li>
        <li>Open the projector window, move it to the projector and go fullscreen.</li>
        <li>Enter measurements, then check the horizon line and pole with a tape measure.</li>
        <li>Save a profile per room. Use “Calibrated View” in Coach mode for true perspective.</li>
      </ol>
      <p className="hint">
        Perspective is exact only for an eye at the marked spot. Head-tracking hardware is not supported yet; see the README for the extension point.
      </p>
    </div>
  );
}
