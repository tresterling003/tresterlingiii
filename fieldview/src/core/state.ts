import type { Calibration, Drill, TeamSettings, ViewPosition } from '../data/schema';

// Shared, serializable state. The coach (controller) window owns it and
// broadcasts it; projector windows render purely from it.

export interface ViewSettings {
  mode: 'calibrated' | 'wide';
  /** defender the athlete stands in for; null = the drill's athlete */
  defenderId: string | null;
  /** alignment adjustments in yards (+dx = defense's right, +ddepth = deeper) */
  dx: number;
  ddepth: number;
  /** virtual eye height in meters; null = use the calibration's athlete eye height */
  eyeHeight: number | null;
  /** horizontal FOV for wide view (degrees) */
  wideFov: number;
  /** manual look offsets (degrees) */
  lookYaw: number;
  lookPitch: number;
}

export interface Overlays {
  labels: boolean;
  paths: boolean;
  los: boolean;
  edgeIndicators: boolean;
  showDefense: boolean;
}

export interface Quality {
  pixelRatio: number;
  shadows: boolean;
  detail: 'low' | 'high';
}

export interface ClockState {
  playing: boolean;
  speed: number;
  anchorT: number;
  /** epoch ms (performance.timeOrigin + performance.now()) when anchorT was valid */
  anchorWall: number;
  /** playback holds here (freeze point / end of rep) */
  stopAt: number | null;
}

export interface AthleteOverlay {
  kind: 'none' | 'countdown' | 'prompt' | 'feedback' | 'rest' | 'summary' | 'message';
  title?: string;
  subtitle?: string;
  lines?: string[];
  choices?: { key: string; label: string; state?: 'correct' | 'wrong' | 'picked' | 'none' }[];
  countdownTo?: number; // epoch ms
  tone?: 'good' | 'bad' | 'neutral';
}

export interface SharedState {
  rev: number;
  drill: Drill;
  seed: number;
  huddle: boolean;
  view: ViewSettings;
  overlays: Overlays;
  /** Evaluation hides names, answers, paths and labels on the projector. */
  evaluation: boolean;
  calibration: Calibration;
  team: TeamSettings;
  quality: Quality;
  clock: ClockState;
  athlete: AthleteOverlay;
  /** 'calibration' shows the calibration scene (grid, horizon, scale pole) */
  scene: 'drill' | 'calibration';
}

export const POSITION_EYE_HEIGHT: Record<ViewPosition, number> = {
  LB: 1.5,
  S: 1.62,
  CB: 1.55,
  EDGE: 1.35,
};

export function wallNow(): number {
  return performance.timeOrigin + performance.now();
}

export function clockTime(c: ClockState, wall = wallNow()): number {
  let t = c.playing ? c.anchorT + ((wall - c.anchorWall) / 1000) * c.speed : c.anchorT;
  if (c.stopAt !== null && t > c.stopAt && c.anchorT <= c.stopAt + 1e-9) t = c.stopAt;
  return Math.max(0, t);
}
