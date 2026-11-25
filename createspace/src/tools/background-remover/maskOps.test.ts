import { describe, expect, it } from 'vitest';
import {
  combine,
  dominantBorderColor,
  feather,
  fitSize,
  keptShare,
  KEEP,
  paintBrush,
  paintStroke,
  refineProbability,
  REMOVE,
  selectSimilar,
  borderIndices,
} from './maskOps';

/** w×h image: white background with a red square from (x0,y0) to (x1,y1). */
function picture(w: number, h: number, [x0, y0, x1, y1]: number[], bg = [255, 255, 255]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      px.set(inside ? [220, 30, 30, 255] : [...bg, 255], p);
    }
  return px;
}

describe('color selection', () => {
  it('flood-fills the background from the edges but not the subject', () => {
    const img = picture(10, 10, [3, 3, 6, 6]);
    const { color, share } = dominantBorderColor(img, 10, 10);
    expect(color).toEqual([255, 255, 255]);
    expect(share).toBe(1);
    const sel = selectSimilar(img, 10, 10, borderIndices(10, 10), color, 30);
    expect(sel[0]).toBe(1);
    expect(sel[5 * 10 + 5]).toBe(0);
    expect(sel.reduce((a, b) => a + b, 0)).toBe(100 - 16);
  });

  it('contiguous selection stops at the subject; global selection does not', () => {
    // white inside a red ring: contiguous from outside can't reach the white center
    const w = 9;
    const img = picture(w, w, [2, 2, 6, 6]);
    img.set([255, 255, 255, 255], (4 * w + 4) * 4); // white pixel in the middle of the red square
    const outside = selectSimilar(img, w, w, [0], [255, 255, 255], 20, true);
    expect(outside[4 * w + 4]).toBe(0);
    const global = selectSimilar(img, w, w, [0], [255, 255, 255], 20, false);
    expect(global[4 * w + 4]).toBe(1);
  });

  it('respects tolerance', () => {
    const img = picture(4, 1, [2, 0, 3, 0], [250, 250, 250]);
    expect(selectSimilar(img, 4, 1, [0], [255, 255, 255], 5).slice(0, 2)).toEqual(new Uint8Array([0, 0]));
    expect(selectSimilar(img, 4, 1, [0], [255, 255, 255], 20).slice(0, 2)).toEqual(new Uint8Array([1, 1]));
  });
});

describe('brushes and overrides', () => {
  it('paints a round brush and reports the changed area', () => {
    const o = new Uint8Array(100);
    const rect = paintBrush(o, 10, 10, 5, 5, 2, REMOVE);
    expect(rect).toEqual({ x: 3, y: 3, w: 5, h: 5 });
    expect(o[5 * 10 + 5]).toBe(REMOVE);
    expect(o[3 * 10 + 3]).toBe(0); // corner of the box is outside the circle
  });

  it('strokes leave no gaps', () => {
    const o = new Uint8Array(100 * 10);
    paintStroke(o, 100, 10, [2, 5], [97, 5], 1, KEEP);
    for (let x = 2; x <= 97; x++) expect(o[5 * 100 + x]).toBe(KEEP);
  });

  it('overrides win over the automatic mask', () => {
    const base = new Uint8Array([255, 0, 128, 255]);
    const o = new Uint8Array([REMOVE, KEEP, 0, 0]);
    expect(Array.from(combine(base, o))).toEqual([0, 255, 128, 255]);
  });
});

describe('AI mask refinement and edges', () => {
  it('maps probabilities to alpha, stricter with more cleanup', () => {
    const p = new Uint8Array([0, 60, 128, 200, 255]);
    const soft = refineProbability(p, 0);
    const strict = refineProbability(p, 80);
    expect(soft[0]).toBe(0);
    expect(soft[4]).toBe(255);
    expect(strict[2]).toBeLessThan(soft[2]);
  });

  it('feathering softens a hard edge but keeps solid areas', () => {
    const w = 20;
    const m = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 10; x < w; x++) m[y * w + x] = 255;
    const f = feather(m, w, w, 2);
    expect(f[10 * w + 0]).toBe(0);
    expect(f[10 * w + 19]).toBe(255);
    expect(f[10 * w + 10]).toBeGreaterThan(0);
    expect(f[10 * w + 10]).toBeLessThan(255);
    expect(feather(m, w, w, 0)).toBe(m);
  });

  it('measures kept share and fits sizes', () => {
    expect(keptShare(new Uint8Array([255, 0, 200, 10]))).toBe(0.5);
    expect(fitSize(6000, 3000, 2500)).toEqual({ w: 2500, h: 1250, scaled: true });
    expect(fitSize(800, 600, 2500)).toEqual({ w: 800, h: 600, scaled: false });
  });
});
