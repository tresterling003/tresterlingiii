// Frame compositing and PNG-sequence export. Exported images never include UI (onion skins, rig handles,
// checkerboard): they are composited fresh from the frame layers.
import JSZip from 'jszip';
import { canvasToBlob, ctx2d, makeCanvas } from '../raster/image';

export interface ComposeLayers { art: HTMLCanvasElement | null; ink: HTMLCanvasElement | null }
export interface ComposeOptions { includeArt: boolean; includeInk: boolean; background: 'transparent' | 'white'; scale: number }

export function composite(l: ComposeLayers, W: number, H: number, o: ComposeOptions): HTMLCanvasElement {
  const c = makeCanvas(W * o.scale, H * o.scale);
  const g = ctx2d(c);
  g.imageSmoothingQuality = 'high';
  if (o.background === 'white') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
  }
  if (o.includeArt && l.art) g.drawImage(l.art, 0, 0, c.width, c.height);
  if (o.includeInk && l.ink) g.drawImage(l.ink, 0, 0, c.width, c.height);
  return c;
}

export const frameFileName = (n: number, prefix = 'frame') => `${prefix}_${String(n).padStart(4, '0')}.png`;

/** Turn a list of drawings with holds into the list of output frames (a drawing held 3 times appears 3 times). */
export function expandHolds<T extends { hold: number }>(frames: T[], useHolds: boolean): T[] {
  const out: T[] = [];
  for (const f of frames) for (let i = 0; i < (useHolds ? Math.max(1, Math.round(f.hold)) : 1); i++) out.push(f);
  return out;
}

export function harmonyReadme(fps: number, count: number, W: number, H: number, useHolds: boolean) {
  return [
    'PosePilot PNG sequence',
    '======================',
    `${count} frames · ${W}×${H} px · intended playback ${fps} fps`,
    useHolds
      ? 'Holds are already expanded: import every image as one frame each.'
      : 'One image per drawing (holds NOT expanded): extend exposures in Harmony to match your timing.',
    '',
    'Import into Toon Boom Harmony',
    '1. Scene > Scene Settings: set the frame rate to ' + fps + ' fps (and resolution if needed).',
    '2. File > Import > Images… and choose all the frame_####.png files.',
    '3. Choose "Create a single layer" (one drawing layer), and keep "Vectorize" off to keep the bitmap lines.',
    '4. The images land on consecutive frames in the Timeline/Xsheet, in number order.',
    '5. Add a new drawing layer above to clean up or trace, using onion skin.',
    '',
    'Transparency is preserved, so you can put your own background layer underneath.',
  ].join('\n');
}

export async function buildSequenceZip(
  images: HTMLCanvasElement[],
  opts: { fps: number; useHolds: boolean; W: number; H: number; extras?: Record<string, string> },
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder('frames')!;
  for (let i = 0; i < images.length; i++) {
    folder.file(frameFileName(i + 1), await canvasToBlob(images[i]));
    onProgress?.(i + 1, images.length);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive on slow devices
  }
  zip.file('HOW_TO_IMPORT_INTO_HARMONY.txt', harmonyReadme(opts.fps, images.length, images[0]?.width ?? opts.W, images[0]?.height ?? opts.H, opts.useHolds));
  for (const [name, text] of Object.entries(opts.extras || {})) zip.file(name, text);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeName = (s: string) => s.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'posepilot';
