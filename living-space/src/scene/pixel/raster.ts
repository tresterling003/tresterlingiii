"use client";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Retro pixel pipeline.
 *
 * Every piece of room art is still authored as vector SVG (see ../*.tsx), but it is
 * rasterised at a deliberately low resolution — one canvas pixel per PX world units —
 * and the canvas is scaled up with nearest-neighbour sampling. The result is a real
 * pixel grid shared by the whole scene, on every browser, including iOS Safari.
 */
export const PX = 3;

/** The world rectangle the canvas covers (room + bleed), aligned to the pixel grid. */
export const STAGE = { x: -702, y: -495, w: 3003, h: 1890 } as const;
export const STAGE_PX = { w: STAGE.w / PX, h: STAGE.h / PX } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sprite {
  img: HTMLCanvasElement;
  /** World position of the sprite's top-left, aligned to the pixel grid. */
  x: number;
  y: number;
}

const snapDown = (v: number) => Math.floor(v / PX) * PX;
const snapUp = (v: number) => Math.ceil(v / PX) * PX;

/** World → canvas pixel. */
export const px = (worldX: number, axis: "x" | "y") => Math.round((worldX - (axis === "x" ? STAGE.x : STAGE.y)) / PX);

/** Remove anti-aliased alpha so sprite edges are hard pixels (no soft halo against other art). */
function hardenAlpha(c: HTMLCanvasElement, cut = 110) {
  const ctx = c.getContext("2d")!;
  try {
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= cut ? 255 : 0;
    ctx.putImageData(d, 0, 0);
  } catch {
    /* A browser that taints SVG-sourced canvases just keeps soft edges. */
  }
}

export async function rasterize(el: ReactElement, rect: Rect, opts: { harden?: boolean } = {}): Promise<Sprite> {
  const x = snapDown(rect.x);
  const y = snapDown(rect.y);
  const w = snapUp(rect.x + rect.w) - x;
  const h = snapUp(rect.y + rect.h) - y;
  const pw = w / PX;
  const ph = h / PX;
  const svg = renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: pw, height: ph, viewBox: `${x} ${y} ${w} ${h}` }, el));
  const img = new Image();
  img.decoding = "async";
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  c.getContext("2d")!.drawImage(img, 0, 0, pw, ph);
  if (opts.harden !== false) hardenAlpha(c);
  return { img: c, x, y };
}

/**
 * Keyed sprite cache. `get` returns the sprite for a key if ready; otherwise it starts
 * rasterising and returns the slot's previous sprite so nothing flickers while it loads.
 */
export class SpriteCache {
  private ready = new Map<string, Sprite>();
  private pending = new Set<string>();
  private lastForSlot = new Map<string, Sprite>();
  private order: string[] = [];
  constructor(private onReady: () => void, private max = 400) {}

  get(slot: string, key: string, make: () => { el: ReactElement; rect: Rect; harden?: boolean }): Sprite | null {
    const k = `${slot}|${key}`;
    const hit = this.ready.get(k);
    if (hit) {
      this.lastForSlot.set(slot, hit);
      return hit;
    }
    if (!this.pending.has(k)) {
      this.pending.add(k);
      const { el, rect, harden } = make();
      rasterize(el, rect, { harden })
        .then((s) => {
          this.ready.set(k, s);
          this.order.push(k);
          if (this.order.length > this.max) this.ready.delete(this.order.shift()!);
          this.onReady();
        })
        .catch(() => undefined)
        .finally(() => this.pending.delete(k));
    }
    return this.lastForSlot.get(slot) ?? null;
  }

  /** Synchronous check used to fade the room in once the backdrop exists. */
  has(slot: string) {
    return this.lastForSlot.has(slot);
  }
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite | null, dx = 0, dy = 0) {
  if (!s) return;
  ctx.drawImage(s.img, px(s.x, "x") + dx, px(s.y, "y") + dy);
}
