import { useSyncExternalStore } from 'react';
import type { BookDetail, Chapter } from './api';

export type Bookmark = { id: string; ch: number; pos: number; at: number; note: string };

export type SavedBook = {
  id: string;
  title: string;
  author: string;
  cover: string;
  chapters: Chapter[];
  total: number;
  addedAt: number;
  lastPlayedAt: number; // 0 = never played
  ch: number;
  pos: number;
  finished: boolean;
  bookmarks: Bookmark[];
};

export type State = {
  books: Record<string, SavedBook>;
  currentId: string | null;
  speed: number;
  english: boolean;
};

const KEY = 'earshot:v1';
const initial: State = { books: {}, currentId: null, speed: 1, english: true };

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initial;
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode: keep working in memory */
  }
}

export function getState() {
  return state;
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

function patchBook(id: string, fn: (b: SavedBook) => SavedBook) {
  setState((s) => (s.books[id] ? { ...s, books: { ...s.books, [id]: fn(s.books[id]) } } : s));
}

/** Adds a book to the shelf, or refreshes its chapter list if already there. */
export function saveBook(d: BookDetail): SavedBook {
  const existing = state.books[d.id];
  const book: SavedBook = existing
    ? { ...existing, chapters: d.chapters.length ? d.chapters : existing.chapters, total: d.total, cover: d.cover }
    : {
        id: d.id,
        title: d.title,
        author: d.author,
        cover: d.cover,
        chapters: d.chapters,
        total: d.total,
        addedAt: Date.now(),
        lastPlayedAt: 0,
        ch: 0,
        pos: 0,
        finished: false,
        bookmarks: [],
      };
  setState((s) => ({ ...s, books: { ...s.books, [d.id]: book } }));
  return book;
}

export function removeBook(id: string) {
  setState((s) => {
    const books = { ...s.books };
    delete books[id];
    return { ...s, books, currentId: s.currentId === id ? null : s.currentId };
  });
}

export function saveProgress(id: string, ch: number, pos: number) {
  patchBook(id, (b) => ({ ...b, ch, pos: Math.max(0, Math.floor(pos)), lastPlayedAt: Date.now() }));
}

export function setFinished(id: string, finished: boolean) {
  patchBook(id, (b) => ({ ...b, finished, ...(finished ? {} : { ch: 0, pos: 0 }) }));
}

export function addBookmark(id: string, ch: number, pos: number) {
  const bm: Bookmark = { id: Math.random().toString(36).slice(2, 10), ch, pos: Math.floor(pos), at: Date.now(), note: '' };
  patchBook(id, (b) => ({ ...b, bookmarks: [...b.bookmarks, bm] }));
  return bm;
}

export function editBookmark(id: string, bmId: string, note: string) {
  patchBook(id, (b) => ({ ...b, bookmarks: b.bookmarks.map((m) => (m.id === bmId ? { ...m, note } : m)) }));
}

export function deleteBookmark(id: string, bmId: string) {
  patchBook(id, (b) => ({ ...b, bookmarks: b.bookmarks.filter((m) => m.id !== bmId) }));
}

/** Seconds listened so far across the whole book. */
export function elapsedInBook(b: Pick<SavedBook, 'chapters' | 'ch' | 'pos'>, ch = b.ch, pos = b.pos) {
  let t = 0;
  for (let i = 0; i < ch && i < b.chapters.length; i++) t += b.chapters[i].dur;
  return t + pos;
}

export function progress(b: SavedBook) {
  if (b.finished) return 1;
  return b.total ? Math.min(1, elapsedInBook(b) / b.total) : 0;
}
