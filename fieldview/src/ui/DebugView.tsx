import { useEffect, useRef } from 'react';
import { Stage } from '../render/stage';
import { Store } from '../data/store';
import { initialState } from '../core/initialState';

/** #/debug?drill=..&t=..&mode=wide|calibrated&def=M — deterministic still frames for automated checks. */
export function DebugView() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const store = new Store();
    const drill = store.get().drills.find((d) => d.id === (q.get('drill') ?? 'demo-across-rl')) ?? store.get().drills[0];
    const s = initialState(store, drill, Number(q.get('seed') ?? 1));
    s.view.mode = (q.get('mode') as 'wide' | 'calibrated') ?? 'wide';
    if (q.get('def')) s.view.defenderId = q.get('def');
    if (q.get('fov')) s.view.wideFov = Number(q.get('fov'));
    if (q.get('eye')) s.view.eyeHeight = Number(q.get('eye'));
    if (q.get('yaw')) s.view.lookYaw = Number(q.get('yaw'));
    if (q.get('pitch')) s.view.lookPitch = Number(q.get('pitch'));
    if (q.get('x')) s.view.dx = Number(q.get('x'));
    if (q.get('depth')) s.view.ddepth = Number(q.get('depth'));
    s.overlays.labels = q.get('labels') === '1';
    s.overlays.paths = q.get('paths') === '1';
    s.overlays.showDefense = q.get('defense') !== '0';
    s.huddle = q.get('huddle') === '1';
    const canvas = ref.current!;
    const stage = new Stage(canvas);
    stage.resize(window.innerWidth, window.innerHeight);
    stage.setState(s);
    const t = Number(q.get('t') ?? 0);
    stage.render(t);
    stage.render(t);
    (window as any).__fv = { stage, ready: true, timeline: stage.timeline };
    return () => stage.dispose();
  }, []);
  return <canvas ref={ref} style={{ width: '100vw', height: '100vh', display: 'block' }} />;
}
