// ================= BOOT / LOOP =================
function setLoad(v, t) { $('#load-fill').style.width = (v * 100).toFixed(0) + '%'; if (t) $('#load-text').textContent = t; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

G.demoMode = () => {
  G.phase = 'menu'; REPLAY.on = false; $('#replay-ui').classList.remove('on'); AUDIO.chant = false;
  $('#scorebug').classList.add('hide'); $('#center-banner').classList.remove('on'); COMM.clear(); FX.clear();
  const clips = ['idle', 'idle2', 'clap', 'idle', 'idle2', 'cheer2'];
  for (const t of G.teams) t.players.forEach((p, i) => {
    p.reset(); p.state = 'celebrate'; p.celebrate = clips[(i + t.idx * 2) % clips.length];
    p.pos.set(t.side * rand(2.5, 7.5), 0, LANES[i] * 0.9 + rand(-0.3, 0.3)); p.yaw = p.targetYaw = t.side < 0 ? Math.PI / 2 + rand(-0.6, 0.6) : -Math.PI / 2 + rand(-0.6, 0.6);
  });
  const zs = [-3.6, -2.2, -0.75, 0.75, 2.2, 3.6]; G.balls.forEach((b, i) => b.reset(new THREE.Vector3(0, BALL_R, zs[i])));
  drawJumboScore();
};

async function startMatchFlow(custom) {
  $('#scorebug').classList.add('hide'); COMM.clear(); FX.clear();
  G.phase = 'loading';
  if (custom) await G.setupMatchTeams(custom.home, custom.away, custom.opts);
  else await G.setupMatch(UI.sel[0], UI.sel[1], UI.diff);
  UI.hintShown = {};
  // line up for the intro shot
  for (const t of G.teams) t.players.forEach((p, i) => { p.reset(); p.state = 'celebrate'; p.celebrate = i % 3 === 0 ? 'clap' : 'idle'; p.pos.set(t.side * (COURT.HX - 0.7), 0, LANES[i]); p.yaw = p.targetYaw = t.side < 0 ? Math.PI / 2 : -Math.PI / 2; });
  const zs = [-3.6, -2.2, -0.75, 0.75, 2.2, 3.6]; G.balls.forEach((b, i) => b.reset(new THREE.Vector3(0, BALL_R, zs[i])));
  G.phase = 'intro';
  const [h, a] = G.teams;
  const V = G.match.venue;
  UI.banner(`<div class="cb"><div class="k">● LIVE · ${V.name}</div><div class="t">${h.data.name} <span style="color:#ffcc33">VS</span> ${a.data.name}</div><div class="s">${V.league}${G.match.bestOf > 1 ? ' · BEST OF ' + G.match.bestOf : ''} · ${G.diff.name}</div></div>`, 3.2);
  AUDIO.cheer(1.5); AUDIO.sting();
  drawJumboText('TONIGHT', `${h.data.abbr} vs ${a.data.abbr}`);
  CAMS.intro = { t: 0, dur: 3.8, done: () => { $('#scorebug').classList.remove('hide'); G.startGame(); } };
}

function wireButtons() {
  $('#scr-select [data-act="back"]').onclick = () => { AUDIO.uiBack(); UI.go('title'); };
  $('#scr-select [data-act="to-matchup"]').onclick = () => UI.go('matchup', () => UI.renderMatchup());
  $('#scr-matchup [data-act="start-match"]').onclick = () => UI.go('hud', () => startMatchFlow());
  $('#pause-btn').onclick = () => UI.togglePause(true);
  $('#cam-btn').onclick = () => cycleCamera();
  $('#sim-btn').onclick = () => { G.simSpeed = G.simSpeed > 1 ? 1 : 4; AUDIO.ui(); };
  for (const b of $$('#scr-pause [data-act]')) b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'resume') UI.togglePause(false);
    if (a === 'controls') UI.info('controls');
    if (a === 'settings') UI.info('settings');
    if (a === 'quit') { UI.togglePause(false); if (G.match.career) CAREER.open(); else UI.go('title', () => G.demoMode()); }
  };
  $('#scr-matchup').addEventListener('keydown', () => { });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Enter') return;
    if (UI.screen === 'title') UI.titleAction('play');
    else if (UI.screen === 'select') $('#scr-select [data-act="to-matchup"]').click();
    else if (UI.screen === 'matchup') $('#scr-matchup [data-act="start-match"]').click();
  });
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (FX.sparks) { FX.sparks.mat.uniforms.uScale.value = innerHeight * 0.5 * renderer.getPixelRatio(); FX.dust.mat.uniforms.uScale.value = innerHeight * 0.5 * renderer.getPixelRatio(); }
}
addEventListener('resize', onResize);

