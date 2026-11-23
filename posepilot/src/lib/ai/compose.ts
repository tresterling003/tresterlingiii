// Prepares reference images for the AI and maps the result back onto the project canvas.
// The character is cropped into a square (with room for arms/legs that move outward), so the model gets the
// most detail and the result can be placed back at exactly the same position and scale.
import { contentBBox, ctx2d, makeCanvas, type Rect } from '../raster/image';
import { renderGuide } from '../rig/render';
import { DEFAULT_PROPORTIONS, type CharacterRig, type RigPose } from '../rig/skeleton';

export const AI_SIZE = 1024;

export function referenceRegion(art: HTMLCanvasElement, extra: Rect[] = []): Rect {
  let b = contentBBox(art) ?? { x: art.width * 0.25, y: art.height * 0.1, w: art.width * 0.5, h: art.height * 0.8 };
  for (const r of extra) {
    const x0 = Math.min(b.x, r.x), y0 = Math.min(b.y, r.y);
    b = { x: x0, y: y0, w: Math.max(b.x + b.w, r.x + r.w) - x0, h: Math.max(b.y + b.h, r.y + r.h) - y0 };
  }
  const side = Math.max(b.w, b.h) * 1.4;
  return { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, w: side, h: side };
}

export function cropTo(src: HTMLCanvasElement, r: Rect, size = AI_SIZE, background: string | null = null): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, size, size);
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, size, size);
  return c;
}

/** A rig that roughly matches the drawing's bounding box, for characters that were never rigged. */
export function rigForBox(box: Rect): CharacterRig {
  return {
    proportions: { ...DEFAULT_PROPORTIONS },
    height: box.h * 0.97,
    anchorX: box.x + box.w / 2,
    groundY: box.y + box.h,
    rest: { angles: {} as CharacterRig['rest']['angles'], lean: 0, dx: 0, lift: 0, facing: 1, view: 'side', look: 0 },
  };
}

export function renderGuideImage(rig: CharacterRig, pose: RigPose, W: number, H: number, region: Rect): HTMLCanvasElement {
  const full = makeCanvas(W, H);
  renderGuide(ctx2d(full), rig, pose, Math.max(4, rig.height * 0.025));
  return cropTo(full, region, AI_SIZE, '#ffffff');
}

/** Place a generated square image back into the project canvas at the reference region. */
export function placeResult(result: HTMLCanvasElement, region: Rect, W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(result, 0, 0, result.width, result.height, region.x, region.y, region.w, region.h);
  return c;
}
