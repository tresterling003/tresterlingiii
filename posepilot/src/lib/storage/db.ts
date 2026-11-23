// Local-only persistence in IndexedDB. Nothing here talks to a server.
const DB_NAME = 'posepilot';
const DB_VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked by another PosePilot tab.'));
    });
  }
  return dbp;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => T): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        let out: T;
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Storage transaction aborted (the device may be out of space).'));
        out = fn(t);
      }),
  );
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export interface StoredProjectSummary { id: string; name: string; updatedAt: number; frameCount: number; thumb?: string }

export async function listProjects(): Promise<StoredProjectSummary[]> {
  const all = await db().then((d) => reqP(d.transaction('projects').objectStore('projects').getAll()));
  return (all as { id: string; name: string; updatedAt: number; frames: unknown[]; thumb?: string }[])
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, frameCount: p.frames.length, thumb: p.thumb }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProjectRecord<T>(id: string): Promise<T | undefined> {
  return db().then((d) => reqP(d.transaction('projects').objectStore('projects').get(id))) as Promise<T | undefined>;
}

/** Atomically write the project record plus any changed layer bitmaps; remove deleted ones. */
export async function saveProjectRecord(record: { id: string }, blobs: Map<string, Blob>, removeKeys: string[] = []) {
  await tx(['projects', 'blobs'], 'readwrite', (t) => {
    t.objectStore('projects').put(record);
    const bs = t.objectStore('blobs');
    blobs.forEach((b, k) => bs.put(b, k));
    for (const k of removeKeys) bs.delete(k);
  });
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return db().then((d) => reqP(d.transaction('blobs').objectStore('blobs').get(key))) as Promise<Blob | undefined>;
}

export async function listBlobKeys(prefix: string): Promise<string[]> {
  const keys = (await db().then((d) => reqP(d.transaction('blobs').objectStore('blobs').getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'))))) as string[];
  return keys;
}

export async function deleteProject(id: string) {
  const keys = await listBlobKeys(`${id}/`);
  await tx(['projects', 'blobs'], 'readwrite', (t) => {
    t.objectStore('projects').delete(id);
    const bs = t.objectStore('blobs');
    for (const k of keys) bs.delete(k);
  });
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage || 0, quota: e.quota || 0 };
}
