import { useEffect, useState } from 'react';
import { useCtl } from './hooks';
import { FREEZE_LABELS, type FreezeMode } from '../core/controller';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function Transport() {
  const ctl = useCtl();
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT(ctl.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ctl]);
  const tl = ctl.timeline;
  const m = tl.markers;
  const dur = tl.duration;
  const pct = (x: number) => `${(x / dur) * 100}%`;
  const c = ctl.state.clock;
  const fp = ctl.freezePoint();
  return (
    <div className="transport">
      <button className="big primary" style={{ minWidth: 92 }} onClick={() => ctl.toggle()} title="Play / pause (B or .)">
        {c.playing ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button className="big" onClick={() => ctl.replay()} title="Exact replay — same timing (PgUp / ←)">
        ↺ Replay
      </button>
      <button className="big" onClick={() => ctl.nextRep()} title="Next rep — new randomized timing (PgDn / →)">
        Next rep ⏭
      </button>
      <button onClick={() => ctl.seek(0)} title="Reset to start">
        ⏮
      </button>
      <div className="scrub">
        <div className="marks">
          {m.firstMotion !== null && <span className="motion" style={{ left: pct(m.firstMotion) }} title="Motion starts" />}
          {m.motionEnd !== null && <span className="motion" style={{ left: pct(m.motionEnd) }} title="Motion ends" />}
          {m.shiftEnd !== null && <span style={{ left: pct(m.shiftEnd) }} title="Shift set" />}
          {m.alignEnd > 0 && <span style={{ left: pct(m.alignEnd) }} title="Aligned" />}
          {fp !== null && <span className="decision" style={{ left: pct(fp) }} title="Freeze / decision point" />}
          <span className="snap" style={{ left: pct(m.snap) }} title="Snap" />
        </div>
        <input
          type="range"
          min={0}
          max={dur}
          step={0.01}
          value={t}
          aria-label="Timeline"
          onChange={(e) => {
            if (c.playing) ctl.pause();
            ctl.seek(Number(e.target.value));
          }}
        />
      </div>
      <span className="time">
        {t.toFixed(2)}s · snap {m.snap.toFixed(1)}
      </span>
      <select value={c.speed} onChange={(e) => ctl.setSpeed(Number(e.target.value))} style={{ width: 84 }} title="Playback speed">
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <select value={ctl.freezeMode} onChange={(e) => ctl.setFreezeMode(e.target.value as FreezeMode)} style={{ width: 190 }} title="Freeze point">
        {Object.entries(FREEZE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            Freeze: {v}
          </option>
        ))}
      </select>
    </div>
  );
}
