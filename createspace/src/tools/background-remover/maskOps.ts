/**
 * Pixel operations for the Background Remover (plain functions, unit-tested).
 *
 * Images are RGBA byte arrays (4 bytes per pixel). Masks are one byte per pixel:
 * 255 = keep, 0 = removed. "Overrides" record the person's own edits:
 * 0 = no edit, 1 = force keep, 2 = force remove. The final cut-out is the automatic mask
 * with overrides applied on top, so changing an automatic setting never wipes manual work.
 */

export const KEEP = 1;
export const REMOVE = 2;

/** Distance between two colors, 0 (same) to ~441 (black vs white). */
export const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) =>
  Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

/** Tolerance slider (0–100) to color distance. */
export const toleranceToDistance = (t: number) => (t / 100) * 180;

/**
 * Select pixels similar in color to the seeds.
 * - contiguous: grow outwards from the seeds (like a paint-bucket); otherwise match the whole image.
 * Returns 1 for selected pixels.
 */
export function selectSimilar(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  seeds: number[],
  target: [number, number, number],
  maxDistance: number,
  contiguous = true,
): Uint8Array {
  const out = new Uint8Array(w * h);
  const [tr, tg, tb] = target;
  const similar = (i: number) => {
    const p = i * 4;
    return rgba[p + 3] > 0 && colorDistance(rgba[p], rgba[p + 1], rgba[p + 2], tr, tg, tb) <= maxDistance;
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (similar(i)) out[i] = 1;
    return out;
  }
  const stack: number[] = [];
  for (const s of seeds) if (s >= 0 && s < w * h && !out[s] && similar(s)) (out[s] = 1), stack.push(s);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const n of neighbours) {
      if (n < 0 || n >= w * h || out[n]) continue;
      if (similar(n)) {
        out[n] = 1;
        stack.push(n);
      }
    }
  }
  return out;
}

/** Indices of every edge pixel. */
export function borderIndices(w: number, h: number): number[] {
  const idx: number[] = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  return idx;
}

/** The most common color around the image edges (likely the background), with its share of the edge. */
export function dominantBorderColor(rgba: Uint8ClampedArray, w: number, h: number): { color: [number, number, number]; share: number } {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const border = borderIndices(w, h);
  for (const i of border) {
    const p = i * 4;
    // bucket colors coarsely so slight noise still counts together
    const key = ((rgba[p] >> 4) << 8) | ((rgba[p + 1] >> 4) << 4) | (rgba[p + 2] >> 4);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += rgba[p];
    c.g += rgba[p + 1];
    c.b += rgba[p + 2];
    counts.set(key, c);
  }
  let best = { n: 0, r: 0, g: 0, b: 0 };
  for (const c of counts.values()) if (c.n > best.n) best = c;
  return { color: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)], share: best.n / border.length };
}

/** Paint a round brush into the override layer. Returns the changed rectangle (or null). */
export function paintBrush(
  overrides: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  value: typeof KEEP | typeof REMOVE,
): { x: number; y: number; w: number; h: number } | null {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  if (x0 > x1 || y0 > y1) return null;
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) overrides[y * w + x] = value;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Paint a line of brush dabs between two points (so fast strokes have no gaps). */
export function paintStroke(
  overrides: Uint8Array,
  w: number,
  h: number,
  from: [number, number],
  to: [number, number],
  radius: number,
  value: typeof KEEP | typeof REMOVE,
) {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius / 2)));
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const r = paintBrush(overrides, w, h, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, radius, value);
    if (r) rect = rect ? unionRect(rect, r) : r;
  }
  return rect;
}

export const unionRect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Combine the automatic mask with manual overrides. */
export function combine(base: Uint8Array, overrides: Uint8Array): Uint8Array {
  const out = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = overrides[i] === KEEP ? 255 : overrides[i] === REMOVE ? 0 : base[i];
  return out;
}

/**
 * Turn the AI's soft "how likely is this the subject" map (0–255) into a mask.
 * cleanup 0–100: higher removes more faint background and makes edges crisper.
 */
export function refineProbability(prob: Uint8Array, cleanup: number): Uint8Array {
  const low = 10 + cleanup * 1.6; // 10..170
  const high = Math.min(255, low + 90 - cleanup * 0.6); // band narrows as cleanup rises
  const out = new Uint8Array(prob.length);
  for (let i = 0; i < prob.length; i++) {
    const v = (prob[i] - low) / (high - low);
    out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  return out;
}

/** Soften mask edges with a fast blur of the given radius (two box-blur passes ≈ smooth falloff). */
export function feather(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius < 1) return mask;
  let src = Float32Array.from(mask);
  const tmp = new Float32Array(mask.length);
  const r = Math.round(radius);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * r + 1);
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    // vertical
    const next = new Float32Array(mask.length);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        next[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    src = next;
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(src[i]);
  return out;
}

/** Share of the image that is kept (for status text and tests). */
export const keptShare = (mask: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) n++;
  return n / mask.length;
};

/** Fit an image inside a maximum long side, keeping its shape. */
export function fitSize(w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scaled: scale < 1 };
}
