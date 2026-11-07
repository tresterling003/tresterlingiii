import "server-only";
import type { CalendarEvent, CalendarSnapshot } from "@/domain/types";
import { fetchJson } from "../http";
import { accessToken } from "./oauth";
import { UpstreamError } from "./errors";

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

/** "YYYY-MM-DD" in the *user's* zone → epoch ms of that local midnight. */
function zonedMidnight(ymd: string, timeZone: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Find the zone's offset at that instant and correct (twice handles DST edges).
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find((p) => p.type === k)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
    t = guess - (asUtc - t);
  }
  return t;
}

/**
 * The client sends the exact local-day window it computed (correct across DST),
 * plus its IANA zone so all-day dates are interpreted in the same zone.
 */
export async function fetchDay(timeMin: string, timeMax: string, timeZone: string, ymd: string): Promise<CalendarSnapshot> {
  const { token } = await accessToken();
  const p = new URLSearchParams({ timeMin, timeMax, timeZone, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  const res = await fetchJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new UpstreamError(res.status, `Calendar ${res.status}`);
  const json = (await res.json()) as { items?: GEvent[] };
  const events: CalendarEvent[] = (json.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const allDay = Boolean(e.start.date);
      return {
        id: e.id,
        title: e.summary?.trim() || "(untitled)",
        allDay,
        start: allDay ? zonedMidnight(e.start.date!, timeZone) : Date.parse(e.start.dateTime!),
        end: allDay ? zonedMidnight(e.end.date!, timeZone) : Date.parse(e.end.dateTime!),
        location: e.location ?? null,
        description: e.description ? e.description.replace(/<[^>]+>/g, " ").slice(0, 600) : null,
        url: e.htmlLink ?? null,
      };
    });
  return { dateKey: ymd, timeZone, events, fetchedAt: Date.now() };
}

export const _test = { zonedMidnight };
