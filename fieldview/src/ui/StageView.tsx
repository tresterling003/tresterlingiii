import { useEffect, useRef, useState } from 'react';
import { Stage } from '../render/stage';
import { clockTime, wallNow, type AthleteOverlay as AO, type SharedState } from '../core/state';

interface Props {
  getState: () => SharedState | null;
  /** override time source (the coach window uses the controller's clamped clock) */
  getTime?: () => number;
  onFrame?: (stage: Stage) => void;
  onStage?: (stage: Stage | null) => void;
  showHud?: boolean;
}

/** WebGL stage + athlete overlay + off-screen edge indicators. */
export function StageView({ getState, getTime, onFrame, onStage, showHud }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const edgeRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [athlete, setAthlete] = useState<AO>({ kind: 'none' });
  const [hud, setHud] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stage: Stage;
    try {
      stage = new Stage(canvasRef.current!);
    } catch (e) {
      setError('WebGL is not available in this browser. FIELDVIEW needs a WebGL2-capable browser (Chrome, Edge, Firefox, Safari).');
      console.error(e);
      return;
    }
    onStage?.(stage);
    // exposed for automated verification (scripts/verify-browser.cjs)
    const reg = ((window as unknown as { __stages?: Stage[] }).__stages ??= []);
    reg.push(stage);
    let raf = 0;
    let lastRev = -1;
    let lastAthlete: AO | null = null;
    let lastHud = 0;
    const ro = new ResizeObserver(() => {
      const el = wrapRef.current!;
      stage.resize(el.clientWidth, el.clientHeight);
      const ec = edgeRef.current!;
      ec.width = el.clientWidth;
      ec.height = el.clientHeight;
    });
    ro.observe(wrapRef.current!);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = getState();
      if (!s) return;
      if (s.rev !== lastRev) {
        lastRev = s.rev;
        stage.setState(s);
      }
      if (s.athlete !== lastAthlete) {
        lastAthlete = s.athlete;
        setAthlete(s.athlete);
      }
      const t = getTime ? getTime() : Math.min(clockTime(s.clock), stage.timeline?.duration ?? 0);
      stage.render(t);
      drawEdges(edgeRef.current!, stage, s);
      onFrame?.(stage);
      if (showHud && performance.now() - lastHud > 500) {
        lastHud = performance.now();
        setHud(`${stage.stats.fps.toFixed(0)} fps · ${stage.stats.drawCalls} draws`);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      onStage?.(null);
      reg.splice(reg.indexOf(stage), 1);
      stage.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} className="stage" />
      <canvas ref={edgeRef} className="edges" />
      {error && <div className="display-help">{error}</div>}
      {showHud && hud && (
        <div className="hud">
          <span className="pill">{hud}</span>
        </div>
      )}
      <AthleteOverlay a={athlete} />
    </div>
  );
}

function drawEdges(c: HTMLCanvasElement, stage: Stage, s: SharedState) {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  if (!s.overlays.edgeIndicators || s.scene !== 'drill' || !stage.offscreen.length) return;
  const vp = stage.viewport;
  const H = c.height;
  // viewport is bottom-left origin in WebGL terms; letterbox is symmetric
  const x0 = vp.x;
  const y0 = H - vp.y - vp.h;
  for (const o of stage.offscreen) {
    const nx = Math.max(-1, Math.min(1, o.ndcX));
    const ny = Math.max(-0.75, Math.min(0.6, o.ndcY));
    const left = o.ndcX < 0;
    const px = left ? x0 + 6 : x0 + vp.w - 6;
    const py = y0 + ((1 - ny) / 2) * vp.h;
    void nx;
    g.save();
    g.translate(px, py);
    g.fillStyle = 'rgba(255, 210, 63, 0.9)';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    const d = left ? 1 : -1;
    g.moveTo(0, 0);
    g.lineTo(d * 22, -14);
    g.lineTo(d * 22, 14);
    g.closePath();
    g.fill();
    g.stroke();
    if (!s.evaluation) {
      g.font = '700 15px Arial, sans-serif';
      g.textAlign = left ? 'left' : 'right';
      g.fillStyle = '#fff';
      g.strokeText(o.label, d * 28, 5);
      g.fillText(o.label, d * 28, 5);
    }
    g.restore();
  }
}

export function AthleteOverlay({ a }: { a: AO }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!a.countdownTo) return;
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [a.countdownTo]);
  if (a.kind === 'none') return null;
  const remaining = a.countdownTo ? Math.max(0, (a.countdownTo - wallNow()) / 1000) : null;
  const centered = a.kind === 'countdown' || a.kind === 'summary' || a.kind === 'message' || a.kind === 'rest';
  const tone = a.tone === 'good' ? 'good' : a.tone === 'bad' ? 'bad' : '';
  return (
    <div className={`ath ${centered ? 'center' : ''}`}>
      <div className={`ath-card ${tone}`}>
        {a.title && <div className={`ath-title ${tone}`}>{a.title}</div>}
        {a.subtitle && <div className="ath-sub">{a.subtitle}</div>}
        {(a.kind === 'countdown' || a.kind === 'rest') && remaining !== null && <div className="ath-count">{Math.ceil(remaining)}</div>}
        {a.choices && (
          <div className="ath-choices">
            {a.choices.map((c, i) => (
              <div key={i} className={`ath-choice ${c.state ?? ''}`}>
                <b>{c.key}</b>
                {c.label}
              </div>
            ))}
          </div>
        )}
        {a.lines && a.lines.length > 0 && (
          <div className="ath-lines">
            {a.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        {a.kind === 'prompt' && remaining !== null && (
          <div className="ath-timer">
            <div style={{ width: `${Math.min(100, (remaining / 6) * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
