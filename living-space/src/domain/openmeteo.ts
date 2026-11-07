import type { WeatherSnapshot } from "./types";
import { describeWmo, sceneWeather } from "./weather";

export interface OpenMeteoResponse {
  current: { time: string; temperature_2m: number; apparent_temperature?: number; weather_code: number; is_day: number; wind_speed_10m?: number };
  hourly?: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability?: (number | null)[] };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
    sunrise?: string[];
    sunset?: string[];
  };
}

/** Normalise an Open-Meteo forecast response into the scene's weather snapshot. */
export function buildSnapshot(r: OpenMeteoResponse, units: "metric" | "imperial", now: number): WeatherSnapshot {
  const c = r.current;
  const isDay = c.is_day === 1;
  const today = r.daily?.time?.[0];
  const idx = r.hourly ? Math.max(0, r.hourly.time.findIndex((t) => t >= c.time.slice(0, 13))) : 0;
  const hourly = r.hourly
    ? r.hourly.time.slice(idx, idx + 12).map((time, i) => ({
        time,
        temperature: r.hourly!.temperature_2m[idx + i],
        code: r.hourly!.weather_code[idx + i],
        precipChance: r.hourly!.precipitation_probability?.[idx + i] ?? null,
      }))
    : [];
  return {
    kind: sceneWeather(c.weather_code, isDay),
    code: c.weather_code,
    description: describeWmo(c.weather_code).description,
    isDay,
    temperature: c.temperature_2m,
    apparent: c.apparent_temperature ?? null,
    high: today ? r.daily!.temperature_2m_max[0] : null,
    low: today ? r.daily!.temperature_2m_min[0] : null,
    precipChance: r.daily?.precipitation_probability_max?.[0] ?? null,
    windSpeed: c.wind_speed_10m ?? null,
    sunrise: r.daily?.sunrise?.[0] ?? null,
    sunset: r.daily?.sunset?.[0] ?? null,
    hourly,
    units,
    fetchedAt: now,
  };
}

/** One-line plain-language forecast built from the next 12 hours. */
export function shortForecast(w: WeatherSnapshot): string {
  if (!w.hourly.length) return w.description;
  const wet = w.hourly.filter((h) => (h.precipChance ?? 0) >= 50);
  const temps = w.hourly.map((h) => h.temperature);
  const trend = temps[temps.length - 1] - temps[0];
  const deg = w.units === "imperial" ? "°F" : "°C";
  const parts: string[] = [];
  if (wet.length) {
    const first = new Date(wet[0].time).toLocaleTimeString(undefined, { hour: "numeric" });
    parts.push(`${describeWmo(wet[0].code).description.toLowerCase()} likely from around ${first}`);
  } else parts.push("staying dry for the next few hours");
  if (Math.abs(trend) >= 3) parts.push(`${trend > 0 ? "warming" : "cooling"} to about ${Math.round(temps[temps.length - 1])}${deg}`);
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
