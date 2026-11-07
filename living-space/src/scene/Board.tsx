import { O, P } from "./palette";
import type { CalendarEvent, Task } from "@/domain/types";
import { eventStatuses, sortEvents, type EventStatus } from "@/domain/calendar";

/** Sheet geometry (world units). Wider than before so pixel text stays readable. */
export const SHEET = { x: 906, y: 147, w: 342, h: 297, head: 87, row: 42, firstRow: 249, rows: 4 };
export const NOTES = { x: 1287, y: 105, w: 168, h: 84, gap: 93, max: 2 };

export type SheetState = "ready" | "loading" | "error" | "offline" | "sample";

export interface SheetModel {
  weekday: string;
  date: string;
  rows: { id: string; time: string; title: string; status: EventStatus }[];
  more: number;
  empty: boolean;
  message: string | null;
  sample: boolean;
}

/** "9:00 AM" → "9a", "11:30 AM" → "11:30a" (compact for the pixel sheet). */
export function shortTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 || 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "a" : "p"}`;
}

export function sheetModel(now: number, events: CalendarEvent[] | null, state: SheetState): SheetModel {
  const d = new Date(now);
  const statuses = events ? eventStatuses(events, now) : new Map<string, EventStatus>();
  const sorted = events ? sortEvents(events) : [];
  // Prefer what's current/upcoming; keep one recent past item for context.
  const timed = sorted.filter((e) => !e.allDay);
  const allDay = sorted.filter((e) => e.allDay);
  const firstLive = timed.findIndex((e) => statuses.get(e.id) !== "past");
  const startIdx = Math.max(0, (firstLive === -1 ? timed.length : firstLive) - 1);
  const visible = [...allDay.slice(0, 1), ...timed.slice(startIdx)].slice(0, SHEET.rows);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase(),
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    rows: visible.map((e) => ({ id: e.id, time: e.allDay ? "All day" : shortTime(e.start), title: e.title, status: statuses.get(e.id) ?? "upcoming" })),
    more: sorted.length - visible.length,
    empty: Boolean(events && sorted.length === 0),
    message: events ? null : state === "loading" ? "Fetching…" : state === "error" || state === "offline" ? "Not connected" : null,
    sample: state === "sample",
  };
}

/** Paper, header band, ruled lines and highlight bars. Text is drawn by the pixel renderer. */
export function DailySheet({ model }: { model: SheetModel }) {
  const { x, y, w, h, head, row, firstRow } = SHEET;
  return (
    <g>
      <rect x={x + 6} y={y + 6} width={w} height={h} fill="#2a1a10" opacity={0.18} />
      <rect x={x} y={y} width={w} height={h} fill={P.paper} stroke={O} strokeWidth={3} />
      <rect x={x} y={y} width={w} height={head} fill={P.tomato} stroke={O} strokeWidth={3} />
      {Array.from({ length: SHEET.rows }, (_, i) => (
        <rect key={i} x={x + 6} y={firstRow + i * row + 36} width={w - 12} height={3} fill="#E3D3B4" />
      ))}
      {model.rows.map((r, i) =>
        r.status === "next" || r.status === "now" ? (
          <rect key={r.id} x={x + 3} y={firstRow + i * row} width={w - 6} height={36} fill={r.status === "now" ? "#BFE3CF" : "#F2D68F"} />
        ) : null,
      )}
      {model.sample && <rect x={x + w - 126} y={y + h - 42} width={117} height={36} fill="none" stroke={P.tomato} strokeWidth={3} />}
      <circle cx={x + w / 2} cy={y + 3} r={8} fill={P.teal} stroke={O} strokeWidth={3} />
    </g>
  );
}

const NOTE_COLORS = ["#F6E1AE", "#CFE3DF", "#F2C3B5", "#DCE8C8"];

export function noteSlots(tasks: Task[]) {
  const open = tasks.filter((t) => !t.done).slice(0, NOTES.max);
  return open.length
    ? open.map((t, i) => ({ text: t.text, x: NOTES.x, y: NOTES.y + i * NOTES.gap, color: NOTE_COLORS[i % 4] }))
    : [{ text: "", x: NOTES.x, y: NOTES.y, color: NOTE_COLORS[0] }];
}

export function StickyNotes({ tasks }: { tasks: Task[] }) {
  return (
    <g>
      {noteSlots(tasks).map((n, i) => (
        <g key={i}>
          <rect x={n.x + 4} y={n.y + 5} width={NOTES.w} height={NOTES.h} fill="#2a1a10" opacity={0.15} />
          <rect x={n.x} y={n.y} width={NOTES.w} height={NOTES.h} fill={n.color} stroke={O} strokeWidth={3} />
          <rect x={n.x} y={n.y} width={NOTES.w} height={9} fill="#000" opacity={0.06} />
          <circle cx={n.x + NOTES.w / 2} cy={n.y + 3} r={6} fill={P.tomato} stroke={O} strokeWidth={3} />
        </g>
      ))}
    </g>
  );
}
