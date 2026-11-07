"use client";
import { useState } from "react";
import { useWorld, world } from "@/engine/store";
import { loadStatus } from "@/engine/adapters/status";
import { api } from "@/engine/poll";
import { toast } from "@/engine/actions";
import { THEMES, DEFAULT_THEME } from "@/scene/theme";
import type { SavedLocation } from "@/domain/types";
import { Panel } from "../Panel";
import { InstallGuide } from "../InstallGuide";

export function SettingsPanel() {
  const s = useWorld((x) => x);
  const g = s.status?.google;
  const a = s.status?.alerts;
  return (
    <Panel title="Home settings" skin="card" width={560}>
      <Section title="Put it on your phone">
        <InstallGuide />
      </Section>

      <Section title="Mode">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Data mode">
          {(["live", "demo"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={s.mode === m} onClick={() => world.set({ mode: m })} className={`rounded-xl border-[2.5px] px-3 py-3 text-left ${s.mode === m ? "border-ink bg-honey-soft shadow-[0_3px_0_#4A3428]" : "border-ink/40"}`}>
              <span className="block font-display text-[17px]">{m === "live" ? "My real day" : "Demo"}</span>
              <span className="block text-sm text-ink-soft">{m === "live" ? "Connected services only" : "Clearly-marked sample data"}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Connections">
        <Row
          name="Google (Gmail + Calendar)"
          state={!g ? "Server unreachable" : !g.configured ? "Not configured on server" : g.connected ? `Connected · ${g.email}` : "Not connected"}
          ok={!!g?.connected}
        >
          {g?.configured && !g.connected && <a className="btn btn-sm btn-primary" href="/api/auth/google">Connect</a>}
          {g?.connected && (
            <>
              <a className="btn btn-sm" href="/api/auth/google">Reconnect</a>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                  await loadStatus();
                  world.set({ mail: { status: "idle", data: null, error: { code: "not_connected", message: "" }, updatedAt: 0 }, calendar: { status: "idle", data: null, error: { code: "not_connected", message: "" }, updatedAt: 0 } });
                  toast({ title: "Google disconnected", tone: "info" });
                }}
              >
                Disconnect
              </button>
            </>
          )}
        </Row>
        {g && !g.configured && <p className="text-sm text-ink-soft -mt-1 mb-2">Missing: <span className="font-mono">{g.missing.join(", ")}</span>. See README.</p>}
        <Row name="Weather (Open-Meteo)" state={s.settings.location ? s.settings.location.name : "No location set"} ok={!!s.settings.location} />
        <Row name="Shortcut alerts" state={!a?.configured ? "Not configured on server" : a.paired ? "This device is paired" : "Not paired (open the phone)"} ok={!!a?.paired} />
      </Section>

      <Section title="Location">
        <LocationPicker />
        <div className="flex gap-2 mt-3" role="radiogroup" aria-label="Units">
          {(["metric", "imperial"] as const).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={s.settings.units === u} className={`btn btn-sm ${s.settings.units === u ? "btn-teal" : ""}`} onClick={() => world.set((w) => ({ settings: { ...w.settings, units: u } }))}>
              {u === "metric" ? "°C" : "°F"}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Room">
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const th = { ...DEFAULT_THEME, ...t.patch };
            const on = s.settings.theme.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => world.set((w) => ({ settings: { ...w.settings, theme: { ...w.settings.theme, ...DEFAULT_THEME, ...t.patch, id: t.id, residentBody: w.settings.theme.residentBody, residentBelly: w.settings.theme.residentBelly, residentSprout: w.settings.theme.residentSprout } } }))}
                className={`rounded-xl border-[2.5px] p-2 flex items-center gap-3 ${on ? "border-ink shadow-[0_3px_0_#4A3428]" : "border-ink/40"}`}
              >
                <span className="w-12 h-10 rounded-md border-2 border-ink overflow-hidden flex flex-col" aria-hidden>
                  <span className="flex-1" style={{ background: th.wallpaper }} />
                  <span className="h-2" style={{ background: th.wainscot }} />
                  <span className="h-2.5" style={{ background: th.floor }} />
                </span>
                <span className="font-display">{t.name}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <p className="text-xs text-ink-soft">Tasks, settings and {s.pet.name} are saved on this device. Gmail and Calendar content is never stored in the browser.</p>
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="font-display text-[17px] mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Row({ name, state, ok, children }: { name: string; state: string; ok: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-paper-line last:border-0 flex-wrap">
      <span className={`w-3 h-3 rounded-full border-2 border-ink ${ok ? "bg-sage" : "bg-paper-edge"}`} aria-hidden />
      <span className="flex-1 min-w-[180px]">
        <span className="block font-semibold">{name}</span>
        <span className="block text-sm text-ink-soft break-all">{state}</span>
      </span>
      <span className="flex gap-2">{children}</span>
    </div>
  );
}

function LocationPicker() {
  const loc = useWorld((s) => s.settings.location);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = (l: SavedLocation) => {
    world.set((w) => ({ settings: { ...w.settings, location: l } }));
    setResults(null);
    toast({ title: `Home set to ${l.name.split(",")[0]}`, tone: "info" });
  };
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ results: { name: string; latitude: number; longitude: number }[] }>(`/api/geocode?q=${encodeURIComponent(q)}`);
      setResults(r.results);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const device = () => {
    if (!navigator.geolocation) return setErr("This browser doesn't support location.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        // Rounded to ~1 km: enough for weather, and we never keep a precise position.
        save({ name: "Current area", latitude: Math.round(p.coords.latitude * 100) / 100, longitude: Math.round(p.coords.longitude * 100) / 100, source: "device" });
      },
      (e) => {
        setBusy(false);
        setErr(e.code === 1 ? "Location permission was declined. You can search for a city instead." : "Couldn't get your location.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 },
    );
  };
  return (
    <div>
      <p className="text-sm mb-2">{loc ? <>Home: <b>{loc.name}</b></> : "No location yet — the window shows a generic sky until you choose one."}</p>
      <form onSubmit={search} className="flex gap-2">
        <label htmlFor="city" className="sr-only">City</label>
        <input id="city" className="field" placeholder="Search a city" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={q.trim().length < 2 || busy}>Search</button>
      </form>
      <button type="button" className="btn btn-sm btn-ghost mt-2 -ml-2" onClick={device} disabled={busy}>
        Use my location (asks permission)
      </button>
      {err && <p className="text-sm text-tomato-dark mt-1" role="alert">{err}</p>}
      {results && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.length === 0 && <li className="text-sm">No matches.</li>}
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button type="button" className="w-full text-left px-3 py-2 rounded-lg hover:bg-paper-warm min-h-[44px]" onClick={() => save({ ...r, source: "search" })}>
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
