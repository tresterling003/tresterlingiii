/**
 * Which files can be stored in the cloud, and helpers for showing them.
 *
 * The hosting platform's storage accepts a fixed set of types (and the browser download
 * feature a fixed set of extensions). This list is exactly the types that work for BOTH,
 * so anything uploaded can always be downloaded again.
 */
export interface FileKind {
  ext: string;
  type: string;
  label: string;
  group: 'image' | 'video' | 'document' | 'text' | 'font';
}

export const FILE_KINDS: FileKind[] = [
  { ext: 'png', type: 'image/png', label: 'PNG image', group: 'image' },
  { ext: 'jpg', type: 'image/jpeg', label: 'JPEG image', group: 'image' },
  { ext: 'jpeg', type: 'image/jpeg', label: 'JPEG image', group: 'image' },
  { ext: 'gif', type: 'image/gif', label: 'GIF', group: 'image' },
  { ext: 'webp', type: 'image/webp', label: 'WebP image', group: 'image' },
  { ext: 'svg', type: 'image/svg+xml', label: 'SVG', group: 'image' },
  { ext: 'mp4', type: 'video/mp4', label: 'MP4 video', group: 'video' },
  { ext: 'webm', type: 'video/webm', label: 'WebM video', group: 'video' },
  { ext: 'pdf', type: 'application/pdf', label: 'PDF', group: 'document' },
  { ext: 'txt', type: 'text/plain', label: 'Text', group: 'text' },
  { ext: 'md', type: 'text/markdown', label: 'Markdown', group: 'text' },
  { ext: 'csv', type: 'text/csv', label: 'CSV', group: 'text' },
  { ext: 'json', type: 'application/json', label: 'JSON', group: 'text' },
  { ext: 'ttf', type: 'font/ttf', label: 'Font', group: 'font' },
];

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_SVG_BYTES = 2 * 1024 * 1024;

export const ACCEPT_ATTR = FILE_KINDS.map((k) => '.' + k.ext).join(',');
export const SUPPORTED_LIST = [...new Set(FILE_KINDS.map((k) => k.ext.toUpperCase()))].filter((e) => e !== 'JPEG').join(', ');

export const extensionOf = (name: string) => {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
};

export const kindOf = (name: string): FileKind | undefined => FILE_KINDS.find((k) => k.ext === extensionOf(name));

export type FileCheck = { ok: true; kind: FileKind } | { ok: false; reason: string };

/** Check a file before uploading, with a message people can act on. */
export function checkFile(file: { name: string; size: number }): FileCheck {
  const kind = kindOf(file.name);
  if (!kind) {
    const ext = extensionOf(file.name);
    return {
      ok: false,
      reason: `${ext ? `.${ext} files` : 'Files without an extension'} can’t be stored yet. Supported: ${SUPPORTED_LIST}.`,
    };
  }
  if (file.size === 0) return { ok: false, reason: 'This file is empty.' };
  const limit = kind.ext === 'svg' ? MAX_SVG_BYTES : MAX_BYTES;
  if (file.size > limit) return { ok: false, reason: `Too big: the limit is ${formatBytes(limit)} per ${kind.ext === 'svg' ? 'SVG' : 'file'}.` };
  return { ok: true, kind };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24 && d.getDate() === now.getDate()) return `today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
