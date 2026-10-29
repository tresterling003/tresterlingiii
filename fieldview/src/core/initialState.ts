import type { Drill } from '../data/schema';
import type { Store } from '../data/store';
import type { SharedState } from './state';
import { wallNow } from './state';

export function initialState(store: Store, drill: Drill, seed = 1): SharedState {
  const d = store.get();
  return {
    rev: 1,
    drill,
    seed,
    huddle: false,
    view: { mode: 'wide', defenderId: null, dx: 0, ddepth: 0, eyeHeight: null, wideFov: 100, lookYaw: 0, lookPitch: 0 },
    overlays: { labels: false, paths: false, los: false, edgeIndicators: true, showDefense: true },
    evaluation: false,
    calibration: store.activeCalibration(),
    team: d.team,
    quality: { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, detail: 'high' },
    clock: { playing: false, speed: 1, anchorT: 0, anchorWall: wallNow(), stopAt: null },
    athlete: { kind: 'none' },
    scene: 'drill',
  };
}
