"use client";
import { useState } from "react";
import { useWorld } from "@/engine/store";
import { refreshSource } from "@/engine/adapters/registry";
import { eventStatuses, formatRange, sortEvents, type EventStatus } from "@/domain/calendar";
import type { CalendarEvent } from "@/domain/types";
import { Panel, SourceStatus, ConnectGoogle } from "../Panel";
import { Skeleton } from "./InboxPanel";

const STATUS_LABEL: Record<EventStatus, string> = { past: "Ended", now: "Happening now", next: "Up next", upcoming: "", "all-day": "All day" };

export function AgendaPanel() {
  const cal = useWorld((s) => s.calendar);
  const mode = useWorld((s) => s.mode);
  const now = useWorld((s) => s.now);
  const [sel, setSel] = useState<CalendarEvent | null>(null);
  const isDemo = mode === "demo";
  const d = new Date(now);
  const needsConnect = !isDemo && cal.error && ["not_connected", "not_configured", "reauth_required"].includes(cal.error.code);
  const events = cal.data ? sortEvents(cal.data.events) : [];
  const st = eventStatuses(events, now);

  return (
    <Panel title={`Today — ${d.toLocaleDateString(undefined, { weekday: "long" })}`} skin="paper" width={540} sample={isDemo}>
      <p className="font-display text-ink-soft -mt-1 mb-3">{d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
      {!isDemo && !needsConnect && <SourceStatus status={cal.status} error={needsConnect ? null : cal.error} updatedAt={cal.updatedAt} now={now} onRefresh={() => refreshSource("calendar")} />}
      {needsConnect && <ConnectGoogle code={cal.error!.code} missing={cal.error!.missing} />}
      {!needsConnect && cal.status === "loading" && !cal.data && <Skeleton />}
      {cal.data && events.length === 0 && (
        <div className="py-10 text-center">
          <p className="font-display text-2xl">No plans today</p>
          <p className="text-ink-soft mt-1">A free day. Nice.</p>
        </div>
      )}
      {sel ? (
        <div className="animate-fade-in">
          <button type="button" className="btn btn-sm btn-ghost -ml-2 mb-2" onClick={() => setSel(null)} data-autofocus>
            ← All of today
          </button>
          <h3 className="font-display text-2xl leading-8">{sel.title}</h3>
          <p className="text-[17px] mt-1">{formatRange(sel)}</p>
          {sel.location && <p className="mt-2"><span className="text-ink-soft">Where · </span>{sel.location}</p>}
          {sel.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-6">{sel.description}</p>}
          {st.get(sel.id) === "past" && <p className="mt-3 text-sm text-ink-soft">This event's scheduled time has passed.</p>}
          {sel.url && (
            <a className="btn btn-teal mt-4" href={sel.url} target="_blank" rel="noopener noreferrer">
              Open in Google Calendar
            </a>
          )}
        </div>
      ) : (
        events.length > 0 && (
          <ol className="flex flex-col">
            {events.map((e) => {
              const s = st.get(e.id)!;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSel(e)}
                    className={`w-full text-left flex gap-4 items-start px-3 py-2.5 my-0.5 rounded-lg transition-colors ${s === "next" ? "bg-honey-soft ring-2 ring-honey" : s === "now" ? "bg-teal-soft ring-2 ring-teal" : "hover:bg-paper-warm"} ${s === "past" ? "opacity-55" : ""}`}
                  >
                    <span className="font-display w-[86px] shrink-0 text-[16px] pt-0.5">{e.allDay ? "All day" : new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[17px] font-semibold ${s === "past" ? "line-through decoration-ink/40" : ""}`}>{e.title}</span>
                      {(e.location || STATUS_LABEL[s]) && (
                        <span className="block text-sm text-ink-soft">
                          {STATUS_LABEL[s] && s !== "all-day" ? <b className="font-bold text-ink">{STATUS_LABEL[s]}</b> : null}
                          {STATUS_LABEL[s] && s !== "all-day" && e.location ? " · " : ""}
                          {e.location}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )
      )}
    </Panel>
  );
}
