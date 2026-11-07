"use client";
import { useEffect } from "react";
import { boot } from "@/engine/boot";
import { useWorld, world } from "@/engine/store";
import { openPanel } from "@/engine/actions";
import { Scene } from "@/scene/Scene";
import { Hud } from "./Hud";
import { Overlays } from "./Overlays";
import { isScreensaver, isStandalone } from "@/engine/platform";

export function App() {
  const hydrated = useWorld((s) => s.hydrated);
  const ambient = typeof window !== "undefined" && isScreensaver();
  useEffect(() => {
    const stop = boot();
    if (!ambient && !world.get().onboarded) setTimeout(() => !world.get().ui.open && openPanel("welcome"), 900);
    if (!isStandalone() && "serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return stop;
  }, [ambient]);
  return (
    <main aria-label="Living Space — your room" className={ambient ? "ambient" : ""}>
      <h1 className="sr-only">Living Space</h1>
      {hydrated ? <Scene /> : <div className="scene grid place-items-center"><span className="font-display text-xl text-ink">Opening the door…</span></div>}
      {/* Screensaver: just the room — no menus, badges or toasts. */}
      {!ambient && <Hud />}
      {!ambient && <Overlays />}
    </main>
  );
}
