/**
 * Where is this copy of Living Space running?
 *
 * - "web":        the Next.js app with its server routes (Gmail, Calendar, alerts, weather proxy).
 * - "standalone": the single-file build (living-space.html / the desktop app's offline room).
 *                 There is no server, so weather is fetched straight from Open-Meteo and the
 *                 Google/alerts integrations are honestly reported as unavailable.
 */
declare global {
  interface Window {
    __LIVING_SPACE_STANDALONE__?: boolean;
    livingSpaceDesktop?: { version: string; screensaver: boolean; openSettings(): void };
  }
}

export function isStandalone(): boolean {
  return typeof window !== "undefined" && window.__LIVING_SPACE_STANDALONE__ === true;
}

export function desktopShell() {
  return typeof window !== "undefined" ? window.livingSpaceDesktop ?? null : null;
}

/** Screensaver windows are ambient: no menus, no welcome, input dismisses them. */
export function isScreensaver(): boolean {
  return Boolean(desktopShell()?.screensaver) || (typeof location !== "undefined" && new URLSearchParams(location.search).has("screensaver"));
}
