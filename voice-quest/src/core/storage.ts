// Local-only persistence (localStorage). Nothing is sent anywhere. No audio is ever stored.

import type { AttemptRecord, ParentNote, Progress, Settings } from '../types';

const KEY = 'voicequest.v1';

export interface SaveData {
  settings: Settings;
  progress: Progress;
  attempts: AttemptRecord[];
  notes: ParentNote[];
}

export function defaultSettings(): Settings {
  return {
    setupDone: false,
    voiceMode: 'activity',
    consentExternal: false,
    lang: 'en-US',
    practiceLevel: 'B',
    targetSounds: [],
    customWords: [],
    acceptedExtra: {},
    prompting: 'model-first',
    listenSeconds: 7,
    generousMatching: true,
    maxTries: 2,
    sessionMinutes: 15,
    gameplay: 'gentle',
    volumes: { master: 0.8, music: 0.45, voice: 1, sfx: 0.7 },
    reducedMotion: false,
    reducedEffects: false,
    captions: true,
    devPanel: false,
    hero: { coat: '#e53935', hat: '#1e88e5', scarf: '#fdd835', skin: '#f2c19b', hair: '#5d3a1a', hatStyle: 'beanie' },
    reindeer: { blanket: '#1e88e5', redNose: false, bellCollar: false, antlerLights: false },
  };
}

export function defaultProgress(): Progress {
  return { stars: 0, coins: 0, bells: 0, found: [], unlocks: [], completions: {}, medals: { dash: [] }, cabin: {}, sessions: [] };
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Deep-merge saved data over defaults so new settings fields get sensible values. */
export function mergeDefaults<T extends object>(def: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return def;
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const d = (def as Record<string, unknown>)[k];
    if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = mergeDefaults(d as object, v);
    else if (v !== undefined && (d === undefined || typeof d === typeof v)) out[k] = v;
  }
  return out as T;
}

export class Store {
  data: SaveData;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private kv: KV = localStorage) {
    this.data = this.load();
  }

  load(): SaveData {
    let raw: Partial<SaveData> = {};
    try {
      raw = JSON.parse(this.kv.getItem(KEY) ?? '{}');
    } catch {
      raw = {};
    }
    return {
      settings: mergeDefaults(defaultSettings(), raw.settings),
      progress: mergeDefaults(defaultProgress(), raw.progress),
      attempts: Array.isArray(raw.attempts) ? raw.attempts.slice(-2000) : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  }

  get settings(): Settings {
    return this.data.settings;
  }
  get progress(): Progress {
    return this.data.progress;
  }

  save(now = false): void {
    if (this.timer) clearTimeout(this.timer);
    const write = () => {
      try {
        this.kv.setItem(KEY, JSON.stringify(this.data));
      } catch {
        /* storage full or blocked: game keeps working in memory */
      }
    };
    if (now) write();
    else this.timer = setTimeout(write, 250);
  }

  logAttempt(a: AttemptRecord): void {
    this.data.attempts.push(a);
    if (this.data.attempts.length > 2000) this.data.attempts.splice(0, this.data.attempts.length - 2000);
    this.save();
  }

  resetProgress(): void {
    this.data.progress = defaultProgress();
    this.save(true);
  }

  deleteAll(): void {
    this.kv.removeItem(KEY);
    this.data = { settings: defaultSettings(), progress: defaultProgress(), attempts: [], notes: [] };
  }

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }
}

/** Summaries for the parent dashboard. Counts practice opportunities; makes no claims about improvement. */
export function summarizeAttempts(attempts: AttemptRecord[]) {
  const byTarget = new Map<string, { target: string; total: number; recognized: number; practiced: number; helped: number; picture: number; last: number }>();
  for (const a of attempts) {
    const k = a.target.toLowerCase();
    const e = byTarget.get(k) ?? { target: a.target, total: 0, recognized: 0, practiced: 0, helped: 0, picture: 0, last: 0 };
    e.total++;
    if (a.label === 'Recognized') e.recognized++;
    else if (a.label === 'Practiced' || a.label === 'Tried again') e.practiced++;
    else if (a.label === 'Completed with help') e.helped++;
    else if (a.label === 'Picture choice') e.picture++;
    e.last = Math.max(e.last, a.t);
    byTarget.set(k, e);
  }
  const days = new Map<string, number>();
  for (const a of attempts) {
    const d = new Date(a.t).toISOString().slice(0, 10);
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  return { byTarget: [...byTarget.values()].sort((a, b) => b.total - a.total), days: [...days.entries()].sort() };
}
