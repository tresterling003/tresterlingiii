import type { Downloads } from '@/cloud/runtime';

/**
 * Give the person a file. On the hosted link the platform's download feature is used (it asks the
 * person to confirm); elsewhere a normal browser download is started.
 */
export async function saveFile(blob: Blob, filename: string, downloads: Downloads | null) {
  if (downloads) return downloads.save({ filename, data: blob });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { status: 'saved' };
}
