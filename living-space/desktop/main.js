// Living Space — desktop shell.
//
// Lives in the menu bar / system tray and shows the room:
//   • in a normal window,
//   • as a screensaver: fullscreen on every display after the computer is idle; any input dismisses it,
//   • as a live wallpaper behind your windows (macOS & Linux),
//   • as a real Windows screen saver via "Living Space.scr" (/s, /c, /p arguments).
// The room is either the built-in offline copy (app/room.html) or your hosted Living Space URL.

const { app, BrowserWindow, Menu, Tray, nativeImage, powerMonitor, powerSaveBlocker, screen, shell, ipcMain, session, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// ───────────────────────────────────────────────────────────── settings
const CONFIG_FILE = () => path.join(app.getPath("userData"), "config.json");
const DEFAULTS = {
  source: "builtin", // "builtin" | "hosted"
  hostedUrl: "",
  screensaverMinutes: 5, // 0 = off
  keepAwake: true,
  wallpaper: false,
  openAtLogin: false,
  pausedUntil: 0,
};
let config = { ...DEFAULTS };
function loadConfig() {
  try {
    config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8")) };
  } catch {
    config = { ...DEFAULTS };
  }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2));
}

// ───────────────────────────────────────────────────────────── arguments
const argv = process.argv.map((a) => a.toLowerCase());
const scrArg = argv.find((a) => /^[/-][scp](:|$)/.test(a)); // Windows screen saver protocol
const startHidden = argv.includes("--hidden") || (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAsHidden);
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const TEST_CAPTURE = process.env.LS_TEST_CAPTURE || ""; // automated visual check: capture the screensaver and quit
const TEST_DISMISS = process.env.LS_TEST_DISMISS === "1"; // automated check: a key press must dismiss the screensaver

if (scrArg && scrArg.startsWith("/p") || scrArg === "-p") {
  // Screen-saver preview pane: not supported; exit quietly so Windows shows its default.
  app.exit(0);
}

// One running copy. A second launch (e.g. Windows starting the .scr) hands its argv to the first.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

// ───────────────────────────────────────────────────────────── room source
function roomUrl(kind) {
  const flag = kind === "screensaver" || kind === "wallpaper" ? "screensaver=1" : "";
  if (config.source === "hosted" && config.hostedUrl) {
    const u = new URL(config.hostedUrl);
    if (flag) u.searchParams.set("screensaver", "1");
    return u.toString();
  }
  const file = path.join(__dirname, "app", "room.html");
  return `file://${file.replace(/\\/g, "/")}${flag ? "?" + flag : ""}`;
}
function hostedOrigin() {
  try {
    return config.source === "hosted" && config.hostedUrl ? new URL(config.hostedUrl).origin : null;
  } catch {
    return null;
  }
}

const ICON = path.join(__dirname, "build", "icon.png");

function roomWindowPrefs(extraArgs) {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    additionalArguments: [`--ls-version=${app.getVersion()}`, ...extraArgs],
  };
}

/** Links open in the real browser; only the room's own origin may navigate in-app. */
function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const target = new URL(url);
    if (target.protocol === "file:") return;
    if (target.origin === hostedOrigin() && !target.pathname.startsWith("/api/auth/google")) return;
    e.preventDefault();
    if (target.origin === hostedOrigin()) {
      // Google doesn't allow sign-in inside embedded app browsers — sign in on the website, then link.
      explainLinking();
      return;
    }
    if (/^https?:/.test(target.protocol)) shell.openExternal(url);
  });
}

