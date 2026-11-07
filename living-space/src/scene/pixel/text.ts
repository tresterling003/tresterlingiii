"use client";

/**
 * Hard-edged pixel text. Glyphs are drawn with the pixel font into a tiny canvas,
 * then the alpha is thresholded so there's no anti-aliasing — every letter sits on
 * the same pixel grid as the art.
 */
export const PIXEL_FONT = '"Pixelify Sans"';

const cache = new Map<string, HTMLCanvasElement>();

export interface TextStyle {
  size: number; // canvas pixels
  color: string;
  weight?: 400 | 500 | 600 | 700;
  align?: "left" | "center" | "right";
}

function glyphs(str: string, s: TextStyle): HTMLCanvasElement {
  const key = `${str}|${s.size}|${s.color}|${s.weight ?? 500}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const font = `${s.weight ?? 500} ${s.size}px ${PIXEL_FONT}`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  const w = Math.max(1, Math.ceil(m.measureText(str).width) + 2);
  const h = Math.ceil(s.size * 1.5);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = s.color;
  ctx.fillText(str, 1, Math.round(s.size * 1.1));
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] >= 120 ? 255 : 0;
  ctx.putImageData(d, 0, 0);
  if (cache.size > 600) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
  return c;
}

export function textWidth(str: string, s: TextStyle) {
  return glyphs(str, s).width - 2;
}

/** Draw at canvas-pixel coords; (x, y) is the left/centre/right edge and the text's top. */
export function drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, s: TextStyle) {
  if (!str) return;
  const g = glyphs(str, s);
  const dx = s.align === "center" ? Math.round(x - (g.width - 2) / 2) : s.align === "right" ? Math.round(x - (g.width - 2)) : Math.round(x);
  ctx.drawImage(g, dx - 1, Math.round(y - s.size * 0.25));
}

/** Truncate with an ellipsis to fit `max` pixels. */
export function fit(str: string, max: number, s: TextStyle): string {
  if (textWidth(str, s) <= max) return str;
  let t = str;
  while (t.length > 1 && textWidth(t + "…", s) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/** Greedy word wrap by measured pixel width. */
export function wrapPx(str: string, max: number, lines: number, s: TextStyle): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of str.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, s) <= max) cur = next;
    else {
      if (cur) out.push(cur);
      cur = textWidth(word, s) <= max ? word : fit(word, max, s);
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = fit(kept[lines - 1] + "…", max, s);
    return kept;
  }
  return out;
}

export function clearTextCache() {
  cache.clear();
}
