import { z } from 'zod';
import {
  CalibrationSchema,
  CoachingRuleSchema,
  DrillSchema,
  FormationTemplateSchema,
  PackageSchema,
  PlaylistSchema,
  TeamSettingsSchema,
  type Calibration,
  type CoachingRule,
  type Drill,
  type FieldviewPackage,
  type FormationTemplate,
  type Playlist,
  type TeamSettings,
} from './schema';
import { buildDemoDrills, buildDemoPlaylists, DEMO_RULES } from './demoDrills';
import { DEFAULT_CALIBRATION } from '../render/camera';

// ---------------------------------------------------------------------------
// Local persistence (no account, works offline). Everything is validated on
// load; invalid entries are dropped rather than crashing the app.
// ---------------------------------------------------------------------------

const PREFIX = 'fieldview.v1.';

export interface KvBackend {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function memoryBackend(): KvBackend {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function defaultBackend(): KvBackend {
  try {
    const ls = globalThis.localStorage;
    const probe = PREFIX + 'probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryBackend();
  }
}

export const DEFAULT_TEAM: TeamSettings = {
  offense: { name: 'Offense', helmet: '#b3122e', facemask: '#d9d9d9', jersey: '#b3122e', numbers: '#ffffff', pants: '#e9e6dc', socks: '#b3122e', cleats: '#111111' },
  defense: { name: 'Defense', helmet: '#0d2a5c', facemask: '#c8c8c8', jersey: '#ffffff', numbers: '#0d2a5c', pants: '#c9a227', socks: '#0d2a5c', cleats: '#f0f0f0' },
};

export interface StoreData {
  drills: Drill[];
  playlists: Playlist[];
  calibrations: Calibration[];
  activeCalibrationId: string;
  team: TeamSettings;
  rules: CoachingRule[];
  formations: FormationTemplate[];
}

function readList<T>(kv: KvBackend, key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] | null {
  const raw = kv.getItem(PREFIX + key);
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const out: T[] = [];
    for (const item of arr) {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else console.warn(`[fieldview] dropped invalid ${key} entry`, r.error.issues[0]);
    }
    return out;
  } catch {
    return null;
  }
}

export class Store {
  private data: StoreData;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(private kv: KvBackend = defaultBackend()) {
    this.data = this.load();
  }

  private load(): StoreData {
    const kv = this.kv;
    const drills = readList(kv, 'drills', DrillSchema) ?? buildDemoDrills();
    const playlists = readList(kv, 'playlists', PlaylistSchema) ?? buildDemoPlaylists();
    const calibrations = readList(kv, 'calibrations', CalibrationSchema) ?? [DEFAULT_CALIBRATION];
    const rules = readList(kv, 'rules', CoachingRuleSchema) ?? DEMO_RULES;
    const formations = readList(kv, 'formations', FormationTemplateSchema) ?? [];
    let team = DEFAULT_TEAM;
    try {
      const t = kv.getItem(PREFIX + 'team');
      if (t) team = TeamSettingsSchema.parse(JSON.parse(t));
    } catch {
      /* keep default */
    }
    const activeCalibrationId = kv.getItem(PREFIX + 'activeCalibration') ?? calibrations[0]?.id ?? 'default';
    return {
      drills,
      playlists,
      calibrations: calibrations.length ? calibrations : [DEFAULT_CALIBRATION],
      activeCalibrationId,
      team,
      rules,
      formations,
    };
  }

