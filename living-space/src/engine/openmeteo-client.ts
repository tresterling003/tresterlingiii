"use client";
import type { WeatherSnapshot } from "@/domain/types";
import { buildSnapshot, type OpenMeteoResponse } from "@/domain/openmeteo";

/** Direct browser → Open-Meteo calls for the standalone build (Open-Meteo allows CORS, no key). */
export async function fetchWeatherDirect(lat: number, lon: number, units: "metric" | "imperial", signal?: AbortSignal): Promise<WeatherSnapshot> {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
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
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return buildSnapshot((await res.json()) as OpenMeteoResponse, units, Date.now());
}

export async function geocodeDirect(name: string) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Search ${res.status}`);
  const json = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  return (json.results ?? []).map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(", "), latitude: r.latitude, longitude: r.longitude }));
}