let lastT = performance.now();
const DYN = { ema: 1 / 60, t: 0, pr: QUALITY.pr };
function dynamicResolution(dtReal) {
  if (document.hidden || dtReal <= 0) return;
  DYN.ema = lerp(DYN.ema, dtReal, 0.05); DYN.t += dtReal;
  if (DYN.t < 1.2) return; DYN.t = 0;
  let pr = DYN.pr;
  if (DYN.ema > 1 / 42 && pr > QUALITY.minPr) pr = Math.max(QUALITY.minPr, pr - 0.15);
  else if (DYN.ema < 1 / 57 && pr < QUALITY.pr) pr = Math.min(QUALITY.pr, pr + 0.1);
  if (pr !== DYN.pr) { DYN.pr = pr; renderer.setPixelRatio(pr); onResize(); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
  if (UI.inGame() && !REPLAY.on && pressed('camera')) cycleCamera();
  if (UI.inGame() && G.locked && G.locked.state !== 'active' && G.phase === 'play' && pressed('switch')) G.simSpeed = G.simSpeed > 1 ? 1 : 4;
  if (!UI.paused) {
    FX.update(dtReal);
    if (REPLAY.on) updateReplay(dtReal);
    else if (G.teams.length) {
      const dt = dtReal * FX.timeScale() * (G.simSpeed || 1);
      let rem = dt, first = true;
      while (rem > 1e-6 && !REPLAY.on) { const h = Math.min(rem, 1 / 60); G.simulate(h); rem -= h; if (first) { INPUT.pressed.clear(); INPUT.released.clear(); first = false; } }
      if (!REPLAY.on) G.render(dt);
    }
  }
  INPUT.pressed.clear(); INPUT.released.clear();
  // crowd + audio
  G.cheer = Math.max(0, G.cheer - dtReal * 0.45);
  if (ARENA.crowd) { const u = ARENA.crowd.uniforms; u.uTime.value += dtReal; u.uHype.value = damp(u.uHype.value, G.hypeTarget(), 2, dtReal); u.uCheer.value = G.cheer; if (G.phase === 'menu' || G.phase === 'between') { u.uWave.value += dtReal * 18; if (u.uWave.value > 60) u.uWave.value = -60; } else u.uWave.value = -99; }
  AUDIO.update(dtReal, clamp(G.hypeTarget() + G.cheer * 0.5, 0, 1.2) * (G.match.venue ? G.match.venue.noise : 1));
  { const sb = $('#sim-btn'); const show = !!(G.locked && G.phase === 'play' && G.locked.state !== 'active' && UI.inGame()); if (sb.classList.contains('on') !== show) sb.classList.toggle('on', show); if (show) sb.classList.toggle('fast', G.simSpeed > 1); if (!show && G.simSpeed > 1 && G.phase !== 'play') G.simSpeed = 1; }
  if (ARENA.boardTex) ARENA.boardTex.offset.x = (ARENA.boardTex.offset.x + dtReal * 0.035) % 1;
  if (ARENA.jumbo) ARENA.jumbo.rotation.y += dtReal * 0.05;
  updateCamera(dtReal); UI.updateHUD(dtReal); COMM.update(dtReal);
  dynamicResolution(dtReal);
  renderer.render(scene, camera);
}

async function boot() {
  try {
    setLoad(0.04, 'Loading fonts…');
    if (document.fonts) await Promise.race([document.fonts.load('40px Anton'), new Promise(r => setTimeout(r, 2500))]);
    setLoad(0.1, 'Loading motion capture…'); await nextFrame();
    loadAnimPack();
    setLoad(0.15, 'Dressing the roster…');
    await loadTextures((f) => setLoad(0.15 + f * 0.45));
    for (const av of AVATARS) { setLoad(0.6 + AVATARS.indexOf(av) * 0.06, 'Rigging athletes…'); await nextFrame(); G.templates[av.id] = buildAvatarTemplate(av); G.clips[av.id] = buildClipsFor(G.templates[av.id]); }
    setLoad(0.85, 'Filling the arena…'); await nextFrame();
    buildArena(); FX.init(); onResize(); setupTouch(); UI.initTitle(); wireButtons();
    UI.sel = [0, 5];
    await G.setupMatch(UI.sel[0], UI.sel[1], UI.diff);
    G.demoMode();
    setLoad(1, 'Tip-off');
    // compile shaders once before revealing
    renderer.compile(scene, camera);
    requestAnimationFrame(frame);
    await new Promise(r => setTimeout(r, 250));
    UI.wipe(() => UI.show('title'));
    window.__DN = { G, UI, THREE, startMatchFlow, camera, renderer, scene, CAMS, REPLAY, startReplay, FX, COMM, INPUT, keyDown, keyUp, updateCamera, SETTINGS, CAREER };
  } catch (e) {
    console.error(e);
    setLoad(1, 'Could not start: ' + (e && e.message ? e.message : e) + ' — check your connection and reload.');
  }
}
boot();
