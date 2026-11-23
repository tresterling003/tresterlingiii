import type { CharacterRig, RigPose } from '../lib/rig/skeleton';
import type { RigStyle } from '../lib/rig/render';
import type { Intensity, MotionPlan, Speed } from '../lib/motion/planner';
import type { View } from '../lib/rig/skeleton';

/** Where a frame came from. Shown on every frame so students never confuse AI output with their own drawing. */
export type FrameKind = 'original' | 'ai' | 'rig' | 'inbetween' | 'drawn' | 'coin';

export const KIND_LABEL: Record<FrameKind, string> = {
  original: 'Original drawing',
  ai: 'AI-generated key pose',
  rig: 'Rig pose (procedural)',
  inbetween: 'In-between',
  drawn: 'Hand-drawn frame',
  coin: 'Coin flip (procedural)',
};
export const KIND_SHORT: Record<FrameKind, string> = { original: 'ORIG', ai: 'AI', rig: 'RIG', inbetween: 'IB', drawn: 'DRAW', coin: 'COIN' };

export interface ConsistencyReport {
  palette: number; // 0..1 colour palette overlap with the original
  sizeRatio: number; // height of the drawn character vs. original
  nearlyIdentical: boolean;
  summary: string;
}

export interface Frame {
  id: string;
  kind: FrameKind;
  label: string;
  role?: string;
  hold: number; // exposures (how many playback frames this drawing is held)
  note?: string;
  /** For rig / rig in-between frames: the pose the art layer is rendered from. */
  rigPose?: RigPose;
  /** How the in-between was made: 'rig' = real interpolated rig pose, 'ai' = AI drawing, 'blank' = for hand drawing. */
  ibMethod?: 'rig' | 'ai' | 'blank';
  aiPrompt?: string;
  correction?: string;
  keyIndex?: number;
  /** Frames generated together share a set id, so later generations don't split them up. */
  setId?: string;
  hasSource: boolean; // a pristine copy of the generated art is kept so "Restore generated" works
  consistency?: ConsistencyReport;
  bgRemoved?: boolean;
}

export type LayerName = 'art' | 'ink';

export interface GenSettings {
  poseCount: 2 | 3;
  intensity: Intensity;
  speed: Speed;
  consistency: number; // 0 = flexible pose, 100 = strict character match
  mode: 'ai' | 'rig';
  view: 'auto' | View;
  side?: 'right' | 'left';
  quality: 'low' | 'medium' | 'high';
}

export interface Assignment { id: 'anticipation' | 'action' | 'follow-through'; reflection: string; started: number }

export interface ProjectData {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: 'transparent' | 'white';
  createdAt: number;
  updatedAt: number;
  frames: Frame[];
  currentId: string;
  rig: CharacterRig | null;
  rigStyle: RigStyle | null;
  prompt: string;
  plan: MotionPlan | null;
  settings: GenSettings;
  aiConsent: boolean;
  assignment: Assignment | null;
  thumb?: string;
}

export const DEFAULT_SETTINGS: GenSettings = {
  poseCount: 3,
  intensity: 'normal',
  speed: 'normal',
  consistency: 75,
  mode: 'rig',
  view: 'auto',
  quality: 'medium',
};

export type Tool = 'draw' | 'eraser' | 'select' | 'move' | 'rig' | 'hand';
