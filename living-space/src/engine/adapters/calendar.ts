"use client";
import type { CalendarSnapshot } from "@/domain/types";
import { dateKey, dayBounds } from "@/domain/time";
import { nextEvent } from "@/domain/calendar";
import { api, ApiError, poll, type PollHandle } from "../poll";
import { world } from "../store";
import { pushActivity } from "../actions";
import type { SourceAdapter } from "./types";

/**
 * Live Google Calendar for *today*. Recomputes the local-day window on every fetch
 * (handles midnight rollover, time-zone changes and DST), and re-fetches when the
 * date key changes. Also emits a gentle "starting soon" reminder to the phone.
 */
export function calendarAdapter(): SourceAdapter {
  let h: PollHandle | null = null;
  let unsub: (() => void) | null = null;
  const reminded = new Set<string>();

  const fetchOnce = async (signal?: AbortSignal) => {
    const now = new Date();
    const { start, end } = dayBounds(now);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const key = dateKey(now);
    const prev = world.get().calendar;
    const sameDay = prev.data?.dateKey === key && prev.data?.timeZone === tz;
    world.set({ calendar: { ...prev, data: sameDay ? prev.data : null, status: sameDay ? prev.status : "loading" } });
    try {
      const q = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), tz, date: key });
      const data = await api<CalendarSnapshot>(`/api/calendar?${q}`, { signal });
      world.set({ calendar: { status: "ready", data, error: null, updatedAt: Date.now() } });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      const err = e instanceof ApiError ? { code: e.code, message: e.message, missing: e.extra.missing as string[] | undefined } : { code: "network", message: "Couldn't reach the server." };
      world.set((s) => ({ calendar: { ...s.calendar, status: "error", error: err } }));
      if (e instanceof ApiError && e.code === "rate_limited") return 180_000;
      if (e instanceof ApiError && ["not_connected", "not_configured", "reauth_required"].includes(e.code)) return 10 * 60_000;
      throw e;
    }
  };

  return {
    id: "calendar",
    label: "Google Calendar",
    channels: ["phone"],
    start() {
      h = poll(fetchOnce, 5 * 60_000);
      let lastKey = dateKey(new Date());
      let lastTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      unsub = (() => {
        const id = setInterval(() => {
          const k = dateKey(new Date());
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (k !== lastKey || tz !== lastTz) {
            lastKey = k;
            lastTz = tz;
            reminded.clear();
            h?.now();
          }
          const ev = world.get().calendar.data?.events ?? [];
          const n = nextEvent(ev, Date.now());
          if (n && n.start - Date.now() <= 10 * 60_000 && !reminded.has(n.id)) {
            reminded.add(n.id);
            pushActivity([{ source: "calendar", sourceLabel: "Calendar", channel: "phone", title: `${n.title} starts soon`, body: new Date(n.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), url: n.url ?? undefined, at: Date.now() }]);
          }
        }, 30_000);
        return () => clearInterval(id);
      })();
      return () => {
        h?.stop();
        unsub?.();
      };
    },
    refresh: () => (h ? h.now() : fetchOnce().then(() => undefined)),
  };
}
