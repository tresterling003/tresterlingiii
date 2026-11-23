// Coin Flip Assistant: a real 3D-style rotation of two flat drawings (front & back) rendered with 2D transforms.
// The coin face is squashed by cos(angle) along the flip axis and a rim is drawn for thickness, so
// no AI image is needed for each angle.
import { ctx2d, makeCanvas, type Rect } from './raster/image';
import { easings, type EasingId } from './rig/skeleton';

export interface CoinOptions {
  frames: number; // drawings to produce
  turns: number; // half-turns = sides shown; 1 turn = front→back→front
  axis: 'horizontal' | 'vertical'; // horizontal axis = flips toward/away from camera (top comes forward)
  direction: 1 | -1; // toward (1) or away from (-1) the viewer
  easing: EasingId;
  arc: number; // toss height as a fraction of canvas height (camera follows if 0)
  thickness: number; // rim thickness as a fraction of coin size
  rimColor: string;
  size: number; // coin diameter as a fraction of canvas height
}

export const DEFAULT_COIN: CoinOptions = { frames: 12, turns: 1, axis: 'horizontal', direction: 1, easing: 'easeInOut', arc: 0.25, thickness: 0.07, rimColor: '#b8892c', size: 0.32 };

export function renderCoinFrames(front: HTMLCanvasElement, back: HTMLCanvasElement, W: number, H: number, o: CoinOptions): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const D = H * o.size;
  for (let i = 0; i < o.frames; i++) {
    const t = o.frames === 1 ? 0 : i / (o.frames - 1);
    const angle = easings[o.easing](t) * o.turns * Math.PI * 2 * o.direction;
    const c = makeCanvas(W, H);
    const g = ctx2d(c);
    const cx = W / 2;
    const cy = H * 0.62 - Math.sin(Math.PI * t) * H * o.arc; // parabola-like toss
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const squash = Math.max(0.015, Math.abs(cos));
    const face = cos >= 0 ? front : back;
    const rim = Math.abs(sin) * D * o.thickness;
    g.save();
    g.translate(cx, cy);
    if (o.axis === 'vertical') g.rotate(Math.PI / 2);
    // rim (the coin's edge) offset toward the side that is turning away
    const off = (sin >= 0 ? 1 : -1) * (cos >= 0 ? 1 : -1) * rim;
    g.fillStyle = o.rimColor;
    g.beginPath();
    g.ellipse(0, off / 2, D / 2, (D / 2) * squash + Math.abs(off) / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, off, D / 2, (D / 2) * squash, 0, 0, Math.PI * 2);
    g.fill();
    // face, squashed along the flip axis; the back face is mirrored as it comes round
    g.save();
    g.scale(1, (cos >= 0 ? 1 : -1) * squash);
    g.drawImage(face, -D / 2, -D / 2, D, D);
    g.restore();
    // subtle shading as the face turns away from the light
    g.globalAlpha = (1 - squash) * 0.35;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(0, 0, D / 2, (D / 2) * squash, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    out.push(c);
  }
  return out;
}

/** Built-in demo coin faces so the tool can be tried without uploading art. */
export function demoCoinFace(side: 'front' | 'back', size = 512): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  grad.addColorStop(0, '#ffe9a3');
  grad.addColorStop(1, '#d9a63e');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = size * 0.03;
  g.strokeStyle = '#8a6216';
  g.stroke();
  g.beginPath();
  g.arc(r, r, r * 0.78, 0, Math.PI * 2);
  g.lineWidth = size * 0.012;
  g.stroke();
  g.fillStyle = '#8a6216';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (side === 'front') {
    g.font = `700 ${size * 0.42}px Inter, system-ui, sans-serif`;
    g.fillText('P', r, r * 1.04);
  } else {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.22 : r * 0.5;
      g.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  return c;
}

export function squareFromBox(src: HTMLCanvasElement, box: Rect | null): HTMLCanvasElement {
  const b = box ?? { x: 0, y: 0, w: src.width, h: src.height };
  const s = Math.max(b.w, b.h);
  const c = makeCanvas(512, 512);
  ctx2d(c).drawImage(src, b.x + b.w / 2 - s / 2, b.y + b.h / 2 - s / 2, s, s, 0, 0, 512, 512);
  return c;
}