// ───────────────────────────────────────────────────────────── main window
let mainWin = null;
let quitting = false;
function openMain() {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    return;
  }
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    title: "Living Space",
    icon: ICON,
    backgroundColor: "#2c2017",
    autoHideMenuBar: true,
    show: false,
    webPreferences: roomWindowPrefs([]),
  });
  guardNavigation(mainWin);
  mainWin.loadURL(roomUrl("window"));
  mainWin.once("ready-to-show", () => mainWin.show());
  mainWin.on("close", (e) => {
    // Closing the window keeps Living Space running in the tray (so the screensaver still works).
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
}

// ───────────────────────────────────────────────────────────── screensaver
let saverWins = [];
let blocker = null;
let quitAfterSaver = false;
function showScreensaver() {
  if (saverWins.length) return;
  if (wallpaperWin) wallpaperWin.hide();
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      show: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      fullscreen: !isMac, // macOS: simpleFullscreen avoids a new Space animation
      simpleFullscreen: isMac,
      backgroundColor: "#2c2017",
      webPreferences: roomWindowPrefs(["--ls-screensaver"]),
    });
    w.setAlwaysOnTop(true, "screen-saver");
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    guardNavigation(w);
    w.loadURL(roomUrl("screensaver"));
    w.once("ready-to-show", () => {
      w.show();
      if (isMac) w.setSimpleFullScreen(true);
      w.focus();
      if (TEST_DISMISS && w === saverWins[0]) {
        setTimeout(() => w.webContents.sendInputEvent({ type: "keyDown", keyCode: "A" }), 2500);
        setTimeout(() => {
          console.log("screensaver windows after key press:", saverWins.length);
          quitting = true;
          app.quit();
        }, 3500);
      }
      if (TEST_CAPTURE && w === saverWins[0]) {
        setTimeout(async () => {
          const img = await w.webContents.capturePage();
          fs.writeFileSync(TEST_CAPTURE, img.toPNG());
          console.log("captured", TEST_CAPTURE, img.getSize());
          quitting = true;
          app.quit();
        }, 5000);
      }
    });
    w.on("closed", () => {
      saverWins = saverWins.filter((x) => x !== w);
    });
    saverWins.push(w);
  }
  if (config.keepAwake && blocker === null) blocker = powerSaveBlocker.start("prevent-display-sleep");
  buildMenu();
}
function hideScreensaver() {
  for (const w of saverWins) if (!w.isDestroyed()) w.destroy();
  saverWins = [];
  if (blocker !== null) {
    powerSaveBlocker.stop(blocker);
    blocker = null;
  }
  if (wallpaperWin) wallpaperWin.showInactive();
  buildMenu();
  if (quitAfterSaver) {
    quitting = true;
    app.quit();
  }
}
ipcMain.on("ls:dismiss", () => hideScreensaver());
ipcMain.on("ls:open-main", () => openMain());

// Idle watcher: poll the OS idle time (cheap) instead of hooking global input.
let idleTimer = null;
function startIdleWatch() {
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (!config.screensaverMinutes || saverWins.length) return;
    if (Date.now() < config.pausedUntil) return;
    if (powerMonitor.getSystemIdleTime() >= config.screensaverMinutes * 60) showScreensaver();
  }, 5000);
}

// ───────────────────────────────────────────────────────────── live wallpaper
let wallpaperWin = null;
function setWallpaper(on) {
  if (!on) {
    if (wallpaperWin && !wallpaperWin.isDestroyed()) wallpaperWin.destroy();
    wallpaperWin = null;
    return;
  }
  if (wallpaperWin) return;
  const d = screen.getPrimaryDisplay();
  wallpaperWin = new BrowserWindow({
    ...d.workArea,
    type: "desktop", // macOS & Linux: sits on the desktop layer, behind every window
    frame: false,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    backgroundColor: "#2c2017",
    webPreferences: roomWindowPrefs(["--ls-wallpaper"]),
  });
  guardNavigation(wallpaperWin);
  wallpaperWin.loadURL(roomUrl("wallpaper"));
  wallpaperWin.once("ready-to-show", () => wallpaperWin && wallpaperWin.showInactive());
  wallpaperWin.on("closed", () => (wallpaperWin = null));
}

// ───────────────────────────────────────────────────────────── prompts
function prompt({ title, text, value = "", placeholder = "" }) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 560,
      height: 300,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Living Space",
      icon: ICON,
      backgroundColor: "#fbf5e8",
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
      if (!w.isDestroyed()) w.close();
    };
    w.webContents.on("did-navigate-in-page", (_e, url) => {
      const m = /#result=(.*)$/.exec(url);
      if (m) finish(JSON.parse(decodeURIComponent(m[1])));
    });
    w.on("closed", () => finish(null));
    const q = new URLSearchParams({ title, text, value, placeholder });
    w.loadFile(path.join(__dirname, "app", "prompt.html"), { search: q.toString() });
  });
}

