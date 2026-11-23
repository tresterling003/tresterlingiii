// Cheap, honest heuristics comparing a generated pose with the original drawing.
// They cannot judge anatomy or identity; they only flag obvious problems (wrong colours, wrong size,
// or a "pose" that is really just the original image again).
import { contentBBox, downscale } from '../raster/image';
import type { ConsistencyReport } from '../../state/types';

function palette(c: HTMLCanvasElement): Map<number, number> {
  const s = downscale(c, 96);
  const d = s.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, s.width, s.height).data;
  const m = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) continue; // ignore paper white
    const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    m.set(k, (m.get(k) || 0) + 1);
    total++;
  }
  m.forEach((v, k) => m.set(k, v / Math.max(1, total)));
  return m;
}

function signature(c: HTMLCanvasElement): Float32Array {
  const s = downscale(c, 48);
  const d = s.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, s.width, s.height).data;
  const out = new Float32Array(d.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4 + 3] / 255) * (1 - (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765);
  return out;
}

export function compareToOriginal(original: HTMLCanvasElement, generated: HTMLCanvasElement): ConsistencyReport {
  const pa = palette(original), pb = palette(generated);
  let overlap = 0;
  pa.forEach((v, k) => (overlap += Math.min(v, pb.get(k) || 0)));
  const ba = contentBBox(original), bb = contentBBox(generated);
  const sizeRatio = ba && bb ? bb.h / ba.h : 0;
  const sa = signature(original), sb = signature(generated);
  let diff = 0;
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) diff += Math.abs(sa[i] - sb[i]);
  const nearlyIdentical = diff / sa.length < 0.012;
  const bits: string[] = [];
  bits.push(overlap > 0.6 ? 'colours match well' : overlap > 0.35 ? 'colours partly match' : 'colours look different');
  if (sizeRatio && (sizeRatio < 0.55 || sizeRatio > 1.6)) bits.push('size changed a lot');
  if (nearlyIdentical) bits.push('pose looks almost unchanged — try regenerating');
  return { palette: overlap, sizeRatio, nearlyIdentical, summary: bits.join(' · ') };
}
