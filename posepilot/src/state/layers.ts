// Bitmap layers live outside React state (canvases are mutable and large). The store keeps a `bitmapVersion`
// counter that components watch to know when to repaint.
import { makeCanvas } from '../lib/raster/image';
import type { LayerName } from './types';

export interface FrameLayers { art: HTMLCanvasElement; ink: HTMLCanvasElement; source: HTMLCanvasElement | null }

const layers = new Map<string, FrameLayers>();
const dirty = new Set<string>(); // `${frameId}:${layer|source}`

export function ensureLayers(frameId: string, w: number, h: number): FrameLayers {
  let l = layers.get(frameId);
  if (!l) {
    l = { art: makeCanvas(w, h), ink: makeCanvas(w, h), source: null };
    layers.set(frameId, l);
  }
  return l;
}

export function getLayers(frameId: string): FrameLayers | undefined {
  return layers.get(frameId);
}

export function setLayers(frameId: string, l: FrameLayers) {
  layers.set(frameId, l);
}

export function clearAllLayers() {
  layers.clear();
  dirty.clear();
}

export function markDirty(frameId: string, layer: LayerName | 'source') {
  dirty.add(`${frameId}:${layer}`);
}

export function takeDirty(): string[] {
  const out = Array.from(dirty);
  dirty.clear();
  return out;
}

export function restoreDirty(keys: string[]) {
  keys.forEach((k) => dirty.add(k));
}

export function allLayerIds(): string[] {
  return Array.from(layers.keys());
}