async function chooseHosted() {
  const url = await prompt({
    title: "Use your hosted Living Space",
    text: "Paste the address of your deployed Living Space (for example https://living-space-yourname.vercel.app). It shows your real Gmail and Calendar once linked.",
    value: config.hostedUrl,
    placeholder: "https://…",
  });
  if (url === null) return;
  let u;
  try {
    u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    dialog.showErrorBox("Living Space", "That doesn't look like a web address.");
    return;
  }
  config.hostedUrl = u.origin + "/";
  config.source = "hosted";
  saveConfig();
  reloadRooms();
}

function explainLinking() {
  dialog
    .showMessageBox({
      type: "info",
      title: "Living Space",
      message: "Sign in to Google on the website, then link this app",
      detail:
        "Google doesn't allow sign-in inside desktop apps' built-in browsers.\n\n1. Open your Living Space in your normal browser and connect Google.\n2. Home → Connections → “Link the desktop app…” and copy the code.\n3. Here: tray menu → “Link Google account…” and paste it.",
      buttons: ["Open website", "Link now", "Later"],
      defaultId: 0,
    })
    .then(({ response }) => {
      if (response === 0 && config.hostedUrl) shell.openExternal(config.hostedUrl);
      if (response === 1) linkAccount();
    });
}

async function linkAccount() {
  const code = await prompt({
    title: "Link Google account",
    text: "Paste the code from your Living Space website (Home → Connections → Link the desktop app). Keep it private — it works like a password.",
    placeholder: "lsdesk1.…",
  });
  if (!code) return;
  try {
    const origin = await applyLinkCode(code);
    dialog.showMessageBox({ type: "info", title: "Living Space", message: "Linked", detail: `Your Gmail and Calendar from ${origin} will appear in the room.` });
  } catch {
    dialog.showErrorBox("Living Space", "That code didn't work. Generate a new one on the website and paste the whole thing.");
  }
}

/** Store the site's encrypted session cookie(s) for the hosted origin and switch to it. */
async function applyLinkCode(code) {
  {
    if (!code.startsWith("lsdesk1.")) throw new Error("bad prefix");
    const data = JSON.parse(Buffer.from(code.slice(8), "base64url").toString("utf8"));
    const origin = new URL(data.origin).origin;
    const secure = origin.startsWith("https:");
    const expirationDate = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
    if (data.g) await session.defaultSession.cookies.set({ url: origin, name: "ls_google", value: data.g, httpOnly: true, secure, sameSite: "lax", path: "/", expirationDate });
    if (data.d) await session.defaultSession.cookies.set({ url: origin, name: "ls_device", value: data.d, httpOnly: true, secure, sameSite: "strict", path: "/", expirationDate });
    config.hostedUrl = origin + "/";
    config.source = "hosted";
    saveConfig();
    reloadRooms();
    return origin;
  }
}

function reloadRooms() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(roomUrl("window"));
  if (wallpaperWin) wallpaperWin.loadURL(roomUrl("wallpaper"));
  buildMenu();
}

