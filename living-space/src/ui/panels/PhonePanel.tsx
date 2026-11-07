"use client";
import { useEffect, useState } from "react";
import { useWorld } from "@/engine/store";
import { markActivityRead, removeActivity, toast } from "@/engine/actions";
import { loadStatus } from "@/engine/adapters/status";
import { refreshSource } from "@/engine/adapters/registry";
import { api } from "@/engine/poll";
import { relativeTime } from "@/domain/time";
import { Panel } from "../Panel";

export function PhonePanel() {
  const s = useWorld((x) => x);
  const [showSetup, setShowSetup] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => markActivityRead("phone"), []);
  const alerts = s.activity.filter((a) => a.channel === "phone");
  const st = s.status?.alerts;
  const isDemo = s.mode === "demo";

  const pair = async () => {
    setBusy(true);
    try {
      await api("/api/alerts/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setToken("");
      await loadStatus();
      await refreshSource("shortcuts");
      toast({ title: "This device is paired for alerts", tone: "info" });
    } catch (e) {
      toast({ title: "Pairing failed", body: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Phone" skin="phone" width={420} sample={isDemo}>
      <p className="text-center font-display text-[40px] leading-none mt-1">{new Date(s.now).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
      <p className="text-center text-sm text-ink-soft mb-4">{new Date(s.now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      {alerts.length === 0 ? (
        <p className="text-center py-6 text-ink-soft">No alerts.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.slice(0, 40).map((a) => (
            <li key={a.id} className="rounded-2xl bg-white/90 border border-ink/15 px-4 py-3 shadow-sm flex gap-3">
              <span className="flex-1 min-w-0">
                <span className="flex gap-2 text-xs text-ink-soft">
                  <span className="uppercase tracking-wider font-bold flex-1 truncate">{a.sourceLabel}</span>
                  <span>{relativeTime(a.at, s.now)}</span>
                </span>
                <span className="block font-semibold text-[16px]">{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/30">{a.title}</a> : a.title}</span>
                {a.body && <span className="block text-sm text-ink-soft">{a.body}</span>}
              </span>
              <button type="button" className="text-ink-faint hover:text-ink px-1 min-w-[32px]" aria-label={`Dismiss ${a.title}`} onClick={() => removeActivity(a.id)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-[14px]">
        <p className="font-display text-[16px] mb-1">What shows up here</p>
        <p className="mb-2">Reminders from your sticky notes and calendar, plus alerts you send from Apple Shortcuts or other automations.</p>
        <p className="text-ink-soft mb-3">A web page can't read your iPhone's notifications, messages or calls, so this phone doesn't pretend to.</p>
        {!isDemo && (
          <>
            {!st?.configured ? (
              <p className="text-sm">Shortcut alerts are off: set <code className="font-mono">ALERTS_INGEST_TOKEN</code> on the server to turn them on.</p>
            ) : st.paired ? (
              <p className="text-sm"><span className="inline-block w-2 h-2 rounded-full bg-sage mr-2" />This device is paired and receiving Shortcut alerts.</p>
            ) : (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); pair(); }}>
                <label className="text-sm font-semibold" htmlFor="pair">Pair this device (enter your ingest token once)</label>
                <input id="pair" className="field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
                <button className="btn btn-teal" disabled={!token || busy}>{busy ? "Pairing…" : "Pair"}</button>
              </form>
            )}
            <button type="button" className="btn btn-sm btn-ghost mt-2 -ml-2" aria-expanded={showSetup} onClick={() => setShowSetup(!showSetup)}>
              {showSetup ? "Hide" : "Show"} Apple Shortcuts setup
            </button>
            {showSetup && (
              <ol className="list-decimal pl-5 mt-2 space-y-1 text-[13px]">
                <li>In Shortcuts, add <b>Get Contents of URL</b>.</li>
                <li>URL: <code className="font-mono break-all">{typeof location !== "undefined" ? location.origin : ""}/api/alerts</code>, Method: <b>POST</b>.</li>
                <li>Header <code className="font-mono">Authorization</code> = <code className="font-mono">Bearer &lt;your token&gt;</code>.</li>
                <li>Request body JSON: <code className="font-mono">title</code> (required), <code className="font-mono">body</code>, <code className="font-mono">url</code>, <code className="font-mono">source</code>.</li>
                <li>Trigger it from an Automation (arrive home, alarm stops, focus mode…).</li>
              </ol>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
