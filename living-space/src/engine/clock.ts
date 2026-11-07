"use client";
import { world } from "./store";
import { computeLighting, isoLocalToMinutes, minutesOfDay } from "@/domain/time";
import { weatherDimming } from "@/domain/weather";
import type { WeatherKind } from "@/domain/types";

/** Updates `now` every 20s (aligned), so the lighting and calendar advance without re-rendering per frame. */
export function startClock(): () => void {
  let t: ReturnType<typeof setTimeout>;
  const tick = () => {
    world.set({ now: Date.now() });
    t = setTimeout(tick, 20_000 - (Date.now() % 20_000) + 20);
  };
  tick();
  const onVis = () => !document.hidden && world.set({ now: Date.now() });
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clearTimeout(t);
    document.removeEventListener("visibilitychange", onVis);
  };
}

export function sceneMinutes(now: number, override: number | null) {
  return override ?? minutesOfDay(new Date(now));
}

export interface SceneLook {
  minutes: number;
  weather: WeatherKind;
  lighting: ReturnType<typeof computeLighting>;
  dim: number;
}

/** Combine clock + weather into what the room should look like. */
export function sceneLook(s: { now: number; timeOverride: number | null; weatherOverride: WeatherKind | null; weather: { data: { kind: WeatherKind; sunrise: string | null; sunset: string | null; code: number } | null } }): SceneLook {
  const minutes = sceneMinutes(s.now, s.timeOverride);
  const w = s.weather.data;
  const lighting = computeLighting(minutes, isoLocalToMinutes(w?.sunrise), isoLocalToMinutes(w?.sunset));
  let weather: WeatherKind = s.weatherOverride ?? w?.kind ?? "partly-cloudy";
  const night = lighting.daylight < 0.25;
  if (night && (weather === "sunny" || weather === "partly-cloudy")) weather = "clear-night";
  if (!night && weather === "clear-night") weather = "sunny";
  return { minutes, weather, lighting, dim: weatherDimming(weather) };
}
