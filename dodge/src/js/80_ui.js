// ================= INPUT =================
const INPUT = { keys: new Set(), pressed: new Set(), released: new Set(), stick: { x: 0, y: 0, active: false, id: null }, manualTarget: null, mouse: { l: false, r: false } };
const KEYMAP = {
  throw: ['KeyJ', 'Mouse0', 'Numpad1', 'Touch_throw'], catch: ['KeyK', 'Mouse2', 'Numpad2', 'Touch_catch'], juke: ['KeyL', 'KeyE', 'Touch_juke'],
  jump: ['Space', 'Touch_jump'], duck: ['KeyC', 'ControlLeft', 'Touch_duck'], fake: ['KeyF', 'Touch_fake'], switch: ['KeyQ', 'Tab', 'Touch_switch'],
  target: ['KeyR'], sprint: ['ShiftLeft', 'ShiftRight'], dive: ['KeyX', 'Touch_dive'], camera: ['KeyV', 'Touch_cam'],
};
const held = (a) => KEYMAP[a].some(k => INPUT.keys.has(k));
const pressed = (a) => KEYMAP[a].some(k => INPUT.pressed.has(k));
const releasedA = (a) => KEYMAP[a].some(k => INPUT.released.has(k));
function keyDown(code) { if (!INPUT.keys.has(code)) INPUT.pressed.add(code); INPUT.keys.add(code); }
function keyUp(code) { if (INPUT.keys.has(code)) INPUT.released.add(code); INPUT.keys.delete(code); }
addEventListener('keydown', (e) => {
  AUDIO.init();
  if (REPLAY.on) { endReplay(); e.preventDefault(); return; }
  if ((e.code === 'Escape' || e.code === 'KeyP') && UI.inGame()) { UI.togglePause(); e.preventDefault(); return; }
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && UI.inGame()) e.preventDefault();
  if (e.repeat) return; keyDown(e.code);
});
addEventListener('keyup', (e) => keyUp(e.code));
addEventListener('blur', () => { for (const k of [...INPUT.keys]) keyUp(k); });
canvas.addEventListener('mousedown', (e) => { AUDIO.init(); if (REPLAY.on) { endReplay(); return; } if (isTouch) return; keyDown('Mouse' + e.button); });
addEventListener('mouseup', (e) => keyUp('Mouse' + e.button));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function setupTouch() {
  if (!isTouch) return;
  document.body.classList.add('touch');
  const stick = $('#stick'), knob = $('#stick-knob');
  const R = () => stick.getBoundingClientRect();
  const move = (t) => {
    const r = R(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const max = r.width * 0.42;
    let dx = t.clientX - cx, dy = t.clientY - cy; const l = Math.hypot(dx, dy); if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; INPUT.stick.x = dx / max; INPUT.stick.y = dy / max;
    stick.classList.toggle('sprint', Math.hypot(INPUT.stick.x, INPUT.stick.y) > 0.92);
  };
  stick.addEventListener('touchstart', (e) => { AUDIO.init(); const t = e.changedTouches[0]; INPUT.stick.id = t.identifier; INPUT.stick.active = true; move(t); e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === INPUT.stick.id) move(t); e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === INPUT.stick.id) { INPUT.stick.active = false; INPUT.stick.x = INPUT.stick.y = 0; knob.style.transform = ''; stick.classList.remove('sprint'); } };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
  for (const b of $$('.tb')) {
    const code = 'Touch_' + b.dataset.b;
    b.addEventListener('touchstart', (e) => { AUDIO.init(); if (REPLAY.on) { endReplay(); e.preventDefault(); return; } keyDown(code); b.classList.add('down'); e.preventDefault(); }, { passive: false });
    const up = (e) => { keyUp(code); b.classList.remove('down'); e.preventDefault(); };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  }
  canvas.addEventListener('touchstart', () => { AUDIO.init(); if (REPLAY.on) endReplay(); }, { passive: true });
  $('#replay-ui').addEventListener('touchstart', () => REPLAY.on && endReplay(), { passive: true });
}

