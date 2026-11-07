"use client";
import { useEffect, useState } from "react";
import { useWorld } from "@/engine/store";
import { activeAdapters } from "@/engine/adapters/registry";
import { markActivityRead, openPanel, removeActivity } from "@/engine/actions";
import { relativeTime, dateKey } from "@/domain/time";
import { nextEvent } from "@/domain/calendar";
import { Panel } from "../Panel";

type Tab = "activity" | "notifications" | "apps" | "reminders";

export function ComputerPanel() {
  const s = useWorld((x) => x);
  const [tab, setTab] = useState<Tab>("activity");
  const isDemo = s.mode === "demo";
  useEffect(() => () => markActivityRead("computer"), []);
  const comp = s.activity.filter((a) => a.channel === "computer");
  const all = s.activity;
  const sources = activeAdapters();
  const today = dateKey(new Date(s.now));
  const dueTasks = s.tasks.filter((t) => !t.done && t.due && t.due <= today);
  const soonTasks = s.tasks.filter((t) => !t.done && t.due && t.due > today).slice(0, 3);
  const nxt = s.calendar.data ? nextEvent(s.calendar.data.events, s.now) : null;
  const tabs: [Tab, string][] = [["activity", "Activity"], ["notifications", "Notifications"], ["apps", "Shortcuts"], ["reminders", "Reminders"]];

  return (
    <Panel title="Desk computer" skin="screen" width={600} sample={isDemo}>
      <div role="tablist" aria-label="Computer sections" className="flex gap-1 mb-4 flex-wrap">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={`px-3 min-h-[40px] rounded-lg font-display text-[15px] border-2 ${tab === id ? "bg-screen-glow text-screen border-screen-glow" : "border-[#3b5560] text-[#cfe9df] hover:bg-[#28414b]"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "activity" && (
        <section aria-label="Recent activity">
          {comp.length === 0 ? (
            <p className="text-[#b9d6cc] py-6 text-center">No new activity from connected services.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comp.slice(0, 30).map((a) => (
                <li key={a.id} className="flex gap-3 items-start rounded-lg bg-[#24414a] px-3 py-2.5 font-mono text-[14px]">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.read ? "bg-[#567]" : "bg-screen-glow"}`} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[#e6f4ee]">{a.title}</span>
                    <span className="block text-[12px] text-[#9fbdb2]">{a.sourceLabel} · {relativeTime(a.at, s.now)}{a.sample ? " · sample" : ""}</span>
                  </span>
                  {a.source === "gmail" && <button type="button" className="text-[13px] underline text-screen-glow" onClick={() => openPanel("inbox")}>View</button>}
                </li>
              ))}
            </ul>
          )}
          <h3 className="font-display text-[15px] text-[#cfe9df] mt-5 mb-2">Connected sources</h3>
          <ul className="flex flex-wrap gap-2 text-[13px]">
            {sources.map((x) => (
              <li key={x.id} className="rounded-full border border-[#4c6c76] px-3 py-1 text-[#cfe9df]">{x.label}</li>
            ))}
          </ul>
          <p className="text-[12px] text-[#9fbdb2] mt-3">Only these services report activity here. Others can be added as new adapters (see README → “Adding a source”).</p>
        </section>
      )}
      {tab === "notifications" && (
        <section aria-label="Notification center">
          {all.length === 0 ? (
            <p className="text-[#b9d6cc] py-6 text-center">All quiet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {all.slice(0, 50).map((a) => (
                <li key={a.id} className="flex gap-3 items-start rounded-lg bg-[#24414a] px-3 py-2.5 text-[14px]">
                  <span className="text-[11px] uppercase tracking-wider text-screen-glow w-[62px] shrink-0 pt-0.5">{a.channel === "phone" ? "Phone" : "Desk"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block">{a.url ? <a className="underline" href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a> : a.title}</span>
                    <span className="block text-[12px] text-[#9fbdb2]">{a.sourceLabel} · {relativeTime(a.at, s.now)}</span>
                  </span>
                  <button type="button" aria-label={`Dismiss ${a.title}`} className="text-[#9fbdb2] hover:text-white px-2 min-h-[32px]" onClick={() => removeActivity(a.id)}>×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "apps" && (
        <section aria-label="App shortcuts" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["Gmail", "https://mail.google.com/", "#d9694f"],
            ["Calendar", "https://calendar.google.com/", "#4f8c8c"],
            ["Forecast", "https://open-meteo.com/", "#e3b04b"],
          ].map(([name, href, c]) => (
            <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#24414a] p-4 flex flex-col items-center gap-2 hover:bg-[#2c4c56] min-h-[96px] justify-center">
              <span className="w-10 h-10 rounded-xl border-2 border-ink" style={{ background: c }} aria-hidden />
              <span className="font-display">{name}</span>
            </a>
          ))}
          {[
            ["Sticky notes", "tasks", "#f6e1ae"],
            ["Phone alerts", "phone", "#cfe3df"],
            ["Settings", "settings", "#b7c7a8"],
          ].map(([name, id, c]) => (
            <button key={name} type="button" onClick={() => openPanel(id as never)} className="rounded-xl bg-[#24414a] p-4 flex flex-col items-center gap-2 hover:bg-[#2c4c56] min-h-[96px] justify-center">
              <span className="w-10 h-10 rounded-xl border-2 border-ink" style={{ background: c }} aria-hidden />
              <span className="font-display">{name}</span>
            </button>
          ))}
        </section>
      )}
      {tab === "reminders" && (
        <section aria-label="Reminders" className="flex flex-col gap-3 text-[15px]">
          <div className="rounded-lg bg-[#24414a] p-3">
            <h3 className="font-display text-screen-glow mb-1">Next on the calendar</h3>
            {nxt ? <p>{nxt.title} · {new Date(nxt.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p> : <p className="text-[#9fbdb2]">Nothing else scheduled today.</p>}
          </div>
          <div className="rounded-lg bg-[#24414a] p-3">
            <h3 className="font-display text-screen-glow mb-1">Notes due</h3>
            {dueTasks.length ? <ul className="list-disc pl-5">{dueTasks.map((t) => <li key={t.id}>{t.text}</li>)}</ul> : <p className="text-[#9fbdb2]">Nothing due today.</p>}
            {soonTasks.length > 0 && <p className="text-[13px] text-[#9fbdb2] mt-2">Coming up: {soonTasks.map((t) => `${t.text} (${t.due})`).join(", ")}</p>}
          </div>
        </section>
      )}
    </Panel>
  );
}
