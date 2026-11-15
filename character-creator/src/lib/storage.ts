import type { Answers, Brief } from './brief';

// Progress is kept only in this browser (localStorage). Nothing is sent anywhere.
const KEY = 'character-creator.v1';

export interface Saved {
  phase: 'intro' | 'quiz' | 'results';
  step: number;
  answers: Answers;
  overrides: Partial<Brief>;
}

export const EMPTY: Saved = { phase: 'intro', step: 0, answers: {}, overrides: {} };

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || typeof s.answers !== 'object') return EMPTY;
    return {
      phase: ['intro', 'quiz', 'results'].includes(s.phase) ? s.phase : 'intro',
      step: Number.isInteger(s.step) ? s.step : 0,
      answers: s.answers ?? {},
      overrides: s.overrides ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage full: the quiz still works, it just won't survive a refresh */
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
