// ================= GAMEPAD (PlayStation / Xbox / any "standard" controller) =================
// Standard mapping: 0 ✕  1 ○  2 □  3 △  4 L1  5 R1  6 L2  7 R2  8 Share/Create  9 Options
// 10 L3  11 R3  12-15 D-pad (up, down, left, right)  16 PS  17 touchpad
const PAD = {
  idx: null, prev: [], connected: false, menuRepeat: 0, lastDir: null, duckHeld: false,
  // gameplay bindings -> virtual key codes used by KEYMAP
  bind: { 7: 'Pad_throw', 6: 'Pad_catch', 2: 'Pad_juke', 0: 'Pad_jump', 1: 'Pad_dive', 3: 'Pad_switch', 4: 'Pad_fake', 5: 'Pad_sprint', 10: 'Pad_sprint', 11: 'Pad_target', 8: 'Pad_camera', 17: 'Pad_camera' },
};
for (const [a, code] of [['throw', 'Pad_throw'], ['catch', 'Pad_catch'], ['juke', 'Pad_juke'], ['jump', 'Pad_jump'], ['dive', 'Pad_dive'], ['switch', 'Pad_switch'], ['fake', 'Pad_fake'], ['sprint', 'Pad_sprint'], ['target', 'Pad_target'], ['camera', 'Pad_camera'], ['duck', 'Pad_duck']]) KEYMAP[a].push(code);
INPUT.pad = { x: 0, y: 0, active: false };

function padLabel() { const g = PAD.idx != null && navigator.getGamepads ? navigator.getGamepads()[PAD.idx] : null; const id = g ? g.id.toLowerCase() : ''; return /xbox|xinput|microsoft/.test(id) ? 'xbox' : 'ps'; }
function padName(btn) {
  const ps = { throw: 'R2', catch: 'L2', juke: '□', jump: '✕', dive: '○', switch: '△', fake: 'L1', sprint: 'R1', duck: 'RIGHT STICK ↓', camera: 'TOUCHPAD', pause: 'OPTIONS', target: 'R3' };
  const xb = { throw: 'RT', catch: 'LT', juke: 'X', jump: 'A', dive: 'B', switch: 'Y', fake: 'LB', sprint: 'RB', duck: 'RIGHT STICK ↓', camera: 'VIEW', pause: 'MENU', target: 'RS' };
  return (padLabel() === 'xbox' ? xb : ps)[btn];
}
addEventListener('gamepadconnected', (e) => {
  PAD.idx = e.gamepad.index; PAD.connected = true; document.body.classList.add('pad');
  UI.hint((padLabel() === 'xbox' ? 'XBOX' : 'PLAYSTATION') + ' CONTROLLER CONNECTED', 'pad' + Math.random());
});
addEventListener('gamepaddisconnected', (e) => {
  if (e.gamepad.index !== PAD.idx) return;
  PAD.idx = null; PAD.connected = false; document.body.classList.remove('pad'); INPUT.pad.active = false;
  for (const code of Object.values(PAD.bind).concat('Pad_duck')) keyUp(code);
  if (UI.inGame() && !UI.paused) UI.togglePause(true);
});

function rumble(strong, weak, ms) {
  const g = PAD.idx != null ? navigator.getGamepads()[PAD.idx] : null;
  const a = g && g.vibrationActuator; if (!a || !a.playEffect) return;
  try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => { }); } catch (e) { }
}

