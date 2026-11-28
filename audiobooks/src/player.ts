import { useSyncExternalStore } from 'react';
import { getState, saveProgress, setFinished, setState, type SavedBook } from './store';

export type Sleep = { mode: 'off' } | { mode: 'timer'; endsAt: number; minutes: number } | { mode: 'chapter' };

export type PlayerState = {
  bookId: string | null;
  ch: number;
  time: number;
  duration: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  sleep: Sleep;
};

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const SKIP_BACK = 15;
export const SKIP_FORWARD = 30;

const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
if (audio) {
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  (window as unknown as { __earshotAudio: HTMLAudioElement }).__earshotAudio = audio;
}

let ps: PlayerState = {
  bookId: null,
  ch: 0,
  time: 0,
  duration: 0,
  playing: false,
  loading: false,
  error: null,
  sleep: { mode: 'off' },
};
const listeners = new Set<() => void>();
const emit = (patch: Partial<PlayerState>) => {
  ps = { ...ps, ...patch };
  listeners.forEach((l) => l());
};

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ps,
  );
}
export const getPlayer = () => ps;

const book = (): SavedBook | null => (ps.bookId ? getState().books[ps.bookId] ?? null : null);

// ---- source management -------------------------------------------------
let srcFor: string | null = null; // "bookId#ch" currently attached to <audio>
let pendingSeek: number | null = null;
let pausedAt = 0;
let lastSave = 0;
let sleepTimer: number | undefined;

function attach(b: SavedBook, ch: number, pos: number) {
  const c = b.chapters[ch];
  if (!c) return;
  srcFor = `${b.id}#${ch}`;
  pendingSeek = pos > 0 ? pos : null;
  // The media fragment starts playback near the saved spot on browsers that
  // honour it; loadedmetadata below corrects anything that does not.
  audio.src = pos > 1 ? `${c.url}#t=${Math.floor(pos)}` : c.url;
  audio.playbackRate = getState().speed;
  emit({ loading: true, error: null });
}

/** Shows a book in the player without starting it (used on app start). */
export function cue(b: SavedBook) {
  emit({ bookId: b.id, ch: b.ch, time: b.pos, duration: b.chapters[b.ch]?.dur ?? 0, error: null });
  updateMediaSession();
}

/** Starts (or resumes) a book. Must be called from a tap so mobile browsers allow sound. */
export function playBook(b: SavedBook, ch = b.ch, pos = b.pos) {
  if (b.finished && ch === b.ch && pos === b.pos) {
    setFinished(b.id, false);
    ch = 0;
    pos = 0;
  }
  ch = Math.min(Math.max(0, ch), Math.max(0, b.chapters.length - 1));
  if (ps.bookId && ps.bookId !== b.id) persistNow();
  setState((s) => ({ ...s, currentId: b.id }));
  emit({ bookId: b.id, ch, time: pos, duration: b.chapters[ch]?.dur ?? 0 });
  saveProgress(b.id, ch, pos);
  attach(b, ch, pos);
  start();
  updateMediaSession();
}

function start() {
  const p = audio.play();
  if (p) p.catch((e: DOMException) => {
    if (e.name === 'NotAllowedError') emit({ playing: false, loading: false });
    else if (e.name !== 'AbortError') emit({ error: "Couldn't start playback.", loading: false });
  });
}

