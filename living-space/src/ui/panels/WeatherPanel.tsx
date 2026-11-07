"use client";
import { useWorld } from "@/engine/store";
import { refreshSource } from "@/engine/adapters/registry";
import { openPanel } from "@/engine/actions";
import { sceneLook } from "@/engine/clock";
import { shortForecast } from "@/domain/openmeteo";
import { describeWmo, WEATHER_LABEL } from "@/domain/weather";
import { Panel, SourceStatus } from "../Panel";
import { Skeleton } from "./InboxPanel";

export function WeatherPanel() {
  const s = useWorld((x) => x);
  const w = s.weather;
  const isDemo = s.mode === "demo";
  const look = sceneLook(s);
  const deg = w.data?.units === "imperial" ? "°F" : "°C";
  const loc = s.settings.location;
  return (
    <div style={{ ["--sky-top" as string]: look.lighting.skyTop, ["--sky-bot" as string]: look.lighting.skyBottom }}>
      <Panel title={isDemo ? "Outside (sample)" : loc ? loc.name.split(",")[0] : "Outside"} skin="postcard" width={500} sample={isDemo}>
        {w.data ? (
          <>
            <div className="flex items-end h-[96px] -mt-2 mb-4">
              <div className="flex items-center gap-4 bg-ink text-paper px-4 py-2 pbox">
              <span className="font-display text-[56px] leading-none font-bold">{Math.round(w.data.temperature)}°</span>
              <span>
                <span className="block font-display text-xl">{w.data.description}</span>
                <span className="block text-[15px]">
                  {w.data.apparent != null && `Feels like ${Math.round(w.data.apparent)}°`}
                </span>
              </span>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 mb-4">
              {[
                ["High", w.data.high != null ? `${Math.round(w.data.high)}${deg}` : "—"],
                ["Low", w.data.low != null ? `${Math.round(w.data.low)}${deg}` : "—"],
                ["Rain chance", w.data.precipChance != null ? `${w.data.precipChance}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border-[3px] border-ink bg-[#fffdf7] px-3 py-2 text-center">
                  <dt className="text-xs uppercase tracking-wider text-ink-soft">{k}</dt>
                  <dd className="font-display text-xl">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[16px] mb-4">{shortForecast(w.data)}</p>
            {w.data.hourly.length > 0 && (
              <ol className="flex gap-2 overflow-x-auto scroll-soft pb-2 -mx-1 px-1" aria-label="Next hours">
                {w.data.hourly.slice(0, 12).map((h) => (
                  <li key={h.time} className="shrink-0 w-[64px] rounded-xl border-[3px] border-ink/70 bg-paper-warm text-center py-2">
                    <div className="text-xs text-ink-soft">{new Date(h.time).toLocaleTimeString(undefined, { hour: "numeric" })}</div>
                    <div className="font-display text-lg">{Math.round(h.temperature)}°</div>
                    <div className="text-[11px] leading-tight px-1">{describeWmo(h.code).description}</div>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-ink-soft mt-3">
              Scene: {WEATHER_LABEL[look.weather]}. {isDemo ? "Sample weather — change it from the dev tools." : "Data: Open-Meteo, refreshed every 15 min."}
            </p>
          </>
        ) : w.status === "loading" ? (
          <div className="pt-24"><Skeleton /></div>
        ) : (
          <div className="pt-24">
            <p className="font-display text-lg mb-2">{w.error?.code === "no_location" || !loc ? "Where is home?" : "The weather report didn't arrive."}</p>
            <p className="mb-4 text-[15px]">{w.error?.code === "no_location" || !loc ? "Pick a city (or allow location once) so the window shows your real sky." : w.error?.message}</p>
            <button type="button" className="btn btn-primary" onClick={() => openPanel("settings")}>Set location</button>
          </div>
        )}
        {!isDemo && w.data && (
          <div className="mt-3">
            <SourceStatus status={w.status} error={w.error} updatedAt={w.updatedAt} now={s.now} onRefresh={() => refreshSource("weather")} live={false} />
          </div>
        )}
      </Panel>
    </div>
  );
}