// ---------- menu navigation with the controller ----------
function padMenuRoot() {
  if ($('#scr-info').classList.contains('show')) return $('#scr-info');
  if ($('#scr-pause').classList.contains('show')) return $('#scr-pause');
  if (UI.screen === 'hud') return null;
  return $('#scr-' + UI.screen);
}
function padFocusables(root) {
  return $$('button, input', root).filter(el => !el.disabled && el.offsetParent !== null && !el.classList.contains('tb') && getComputedStyle(el).visibility !== 'hidden');
}
function padMenu(cmd) {
  const root = padMenuRoot(); if (!root) return;
  const els = padFocusables(root); if (!els.length) return;
  let cur = els.includes(document.activeElement) ? document.activeElement : null;
  if (cmd === 'ok') { if (!cur) cur = els.find(e => e.classList.contains('cta') || e.classList.contains('primary')) || els[0]; AUDIO.init(); cur.click(); if (cur.tagName === 'INPUT') cur.focus(); return; }
  if (cmd === 'back') {
    AUDIO.init();
    if (root.id === 'scr-info') { const c = $('.close', root); if (c) c.click(); return; }
    if (root.id === 'scr-pause') { UI.togglePause(false); return; }
    const b = $('.back', root); if (b) b.click(); return;
  }
  if (!cur) { const first = els.find(e => e.classList.contains('cta') || e.classList.contains('primary') || e.classList.contains('on')) || els[0]; first.focus({ preventScroll: false }); AUDIO.ui(); return; }
  const r0 = cur.getBoundingClientRect(); const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[cmd];
  let best = null, bs = 1e9;
  for (const e of els) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(); const ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
    const along = ex * dx + ey * dy; if (along <= 4) continue;
    const across = Math.abs(ex * dy - ey * dx);
    const s = along + across * 2.2; if (s < bs) { bs = s; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); AUDIO.ui(); }
}

// ---------- per-frame poll ----------
function pollGamepad(dtReal) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads(); let g = PAD.idx != null ? pads[PAD.idx] : null;
  if (!g || !g.connected) { g = null; for (const p of pads) if (p && p.connected !== false) { g = p; PAD.idx = p.index; if (!PAD.connected) { PAD.connected = true; document.body.classList.add('pad'); UI.hint((padLabel() === 'xbox' ? 'XBOX' : 'PLAYSTATION') + ' CONTROLLER CONNECTED', 'pad' + Math.random()); } break; } }
  if (!g) return;
  const btn = (i) => { const b = g.buttons[i]; return !!b && (b.pressed || (typeof b === 'number' ? b > 0.45 : b.value > 0.45)); };
  const now = g.buttons.map((_, i) => btn(i));
  const edge = (i) => now[i] && !PAD.prev[i];
  const anyEdge = now.some((v, i) => v && !PAD.prev[i]);
  if (anyEdge) AUDIO.init();
  // skip replays with any button
  if (REPLAY.on && anyEdge) { endReplay(); PAD.prev = now; return; }
  // Options / Menu = pause
  if (edge(9) && UI.inGame()) UI.togglePause();
  const menuMode = !UI.inGame() || UI.paused;
  // left stick + d-pad
  let x = g.axes[0] || 0, y = g.axes[1] || 0;
  if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }
  if (now[14]) x = -1; if (now[15]) x = 1; if (now[12]) y = -1; if (now[13]) y = 1;
  if (menuMode) {
    INPUT.pad.active = false;
    for (const code of Object.values(PAD.bind).concat('Pad_duck')) keyUp(code);
    let dir = null;
    if (Math.abs(x) > 0.6 || Math.abs(y) > 0.6) dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    if (dir) { PAD.menuRepeat -= dtReal; if (dir !== PAD.lastDir || PAD.menuRepeat <= 0) { padMenu(dir); PAD.menuRepeat = dir !== PAD.lastDir ? 0.38 : 0.14; } }
    PAD.lastDir = dir;
    if (edge(0)) padMenu('ok');
    if (edge(1)) padMenu('back');
    PAD.prev = now; return;
  }
  INPUT.pad.x = x; INPUT.pad.y = y; INPUT.pad.active = Math.hypot(x, y) > 0;
  for (const [i, code] of Object.entries(PAD.bind)) {
    const on = now[i];
    // several buttons can share one code (R1 and L3 both sprint): only release when none is held
    const shared = Object.entries(PAD.bind).some(([j, c]) => c === code && now[j]);
    if (on && !PAD.prev[i]) keyDown(code);
    else if (!shared && INPUT.keys.has(code)) keyUp(code);
  }
  // duck = hold the right stick down
  const ry = g.axes[3] || 0; const duck = ry > 0.6;
  if (duck && !PAD.duckHeld) keyDown('Pad_duck'); else if (!duck && PAD.duckHeld) keyUp('Pad_duck');
  PAD.duckHeld = duck;
  PAD.prev = now;
}
