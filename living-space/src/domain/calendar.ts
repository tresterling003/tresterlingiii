import type { CalendarEvent } from "./types";

export type EventStatus = "past" | "now" | "next" | "upcoming" | "all-day";

/** All-day first, then timed events by start time (ties by end, then title). */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start - b.start || a.end - b.end || a.title.localeCompare(b.title);
  });
}

/**
 * Status is purely about time. "past" means the scheduled end has passed —
 * it does NOT claim the event was attended or completed.
 */
export function eventStatuses(events: CalendarEvent[], now: number): Map<string, EventStatus> {
  const out = new Map<string, EventStatus>();
  let nextAssigned = false;
  for (const e of sortEvents(events)) {
    if (e.allDay) out.set(e.id, "all-day");
    else if (e.end <= now) out.set(e.id, "past");
    else if (e.start <= now) out.set(e.id, "now");
    else if (!nextAssigned) {
      out.set(e.id, "next");
      nextAssigned = true;
    } else out.set(e.id, "upcoming");
  }
  return out;
}

export function nextEvent(events: CalendarEvent[], now: number): CalendarEvent | null {
  return sortEvents(events).find((e) => !e.allDay && e.start > now) ?? null;
}

/** Parse a Google all-day "YYYY-MM-DD" as local midnight (not UTC midnight). */
export function localDateToMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function formatEventTime(e: CalendarEvent): string {
  if (e.allDay) return "All day";
  return new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatRange(e: CalendarEvent): string {
  if (e.allDay) return "All day";
  const o: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${new Date(e.start).toLocaleTimeString(undefined, o)} – ${new Date(e.end).toLocaleTimeString(undefined, o)}`;
}
