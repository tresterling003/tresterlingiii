// Built-in demonstration characters. They are rigged, so every pose they produce is a real rig pose.
import { ctx2d, makeCanvas } from './raster/image';
import { DEFAULT_STICK, PIP_STYLE, renderRig, type RigStyle } from './rig/render';
import { defaultRig, type CharacterRig } from './rig/skeleton';

export type DemoId = 'sticks' | 'pip';
export const DEMOS: { id: DemoId; name: string; blurb: string }[] = [
  { id: 'sticks', name: 'Sticks', blurb: 'Classic stick figure — the easiest way to learn key poses.' },
  { id: 'pip', name: 'Pip', blurb: 'A simple shape-built cartoon character with clothes and colours.' },
];

export function createDemo(id: DemoId, W: number, H: number): { name: string; rig: CharacterRig; style: RigStyle; art: HTMLCanvasElement } {
  const rig = defaultRig(W, H, H * 0.6, 'side');
  rig.anchorX = W * 0.42;
  const style: RigStyle = id === 'sticks' ? { ...DEFAULT_STICK, lineWidth: Math.round(H * 0.013) } : { ...PIP_STYLE };
  if (id === 'pip') rig.proportions = { ...rig.proportions, head: 0.11, spine: 0.27, thR: 0.2, thL: 0.2, shR: 0.2, shL: 0.2, shoulderW: 0.075, hipW: 0.04 };
  const art = makeCanvas(W, H);
  renderRig(ctx2d(art), rig, rig.rest, style);
  return { name: id === 'sticks' ? 'Sticks' : 'Pip', rig, style, art };
}
