import type { Controller } from '../core/controller';
import { Vector2 } from 'three';
import type { Stage } from '../render/stage';

export interface BenchResult {
  reps: number;
  frames: number;
  avgFps: number;
  lowFps: number;
  avgMs: number;
  drawCalls: number;
  width: number;
  height: number;
  renderer: string;
}

/**
 * Plays `reps` reps across the drill library at 2× speed and measures frame
 * times of the real render loop. Reports measurements — it does not promise a
 * frame rate on other hardware.
 */
export async function runBenchmark(ctl: Controller, stage: Stage, reps: number): Promise<BenchResult> {
  const drills = ctl.store.get().drills;
  const frameMs: number[] = [];
  const prevSpeed = ctl.state.clock.speed;
  const prevDrill = ctl.state.drill;
  for (let r = 0; r < reps; r++) {
    const d = drills[r % drills.length];
    ctl.loadDrill(d, { seed: 1000 + r });
    ctl.update({ clock: { ...ctl.state.clock, speed: 2 } });
    ctl.seek(0);
    ctl.play();
    // skip freeze points: keep playing until the end
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const step = () => {
        const now = performance.now();
        frameMs.push(now - last);
        last = now;
        if (!ctl.state.clock.playing) {
          if (ctl.now() < ctl.timeline.duration - 1e-3) ctl.play();
          else return resolve();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  ctl.loadDrill(prevDrill, { seed: 1 });
  ctl.setSpeed(prevSpeed);
  const ms = frameMs.slice(5).sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const p99 = ms[Math.floor(ms.length * 0.99)] ?? avg;
  const gl = stage.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'GPU info unavailable';
  const size = stage.renderer.getDrawingBufferSize(new Vector2());
  return {
    reps,
    frames: ms.length,
    avgFps: 1000 / avg,
    lowFps: 1000 / p99,
    avgMs: avg,
    drawCalls: stage.stats.drawCalls,
    width: size.x,
    height: size.y,
    renderer,
  };
}
