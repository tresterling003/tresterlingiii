import "server-only";
import type { WeatherSnapshot } from "@/domain/types";
import { buildSnapshot, type OpenMeteoResponse } from "@/domain/openmeteo";
import { fetchJson } from "./http";

/** Small in-memory cache keyed by ~1 km rounded coordinates. */
const cache = new Map<string, { at: number; data: WeatherSnapshot }>();
const TTL = 10 * 60_000;

export async function getWeather(lat: number, lon: number, units: "metric" | "imperial"): Promise<{ data: WeatherSnapshot; cached: boolean }> {
  const rl = lat.toFixed(2);
  const ro = lon.toFixed(2);
  const k = `${rl},${ro},${units}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return { data: hit.data, cached: true };
  const p = new URLSearchParams({
    latitude: rl,
    longitude: ro,
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    forecast_days: "2",
    timezone: "auto",
  });
  if (units === "imperial") {
    p.set("temperature_unit", "fahrenheit");
    p.set("wind_speed_unit", "mph");
  }
  const res = await fetchJson(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!res.ok) {
    if (hit) return { data: hit.data, cached: true }; // serve stale rather than nothing
    throw new Error(`Open-Meteo ${res.status}`);
  }
  const data = buildSnapshot((await res.json()) as OpenMeteoResponse, units, Date.now());
  cache.set(k, { at: Date.now(), data });
  if (cache.size > 50) cache.delete(cache.keys().next().value as string);
  return { data, cached: false };
}

export async function geocode(name: string) {
  const res = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Geocoding ${res.status}`);
  const json = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  return (json.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}