  private persist() {
    const d = this.data;
    const kv = this.kv;
    try {
      kv.setItem(PREFIX + 'drills', JSON.stringify(d.drills));
      kv.setItem(PREFIX + 'playlists', JSON.stringify(d.playlists));
      kv.setItem(PREFIX + 'calibrations', JSON.stringify(d.calibrations));
      kv.setItem(PREFIX + 'activeCalibration', d.activeCalibrationId);
      kv.setItem(PREFIX + 'team', JSON.stringify(d.team));
      kv.setItem(PREFIX + 'rules', JSON.stringify(d.rules));
      kv.setItem(PREFIX + 'formations', JSON.stringify(d.formations));
    } catch (e) {
      console.error('[fieldview] could not save', e);
    }
    this.version++;
    this.listeners.forEach((l) => l());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  get(): StoreData {
    return this.data;
  }

  // --- drills -----------------------------------------------------------------
  saveDrill(d: Drill) {
    const parsed = DrillSchema.parse(d);
    const i = this.data.drills.findIndex((x) => x.id === d.id);
    const drills = [...this.data.drills];
    if (i >= 0) drills[i] = parsed;
    else drills.push(parsed);
    this.data = { ...this.data, drills };
    this.persist();
  }
  deleteDrill(id: string) {
    this.data = {
      ...this.data,
      drills: this.data.drills.filter((d) => d.id !== id),
      playlists: this.data.playlists
        .map((p) => ({ ...p, drillIds: p.drillIds.filter((x) => x !== id) }))
        .filter((p) => p.drillIds.length > 0),
    };
    this.persist();
  }
  restoreDemos() {
    const demos = buildDemoDrills();
    const ids = new Set(demos.map((d) => d.id));
    const others = this.data.drills.filter((d) => !ids.has(d.id));
    const pls = buildDemoPlaylists();
    const plIds = new Set(pls.map((p) => p.id));
    const rules = [...this.data.rules.filter((r) => !DEMO_RULES.some((d) => d.id === r.id)), ...DEMO_RULES];
    this.data = { ...this.data, drills: [...demos, ...others], playlists: [...pls, ...this.data.playlists.filter((p) => !plIds.has(p.id))], rules };
    this.persist();
  }

  // --- saved formations ----------------------------------------------------------
  saveFormation(f: FormationTemplate) {
    const parsed = FormationTemplateSchema.parse(f);
    this.data = { ...this.data, formations: [...this.data.formations.filter((x) => x.id !== f.id), parsed] };
    this.persist();
  }
  deleteFormation(id: string) {
    this.data = { ...this.data, formations: this.data.formations.filter((x) => x.id !== id) };
    this.persist();
  }

  // --- playlists ---------------------------------------------------------------
  savePlaylist(p: Playlist) {
    const parsed = PlaylistSchema.parse(p);
    const list = this.data.playlists.filter((x) => x.id !== p.id);
    this.data = { ...this.data, playlists: [...list, parsed] };
    this.persist();
  }
  deletePlaylist(id: string) {
    this.data = { ...this.data, playlists: this.data.playlists.filter((p) => p.id !== id) };
    this.persist();
  }

  // --- calibration ---------------------------------------------------------------
  saveCalibration(c: Calibration) {
    const parsed = CalibrationSchema.parse(c);
    const list = this.data.calibrations.filter((x) => x.id !== c.id);
    this.data = { ...this.data, calibrations: [...list, parsed], activeCalibrationId: c.id };
    this.persist();
  }
  deleteCalibration(id: string) {
    const list = this.data.calibrations.filter((x) => x.id !== id);
    const calibrations = list.length ? list : [DEFAULT_CALIBRATION];
    this.data = { ...this.data, calibrations, activeCalibrationId: calibrations[0].id };
    this.persist();
  }
  setActiveCalibration(id: string) {
    this.data = { ...this.data, activeCalibrationId: id };
    this.persist();
  }
  activeCalibration(): Calibration {
    return this.data.calibrations.find((c) => c.id === this.data.activeCalibrationId) ?? this.data.calibrations[0];
  }

  // --- team / rules ---------------------------------------------------------------
  saveTeam(t: TeamSettings) {
    this.data = { ...this.data, team: TeamSettingsSchema.parse(t) };
    this.persist();
  }
  saveRules(rules: CoachingRule[]) {
    this.data = { ...this.data, rules: rules.map((r) => CoachingRuleSchema.parse(r)) };
    this.persist();
  }

  // --- packages -----------------------------------------------------------------
  exportPackage(opts: { drillIds?: string[]; includeCalibrations?: boolean; includeTeam?: boolean } = {}): FieldviewPackage {
    const drills = opts.drillIds ? this.data.drills.filter((d) => opts.drillIds!.includes(d.id)) : this.data.drills;
    const ids = new Set(drills.map((d) => d.id));
    return {
      format: 'fieldview-package',
      version: 1,
      exportedAt: new Date().toISOString(),
      drills,
      playlists: this.data.playlists.filter((p) => p.drillIds.every((id) => ids.has(id))),
      calibrations: opts.includeCalibrations === false ? [] : this.data.calibrations,
      rules: this.data.rules,
      formations: this.data.formations,
      team: opts.includeTeam === false ? undefined : this.data.team,
    };
  }

  importPackage(json: string, opts: { overwrite: boolean } = { overwrite: true }): { ok: true; summary: string } | { ok: false; errors: string[] } {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return { ok: false, errors: ['File is not valid JSON: ' + (e as Error).message] };
    }
    const r = PackageSchema.safeParse(raw);
    if (!r.success) {
      return { ok: false, errors: r.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
    }
    const pkg = r.data;
    const merge = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
      const map = new Map(existing.map((x) => [x.id, x]));
      for (const x of incoming) {
        if (map.has(x.id) && !opts.overwrite) continue;
        map.set(x.id, x);
      }
      return [...map.values()];
    };
    this.data = {
      ...this.data,
      drills: merge(this.data.drills, pkg.drills),
      playlists: merge(this.data.playlists, pkg.playlists),
      calibrations: merge(this.data.calibrations, pkg.calibrations),
      rules: merge(this.data.rules, pkg.rules),
      formations: merge(this.data.formations, pkg.formations),
      team: pkg.team ?? this.data.team,
    };
    this.persist();
    return {
      ok: true,
      summary: `Imported ${pkg.drills.length} drills, ${pkg.playlists.length} playlists, ${pkg.calibrations.length} calibration profiles, ${pkg.rules.length} rules, ${pkg.formations.length} formations${pkg.team ? ', team colors' : ''}.`,
    };
  }

  // --- misc key/value (keymap, results, prefs) ---------------------------------------
  getJson<T>(key: string, fallback: T): T {
    try {
      const v = this.kv.getItem(PREFIX + key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  setJson(key: string, value: unknown) {
    try {
      this.kv.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.error('[fieldview] could not save', key, e);
    }
  }
}