// ---- human intent ----
function humanIntent(p, dt) {
  const I = {};
  let mx = 0, my = 0;
  if (INPUT.keys.has('KeyA') || INPUT.keys.has('ArrowLeft')) mx -= 1;
  if (INPUT.keys.has('KeyD') || INPUT.keys.has('ArrowRight')) mx += 1;
  if (INPUT.keys.has('KeyW') || INPUT.keys.has('ArrowUp')) my -= 1;
  if (INPUT.keys.has('KeyS') || INPUT.keys.has('ArrowDown')) my += 1;
  if (INPUT.stick.active) { mx = INPUT.stick.x; my = INPUT.stick.y; }
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  // camera-relative movement (works for every camera angle)
  const fx = CAMS.look.x - CAMS.pos.x, fz = CAMS.look.z - CAMS.pos.z; const fl = Math.hypot(fx, fz) || 1;
  const Fx = fx / fl, Fz = fz / fl, Rx = -Fz, Rz = Fx;
  const wx = Rx * mx - Fx * my, wz = Rz * mx - Fz * my;
  mx = wx; my = wz;
  I.move = { x: mx, y: my };
  I.sprint = held('sprint') || (INPUT.stick.active && Math.hypot(INPUT.stick.x, INPUT.stick.y) > 0.92);
  // targeting
  const opp = p.team.opp.active();
  if (pressed('target') && opp.length) { const i = opp.indexOf(INPUT.manualTarget); INPUT.manualTarget = opp[(i + 1) % opp.length]; }
  if (INPUT.manualTarget && !INPUT.manualTarget.isActive()) INPUT.manualTarget = null;
  if (p.ball) {
    let tgt = INPUT.manualTarget;
    if (!tgt && opp.length) {
      const ax = ml > 0.3 ? mx : -p.side, az = ml > 0.3 ? my : 0; const al = Math.hypot(ax, az) || 1;
      let bs = -1e9;
      for (const o of opp) { const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z; const d = Math.hypot(dx, dz) || 1; const s = (dx * ax + dz * az) / (d * al) * 10 - d * 0.18 + (p.target === o ? 1.2 : 0); if (s > bs) { bs = s; tgt = o; } }
    }
    p.target = tgt;
    const charging = p.action && p.action.type === 'charge';
    if (tgt && (charging || ml < 0.2 || p.blocking)) I.face = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
  } else p.target = null;
  if (pressed('throw')) I.throwStart = true;
  if (releasedA('throw')) { I.throwRelease = true; I.target = p.target; }
  if (pressed('catch')) I.catch = true;
  I.block = held('catch') && !!p.ball;
  if (pressed('juke')) I.juke = true;
  if (pressed('jump')) I.jump = true;
  if (pressed('dive')) I.dive = true;
  I.duck = held('duck');
  if (pressed('fake')) I.fake = true;
  if (pressed('switch')) { setTimeout(() => G.switchPlayer(), 0); }
  // face incoming ball when trying to catch
  if (p.catchT > 0 || I.catch) {
    let best = null, bt = 9; for (const b of G.balls) { const th = threatTo(p, b); if (th && th.tc < bt) { bt = th.tc; best = b; } }
    if (!best) for (const b of G.balls) if (b.state === 'flying' && b.live && b.thrower && b.thrower.team !== p.team) { best = b; break; }
    if (best) I.face = Math.atan2(-best.vel.x, -best.vel.z);
  }
  if (I.block) { let best = null; for (const b of G.balls) if (b.state === 'flying' && b.live && b.thrower && b.thrower.team !== p.team) best = b; if (best) I.face = Math.atan2(-best.vel.x, -best.vel.z); }
  // first-game coaching hints
  if (G.gameNo === 1) {
    if (p.ball && !UI.hintShown.throw) UI.hint(isTouch ? 'HOLD THROW · RELEASE IN THE GOLD ZONE' : 'HOLD J / LEFT CLICK · RELEASE IN THE GOLD ZONE', 'throw');
    else if (!p.ball && G.balls.some(b => b.state === 'flying' && b.live && b.thrower && b.thrower.team !== p.team && threatTo(p, b)) && !UI.hintShown.catch) UI.hint(isTouch ? 'CATCH WHEN THE RING TURNS GREEN · OR JUKE / DIVE / JUMP' : 'K / RIGHT CLICK WHEN THE RING TURNS GREEN · L JUKE · X DIVE', 'catch');
  }
  return I;
}

