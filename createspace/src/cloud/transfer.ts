import { kindOf, type FileKind } from './files';
import { assetUrl, type Assets, type Downloads } from './runtime';

/** Upload one file to cloud storage. Returns what the project needs to remember. */
export async function uploadBlob(assets: Assets, blob: Blob, kind: FileKind) {
  let result;
  try {
    result = await assets.upload(blob, { type: kind.type });
  } catch (e) {
    // Transient trouble: retry once, as the platform recommends.
    if ((e as { code?: string })?.code !== 'store_unavailable') throw e;
    await new Promise((r) => setTimeout(r, 800));
    result = await assets.upload(blob, { type: kind.type });
  }
  return { assetId: result.id, size: result.sizeBytes, type: result.contentType || kind.type };
}

/** Delete stored files no longer referenced. Failures are ignored: a leftover file only uses space. */
export async function deleteAssets(assets: Assets | null, ids: string[]) {
  if (!assets) return;
  for (const id of ids) await assets.delete(id).catch(() => undefined);
}

/** Fetch a stored file and offer it to the person as a download. */
export async function downloadAsset(downloads: Downloads, assetId: string, filename: string) {
  const res = await fetch(assetUrl(assetId));
  if (!res.ok) throw { code: 'missing', message: 'This file could not be found in storage.' };
  const blob = await res.blob();
  const kind = kindOf(filename);
  const name = kind ? filename : `${filename}.${extForType(blob.type) ?? 'bin'}`;
  return downloads.save({ filename: name, data: blob });
}

const extForType = (type: string) =>
  ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'application/json': 'json', 'font/ttf': 'ttf' })[type];
