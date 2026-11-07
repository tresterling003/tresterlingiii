"use client";
import { memo } from "react";
import { O, P } from "./palette";
import type { CalendarEvent, Task } from "@/domain/types";
import { eventStatuses, formatEventTime, sortEvents } from "@/domain/calendar";

interface SheetProps {
  now: number;
  events: CalendarEvent[] | null;
  state: "ready" | "loading" | "error" | "offline" | "sample";
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** The pinned daily planner sheet. Big type; shows up to four lines, the rest in the agenda. */
export const DailySheet = memo(function DailySheet({ now, events, state }: SheetProps) {
  const d = new Date(now);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const statuses = events ? eventStatuses(events, now) : new Map();
  const sorted = events ? sortEvents(events) : [];
  // Prefer showing what's current/upcoming; keep one recent past item for context.
  const firstLive = sorted.findIndex((e) => statuses.get(e.id) !== "past" && !e.allDay);
  const timed = sorted.filter((e) => !e.allDay);
  const allDay = sorted.filter((e) => e.allDay);
  const startIdx = Math.max(0, (firstLive === -1 ? timed.length : timed.indexOf(sorted[firstLive])) - 1);
  const visible = [...allDay.slice(0, 1), ...timed.slice(startIdx)].slice(0, 4);
  const more = sorted.length - visible.length;
  return (
    <g className="obj obj-calendar">
      <g transform="rotate(-1.5 990 266)">
        <rect x={912} y={158} width={158} height={222} fill="#2a1a10" opacity={0.15} transform="translate(4 5)" />
        <rect x={912} y={158} width={158} height={222} fill={P.paper} stroke={O} strokeWidth={2.5} />
        <rect x={912} y={158} width={158} height={44} fill={P.tomato} stroke={O} strokeWidth={2.5} />
        <text x={991} y={178} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={13} fontWeight={600} fill={P.paper} letterSpacing={1.5}>
          TODAY
        </text>
        <text x={991} y={195} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={12} fill={P.paper}>
          {clip(`${weekday} · ${date}`, 22)}
        </text>
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1={920} y1={232 + i * 28} x2={1062} y2={232 + i * 28} stroke="#D9C6A3" strokeWidth={1.5} />
        ))}
        {state === "loading" && !events && <text x={991} y={262} textAnchor="middle" fontFamily="Nunito, sans-serif" fontSize={14} fill={O} opacity={0.6}>Fetching…</text>}
        {(state === "error" || state === "offline") && !events && (
          <text x={991} y={262} textAnchor="middle" fontFamily="Nunito, sans-serif" fontSize={13} fill={O} opacity={0.7}>Not connected</text>
        )}
        {events && sorted.length === 0 && (
          <g>
            <text x={991} y={258} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={16} fill={O}>No plans today</text>
            <path d="M972 286 q19 14 38 0" fill="none" stroke={O} strokeWidth={2.5} strokeLinecap="round" />
          </g>
        )}
        {visible.map((e, i) => {
          const st = statuses.get(e.id);
          const y = 226 + i * 28;
          return (
            <g key={e.id} opacity={st === "past" ? 0.45 : 1}>
              {st === "next" && <rect x={916} y={y - 16} width={150} height={24} rx={4} fill={P.honey} opacity={0.55} />}
              {st === "now" && <rect x={916} y={y - 16} width={150} height={24} rx={4} fill="#BFE3CF" />}
              <text x={922} y={y} fontFamily="Nunito, sans-serif" fontSize={13} fontWeight={800} fill={O}>
                {e.allDay ? "All day" : formatEventTime(e).replace(/\s?([AP]M)/i, (m) => m.trim().toLowerCase())}
              </text>
              <text x={982} y={y} fontFamily="Nunito, sans-serif" fontSize={13} fontWeight={600} fill={O}>
                {clip(e.title, 11)}
              </text>
            </g>
          );
        })}
        {more > 0 && <text x={922} y={370} textAnchor="start" fontFamily="Nunito, sans-serif" fontSize={12} fontWeight={700} fill={P.tomato}>+{more} more</text>}
        {state === "sample" && (
          <g transform="translate(1032 362) rotate(-12)">
            <rect x={-30} y={-10} width={60} height={18} rx={3} fill="none" stroke={P.tomato} strokeWidth={2} />
            <text x={0} y={4} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={11} fill={P.tomato} letterSpacing={1}>SAMPLE</text>
          </g>
        )}
      </g>
      <circle cx={991} cy={160} r={7} fill={P.teal} stroke={O} strokeWidth={2} />
    </g>
  );
});

/** Greedy word wrap for SVG text (avoids foreignObject, which misrenders under transforms on iOS Safari). */
export function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const word = w.length > max ? w.slice(0, max - 1) + "…" : w;
    if ((cur + " " + word).trim().length <= max) cur = (cur + " " + word).trim();
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = kept[lines - 1].slice(0, max - 1) + "…";
    return kept;
  }
  return out;
}

const NOTE_COLORS = ["#F6E1AE", "#CFE3DF", "#F2C3B5", "#DCE8C8"];

export const StickyNotes = memo(function StickyNotes({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => !t.done).slice(0, 3);
  const notes = open.length ? open : [];
  return (
    <g className="obj obj-notes">
      {notes.length === 0 && (
        <g transform="translate(1100 176) rotate(4)">
          <rect x={0} y={0} width={100} height={92} fill="#2a1a10" opacity={0.12} transform="translate(3 4)" />
          <rect x={0} y={0} width={100} height={92} fill={NOTE_COLORS[0]} stroke={O} strokeWidth={2.2} />
          <text x={50} y={40} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={14} fill={O}>Add a</text>
          <text x={50} y={60} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={14} fill={O}>note +</text>
        </g>
      )}
      {notes.map((t, i) => (
        <g key={t.id} transform={`translate(${1098 + (i % 2) * 8} ${168 + i * 68}) rotate(${[4, -3, 2][i]})`}>
          <rect x={0} y={0} width={104} height={76} fill="#2a1a10" opacity={0.12} transform="translate(3 4)" />
          <rect x={0} y={0} width={104} height={76} fill={NOTE_COLORS[i % 4]} stroke={O} strokeWidth={2.2} />
          {wrap(t.text, 12, 3).map((line, li) => (
            <text key={li} x={8} y={26 + li * 18} fontFamily="Fredoka, sans-serif" fontSize={14} fill={O}>
              {line}
            </text>
          ))}
          <circle cx={52} cy={2} r={5} fill={P.tomato} stroke={O} strokeWidth={1.5} />
        </g>
      ))}
    </g>
  );
});
