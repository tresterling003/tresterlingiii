// Runs in every room window. Exposes a tiny, read-only bridge and, in screensaver
// windows, turns any keyboard/mouse/touch input into "dismiss".
const { contextBridge, ipcRenderer } = require("electron");

const arg = (name) => process.argv.includes(name);
const screensaver = arg("--ls-screensaver");
const wallpaper = arg("--ls-wallpaper");

contextBridge.exposeInMainWorld("livingSpaceDesktop", {
  version: process.argv.find((a) => a.startsWith("--ls-version="))?.split("=")[1] ?? "",
  screensaver: screensaver || wallpaper,
  openSettings: () => ipcRenderer.send("ls:open-main"),
});

if (screensaver) {
  const shownAt = Date.now();
  let origin = null;
  const dismiss = () => {
    // Ignore the first moment (mouse jitter, the click that may have triggered "Show now").
    if (Date.now() - shownAt > 1200) ipcRenderer.send("ls:dismiss");
  };
  window.addEventListener("keydown", dismiss, true);
  window.addEventListener("mousedown", dismiss, true);
  window.addEventListener("touchstart", dismiss, true);
  window.addEventListener("wheel", dismiss, true);
  window.addEventListener(
    "mousemove",
    (e) => {
      if (!origin) origin = { x: e.screenX, y: e.screenY };
      else if (Math.hypot(e.screenX - origin.x, e.screenY - origin.y) > 12) dismiss();
    },
    true,
  );
  // No cursor over the ambient room.
  window.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "*{cursor:none!important}";
    document.head.appendChild(s);
  });
}