// ───────────────────────────────────────────────────────────── tray menu
let tray = null;
function buildMenu() {
  if (!tray) return;
  const minutes = [0, 1, 3, 5, 10, 15, 30, 60];
  const paused = Date.now() < config.pausedUntil;
  const set = (patch, after) => () => {
    Object.assign(config, patch);
    saveConfig();
    after?.();
    buildMenu();
  };
  const menu = Menu.buildFromTemplate([
    { label: "Open Living Space", click: openMain },
    { type: "separator" },
    { label: saverWins.length ? "Hide screensaver" : "Show screensaver now", click: () => (saverWins.length ? hideScreensaver() : showScreensaver()) },
    {
      label: "Screensaver after idle",
      submenu: minutes.map((m) => ({
        label: m === 0 ? "Off" : m === 60 ? "1 hour" : `${m} minute${m === 1 ? "" : "s"}`,
        type: "radio",
        checked: config.screensaverMinutes === m,
        click: set({ screensaverMinutes: m }),
      })),
    },
    { label: "Keep screen awake while showing", type: "checkbox", checked: config.keepAwake, click: (i) => set({ keepAwake: i.checked })() },
    {
      label: paused ? "Resume screensaver" : "Pause screensaver for 1 hour",
      click: set({ pausedUntil: paused ? 0 : Date.now() + 3600_000 }),
    },
    {
      label: isWin ? "Live wallpaper (macOS & Linux only)" : "Live wallpaper (behind windows)",
      type: "checkbox",
      enabled: !isWin,
      checked: config.wallpaper && !isWin,
      click: (i) => set({ wallpaper: i.checked }, () => setWallpaper(i.checked))(),
    },
    { type: "separator" },
    {
      label: "Room source",
      submenu: [
        { label: "Built-in (offline)", type: "radio", checked: config.source === "builtin", click: set({ source: "builtin" }, reloadRooms) },
        { label: config.hostedUrl ? `My hosted Living Space (${new URL(config.hostedUrl).host})` : "My hosted Living Space…", type: "radio", checked: config.source === "hosted", click: () => chooseHosted() },
        { label: "Change hosted address…", enabled: Boolean(config.hostedUrl), click: () => chooseHosted() },
      ],
    },
    { label: "Link Google account…", click: () => (config.hostedUrl ? linkAccount() : chooseHosted().then(() => config.hostedUrl && explainLinking())) },
    { type: "separator" },
    {
      label: "Start at login",
      type: "checkbox",
      checked: config.openAtLogin,
      click: (i) =>
        set({ openAtLogin: i.checked }, () => app.setLoginItemSettings({ openAtLogin: i.checked, openAsHidden: true, args: ["--hidden"] }))(),
    },
    { label: "Quit Living Space", click: () => ((quitting = true), app.quit()) },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(saverWins.length ? "Living Space — screensaver on" : "Living Space");
}

// ───────────────────────────────────────────────────────────── lifecycle
app.on("second-instance", (_e, args) => {
  const a = args.map((x) => x.toLowerCase());
  if (a.some((x) => /^[/-]s$/.test(x))) showScreensaver();
  else openMain();
});

app.whenReady().then(() => {
  loadConfig();
  if (isMac && app.dock) app.dock.setIcon(nativeImage.createFromPath(ICON));
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "build", isMac ? "trayTemplate.png" : "tray.png"));
  tray = new Tray(trayIcon);
  if (!isMac) tray.on("click", openMain);
  buildMenu();
  startIdleWatch();
  if (config.wallpaper && !isWin) setWallpaper(true);

  if (scrArg && /^[/-]s/.test(scrArg)) {
    // Launched by Windows as the screen saver: show now, exit when dismissed.
    quitAfterSaver = true;
    showScreensaver();
  } else if (scrArg && /^[/-]c/.test(scrArg)) {
    openMain();
  } else if (process.env.LS_TEST_LINK) {
    // Automated check: apply a link code, then ask the hosted room whether Google is connected.
    applyLinkCode(process.env.LS_TEST_LINK).then(async () => {
      openMain();
      mainWin.webContents.once("did-finish-load", async () => {
        const st = await mainWin.webContents.executeJavaScript("fetch('/api/status').then(r => r.json())");
        console.log("hosted status after link:", JSON.stringify(st.google));
        quitting = true;
        app.quit();
      });
    }, (e) => (console.log("link failed", e), app.exit(1)));
  } else if (TEST_CAPTURE || TEST_DISMISS || argv.includes("--screensaver")) {
    showScreensaver();
  } else if (!startHidden) {
    openMain();
  }
  screen.on("display-added", () => saverWins.length && (hideScreensaver(), showScreensaver()));
  screen.on("display-removed", () => saverWins.length && (hideScreensaver(), showScreensaver()));
});

// Keep running in the tray when every window is closed.
app.on("window-all-closed", () => {});
app.on("activate", openMain);
app.on("before-quit", () => (quitting = true));
