"use client";
import type { WeatherSnapshot } from "@/domain/types";
import { api, ApiError, poll, type PollHandle } from "../poll";
import { world } from "../store";
import { cue } from "../actions";
import type { SourceAdapter } from "./types";
import { isStandalone } from "../platform";
import { fetchWeatherDirect } from "../openmeteo-client";
import { load, save } from "../persist";

/** Real weather from Open-Meteo via the server's cached proxy. Needs a saved location. */
export function weatherAdapter(): SourceAdapter {
  let h: PollHandle | null = null;
  let unsub: (() => void) | null = null;
  const fetchOnce = async (signal?: AbortSignal) => {
    const { location, units } = world.get().settings;
    if (!location) {
      world.set((s) => ({ weather: { ...s.weather, status: s.weather.data ? "ready" : "idle", error: s.weather.data ? null : { code: "no_location", message: "Set a location to see your weather." } } }));
      return;
    }
    world.set((s) => ({ weather: { ...s.weather, status: s.weather.data ? "ready" : "loading" } }));
    try {
      const q = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), units });
      const prevKind = world.get().weather.data?.kind;
      let data: WeatherSnapshot;
      if (isStandalone()) {
        // No server: call Open-Meteo directly, with a 10-minute local cache.
        const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${units}`;
        const hit = load<{ key: string; data: WeatherSnapshot } | null>("weatherDirect", null);
        data = hit && hit.key === key && Date.now() - hit.data.fetchedAt < 10 * 60_000 ? hit.data : await fetchWeatherDirect(location.latitude, location.longitude, units, signal);
        save("weatherDirect", { key, data });
      } else {
        data = await api<WeatherSnapshot>(`/api/weather?${q}`, { signal });
      }
      world.set({ weather: { status: "ready", data, error: null, updatedAt: Date.now() } });
      if (data.kind === "thunderstorm" && prevKind !== "thunderstorm") cue("storm");
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      world.set((s) => ({ weather: { ...s.weather, status: "error", error: { code: e instanceof ApiError ? e.code : "network", message: e instanceof ApiError ? e.message : "Weather is unreachable right now." } } }));
      throw e;
    }
  };
  return {
    id: "weather",
    label: "Open-Meteo weather",
    channels: [],
    start() {
      h = poll(fetchOnce, 15 * 60_000);
      let last = JSON.stringify([world.get().settings.location, world.get().settings.units]);
      unsub = world.subscribe(() => {
        const cur = JSON.stringify([world.get().settings.location, world.get().settings.units]);
        if (cur !== last) {
          last = cur;
          h?.now();
        }
      });
      return () => {
        h?.stop();
        unsub?.();
      };
    },
    refresh: () => (h ? h.now() : fetchOnce().then(() => undefined)),
  };
}