// ================= UI =================
const UI = {
  sel: [0, 5], diff: SETTINGS.difficulty ?? 1, screen: 'loading', paused: false, hintShown: {}, bannerT: 0, portraits: new Map(),
  show(id) {
    for (const s of $$('.screen')) if (!s.classList.contains('modal')) s.classList.remove('show');
    $('#scr-' + id).classList.add('show'); this.screen = id;
  },
  modal(id, on) { $('#scr-' + id).classList.toggle('show', on); },
  inGame() { return this.screen === 'hud'; },
  wipe(cb) { const w = $('#wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); if (cb) setTimeout(cb, 380); setTimeout(() => w.classList.remove('go'), 900); },
  go(id, before) { AUDIO.ui(); this.wipe(() => { before && before(); this.show(id); }); },
  hint(text, key) { const h = $('#hint'); h.textContent = text; h.classList.add('on'); this.hintShown[key] = true; clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('on'), 4200); },
  banner(html, dur) { const b = $('#center-banner'); b.innerHTML = html; b.classList.add('on'); this.bannerT = dur; },
  togglePause(force) {
    const on = force ?? !this.paused; this.paused = on; this.modal('pause', on);
    if (on) { for (const k of [...INPUT.keys]) keyUp(k); }
    AUDIO.ui();
  },
  // ---------- title ----------
  initTitle() {
    const ticks = [];
    for (let i = 0; i < 8; i++) { const a = TEAMS[i], b = TEAMS[(i * 3 + 2) % 8]; if (a === b) continue; ticks.push(`<b>${a.abbr}</b> 2 – ${i % 2} <b>${b.abbr}</b>`); }
    const lead = TEAMS.slice().sort((x, y) => y.rec[0] - x.rec[0]);
    ticks.push(`<b>STANDINGS</b> ${lead.slice(0, 4).map(t => `${t.name} ${t.rec[0]}-${t.rec[1]}`).join(' · ')}`);
    const star = TEAMS.flatMap(t => t.roster.map(p => [p, t])).sort((a, b) => b[0].ovr - a[0].ovr)[0];
    ticks.push(`<b>TOP RATED</b> ${star[0].first} ${star[0].last} (${star[1].abbr}) · ${star[0].ovr} OVR ${ARCH[star[0].arch].label}`);
    $('#title-ticker').innerHTML = ticks.join('<em>●</em>') + '<em>●</em>' + ticks.join('<em>●</em>');
    for (const b of $$('#title-menu .mi')) b.addEventListener('click', () => this.titleAction(b.dataset.act));
  },
  titleAction(a) {
    AUDIO.init();
    if (a === 'play') this.go('select', () => this.renderSelect());
    if (a === 'controls') this.info('controls');
    if (a === 'settings') this.info('settings');
    if (a === 'credits') this.info('credits');
  },
  // ---------- team select ----------
  renderSelect() {
    for (let s = 0; s < 2; s++) {
      const t = TEAMS[this.sel[s]]; const u = TEAMS[this.sel[1 - s]];
      const uni = uniformsFor(TEAMS[this.sel[0]], TEAMS[this.sel[1]])[s];
      const el = $('#pick-' + s); const R = teamUnitRatings(t);
      el.innerHTML = `<div class="tp-band" style="background:linear-gradient(160deg, ${uni.p} 0%, ${uni.s} 85%)"></div>
        <div class="tp-side">${s === 0 ? 'YOU · HOME' : 'CPU · AWAY'}</div>
        <div class="tp-top"><div class="tp-logo">${logoSVG(t)}</div><div class="tp-name"><div class="city">${t.city}</div><div class="nick">${t.name}</div></div></div>
        <div class="tp-ovr"><div><b>${t.ovr}</b><span>OVR</span></div><div><b>${R.OFF}</b><span>OFF</span></div><div><b>${R.DEF}</b><span>DEF</span></div><div><b>${R.ATH}</b><span>ATH</span></div><div><b>${R.IQ}</b><span>IQ</span></div></div>
        <div class="tp-roster">${t.roster.map(p => `<div class="rrow"><span class="num">#${p.num}</span><span class="nm">${p.first[0]}. ${p.last}</span><span class="arch">${ARCH[p.arch].label}</span><span class="ov">${p.ovr}</span></div>`).join('')}</div>
        <div class="tp-nav"><button data-d="-1">‹ PREV</button><button data-d="1">NEXT ›</button></div>`;
      for (const b of $$('.tp-nav button', el)) b.onclick = () => { AUDIO.ui(); let n = this.sel[s]; do { n = (n + +b.dataset.d + TEAMS.length) % TEAMS.length; } while (n === this.sel[1 - s]); this.sel[s] = n; this.renderSelect(); };
    }
    $('#diff-seg').innerHTML = DIFFS.map((d, i) => `<button class="${i === this.diff ? 'on' : ''}" data-i="${i}">${d.name}</button>`).join('');
    for (const b of $$('#diff-seg button')) b.onclick = () => { this.diff = +b.dataset.i; SETTINGS.difficulty = this.diff; saveSettings(); AUDIO.ui(); this.renderSelect(); };
  },
  // ---------- matchup ----------
  async renderMatchup() {
    const [h, a] = [TEAMS[this.sel[0]], TEAMS[this.sel[1]]]; const [uh, ua] = uniformsFor(h, a);
    $('#mu-bg').innerHTML = `<div class="half l" style="background:linear-gradient(135deg, ${uh.p}, ${uh.s})"></div><div class="half r" style="background:linear-gradient(225deg, ${ua.p}, ${ua.s})"></div>`;
    const tm = (t) => `<div class="mu-team">${logoSVG(t)}<div class="city">${t.city}</div><div class="nick">${t.name}</div><div class="rec">${t.rec[0]}-${t.rec[1]} · ${t.ovr} OVR</div></div>`;
    $('#mu-teams').innerHTML = `${tm(h)}<div class="mu-vs">VS</div>${tm(a)}`;
    const keys = (t) => t.roster.slice().sort((x, y) => y.ovr - x.ovr).slice(0, isTouch && innerWidth < 760 ? 2 : 3);
    const hk = keys(h), ak = keys(a);
    $('#mu-keys').innerHTML = [...hk.map(p => [p, h, uh]), ...ak.map(p => [p, a, ua])].map(([p, t, u], i) => this.cardHTML(p, t, u, i * 0.08)).join('');
    // render real 3D portraits into the cards
    for (const [p, t, u] of [...hk.map(p => [p, h, uh]), ...ak.map(p => [p, a, ua])]) {
      const url = await portrait(p, t, u); const el = $(`[data-pc="${p.id}"] .sil`); if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
    }
  },
  cardHTML(p, t, u, delay = 0) {
    const r = p.ratings; const keysShown = ['pow', 'acc', 'catch', 'dodge', 'speed', 'awr'];
    return `<div class="pc" data-pc="${p.id}" style="animation-delay:${delay}s"><div class="bg" style="background:linear-gradient(170deg, ${u.p} 0%, ${u.s} 75%)"></div>
      <div class="numbg">${p.num}</div><div class="ovr">${p.ovr}</div><div class="arch">${ARCH[p.arch].label}</div>
      <div class="sil"></div>
      <div class="nm"><div class="f">${p.first.toUpperCase()} · #${p.num} · ${t.abbr}</div><div class="l">${p.last.toUpperCase()}</div></div>
      <div class="rt">${keysShown.map(k => `<span>${RATING_LABEL[k]} <b>${r[k]}</b></span>`).join('')}</div></div>`;
  },
  // ---------- HUD ----------
  updateScorebug(flash) {
    if (!G.teams.length) return;
    const html = G.teams.map((t, i) => {
      const pips = t.players.map(p => `<i class="${p.state === 'active' || p.state === 'returning' || p.state === 'celebrate' ? '' : 'out'}"></i>`).join('');
      return `<div class="sb-team ${i ? 'r' : ''}" style="background:linear-gradient(${i ? 270 : 90}deg, ${t.uni.s}, ${t.uni.p})">${logoSVG(t.data)}<span class="sb-abbr" style="color:${lum(t.uni.p) > 0.7 ? '#111' : '#fff'}">${t.data.abbr}</span><span class="sb-pips">${pips}</span></div>`;
    });
    const dots = (w) => `<span class="sb-dots">${[0, 1].map(k => `<i class="${k < w ? 'won' : ''}"></i>`).join('')}</span>`;
    $('#scorebug').innerHTML = `${html[0]}<div class="sb-mid"><div class="sb-gl">GAME ${G.gameNo} · BO3</div><div class="sb-games"><span>${dots(G.wins[0])}</span><span>${dots(G.wins[1])}</span></div></div>${html[1]}`;
    if (flash) { const s = $('#scorebug'); s.classList.remove('sb-flash'); void s.offsetWidth; s.classList.add('sb-flash'); }
  },
  playerCard(p) {
    const u = p.team.uni;
    $('#pcard').innerHTML = `<div class="pn" style="background:${u.p};color:${lum(u.p) > 0.7 ? '#111' : '#fff'}">${p.data.num}</div><div class="pi"><div class="l">${p.data.last.toUpperCase()}</div><div class="a">${ARCH[p.data.arch].label} · <b>${p.data.ovr}</b> OVR</div><div class="st"><i id="stam" style="width:100%"></i></div></div>`;
  },
  updateHUD(dtReal) {
    if (this.bannerT > 0) { this.bannerT -= dtReal; if (this.bannerT <= 0) $('#center-banner').classList.remove('on'); }
    const p = G.human; const m = $('#meter');
    const st = $('#stam'); if (st && p) st.style.width = (p.stamina * 100).toFixed(0) + '%';
    if (p && p.action && p.action.type === 'charge' && !REPLAY.on) {
      m.classList.add('on');
      _v1.set(p.pos.x, p.height + 0.45 + p.jumpY, p.pos.z).project(camera);
      m.style.left = ((_v1.x * 0.5 + 0.5) * innerWidth) + 'px'; m.style.top = ((-_v1.y * 0.5 + 0.5) * innerHeight) + 'px';
      $('#meter-fill').style.width = (p.charge * 100).toFixed(1) + '%';
      const perf = p.charge >= 0.86 && p.charge <= 0.97; m.classList.toggle('hot', perf);
      $('#meter-label').textContent = p.airborne ? (perf ? 'SKY SHOT!' : 'IN THE AIR') : perf ? 'PERFECT!' : p.chargePhase > 1 ? 'TOO LONG' : 'POWER';
    } else m.classList.remove('on');
  },
  // ---------- results ----------
  async showResults(winner) {
    const all = G.players.slice();
    const score = (p) => p.stats.hits * 3 + p.stats.catches * 4.5 + p.stats.dodges * 1 + p.stats.blocks * 1.5 + p.stats.perfect * 0.5 - p.stats.outs * 1.2 + (p.team === winner ? 2 : 0);
    const mvp = all.slice().sort((a, b) => score(b) - score(a))[0];
    const [A, B] = G.teams;
    const tbl = (t) => {
      const rows = t.players.map(p => { const s = p.stats; const acc = s.throws ? Math.round(s.hits / s.throws * 100) + '%' : '—'; return `<tr><td><span class="n">#${p.data.num}</span>${p.data.first[0]}. ${p.data.last}${p === mvp ? ' ★' : ''}</td><td>${s.hits}</td><td>${s.catches}</td><td>${s.dodges}</td><td>${s.blocks}</td><td>${s.throws}</td><td>${acc}</td><td>${s.outs}</td></tr>`; }).join('');
      const tot = (k) => t.players.reduce((a, p) => a + p.stats[k], 0);
      return `<table class="tbl"><caption style="color:${t.uni.p === '#ffffff' ? '#fff' : t.uni.p}">${t.data.city} ${t.data.name}</caption><tr><th>PLAYER</th><th>HITS</th><th>CATCH</th><th>DODGE</th><th>BLK</th><th>THR</th><th>ACC</th><th>OUTS</th></tr>${rows}<tr class="tot"><td>TEAM</td><td>${tot('hits')}</td><td>${tot('catches')}</td><td>${tot('dodges')}</td><td>${tot('blocks')}</td><td>${tot('throws')}</td><td>${tot('throws') ? Math.round(tot('hits') / tot('throws') * 100) + '%' : '—'}</td><td>${tot('outs')}</td></tr></table>`;
    };
    const ms = mvp.stats;
    $('#res-wrap').innerHTML = `
      <div class="res-head">${logoSVG(A.data)}<div class="sc">${G.wins[0]}</div><div class="mid"><div class="fin">FINAL · BEST OF 3</div><div class="sc">—</div></div><div class="sc">${G.wins[1]}</div>${logoSVG(B.data)}</div>
      <div class="res-win" style="color:${winner.uni.p === '#ffffff' ? '#ffcc33' : winner.uni.p}">${winner.data.city} ${winner.data.name} WIN${winner.isHuman ? ' — YOU TAKE THE SERIES!' : ''}</div>
      <div class="res-body"><div class="mvp"><div class="tag">★ MATCH MVP</div>${this.cardHTML(mvp.data, mvp.team.data, mvp.team.uni)}<div class="line">${ms.hits} HITS · ${ms.catches} CATCHES · ${ms.dodges} DODGES</div></div>
      <div class="tables">${tbl(A)}${tbl(B)}</div></div>
      <div class="res-actions"><button class="cta" data-act="rematch">REMATCH ›</button><button class="btn2" data-act="newmatch">NEW MATCHUP</button><button class="btn2" data-act="menu">MAIN MENU</button></div>`;
    this.go('results');
    for (const b of $$('#res-wrap [data-act]')) b.onclick = () => this.resultAction(b.dataset.act);
    const url = await portrait(mvp.data, mvp.team.data, mvp.team.uni); const el = $(`#res-wrap [data-pc="${mvp.data.id}"] .sil`); if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
  },
  resultAction(a) {
    if (a === 'rematch') this.go('hud', () => startMatchFlow(true));
    if (a === 'newmatch') this.go('select', () => { G.demoMode(); this.renderSelect(); });
    if (a === 'menu') this.go('title', () => G.demoMode());
  },
  // ---------- info panels ----------
  info(kind) {
    const p = $('#info-panel');
    if (kind === 'controls') {
      p.innerHTML = `<h2>HOW TO PLAY</h2>
      <p>6 v 6. Hit an opponent with a live throw and they're out. Catch a throw and the thrower is out — and your first player on the bench comes back in. First team to eliminate everyone wins the game; best of 3 wins the match.</p>
      <h3>KEYBOARD &amp; MOUSE</h3>
      <div class="keys">
        <div>Move <span><kbd>WASD</kbd> / <kbd>Arrows</kbd></span></div><div>Sprint <kbd>Shift</kbd></div>
        <div>Throw (hold · release) <span><kbd>J</kbd> / <kbd>Left Click</kbd></span></div><div>Catch · Block (hold with ball) <span><kbd>K</kbd> / <kbd>Right Click</kbd></span></div>
        <div>Juke <span><kbd>L</kbd> / <kbd>E</kbd></span></div><div>Jump <kbd>Space</kbd></div>
        <div>Duck (hold) <span><kbd>C</kbd> / <kbd>Ctrl</kbd></span></div><div>Fake throw <kbd>F</kbd></div>
        <div>Switch player <span><kbd>Q</kbd> / <kbd>Tab</kbd></span></div><div>Cycle target <kbd>R</kbd></div>
        <div>Dive <kbd>X</kbd></div><div>Camera angle <kbd>V</kbd></div>
        <div>Pause <span><kbd>Esc</kbd> / <kbd>P</kbd></span></div><div>Skip replay <kbd>Any key</kbd></div>
      </div>
      <h3>TOUCH</h3>
      <p>Left stick moves (push to the edge to sprint). THROW: hold and release. CATCH: tap just before impact; hold it while carrying a ball to block. JUKE, DIVE, JUMP, DUCK, FAKE and SWITCH have their own buttons; CAM (top right) cycles camera angles.</p>
      <h3>THE FINE PRINT</h3>
      <ul>
        <li><b>Power meter:</b> it fills, then falls back. Release inside the gold zone for a PERFECT throw: faster and far more accurate.</li>
        <li><b>Catching:</b> your catch window size comes from the CATCH rating. Hard throws and perfect releases are tougher to hang on to.</li>
        <li><b>Blocking:</b> a held ball deflects throws, but a fumble on the block is an out.</li>
        <li><b>Juking:</b> high-DODGE players can "ghost" a throw mid-juke. Ducking beats high throws, jumping beats low ones.</li>
        <li><b>Dive:</b> lay out to the side and most throws sail over you — but you're on the floor for a moment getting up.</li>
        <li><b>Sky shots:</b> start charging, jump, and release in the gold zone while airborne for a faster, laser-accurate SKY SHOT. Miss the zone in the air and your aim gets sloppy.</li>
        <li><b>Fakes:</b> low-awareness opponents bite — then they're wide open.</li>
        <li><b>Clutch &amp; Captains:</b> CLUTCH swings ratings when your team is down to its last two. A CAPTAIN left standing alone triggers a team-wide rally.</li>
      </ul>
      <button class="cta close">GOT IT</button>`;
    } else if (kind === 'settings') {
      const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button class="${String(SETTINGS[key]) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
      p.innerHTML = `<h2>SETTINGS</h2>
        <div class="set-row">GRAPHICS ${seg('quality', [['auto', 'AUTO'], ['high', 'HIGH'], ['medium', 'MEDIUM'], ['low', 'LOW']])}</div>
        <div class="set-row">CAMERA ${seg('camera', CAM_MODES.map((m, i) => [i, m]))}</div>
        <div class="set-row">SOUND ${seg('sound', [[true, 'ON'], [false, 'OFF']])}</div>
        <div class="set-row">INSTANT REPLAYS ${seg('replays', [[true, 'ON'], [false, 'OFF']])}</div>
        <div class="set-row">CAMERA SHAKE ${seg('shake', [[true, 'ON'], [false, 'OFF']])}</div>
        <div class="set-row">AUTO-SWITCH TO BALL ${seg('autoSwitch', [[true, 'ON'], [false, 'OFF']])}</div>
        <div class="set-row">DEFAULT DIFFICULTY ${seg('difficulty', DIFFS.map((d, i) => [i, d.name]))}</div>
        <p id="gfx-note" style="margin-top:10px;color:#9aa3b8;display:none">Graphics quality changes apply after a reload. <button class="btn2" id="reload-btn" style="margin-left:8px;font-size:16px;padding:4px 14px">RELOAD NOW</button></p>
        <button class="cta close">DONE</button>`;
      if (SETTINGS.autoSwitch === undefined) SETTINGS.autoSwitch = true;
      for (const s of $$('.seg[data-k]', p)) for (const b of $$('button', s)) b.onclick = () => {
        const k = s.dataset.k; let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : ((k === 'difficulty' || k === 'camera') ? +v : v);
        SETTINGS[k] = v; saveSettings(); AUDIO.ui();
        for (const x of $$('button', s)) x.classList.toggle('on', x === b);
        if (k === 'sound') AUDIO.setEnabled(v);
        if (k === 'difficulty') this.diff = v;
        if (k === 'quality') $('#gfx-note').style.display = 'block';
      };
      p.querySelector('#reload-btn').onclick = () => location.reload();
    } else if (kind === 'credits') {
      p.innerHTML = `<h2>CREDITS</h2>
        <p><b>DODGE NATION</b> — an original pro dodgeball simulation. All teams, players and the DNL league are fictional.</p>
        <h3>PLAYER MODELS &amp; MOTION CAPTURE</h3>
        <p>Athlete avatars and mocap animations come from the <b>Microsoft Rocketbox Avatar Library</b> (github.com/microsoft/Microsoft-Rocketbox), released under the MIT License. Uniforms are recolored per team and jersey numbers are painted at runtime.</p>
        <pre>MIT License — Copyright (c) 2020 Microsoft
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.</pre>
        <h3>ENGINE</h3><p>three.js (MIT). Audio is synthesized live with the Web Audio API.</p>
        <button class="cta close">CLOSE</button>`;
    }
    p.querySelector('.close').onclick = () => { AUDIO.uiBack(); this.modal('info', false); };
    this.modal('info', true); AUDIO.ui();
  },
};

// ---------- 3D rendered portraits for player cards ----------
const PORTRAIT = { scene: null, cam: null, rt: null };
async function portrait(p, team, uni) {
  const key = p.id + uni.p + uni.s;
  if (UI.portraits.has(key)) return UI.portraits.get(key);
  if (!PORTRAIT.scene) {
    const s = new THREE.Scene(); s.environment = scene.environment;
    s.add(new THREE.HemisphereLight(0xdde6ff, 0x302418, 1.0));
    const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(1.5, 2.5, 3); s.add(k);
    const r = new THREE.DirectionalLight(0xffd2a8, 1.6); r.position.set(-2.5, 2, -2); s.add(r);
    PORTRAIT.scene = s; PORTRAIT.cam = new THREE.PerspectiveCamera(24, 0.78, 0.1, 20);
    PORTRAIT.rt = new THREE.WebGLRenderTarget(312, 400, { samples: 4 }); PORTRAIT.rt.texture.colorSpace = THREE.SRGBColorSpace;
  }
  const tpl = G.templates[p.avatar.id];
  const c = new Character(tpl, G.clips[p.avatar.id], p, uni, team);
  PORTRAIT.scene.add(c.root); c.root.rotation.y = -0.38;
  c.actions.idle.time = 2.2; for (let i = 0; i < 6; i++) c.animate(1 / 30, 0, null);
  c.applyPose({ armW: 0, head: [0, 0.25] });
  const H = p.height; PORTRAIT.cam.position.set(0.22, H * 0.84, 2.35); PORTRAIT.cam.lookAt(0, H * 0.77, 0);
  const prevT = renderer.getRenderTarget(); const prevC = renderer.getClearAlpha();
  renderer.setRenderTarget(PORTRAIT.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(PORTRAIT.scene, PORTRAIT.cam);
  const buf = new Uint8Array(312 * 400 * 4); renderer.readRenderTargetPixels(PORTRAIT.rt, 0, 0, 312, 400, buf);
  renderer.setRenderTarget(prevT); renderer.setClearColor(0x04060b, prevC);
  PORTRAIT.scene.remove(c.root); c.mats.forEach(m => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); });
  const cv = document.createElement('canvas'); cv.width = 312; cv.height = 400; const x = cv.getContext('2d'); const id = x.createImageData(312, 400);
  for (let y = 0; y < 400; y++) id.data.set(buf.subarray((399 - y) * 312 * 4, (400 - y) * 312 * 4), y * 312 * 4);
  x.putImageData(id, 0, 0);
  const url = cv.toDataURL('image/png'); UI.portraits.set(key, url); return url;
}
