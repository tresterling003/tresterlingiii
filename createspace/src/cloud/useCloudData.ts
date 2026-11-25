import { useCallback, useEffect, useRef, useState } from 'react';
import { useCloud } from './CloudProvider';
import { addFile, toDoc, toProject, type Project } from './projectModel';
import type { Db, DocRef } from './runtime';
import { readSuggestions, type Suggestion } from './suggestionModel';

export type LoadState = 'loading' | 'ready' | 'slow' | 'error';

/** Paths. Projects live in each person's private area, which nobody else (not even the site owner) can read. */
export const projectsPath = (uid: string) => `data/users/${uid}`;
export const SUGGESTIONS = 'suggestions';

/*
 * Writes to one document must happen one at a time. This keeps a queue per document path so
 * quick successive actions (e.g. uploading several files) never overlap or overwrite each other.
 */
const queues = new Map<string, Promise<unknown>>();
export function queueWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(path) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(path, next);
  return next;
}

/** Start a 10-second "taking a while" timer, as the platform recommends for first loads. */
function useSlowTimer(state: LoadState, setState: (s: LoadState) => void) {
  useEffect(() => {
    if (state !== 'loading') return;
    const t = setTimeout(() => setState('slow'), 10000);
    return () => clearTimeout(t);
  }, [state, setState]);
}

/** All of this person's projects, newest activity first, kept live. */
export function useProjects() {
  const { db, userId } = useCloud();
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  useSlowTimer(state, setState);

  useEffect(() => {
    if (!db || !userId) return;
    return db.collection(projectsPath(userId)).onSnapshot(
      (snap) => {
        const list = snap.docs
          // ids starting with "_" are app data stored beside projects (e.g. Business Dashboard)
          .filter((d) => d.exists && !d.id.startsWith('_'))
          .map((d) => toProject(d.id, d.data()))
          .filter((p): p is Project => !!p)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setProjects(list);
        if (!snap.metadata.fromCache) setState('ready');
        else setState((s) => (s === 'loading' ? 'loading' : s));
      },
      () => setState('error'),
    );
  }, [db, userId]);

  return { projects, state };
}

/** One project, kept live, plus a safe way to change it. */
export function useProject(projectId: string | undefined) {
  const { db, userId } = useCloud();
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [missing, setMissing] = useState(false);
  const latest = useRef<Project | null>(null);
  useSlowTimer(state, setState);

  const ref = db && userId && projectId ? db.collection(projectsPath(userId)).doc(projectId) : null;
  const path = ref?.path;

  useEffect(() => {
    if (!db || !userId || !projectId) return;
    const docRef = db.collection(projectsPath(userId)).doc(projectId);
    return docRef.onSnapshot(
      (snap) => {
        const p = snap.exists ? toProject(snap.id, snap.data()) : null;
        latest.current = p;
        setProject(p);
        if (!snap.metadata.fromCache) {
          setMissing(!p);
          setState('ready');
        }
      },
      () => setState('error'),
    );
  }, [db, userId, projectId]);

  /** Apply a change to the latest saved version of the project and save it. */
  const mutate = useCallback(
    (change: (p: Project) => Project) => {
      if (!ref || !path) return Promise.reject(new Error('Not connected'));
      return queueWrite(path, async () => {
        const base = latest.current;
        if (!base) throw new Error('Project not loaded');
        const next = change(base);
        if (next === base) return base;
        latest.current = next;
        setProject(next);
        await ref.set(toDoc(next));
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path],
  );

  const remove = useCallback(() => (ref && path ? queueWrite(path, () => ref.delete()) : Promise.resolve()), [path]); // eslint-disable-line react-hooks/exhaustive-deps

  return { project, state, missing, mutate, remove };
}

export async function saveNewProject(db: Db, uid: string, project: Project) {
  const ref = db.collection(projectsPath(uid)).doc(project.id);
  await queueWrite(ref.path, () => ref.set(toDoc(project)));
}

/** This person's own suggestions (live). */
export function useMySuggestions() {
  const { db, userId } = useCloud();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  useSlowTimer(state, setState);

  useEffect(() => {
    if (!db || !userId) return;
    return db.doc(`${SUGGESTIONS}/${userId}`).onSnapshot(
      (snap) => {
        setItems(readSuggestions(snap.exists ? snap.data() : undefined));
        if (!snap.metadata.fromCache) setState('ready');
      },
      () => setState('error'),
    );
  }, [db, userId]);

  return { items, state };
}

export interface InboxEntry extends Suggestion {
  authorId: string;
}

/** Every suggestion from everyone. Only the site owner can read these. */
export function useSuggestionInbox(enabled: boolean) {
  const { db } = useCloud();
  const [items, setItems] = useState<InboxEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  useSlowTimer(state, setState);

  useEffect(() => {
    if (!db || !enabled) return;
    return db.collection(SUGGESTIONS).onSnapshot(
      (snap) => {
        const all = snap.docs
          .filter((d) => d.exists)
          .flatMap((d) => readSuggestions(d.data()).map((s) => ({ ...s, authorId: d.id })))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItems(all);
        if (!snap.metadata.fromCache) setState('ready');
      },
      () => setState('error'),
    );
  }, [db, enabled]);

  return { items, state };
}

/** Read-modify-write one person's suggestion document. */
export function updateSuggestionDoc(db: Db, authorId: string, change: (items: Suggestion[]) => Suggestion[]) {
  const ref: DocRef = db.doc(`${SUGGESTIONS}/${authorId}`);
  return queueWrite(ref.path, async () => {
    const snap = await ref.get();
    const items = change(readSuggestions(snap.exists ? snap.data() : undefined));
    await ref.set({ items, updatedAt: new Date().toISOString() });
  });
}

/** Add an already-uploaded file to a project (used by tools that save their results into projects). */
export function addFileToProject(
  db: Db,
  uid: string,
  projectId: string,
  file: { name: string; type: string; assetId: string; size: number },
  folderId: string | null,
) {
  const ref = db.collection(projectsPath(uid)).doc(projectId);
  return queueWrite(ref.path, async () => {
    const snap = await ref.get();
    const project = snap.exists ? toProject(snap.id, snap.data()) : null;
    if (!project) throw { code: 'missing', message: 'That project no longer exists.' };
    const next = addFile(project, file, folderId, new Date().toISOString());
    await ref.set(toDoc(next));
    return next.files[next.files.length - 1].name;
  });
}
