"use client";
import { useWorld, world } from "@/engine/store";
import { demo } from "@/engine/adapters/demo";
import { cue } from "@/engine/actions";
import type { WeatherKind } from "@/domain/types";
import { WEATHER_LABEL } from "@/domain/weather";
import type { ResidentController, Behavior } from "@/engine/character";
import { Panel } from "../Panel";

const KINDS: WeatherKind[] = ["sunny", "partly-cloudy", "cloudy", "fog", "rain", "thunderstorm", "snow", "clear-night"];
const res = () => (window as unknown as { __resident?: ResidentController }).__resident;

/** Development-only controls for exercising every room event. */
export function DevPanel() {
  const s = useWorld((x) => x);
  const isDemo = s.mode === "demo";
  const minutes = s.timeOverride ?? new Date(s.now).getHours() * 60 + new Date(s.now).getMinutes();
  const hh = Math.floor(minutes / 60);
  const mm = Math.floor(minutes % 60);
  return (
    <Panel title="Dev tools" skin="screen" width={560}>
      <p className="text-[13px] text-[#b9d6cc] mb-3">
        Testing controls (development only). {isDemo ? "" : "Data buttons need demo mode, so live data is never mixed with samples."}
      </p>
      {!isDemo && <button type="button" className="btn btn-sm mb-3" onClick={() => world.set({ mode: "demo" })}>Switch to demo mode</button>}

      <G title="Time of day (lighting)">
        <input type="range" min={0} max={1439} step={5} value={minutes} aria-label="Time of day" onChange={(e) => world.set({ timeOverride: Number(e.target.value) })} className="w-full accent-[#9FE3C9]" />
        <div className="flex gap-2 items-center flex-wrap">
          <span className="font-mono">{String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</span>
          {[["Dawn", 400], ["Noon", 720], ["Dusk", 1060], ["Night", 1380]].map(([n, v]) => (
            <B key={n} on={() => world.set({ timeOverride: v as number })}>{n}</B>
          ))}
          <B on={() => world.set({ timeOverride: null })}>Real time</B>
        </div>
      </G>
      <G title="Weather (scene)">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <B key={k} on={() => (isDemo ? demo.setWeather(k) : world.set({ weatherOverride: k }))} active={(s.weatherOverride ?? s.weather.data?.kind) === k}>{WEATHER_LABEL[k]}</B>
          ))}
          {s.weatherOverride && <B on={() => world.set({ weatherOverride: null })}>Clear override</B>}
        </div>
      </G>
      <fieldset disabled={!isDemo} className="disabled:opacity-40">
        <G title={`Mail (${s.mail.data?.unreadCount ?? 0} unread)`}>
          <div className="flex flex-wrap gap-2">
            <B on={() => demo.deliver(1)}>Deliver 1</B>
            <B on={() => demo.deliver(3)}>Deliver 3</B>
            {[0, 3, 12, 30].map((n) => <B key={n} on={() => demo.setUnread(n)}>Set {n}</B>)}
          </div>
        </G>
        <G title="Calendar">
          <div className="flex flex-wrap gap-2">
            <B on={() => demo.setCalendar("sample")}>Sample day</B>
            <B on={() => demo.setCalendar("empty")}>Empty day</B>
            <B on={() => demo.addEventSoon()}>Event in 5 min</B>
          </div>
        </G>
        <G title="Devices">
          <div className="flex flex-wrap gap-2">
            <B on={() => demo.computer()}>Computer activity</B>
            <B on={() => demo.phone()}>Phone alert</B>
          </div>
        </G>
      </fieldset>
      <G title="Resident">
        <div className="flex flex-wrap gap-2">
          {(["idle", "wander", "sit", "sleep", "play", "look-window", "check-mail", "react-computer", "inspect-plant", "read-board"] as Behavior[]).map((b) => (
            <B key={b} on={() => res()?.command(b)}>{b}</B>
          ))}
          <B on={() => cue("mail")}>React: mail</B>
          <B on={() => world.set((w) => ({ pet: { ...w.pet, vitals: { ...w.pet.vitals, energy: 10 } } }))}>Energy 10</B>
        </div>
      </G>
      <G title="Simulate">
        <div className="flex flex-wrap gap-2">
          <B on={() => world.set({ online: !s.online })}>{s.online ? "Go offline (UI)" : "Back online (UI)"}</B>
          <B on={() => world.set({ onboarded: false, ui: { open: "welcome", origin: null, focusObject: null } })}>Show welcome</B>
        </div>
      </G>
    </Panel>
  );
}

function G({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="font-display text-screen-glow text-[15px] mb-2">{title}</h3>
      {children}
    </section>
  );
}
function B({ on, children, active }: { on: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button type="button" onClick={on} className={`px-3 min-h-[36px] rounded-lg border-[3px] text-[13px] font-mono ${active ? "bg-screen-glow text-screen border-screen-glow" : "border-[#3b5560] text-[#cfe9df] hover:bg-[#28414b]"}`}>
      {children}
    </button>
  );
}
