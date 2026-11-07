"use client";
import { useSyncExternalStore } from "react";
import type { ActivityItem, CalendarSnapshot, MailSnapshot, SavedLocation, Task, WeatherKind, WeatherSnapshot } from "@/domain/types";
import { DEFAULT_VITALS, type PetVitals } from "@/domain/pet";
import { load, save } from "./persist";
import { DEFAULT_THEME, type RoomTheme } from "@/scene/theme";

export type PanelId = "inbox" | "agenda" | "weather" | "computer" | "phone" | "pet" | "tasks" | "settings" | "welcome" | "dev";

export interface ResourceError {
  code: string;
  message: string;
  missing?: string[];
}
export interface Resource<T> {
  status: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: ResourceError | null;
  updatedAt: number;
}
const idle = <T,>(): Resource<T> => ({ status: "idle", data: null, error: null, updatedAt: 0 });

export interface ConnectionStatus {
  google: { configured: boolean; missing: string[]; connected: boolean; email: string | null; canMarkRead: boolean };
  alerts: { configured: boolean; paired: boolean; needsStorage?: boolean };
}

export type CueKind = "mail" | "computer" | "phone" | "storm" | "pet" | "wake";
export interface Toast {
  id: string;
  title: string;
  body?: string;
  panel?: PanelId;
  tone: "mail" | "computer" | "phone" | "info" | "error";
}

export interface Settings {
  location: SavedLocation | null;
  units: "metric" | "imperial";
  theme: RoomTheme;
  sound: boolean;
}

export interface WorldState {
  hydrated: boolean;
  now: number;
  /** Dev-only: override minutes-of-day for lighting tests. */
  timeOverride: number | null;
  weatherOverride: WeatherKind | null;
  mode: "demo" | "live";
  onboarded: boolean;
  online: boolean;
  status: ConnectionStatus | null;
  weather: Resource<WeatherSnapshot>;
  mail: Resource<MailSnapshot>;
  calendar: Resource<CalendarSnapshot>;
  alertsRes: Resource<true>;
  activity: ActivityItem[];
  tasks: Task[];
  pet: { name: string; vitals: PetVitals };
  settings: Settings;
  ui: { open: PanelId | null; origin: { x: number; y: number } | null; focusObject: string | null };
  /** Monotonic counters/timestamps the scene watches to play one-shot animations. */
  pulses: { door: number; computer: number; phone: number; doorCount: number };
  cue: { kind: CueKind; at: number } | null;
  toasts: Toast[];
}

const initial: WorldState = {
  hydrated: false,
  now: Date.now(),
  timeOverride: null,
  weatherOverride: null,
  mode: "live",
  onboarded: false,
  online: true,
  status: null,
  weather: idle(),
  mail: idle(),
  calendar: idle(),
  alertsRes: idle(),
  activity: [],
  tasks: [],
  pet: { name: "Pip", vitals: DEFAULT_VITALS },
  settings: { location: null, units: "metric", theme: DEFAULT_THEME, sound: false },
  ui: { open: null, origin: null, focusObject: null },
  pulses: { door: 0, computer: 0, phone: 0, doorCount: 0 },
  cue: null,
  toasts: [],
};

type Listener = () => void;
let state: WorldState = initial;
const listeners = new Set<Listener>();

export const world = {
  get: () => state,
  set(patch: Partial<WorldState> | ((s: WorldState) => Partial<WorldState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
    if (state.hydrated) persistSlices(p);
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useWorld<T>(sel: (s: WorldState) => T): T {
  return useSyncExternalStore(world.subscribe, () => sel(state), () => sel(initial));
}

/** Only durable slices go to localStorage. Live Gmail/Calendar data is never written to disk. */
function persistSlices(p: Partial<WorldState>) {
  if ("tasks" in p) save("tasks", state.tasks);
  if ("pet" in p) save("pet", state.pet);
  if ("settings" in p) save("settings", state.settings);
  if ("mode" in p) save("mode", state.mode);
  if ("onboarded" in p) save("onboarded", state.onboarded);
  if ("activity" in p) save(`activity:${state.mode}`, state.activity.slice(0, 60));
  if ("weather" in p && state.mode === "live" && state.weather.data) save("weatherCache", state.weather.data);
}

export function hydrate() {
  const mode = load<"demo" | "live">("mode", "live");
  const s = load<Settings>("settings", initial.settings);
  state = {
    ...state,
    hydrated: true,
    mode,
    onboarded: load("onboarded", false),
    tasks: load("tasks", []),
    pet: load("pet", initial.pet),
    settings: { ...initial.settings, ...s, theme: { ...DEFAULT_THEME, ...s.theme } },
    activity: load(`activity:${mode}`, []),
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  };
  const cachedWeather = mode === "live" ? load<WeatherSnapshot | null>("weatherCache", null) : null;
  if (cachedWeather) state = { ...state, weather: { status: "ready", data: cachedWeather, error: null, updatedAt: cachedWeather.fetchedAt } };
  listeners.forEach((l) => l());
}

export function resetTransient() {
  world.set({ weather: idle(), mail: idle(), calendar: idle(), alertsRes: idle(), activity: load(`activity:${state.mode}`, []), pulses: { door: 0, computer: 0, phone: 0, doorCount: 0 } });
}

export const initialState = initial;