export function play() {
  const b = book();
  if (!b) return;
  if (srcFor !== `${b.id}#${ps.ch}`) {
    attach(b, ps.ch, ps.time);
  } else if (pausedAt && Date.now() - pausedAt > 60_000) {
    // Back after a break: replay a few seconds to pick the thread back up.
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
  start();
}

export function pause() {
  audio.pause();
}

export function toggle() {
  if (ps.playing || ps.loading) pause();
  else play();
}

export function seek(t: number) {
  const b = book();
  if (!b) return;
  t = Math.max(0, Math.min(t, (ps.duration || Infinity) - 0.5));
  if (srcFor === `${b.id}#${ps.ch}` && audio.readyState > 0) audio.currentTime = t;
  else pendingSeek = t;
  emit({ time: t });
  saveProgress(b.id, ps.ch, t);
  setPositionState();
}

export function skip(sec: number) {
  const b = book();
  if (!b) return;
  const t = ps.time + sec;
  if (t < 0 && ps.ch > 0 && ps.time < 3) {
    const prev = b.chapters[ps.ch - 1];
    goToChapter(ps.ch - 1, Math.max(0, prev.dur + t));
  } else if (ps.duration && t >= ps.duration - 0.5 && ps.ch < b.chapters.length - 1) {
    goToChapter(ps.ch + 1, 0);
  } else seek(t);
}

export function goToChapter(ch: number, pos = 0) {
  const b = book();
  if (!b || !b.chapters[ch]) return;
  const wasPlaying = ps.playing || ps.loading;
  emit({ ch, time: pos, duration: b.chapters[ch].dur });
  saveProgress(b.id, ch, pos);
  attach(b, ch, pos);
  if (wasPlaying) start();
  else {
    audio.pause();
    emit({ loading: false });
  }
  updateMediaSession();
}

export function setSpeed(r: number) {
  audio.playbackRate = r;
  setState((s) => ({ ...s, speed: r }));
  setPositionState();
}

export function setSleep(s: Sleep) {
  clearTimeout(sleepTimer);
  emit({ sleep: s });
  if (s.mode === 'timer') {
    const tick = () => {
      if (ps.sleep.mode !== 'timer') return;
      if (Date.now() >= ps.sleep.endsAt) {
        pause();
        emit({ sleep: { mode: 'off' } });
      } else sleepTimer = window.setTimeout(tick, 1000);
    };
    tick();
  }
}

/** Ejects the current book from the player (it stays on the shelf). */
export function eject() {
  persistNow();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  srcFor = null;
  setState((s) => ({ ...s, currentId: null }));
  emit({ bookId: null, playing: false, loading: false, time: 0, duration: 0, error: null });
}

export function persistNow() {
  if (ps.bookId && getState().books[ps.bookId]) saveProgress(ps.bookId, ps.ch, ps.time);
}

// ---- audio events --------------------------------------------------------
if (audio) {
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek != null && Math.abs(audio.currentTime - pendingSeek) > 2) audio.currentTime = pendingSeek;
    pendingSeek = null;
    if (isFinite(audio.duration) && audio.duration > 0) emit({ duration: audio.duration });
    setPositionState();
  });
  audio.addEventListener('playing', () => emit({ playing: true, loading: false, error: null }));
  audio.addEventListener('play', () => emit({ playing: true }));
  audio.addEventListener('waiting', () => emit({ loading: true }));
  audio.addEventListener('canplay', () => emit({ loading: false }));
  audio.addEventListener('pause', () => {
    pausedAt = Date.now();
    emit({ playing: false, loading: false });
    persistNow();
  });
  audio.addEventListener('timeupdate', () => {
    if (pendingSeek != null || srcFor !== `${ps.bookId}#${ps.ch}`) return;
    emit({ time: audio.currentTime });
    if (Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      persistNow();
      setPositionState();
    }
  });
  audio.addEventListener('ended', () => {
    const b = book();
    if (!b) return;
    if (ps.ch < b.chapters.length - 1) {
      const stopHere = ps.sleep.mode === 'chapter';
      emit({ ch: ps.ch + 1, time: 0, duration: b.chapters[ps.ch + 1].dur });
      saveProgress(b.id, ps.ch, 0);
      attach(b, ps.ch, 0);
      if (stopHere) {
        emit({ sleep: { mode: 'off' }, loading: false });
      } else start();
      updateMediaSession();
    } else {
      emit({ playing: false, time: 0 });
      saveProgress(b.id, 0, 0);
      setFinished(b.id, true);
      emit({ ch: 0, duration: b.chapters[0]?.dur ?? 0, sleep: { mode: 'off' } });
      srcFor = null;
    }
  });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    emit({ error: "Couldn't load this chapter. Check your connection and try again.", playing: false, loading: false });
  });
  window.addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persistNow());
}

// ---- lock screen / headphone controls -------------------------------------
function updateMediaSession() {
  const b = book();
  if (!('mediaSession' in navigator) || !b) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: b.chapters[ps.ch]?.title ?? b.title,
    artist: b.author,
    album: b.title,
    artwork: [{ src: b.cover, sizes: '512x512', type: 'image/jpeg' }],
  });
}

function setPositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const duration = ps.duration;
  if (!duration || !isFinite(duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(ps.time, duration),
      playbackRate: audio.playbackRate || 1,
    });
  } catch {
    /* some browsers reject transient values */
  }
}

if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
    try {
      navigator.mediaSession.setActionHandler(a, h);
    } catch {
      /* action not supported */
    }
  };
  set('play', () => play());
  set('pause', () => pause());
  set('seekbackward', (d) => skip(-(d.seekOffset || SKIP_BACK)));
  set('seekforward', (d) => skip(d.seekOffset || SKIP_FORWARD));
  set('seekto', (d) => d.seekTime != null && seek(d.seekTime));
  set('previoustrack', () => (ps.time > 5 ? seek(0) : goToChapter(Math.max(0, ps.ch - 1))));
  set('nexttrack', () => goToChapter(ps.ch + 1));
}
