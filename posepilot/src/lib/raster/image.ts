// Canvas/bitmap helpers: loading uploads safely, background detection & separation, bounding boxes.

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_SOURCE_EDGE = 2400; // big photos are scaled down on import to protect low-memory Chromebooks

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: false })!;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

export class UploadError extends Error {}

/** Validate and decode an uploaded image file. Throws UploadError with a student-friendly message. */
export async function loadImageFile(file: File): Promise<HTMLCanvasElement> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new UploadError(`"${file.name}" isn't a PNG, JPG or WebP image. Save your drawing in one of those formats and try again.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`"${file.name}" is larger than 25 MB. Export a smaller version of your drawing and try again.`);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new UploadError(`"${file.name}" couldn't be opened. The file may be damaged — try exporting it again.`);
  }
  const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bmp.width, bmp.height));
  const c = makeCanvas(bmp.width * scale, bmp.height * scale);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export async function dataUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  ctx2d(c).drawImage(img, 0, 0);
  return c;
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const c = makeCanvas(bmp.width, bmp.height);
  ctx2d(c).drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), type));
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Bounding box of visible pixels (alpha > threshold). Null if the canvas is empty. */
export function contentBBox(c: HTMLCanvasElement, alphaThreshold = 8): Rect | null {
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > alphaThreshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface BackgroundInfo {
  hasTransparency: boolean;
  /** A plain border colour was found (likely paper/white background). */
  plainBackground: { r: number; g: number; b: number } | null;
}

/** Look at the border pixels to decide whether the drawing sits on a plain background. */
export function analyzeBackground(c: HTMLCanvasElement): BackgroundInfo {
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let transparent = 0;
  const samples: number[][] = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 250) transparent++;
    else samples.push([d[i], d[i + 1], d[i + 2]]);
  };
  for (let x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
  const total = transparent + samples.length;
  const hasTransparency = transparent / total > 0.3 || anyTransparent(d);
  if (hasTransparency || samples.length === 0) return { hasTransparency, plainBackground: null };
  const avg = samples.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]).map((v) => v / samples.length);
  const close = samples.filter((s) => Math.abs(s[0] - avg[0]) + Math.abs(s[1] - avg[1]) + Math.abs(s[2] - avg[2]) < 60).length;
  return {
    hasTransparency: false,
    plainBackground: close / samples.length > 0.85 ? { r: Math.round(avg[0]), g: Math.round(avg[1]), b: Math.round(avg[2]) } : null,
  };
}

function anyTransparent(d: Uint8ClampedArray) {
  const n = d.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) if (d[i * 4 + 3] < 250) return true;
  return false;
}

/**
 * Remove a plain background by flood-filling from the image border only. Enclosed areas of the same colour
 * (e.g. white eyes or a white shirt surrounded by outlines) are kept. Returns a NEW canvas; the input is untouched.
 */
export function removePlainBackground(c: HTMLCanvasElement, bg: { r: number; g: number; b: number }, tolerance = 40): HTMLCanvasElement {
  const { width: w, height: h } = c;
  const out = cloneCanvas(c);
  const g = out.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const dist = (i: number) => Math.abs(d[i] - bg.r) + Math.abs(d[i + 1] - bg.g) + Math.abs(d[i + 2] - bg.b);
  const tol = tolerance * 3;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    const dd = dist(i);
    if (dd > tol) continue;
    // soft edge: pixels close to the tolerance keep part of their alpha (anti-aliased lines stay smooth)
    d[i + 3] = dd < tol * 0.6 ? 0 : Math.min(d[i + 3], Math.round(((dd - tol * 0.6) / (tol * 0.4)) * 255));
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** Fit an image inside a W×H canvas (never upscaling more than `maxUpscale`), centred, with a margin. */
export function fitInto(src: HTMLCanvasElement, W: number, H: number, margin = 0.06, maxUpscale = 1.5): { canvas: HTMLCanvasElement; rect: Rect } {
  const scale = Math.min(maxUpscale, (W * (1 - margin * 2)) / src.width, (H * (1 - margin * 2)) / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  const rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, rect.x, rect.y, w, h);
  return { canvas: c, rect };
}

/**
 * The colour of a drawing's LINES — used to match a stick-figure rig to the student's line colour.
 * Outlines are usually the darkest frequent colour, so dark pixels are preferred over big filled areas.
 */
export function dominantInkColor(c: HTMLCanvasElement): string {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const dark = new Map<number, number>();
  const any = new Map<number, number>();
  const step = Math.max(1, Math.floor(d.length / 4 / 60000));
  for (let p = 0; p < d.length / 4; p += step) {
    const i = p * 4;
    if (d[i + 3] < 128) continue;
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    if (lum > 200) continue;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    any.set(key, (any.get(key) || 0) + 1);
    if (lum < 90) dark.set(key, (dark.get(key) || 0) + 1);
  }
  const pick = (m: Map<number, number>) => {
    let best = -1, bestN = 0;
    m.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
    return { best, bestN };
  };
  const total = Array.from(any.values()).reduce((a, b) => a + b, 0);
  const dk = pick(dark);
  const best = dk.bestN > total * 0.02 ? dk.best : pick(any).best;
  if (best < 0) return '#1d1f24';
  const r = ((best >> 8) & 15) * 17, g = ((best >> 4) & 15) * 17, b = (best & 15) * 17;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Downscaled copy for thumbnails and cheap comparisons. */
export function downscale(src: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const s = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const c = makeCanvas(src.width * s, src.height * s);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'medium';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
