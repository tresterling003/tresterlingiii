// IndexedDB storage for user-supplied binary assets (GLB athletes), so they
// survive reloads and work offline. Small JSON data lives in localStorage.

const DB = 'fieldview-assets';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function putAsset(key: string, value: { name: string; data: ArrayBuffer } | null): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (value) tx.objectStore(STORE).put(value, key);
    else tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAsset(key: string): Promise<{ name: string; data: ArrayBuffer } | null> {
  try {
    const db = await open();
    const v = await new Promise<{ name: string; data: ArrayBuffer } | null>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as { name: string; data: ArrayBuffer }) ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return v;
  } catch {
    return null;
  }
}
