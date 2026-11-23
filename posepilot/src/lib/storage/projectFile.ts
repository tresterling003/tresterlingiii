// Portable project file (.posepilot = a ZIP with project.json and PNG layers). Students can hand it in,
// move it to another Chromebook, or keep a backup outside the browser.
import JSZip from 'jszip';
import { blobToCanvas, canvasToBlob } from '../raster/image';

export const PROJECT_FILE_VERSION = 1;

export interface LayerSet { art: HTMLCanvasElement; ink: HTMLCanvasElement; source: HTMLCanvasElement | null }

export async function writeProjectFile<T extends { frames: { id: string }[] }>(data: T, layers: (id: string) => LayerSet | undefined): Promise<Blob> {
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify({ format: 'posepilot', version: PROJECT_FILE_VERSION, project: data }, null, 1));
  for (const f of data.frames) {
    const l = layers(f.id);
    if (!l) continue;
    zip.file(`layers/${f.id}/art.png`, await canvasToBlob(l.art));
    zip.file(`layers/${f.id}/ink.png`, await canvasToBlob(l.ink));
    if (l.source) zip.file(`layers/${f.id}/source.png`, await canvasToBlob(l.source));
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function readProjectFile<T extends { frames: { id: string }[]; width: number; height: number }>(file: Blob): Promise<{ data: T; layers: Map<string, Partial<LayerSet>> }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a PosePilot project (.posepilot).');
  }
  const meta = zip.file('project.json');
  if (!meta) throw new Error('This file is not a PosePilot project (project.json is missing).');
  const parsed = JSON.parse(await meta.async('string'));
  if (parsed.format !== 'posepilot' || !parsed.project) throw new Error('This file is not a PosePilot project.');
  if (parsed.version > PROJECT_FILE_VERSION) throw new Error('This project was saved by a newer version of PosePilot.');
  const data = parsed.project as T;
  const layers = new Map<string, Partial<LayerSet>>();
  for (const f of data.frames) {
    const set: Partial<LayerSet> = {};
    for (const name of ['art', 'ink', 'source'] as const) {
      const entry = zip.file(`layers/${f.id}/${name}.png`);
      if (entry) set[name] = await blobToCanvas(await entry.async('blob'));
    }
    layers.set(f.id, set);
  }
  return { data, layers };
}
