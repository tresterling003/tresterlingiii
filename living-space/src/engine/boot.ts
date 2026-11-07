"use client";
import { world, hydrate, resetTransient } from "./store";
import { startClock } from "./clock";
import { startAdapters, stopAdapters } from "./adapters/registry";
import { gmailAdapter } from "./adapters/gmail";
import { calendarAdapter } from "./adapters/calendar";
import { weatherAdapter } from "./adapters/weather";
import { alertsAdapter } from "./adapters/alerts";
import { taskRemindersAdapter } from "./adapters/tasks";
import { demoAdapter } from "./adapters/demo";
import { loadStatus } from "./adapters/status";
import { toast } from "./actions";

/** Environment controller bootstrap: clock, connectivity, and the right set of adapters for the mode. */
export function boot(): () => void {
  hydrate();
  const stopClock = startClock();
  const online = () => world.set({ online: navigator.onLine });
  window.addEventListener("online", online);
  window.addEventListener("offline", online);

  let mode = world.get().mode;
  const startFor = async (m: "demo" | "live") => {
    resetTransient();
    await loadStatus();
    if (m === "demo") startAdapters([demoAdapter(), taskRemindersAdapter()]);
    else startAdapters([weatherAdapter(), gmailAdapter(), calendarAdapter(), alertsAdapter(), taskRemindersAdapter()]);
  };
  startFor(mode);
  const unsub = world.subscribe(() => {
    const m = world.get().mode;
    if (m !== mode) {
      mode = m;
      startFor(m);
    }
  });

  const p = new URLSearchParams(location.search);
  // Home-screen shortcuts (long-press the app icon): /?open=agenda etc.
  const open = p.get("open");
  if (open === "agenda" || open === "inbox") {
    world.set({ onboarded: true, ui: { open, origin: null, focusObject: null } });
    history.replaceState(null, "", location.pathname);
  }
  // OAuth round-trip result.
  const c = p.get("connect");
  if (c) {
    const msg: Record<string, string> = {
      ok: "Google connected. Your mail and today's plans are on their way.",
      denied: "Google sign-in was cancelled.",
      not_configured: "Google isn't configured on the server yet. See Settings for setup steps.",
      wrong_account: "That Google account isn't allowed for this home.",
      no_refresh: "Google didn't grant offline access. Try connecting again.",
    };
    toast({ title: msg[c] ?? "Couldn't finish connecting Google. Try again.", tone: c === "ok" ? "info" : "error", panel: "settings" });
    if (c === "ok") world.set({ mode: "live", onboarded: true });
    history.replaceState(null, "", location.pathname);
  }

  return () => {
    stopClock();
    stopAdapters();
    unsub();
    window.removeEventListener("online", online);
    window.removeEventListener("offline", online);
  };
}
