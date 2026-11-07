/**
 * Day/night model. Converts a moment + optional sunrise/sunset into a continuous
 * lighting description that the scene interpolates smoothly.
 */

export type DayPhase = "night" | "morning" | "afternoon" | "evening";

export interface Lighting {
  phase: DayPhase;
  /** 0 = deep night, 1 = full midday. */
  daylight: number;
  /** 0..1 how golden the light is (peaks at sunrise/sunset). */
  golden: number;
  /** 0..1 how strongly interior lamps glow. */
  lamps: number;
  /** Multiply tint over the whole room, as [r,g,b,alpha]. */
  tint: [number, number, number, number];
  /** Sky gradient (top, bottom) before weather is applied. */
  skyTop: string;
  skyBottom: string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Parse "2026-11-07T06:41" style local ISO from Open-Meteo into minutes of day. */
export function isoLocalToMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

interface Key {
  t: number;
  daylight: number;
  golden: number;
  lamps: number;
  tint: [number, number, number, number];
  skyTop: [number, number, number];
  skyBottom: [number, number, number];
}

function hex(rgb: [number, number, number]) {
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

/** Build lighting keyframes around the real sunrise/sunset (defaults 6:45 / 17:45). */
function keys(sunrise: number, sunset: number): Key[] {
  const NIGHT: Omit<Key, "t"> = {
    daylight: 0.05, golden: 0, lamps: 1,
    tint: [40, 36, 92, 0.5], skyTop: [14, 18, 44], skyBottom: [38, 44, 86],
  };
  return [
    { t: 0, ...NIGHT },
    { t: sunrise - 50, ...NIGHT },
    { t: sunrise, daylight: 0.4, golden: 1, lamps: 0.55, tint: [120, 90, 140, 0.26], skyTop: [96, 118, 178], skyBottom: [246, 176, 140] },
    { t: sunrise + 90, daylight: 0.8, golden: 0.3, lamps: 0.05, tint: [255, 236, 214, 0.06], skyTop: [126, 182, 222], skyBottom: [214, 232, 240] },
    { t: (sunrise + sunset) / 2, daylight: 1, golden: 0, lamps: 0, tint: [255, 255, 255, 0], skyTop: [104, 170, 222], skyBottom: [196, 226, 244] },
    { t: sunset - 80, daylight: 0.85, golden: 0.45, lamps: 0.15, tint: [255, 214, 170, 0.1], skyTop: [118, 168, 214], skyBottom: [244, 214, 168] },
    { t: sunset, daylight: 0.45, golden: 1, lamps: 0.7, tint: [214, 120, 110, 0.26], skyTop: [92, 96, 160], skyBottom: [246, 150, 108] },
    { t: sunset + 55, ...NIGHT, daylight: 0.12, tint: [56, 44, 110, 0.44], skyTop: [24, 26, 62], skyBottom: [70, 60, 112] },
    { t: 1440, ...NIGHT },
  ];
}

export function phaseFor(minutes: number, sunrise = 405, sunset = 1065): DayPhase {
  if (minutes < sunrise - 30 || minutes >= sunset + 60) return "night";
  if (minutes < 12 * 60) return "morning";
  if (minutes < sunset - 60) return "afternoon";
  return "evening";
}

export function computeLighting(minutes: number, sunriseMin?: number | null, sunsetMin?: number | null): Lighting {
  const sr = sunriseMin ?? 405;
  const ss = sunsetMin ?? 1065;
  const ks = keys(sr, ss);
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= minutes) i++;
  const a = ks[i];
  const b = ks[i + 1];
  const span = Math.max(1, b.t - a.t);
  const t = clamp01((minutes - a.t) / span);
  // Smoothstep so the transitions ease in and out.
  const s = t * t * (3 - 2 * t);
  const mix3 = (x: [number, number, number], y: [number, number, number]) =>
    [lerp(x[0], y[0], s), lerp(x[1], y[1], s), lerp(x[2], y[2], s)] as [number, number, number];
  return {
    phase: phaseFor(minutes, sr, ss),
    daylight: lerp(a.daylight, b.daylight, s),
    golden: lerp(a.golden, b.golden, s),
    lamps: lerp(a.lamps, b.lamps, s),
    tint: [
      Math.round(lerp(a.tint[0], b.tint[0], s)),
      Math.round(lerp(a.tint[1], b.tint[1], s)),
      Math.round(lerp(a.tint[2], b.tint[2], s)),
      Number(lerp(a.tint[3], b.tint[3], s).toFixed(3)),
    ],
    skyTop: hex(mix3(a.skyTop, b.skyTop)),
    skyBottom: hex(mix3(a.skyBottom, b.skyBottom)),
  };
}

/** Local calendar date key, e.g. "2026-11-07". */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local-day bounds. Uses the Date constructor so DST transitions give 23h/25h days correctly. */
export function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return { start, end };
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function relativeTime(ms: number, now: number): string {
  const diff = Math.round((now - ms) / 1000);
  if (diff < 45) return "just now";
  const m = Math.round(diff / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
