// ================= MATCH FLOW, RULES, CAMERA, REPLAY =================
G.dbg = { contact: 0, inWindow: 0, notFrontal: 0, tries: 0 };
G.diffFor = (p) => p.team.isHuman ? DIFFS[1] : G.diff;
G.aliveCount = (team) => team.players.filter(p => p.state === 'active' || p.state === 'returning').length;

G.lookTargetFor = (p) => {
  if (p.ball && p.target) return p.target.pos;
  let best = null, bd = 1e9;
  for (const b of G.balls) if (b.state === 'flying' && b.live && b.thrower && b.thrower.team !== p.team) { const d = b.pos.distanceToSquared(p.pos); if (d < bd) { bd = d; best = b.pos; } }
  if (best) return best;
  for (const o of p.team.opp.players) if (o.state === 'active' && o.ball) { const d = o.pos.distanceToSquared(p.pos); if (d < bd) { bd = d; best = o.pos; } }
  return best;
};

// ---------- event hooks ----------
G.onThrow = (p, b) => { if (b.perfect) { AUDIO.ooh(0.05); } G.cheer = Math.max(G.cheer, 0.15); };
G.onFake = (p) => { aiOnFake(p); AUDIO.noiseHit({ freq: 1800, sweepTo: 900, q: 1, peak: 0.06, d: 0.12 }); };
G.onPickup = (p, b) => {
  if (G.human && p.team === G.human.team && p !== G.human && !G.human.ball && G.human.state === 'active' && G.phase === 'play') {
    const near = G.balls.some(x => x.state === 'loose' && Math.hypot(x.pos.x - G.human.pos.x, x.pos.z - G.human.pos.z) < 2.5);
    const busy = G.human.catchT > 0 || G.human.duck || G.human.airborne;
    if (!near && !busy && SETTINGS.autoSwitch !== false && !G.locked) G.setHuman(p);
  }
};
G.onDodge = (p, b, d) => {
  if (p.dive && d < 1.1) { COMM.say('dive', { d: p.name }, true); COMM.callout('LAID OUT!', p.name, '#9fffc4', 0.9); AUDIO.cheer(0.6); if (p === G.human) FX.slowMo(0.3, 0.35); }
  else if (d < 0.75 && (p === G.human || Math.random() < 0.35)) { COMM.say('dodge', { d: p.name }); if (p === G.human) COMM.callout('DODGE', '', '#9fffc4', 0.8); }
  AUDIO.ooh(); G.cheer = Math.max(G.cheer, 0.35);
};

G.resolveContact = (b, p, nrm, cy) => {
  const thrower = b.thrower;
  const inc = _v1.copy(b.vel).normalize();
  const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const frontal = -(inc.x * fwd.x + inc.z * fwd.z) > 0.1;
  const contact = b.pos.clone();
  // ---- catch ----
  G.dbg.contact++; if (p.catchT > 0) G.dbg.inWindow++; if (p.catchT > 0 && !frontal) G.dbg.notFrontal++;
  if (p.catchT > 0 && !p.ball && frontal) {
    const prog = 1 - p.catchT / p.catchLen; const timing = 1 - Math.abs(prog - 0.5) * 2;
    let ch = 0.6 + r01(p.r('catch')) * 0.38 - b.power * 0.3 + timing * 0.12 - (b.perfect ? 0.08 : 0);
    if (!p.team.isHuman) ch *= G.diffFor(p).catchSkill; else if (p === G.human) ch += 0.08 + timing * 0.12;
    ch = clamp(ch, 0.2, 0.97);
    if (Math.random() < ch) return G.caught(b, p, thrower, contact);
    // bobble
    b.live = false; b.state = 'loose'; b.vel.set(fwd.x * 1.5 + gauss(), 3, fwd.z * 1.5 + gauss()); b.pickCD = 0.5;
    p.knockOut(thrower, null, 'bobble'); thrower.stats.hits++;
    COMM.callout('BOBBLED!', p.name + ' OUT', '#ff6b6b', 1.2); COMM.say('bobble', { c: p.name, t: thrower.name }, true);
    AUDIO.hit(0.4); AUDIO.groan(); FX.impact(contact, 0xffffff, 0.6);
    G.markEvent('bobble', contact, 2, p);
    b.deaden(); return;
  }
  // ---- block with held ball ----
  if (p.ball && frontal && (p.blocking || Math.random() < 0.1)) {
    const fumble = clamp(0.06 + (b.power - r01(p.r('catch')) * 0.55) * 0.32 + (b.perfect ? 0.1 : 0), 0.03, 0.5);
    const out = _v2.copy(b.vel).reflect(nrm.lengthSq() ? nrm : fwd).multiplyScalar(0.3); out.y = Math.abs(out.y) + 2.5;
    b.vel.copy(out); b.live = false; b.state = 'loose'; b.pickCD = 0.3; b.ignore.add(p);
    FX.impact(contact, 0xbfe0ff, 0.8); FX.shake(0.12); AUDIO.block();
    if (Math.random() < fumble) {
      p.stats.fumbles++; thrower.stats.hits++;
      p.knockOut(thrower, b, 'fumble');
      COMM.callout('FUMBLE!', p.name + ' LOSES IT', '#ff6b6b', 1.3); COMM.say('fumble', { b: p.name }, true); AUDIO.groan();
      G.markEvent('fumble', contact, 2, p);
    } else {
      p.stats.blocks++; p.blocking = false; p.recover = 0.15;
      COMM.callout('BLOCKED', '', '#bfe0ff', 0.9); COMM.say('block', { b: p.name }); AUDIO.ooh(); G.cheer = Math.max(G.cheer, 0.5);
    }
    b.deaden(); return;
  }
  // ---- ghost: juke evasion ----
  if (p.jukeT > 0 && !p.evaded.has(b)) {
    p.evaded.add(b);
    if (Math.random() < r01(p.r('dodge')) * 0.42) {
      b.ignore.add(p); p.stats.dodges++;
      COMM.callout('GHOSTED', p.name, '#9fffc4', 1.0); COMM.say('ghost', { d: p.name }, true); AUDIO.ooh(); G.cheer = Math.max(G.cheer, 0.7);
      G.markEvent('ghost', contact, 2.5, p);
      return;
    }
  }
  // ---- OUT ----
  const power = b.power;
  b.vel.reflect(nrm.lengthSq() ? nrm : fwd).multiplyScalar(0.28); b.vel.y = Math.abs(b.vel.y) + 1.5;
  b.live = false; b.state = 'loose'; b.pickCD = 0.25; b.ignore.add(p);
  p.knockOut(thrower, b, 'hit');
  p.vel.set(inc.x * (1.2 + power * 2.5), 0, inc.z * (1.2 + power * 2.5));
  if (cy > p.height * 0.5 && power > 0.5) { p.airborne = true; p.jumpV = 1.2; }
  thrower.stats.hits++;
  AUDIO.hit(power); FX.sweat(contact, inc, 0.6 + power); FX.impact(contact, b.perfect ? 0xffc040 : 0xffffff, 0.7 + power * 0.6); FX.shake(0.12 + power * 0.32);
  if (p === G.human) rumble(1, 0.8, 320); else if (thrower === G.human) rumble(0.5, 0.6, 140);
  const last = G.aliveCount(p.team) === 0;
  FX.hitStop(0.05 + power * 0.05); b.squash = 1;
  if (last) FX.slowMo(0.18, 0.75); else if (b.perfect || power > 0.75) FX.slowMo(0.35, 0.22);
  const big = power > 0.7 || b.perfect;
  COMM.callout(big ? pick(['BOOM!', 'DRILLED!', 'LIGHTS OUT!', 'ROCKET!']) : pick(['OUT!', 'TAGGED!', 'GOT HIM!']).replace('HIM', p.data.female ? 'HER' : 'HIM'), `${thrower.name} ▸ ${p.name}`, thrower.team.uni.p === '#ffffff' ? '#ffcc33' : '#ffffff', 1.1);
  COMM.say(big ? 'hitBig' : (b.perfect ? 'perfect' : 'hit'), { t: thrower.name, v: p.name });
  G.cheer = Math.max(G.cheer, 0.6 + power * 0.4); AUDIO.cheer(0.4 + power * 0.6);
  G.markEvent('hit', contact, (b.perfect ? 3.2 : 1.6) + power * 1.4 + (last ? 5 : 0), p);
  b.deaden();
};
G.caught = (b, p, thrower, contact) => {
  b.state = 'held'; b.holder = p; p.ball = b; b.live = false; b.thrower = null; b.vel.set(0, 0, 0); b.trail.length = 0;
  p.catchT = 0; p.catchCD = 0.2; p.secureT = 0.5; p.stats.catches++; p.ai.holdT = 0; p.ai.fakeDone = false;
  if (p === G.human) rumble(0.7, 1, 200); else if (thrower === G.human) rumble(1, 0.6, 300);
  AUDIO.catch(); AUDIO.cheer(1.2); FX.impact(contact, 0x7fd4ff, 1.1); FX.shake(0.22); FX.hitStop(0.08); FX.slowMo(0.25, 0.4);
  thrower.knockOut(p, null, 'caught');
  const ret = p.team.returnOne();
  COMM.callout(pick(['WHAT A CATCH!', 'SNAGGED!', 'CAUGHT!', 'HANDS!']), ret ? `${thrower.name} OUT · ${ret.name} RETURNS` : `${thrower.name} OUT`, '#7fd4ff', 1.6);
  if (ret) COMM.say('catch', { c: p.name, t: thrower.name, r: ret.name }, true); else COMM.say('catchNoReturn', { c: p.name, t: thrower.name }, true);
  G.cheer = 1;
  G.markEvent('catch', contact, 4 + (G.aliveCount(thrower.team) === 0 ? 4 : 0), p);
  G.checkEnd();
};

G.onPlayerOut = (p) => {
  UI.updateScorebug(true); drawJumboScore();
  const team = p.team, opp = team.opp;
  const alive = G.aliveCount(team), oAlive = G.aliveCount(opp);
  const diff = oAlive - alive; G.maxDeficit[team.idx] = Math.max(G.maxDeficit[team.idx], diff);
  if (alive === 1 && oAlive >= 2 && !team.lastAnnounced) {
    const last = team.players.find(q => q.state === 'active' || q.state === 'returning');
    if (last) {
      team.lastAnnounced = true;
      setTimeout(() => {
        if (G.phase !== 'play') return;
        COMM.say('lastMan', { p: last.name, team: team.data.name, n: oAlive }, true);
        if (last.data.arch === 'CAPTAIN') { team.rally = true; COMM.callout("CAPTAIN'S RALLY", last.name + ' · ALL RATINGS BOOSTED', '#ffcc33', 2); COMM.say('captain', { p: last.name }, true); AUDIO.sting(); }
        else COMM.callout('LAST ONE STANDING', `${last.full.toUpperCase()} · ${oAlive} ON 1`, '#ffcc33', 1.8);
        AUDIO.chant = true;
      }, 900);
    }
  }
  if (alive === 1 && oAlive === 1 && !G.oneOnOne) { G.oneOnOne = true; setTimeout(() => G.phase === 'play' && COMM.callout('ONE ON ONE', 'NEXT OUT LOSES', '#ff5a1f', 1.6), 900); }
  // comeback: the other team was trailing big and is now level or ahead
  const oDiff = alive - oAlive;
  if (G.maxDeficit[opp.idx] >= 3 && oDiff <= 0 && !opp.comebackSaid) { opp.comebackSaid = true; COMM.say('comeback', { team: opp.data.name }, true); G.markEvent('comeback', p.pos.clone().setY(1), 4.2, p); }
  if (alive > 1 && oAlive > 1) AUDIO.chant = false;
  G.checkEnd();
};
G.checkEnd = () => {
  if (G.phase !== 'play') return;
  for (const t of G.teams) if (G.aliveCount(t) === 0) return G.endGame(t.opp);
};

// ---------- events / replays ----------
G.markEvent = (kind, pos, score, who) => {
  G.events.push({ kind, pos: pos.clone(), t: G.time, score, who });
  if (!SETTINGS.replays) return;
  const gameEnding = G.teams.some(t => G.aliveCount(t) === 0);
  if (gameEnding) return; // the end-of-game replay is handled by endGame
  if (score >= 3.6 && G.time - G.lastReplayAt > 15 && !G.pendingReplay) {
    G.pendingReplay = { ev: G.events[G.events.length - 1], at: G.time + 1.1 };
  }
};
const REC = { frames: [], max: 520, stride: 0 };
function recInit() { REC.stride = G.players.length * (6 + REC_STRIDE_CHAR) + G.balls.length * 7; REC.frames.length = 0; }
function recCapture() {
  let a; if (REC.frames.length >= REC.max) a = REC.frames.shift().a; else a = new Float32Array(REC.stride);
  let o = 0;
  for (const p of G.players) {
    const r = p.char.root; a[o++] = r.position.x; a[o++] = r.position.y; a[o++] = r.position.z; a[o++] = r.rotation.y; a[o++] = p.flash; a[o++] = p.pitch || 0;
    o = p.char.capture(a, o);
  }
  for (const b of G.balls) { a[o++] = b.pos.x; a[o++] = b.pos.y; a[o++] = b.pos.z; a[o++] = b.mesh.rotation.x; a[o++] = b.mesh.rotation.z; a[o++] = b.state === 'flying' && b.live ? 1 : 0; a[o++] = b.perfect ? 1 : 0; }
  REC.frames.push({ t: G.time, a });
}
function recApply(t) {
  const F = REC.frames; if (F.length < 2) return;
  let i = F.findIndex(f => f.t >= t); if (i <= 0) i = 1; if (i < 0) i = F.length - 1;
  const A = F[i - 1], B = F[i]; const k = clamp((t - A.t) / Math.max(1e-4, B.t - A.t), 0, 1);
  let o = 0;
  for (const p of G.players) {
    const r = p.char.root; r.position.set(lerp(A.a[o], B.a[o], k), lerp(A.a[o + 1], B.a[o + 1], k), lerp(A.a[o + 2], B.a[o + 2], k));
    r.rotation.order = 'YXZ'; r.rotation.y = A.a[o + 3] + angDiff(A.a[o + 3], B.a[o + 3]) * k; r.rotation.x = lerp(A.a[o + 5], B.a[o + 5], k); p.char.setFlash(A.a[o + 4] * 0.45); o += 6;
    o = p.char.restore(A.a, B.a, k, o);
    p.blob.position.set(r.position.x, 0.008, r.position.z); p.ring.material.opacity = 0;
  }
  G.balls.forEach((b, bi) => {
    b.mesh.position.set(lerp(A.a[o], B.a[o], k), lerp(A.a[o + 1], B.a[o + 1], k), lerp(A.a[o + 2], B.a[o + 2], k));
    b.mesh.rotation.x = B.a[o + 3]; b.mesh.rotation.z = B.a[o + 4];
    b.shadow.position.set(b.mesh.position.x, 0.011, b.mesh.position.z); b.mesh.scale.setScalar(1);
    const flying = B.a[o + 5] > 0.5, perf = B.a[o + 6] > 0.5;
    b.trailMeshes.forEach((m, kk) => {
      const fi = i - (kk + 1) * 1; const f = F[fi];
      if (!flying || !f || f.a[o + 5] < 0.5) { m.visible = false; return; }
      m.visible = true; m.position.set(f.a[o], f.a[o + 1], f.a[o + 2]); const ff = 1 - (kk + 1) / 10; m.scale.setScalar(ff * 0.95); m.material.opacity = ff * (perf ? 0.6 : 0.35); m.material.color.set(perf ? 0xffb030 : 0xffffff);
    });
    b.glow.material.opacity = 0;
    o += 7;
  });
}
const REPLAY = { on: false, t: 0, t0: 0, t1: 0, ev: null, ang: 0, done: null };
function startReplay(ev, after) {
  if (REC.frames.length < 10) { after && after(); return; }
  const first = REC.frames[0].t, last = REC.frames[REC.frames.length - 1].t;
  REPLAY.on = true; REPLAY.ev = ev; REPLAY.t0 = Math.max(first, ev.t - 1.9); REPLAY.t1 = Math.min(last, ev.t + 0.9); REPLAY.t = REPLAY.t0; REPLAY.done = after;
  REPLAY.prevPhase = G.phase; G.phase = 'replay'; G.lastReplayAt = G.time;
  // camera angle: start from the side the action faces
  REPLAY.ang = (ev.who ? ev.who.side : 1) * 0.9 + (Math.random() - 0.5) * 0.6;
  REPLAY.dist = 4.6 + Math.random();
  $('#replay-ui').classList.add('on');
  $('#replay-sub').textContent = ({ catch: 'THE CATCH', hit: 'THE HIT', ghost: 'THE DODGE', comeback: 'THE COMEBACK', fumble: 'THE FUMBLE', bobble: 'THE BOBBLE', final: 'GAME POINT' })[ev.kind] || 'BIG MOMENT';
  if (G.catchRing) { G.catchRing.outer.material.opacity = 0; G.catchRing.inner.material.opacity = 0; }
  FX.clear(); COMM.clear(); $('#meter').classList.remove('on'); $('#center-banner').classList.remove('on'); UI.bannerT = 0;
  UI.wipe(); drawJumboReplay();
}
function endReplay() {
  if (!REPLAY.on) return;
  REPLAY.on = false; $('#replay-ui').classList.remove('on'); UI.wipe();
  G.phase = REPLAY.prevPhase === 'replay' ? 'play' : REPLAY.prevPhase;
  for (const b of G.balls) b.trailMeshes.forEach(m => m.visible = false);
  const cb = REPLAY.done; REPLAY.done = null; drawJumboScore(); cb && cb();
}
function updateReplay(dtReal) {
  const near = Math.abs(REPLAY.t - REPLAY.ev.t) < 0.6;
  REPLAY.t += dtReal * (near ? 0.26 : 0.75);
  REPLAY.ang += dtReal * 0.22;
  recApply(REPLAY.t);
  if (REPLAY.t >= REPLAY.t1) endReplay();
}

// ---------- camera ----------
const CAM_MODES = ['BROADCAST', 'COURTSIDE', 'OVERHEAD', 'PLAYER'];
const CAM_LABEL = { BROADCAST: 'BROADCAST CAM', COURTSIDE: 'COURTSIDE CAM', OVERHEAD: 'OVERHEAD CAM', PLAYER: 'PLAYER CAM' };
function cycleCamera() { SETTINGS.camera = ((SETTINGS.camera || 0) + 1) % CAM_MODES.length; saveSettings(); UI.hint(CAM_LABEL[CAM_MODES[SETTINGS.camera]] + (isTouch ? '' : ' · V TO CHANGE'), 'cam' + Math.random()); AUDIO.ui(); }
const CAMS = { kick: 0, pos: new THREE.Vector3(0, 8, 16), look: new THREE.Vector3(0, 1, 0), fov: 36, intro: null };
function updateCamera(dtReal) {
  const portrait = camera.aspect < 1;
  let wantPos, wantLook, fov = portrait ? 58 : camera.aspect < 1.45 ? 44 : 36, k = 3.2;
  if (REPLAY.on) {
    const e = REPLAY.ev.pos; const a = REPLAY.ang;
    wantPos = _v1.set(e.x + Math.sin(a) * REPLAY.dist, 1.35, e.z + Math.cos(a) * REPLAY.dist);
    wantLook = _v2.set(e.x, 1.05, e.z); fov = portrait ? 50 : 32; k = 6;
    if (REPLAY.t - REPLAY.t0 < 0.05) { CAMS.pos.copy(wantPos); CAMS.look.copy(wantLook); }
  } else if (CAMS.intro) {
    const I = CAMS.intro; I.t += dtReal; const u = smooth(clamp(I.t / I.dur, 0, 1));
    wantPos = _v1.set(Math.sin(lerp(-1.4, 0.15, u)) * lerp(22, 15.5, u), lerp(14, 7, u), Math.cos(lerp(-1.4, 0.15, u)) * lerp(22, 15.5, u));
    wantLook = _v2.set(0, lerp(3, 0.8, u), 0); k = 8;
    if (portrait) wantPos.multiplyScalar(1.25);
    if (I.t >= I.dur) { CAMS.intro = null; I.done && I.done(); }
  } else if (G.phase === 'menu') {
    const t = performance.now() / 1000 * 0.06;
    wantPos = _v1.set(Math.sin(t) * 17, 6.5 + Math.sin(t * 2.3) * 1.2, Math.cos(t) * 17); wantLook = _v2.set(0, 1.4, 0); k = 1.5;
  } else {
    // broadcast follow
    let fx = 0, wsum = 0;
    const h = G.human && G.human.state === 'active' ? G.human : null;
    if (h) { fx += h.pos.x * 1.2; wsum += 1.2; }
    for (const b of G.balls) if (b.state === 'flying' && b.live) { fx += b.pos.x * 0.9; wsum += 0.9; }
    let ax = 0, an = 0; for (const p of G.players) if (p.state === 'active') { ax += p.pos.x; an++; }
    if (an) { fx += (ax / an) * 0.8; wsum += 0.8; }
    fx = wsum ? fx / wsum : 0;
    const tension = G.phase === 'play' ? clamp(1 - (Math.min(G.aliveCount(G.teams[0]), G.aliveCount(G.teams[1])) - 1) / 3, 0, 1) : 0;
    const cx = clamp(fx * 0.75, -5, 5);
    const dist = lerp(17.6, 15.2, tension * 0.7);
    wantPos = _v1.set(cx * 0.88, lerp(8.8, 7.6, tension), dist);
    wantLook = _v2.set(cx, 0.4, 0.15);
    if (portrait) { wantPos.set(cx * 0.5, 12.5, 15.5); wantLook.set(cx * 0.6, 0, -0.3); }
    const mode = CAM_MODES[SETTINGS.camera || 0];
    if (mode === 'COURTSIDE') { wantPos.set(cx * 0.9, 3.1, portrait ? 14 : 11.4); wantLook.set(cx, 1.0, -0.8); fov = portrait ? 64 : camera.aspect < 1.45 ? 54 : 46; }
    else if (mode === 'OVERHEAD') { wantPos.set(cx * 0.35, 15.2, portrait ? 3.5 : 6.6); wantLook.set(cx * 0.35, 0, 0.3); fov = portrait ? 72 : 50; }
    else if (mode === 'PLAYER') {
      const f = h || G.teams[0].players.find(p => p.state === 'active');
      const fx2 = f ? f.pos.x : -5, fz = f ? f.pos.z : 0;
      wantPos.set(Math.max(fx2 - 6.4, -14.5), 3.5, fz * 0.7); wantLook.set(fx2 + 5.5, 0.7, fz * 0.35); fov = portrait ? 66 : 52; k = 4.5;
    }
    if (G.phase === 'gameover' && G.winnerTeam) { const w = G.winnerTeam.players.filter(p => p.state !== 'bench'); if (w.length) { const c = w.reduce((s, p) => s.add(p.pos), new THREE.Vector3()).multiplyScalar(1 / w.length); wantPos.set(c.x * 0.7, 3.2, c.z + 8.5); wantLook.set(c.x, 1.2, c.z); k = 1.6; fov = portrait ? 55 : 34; } }
  }
  if (ARENA.jumbo) ARENA.jumbo.visible = (!G.match.venue || G.match.venue.jumbo || G.phase === 'menu') && !(CAM_MODES[SETTINGS.camera || 0] === 'OVERHEAD' && !REPLAY.on && !CAMS.intro && G.phase !== 'menu');
  CAMS.pos.lerp(wantPos, 1 - Math.exp(-k * dtReal)); CAMS.look.lerp(wantLook, 1 - Math.exp(-k * 1.2 * dtReal));
  CAMS.kick = damp(CAMS.kick || 0, 0, 7, dtReal);
  CAMS.fov = damp(CAMS.fov, fov + CAMS.kick, 4, dtReal);
  camera.position.copy(CAMS.pos);
  if (FX.shakeAmp > 0.001) { const s = FX.shakeAmp; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; }
  camera.lookAt(CAMS.look);
  if (Math.abs(camera.fov - CAMS.fov) > 0.01) { camera.fov = CAMS.fov; camera.updateProjectionMatrix(); }
}

// ---------- jumbotron content ----------
function drawJumboScore() {
  if (!G.teams.length) return drawJumbo((x, w, h) => { x.fillStyle = '#ff5a1f'; x.font = '64px Anton, Impact'; x.textAlign = 'center'; x.fillText('DODGE NATION', w / 2, h / 2 + 10); x.fillStyle = '#ffcc33'; x.font = '26px Anton, Impact'; x.fillText('PRO DODGEBALL', w / 2, h / 2 + 48); });
  drawJumbo((x, w, h) => {
    const [A, B] = G.teams;
    x.textAlign = 'center';
    for (const [t, cx] of [[A, w * 0.25], [B, w * 0.75]]) {
      x.fillStyle = t.uni.p; x.fillRect(cx - 110, 30, 220, 12);
      if (t.logoImg) x.drawImage(t.logoImg, cx - 46, 52, 92, 92);
      x.fillStyle = '#fff'; x.font = '40px Anton, Impact'; x.fillText(t.data.abbr, cx, 182);
      x.font = '64px Anton, Impact'; x.fillStyle = '#ffcc33'; x.fillText(String(G.aliveCount(t)), cx, 252);
    }
    x.fillStyle = '#9aa3b8'; x.font = '22px Anton, Impact'; x.fillText('GAME ' + G.gameNo, w / 2, 110);
    x.fillStyle = '#fff'; x.font = '46px Anton, Impact'; x.fillText(`${G.wins[0]} - ${G.wins[1]}`, w / 2, 160);
    x.fillStyle = '#ff5a1f'; x.font = '18px Anton, Impact'; x.fillText('PLAYERS LEFT', w / 2, 238);
  });
}
function drawJumboReplay() { drawJumbo((x, w, h) => { x.fillStyle = '#ff5a1f'; x.fillRect(0, h / 2 - 50, w, 100); x.fillStyle = '#fff'; x.font = '72px Anton, Impact'; x.textAlign = 'center'; x.fillText('REPLAY', w / 2, h / 2 + 26); }); }
function drawJumboText(t, s) { drawJumbo((x, w, h) => { x.textAlign = 'center'; x.fillStyle = '#ffcc33'; x.font = '60px Anton, Impact'; x.fillText(t, w / 2, h / 2 + 10); if (s) { x.fillStyle = '#fff'; x.font = '26px Anton, Impact'; x.fillText(s, w / 2, h / 2 + 52); } }); }

// ---------- match lifecycle ----------
G.clearMatch = () => {
  for (const p of G.players) { scene.remove(p.char.root, p.ring, p.blob); p.char.mats.forEach(m => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); }); }
  G.players = []; G.teams = []; G.human = null; AUDIO.chant = false;
};
G.match = { bestOf: 3, venue: null, locked: null, career: null };
G.need = () => Math.ceil(G.match.bestOf / 2);
G.setupMatch = (homeIdx, awayIdx, diffIdx) => G.setupMatchTeams(TEAMS[homeIdx], TEAMS[awayIdx], { diff: diffIdx, bestOf: 3 });
G.setupMatchTeams = async (home, away, opts = {}) => {
  G.clearMatch();
  const [uH, uA] = opts.uni || uniformsFor(home, away);
  G.diff = DIFFS[opts.diff ?? 1];
  G.match = { bestOf: opts.bestOf || 3, venue: VENUES[opts.venue || 'pro'], locked: opts.lockedId || null, career: opts.career || null };
  const tA = new TeamRT(home, 0, -1, uH, true), tB = new TeamRT(away, 1, 1, uA, false);
  G.teams = [tA, tB];
  for (const t of G.teams) { t.logoImg = await svgToImage(logoSVG(t.data), 256); }
  await dressArena(home, away, uH, uA, G.match.venue);
  for (const t of G.teams) t.data.roster.forEach((d, i) => { const p = new Player(d, t, i); t.players.push(p); G.players.push(p); });
  if (!G.balls.length) { const mat = ballMaterial(); for (let i = 0; i < 6; i++) G.balls.push(new Ball(i, mat)); }
  G.wins = [0, 0]; G.gameNo = 1; G.lastReplayAt = -99;
  for (const p of G.players) p.stats = makeStats();
  G.locked = G.match.locked ? G.players.find(p => p.data.id === G.match.locked) : null;
  G.simSpeed = 1;
  recInit();
};
G.toTitle = async () => { await G.setupMatch(UI.sel[0], UI.sel[1], UI.diff); G.demoMode(); };
G.setHuman = (p) => {
  if (!p || p.state !== 'active') return;
  G.human = p; UI.playerCard(p);
};
G.switchPlayer = () => {
  if (G.locked) { UI.hint('ROAD TO GLORY · LOCKED ON ' + G.locked.name.toUpperCase(), 'lock' + Math.random()); return; }
  const t = G.teams[0]; const cand = t.players.filter(p => p.state === 'active' && p !== G.human); if (!cand.length) return;
  const withBall = cand.filter(p => p.ball);
  let best = null;
  if (withBall.length) best = withBall.sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x))[0];
  if (!best) { // closest to an incoming ball
    let bt = 9; for (const b of G.balls) for (const p of cand) { const th = threatTo(p, b); if (th && th.tc < bt) { bt = th.tc; best = p; } }
  }
  if (!best) { let bd = 1e9; for (const b of G.balls) if (b.state === 'loose' && b.pos.x * t.side > -0.5) for (const p of cand) { const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z); if (d < bd) { bd = d; best = p; } } }
  if (!best) { const i = (t.players.indexOf(G.human) + 1); for (let k = 0; k < 6; k++) { const p = t.players[(i + k) % 6]; if (p.state === 'active' && p !== G.human) { best = p; break; } } }
  G.setHuman(best); AUDIO.ui();
};
G.autoSwitch = () => {
  if (G.locked) { setTimeout(() => { if (G.phase === 'play' && G.locked.state !== 'active') { UI.hint(isTouch ? "YOU'RE OUT · TAP ›› TO FAST-FORWARD" : "YOU'RE OUT · ›› OR TAB TO FAST-FORWARD", 'out' + Math.random()); } }, 600); return; }
  setTimeout(() => { if (G.human && G.human.state !== 'active') G.switchPlayer(); }, 250);
};

G.startGame = () => {
  FX.clear(); COMM.clear();
  G.events = []; G.pendingReplay = null; G.oneOnOne = false; G.maxDeficit = [0, 0]; G.winnerTeam = null; AUDIO.chant = false;
  for (const t of G.teams) { t.outQueue = []; t.rally = false; t.lastAnnounced = false; t.comebackSaid = false; t.volleyAt = 0; }
  for (const t of G.teams) t.players.forEach((p, i) => {
    p.reset(); p.pos.set(t.side * (COURT.HX - 0.7), 0, LANES[i] * 1.0); p.yaw = p.targetYaw = t.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    p.char.actions.idle.time = Math.random() * 8;
  });
  const zs = [-3.6, -2.2, -0.75, 0.75, 2.2, 3.6];
  G.balls.forEach((b, i) => b.reset(new THREE.Vector3(0, BALL_R, zs[i])));
  const cap = G.teams[0].players.find(p => p.data.arch === 'CAPTAIN') || G.teams[0].players[0];
  if (G.locked) { G.human = G.locked; UI.playerCard(G.locked); } else G.setHuman(G.teams[0].players[2] || cap);
  G.simSpeed = 1;
  G.rush = true; G.rushT = 0;
  recInit();
  G.phase = 'countdown'; G.countT = 0; G.countStep = -1;
  UI.updateScorebug(true); drawJumboScore();
  UI.banner(`<div class="cb"><div class="k">${G.wins[0] + G.wins[1] === 0 ? (G.match.bestOf === 1 ? 'ONE GAME · WINNER TAKES IT' : 'OPENING GAME') : G.wins[0] === G.need() - 1 && G.wins[1] === G.need() - 1 ? 'WINNER TAKES ALL' : 'BEST OF ' + G.match.bestOf}</div><div class="t">GAME ${G.gameNo}</div><div class="s">${G.teams[0].data.name} ${G.wins[0]} — ${G.wins[1]} ${G.teams[1].data.name}</div></div>`, 1.6);
  if (G.match.bestOf > 1 && (G.wins[0] === G.need() - 1 || G.wins[1] === G.need() - 1)) COMM.say('gamePoint', {}, true);
};
G.updateCountdown = (dt) => {
  G.countT += dt;
  const step = Math.floor((G.countT - 1.7) / 0.75);
  if (step !== G.countStep && G.countT > 1.7) {
    G.countStep = step;
    if (step < 3) { UI.banner(`<div class="count">${3 - step}</div>`, 0.7); AUDIO.tone({ f0: 660, type: 'square', peak: 0.05, d: 0.12 }); }
    else { UI.banner(`<div class="count" style="color:#ffcc33">DODGE!</div>`, 0.8); AUDIO.whistle(0.55); AUDIO.cheer(1.2); G.cheer = 1; G.phase = 'play'; G.gameStartT = G.time; COMM.say('rush', {}, true); }
  }
};
G.endGame = (winner) => {
  G.phase = 'gameover'; G.winnerTeam = winner; G.goT = 0; G.goReplayed = false;
  G.wins[winner.idx]++;
  AUDIO.whistle(0.9); AUDIO.horn(); AUDIO.cheer(2); AUDIO.chant = false; G.cheer = 1.2;
  const matchOver = G.wins[winner.idx] >= G.need(); G.simSpeed = 1;
  COMM.say(matchOver ? 'matchWin' : 'gameWin', { team: winner.data.name }, true);
  COMM.callout(matchOver ? 'MATCH' : 'GAME', winner.data.city + ' ' + winner.data.name, winner.uni.p, 2.2);
  UI.updateScorebug(true); drawJumboText(winner.data.name + ' WIN', `GAME ${G.gameNo} · SERIES ${G.wins[0]}-${G.wins[1]}`);
  for (const p of winner.players) if (p.state === 'active' || p.state === 'returning') { p.state = 'celebrate'; p.celebrate = pick(['cheer', 'cheer2', 'cheer3']); p.action = null; if (p.ball) { const b = p.ball; p.ball = null; b.drop(p, new THREE.Vector3(0, 3, 0)); } }
  for (const p of winner.opp.players) if (p.state === 'bench') p.celebrate = null;
  const finalEv = G.events.filter(e => e.kind === 'hit' || e.kind === 'catch' || e.kind === 'fumble' || e.kind === 'bobble').pop();
  G.after = () => {
    if (matchOver) { G.phase = 'done'; UI.showResults(winner); }
    else {
      UI.banner(`<div class="cb"><div class="k">GAME ${G.gameNo} FINAL</div><div class="t">${winner.data.name}</div><div class="s">SERIES ${G.teams[0].data.abbr} ${G.wins[0]} — ${G.wins[1]} ${G.teams[1].data.abbr}</div></div>`, 2.6);
      G.phase = 'between'; G.betweenT = 0;
    }
  };
  G.finalEv = finalEv;
};
G.updateGameOver = (dt) => {
  G.goT += dt;
  if (G.goT > 3.4 && !G.goReplayed) {
    G.goReplayed = true;
    if (SETTINGS.replays && G.finalEv) { const ev = { ...G.finalEv, kind: 'final' }; startReplay(ev, () => { G.phase = 'gameover'; G.goT = 99; G.after(); }); }
    else G.after();
  }
};

// ---------- per-frame simulation ----------
G.hypeTarget = () => {
  if (G.phase !== 'play') return G.phase === 'gameover' ? 1 : 0.3;
  const a = G.aliveCount(G.teams[0]), b = G.aliveCount(G.teams[1]);
  let h = 0.24 + (1 - Math.abs(a - b) / 6) * 0.22 + (1 - (a + b) / 12) * 0.3;
  if (Math.min(a, b) === 1) h += 0.25;
  if (G.balls.some(x => x.state === 'flying' && x.live)) h += 0.06;
  return clamp(h, 0, 1);
};
G.cheer = 0;
G.simulate = (dt) => {
  G.time += dt;
  if (G.phase === 'countdown') G.updateCountdown(dt);
  const playing = G.phase === 'play';
  if (playing) { G.rushT += dt; if (G.rushT > 4.5) G.rush = false; }
  for (const t of G.teams) if (playing) assignFetchers(t);
  for (const p of G.players) {
    let I = null;
    if (playing && p.state === 'active') I = p === G.human && !G.autoplay ? humanIntent(p, dt) : aiIntent(p, dt);
    p.update(dt, I);
  }
  // player separation
  const act = G.players.filter(p => p.state === 'active' || p.state === 'celebrate');
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j]; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const d = Math.hypot(dx, dz); const m = 0.62;
    if (d < m && d > 1e-4) { const push = (m - d) / 2; a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; b.pos.x += dx / d * push; b.pos.z += dz / d * push; }
  }
  for (const b of G.balls) b.update(dt);
  if (G.phase === 'gameover') G.updateGameOver(dt);
  if (G.phase === 'between') { G.betweenT += dt; if (G.betweenT > 3.0) { G.gameNo++; G.startGame(); } }
  if (G.pendingReplay && G.phase === 'play' && G.time >= G.pendingReplay.at) { const ev = G.pendingReplay.ev; G.pendingReplay = null; startReplay(ev); }
};
G.catchRing = null;
function updateCatchRing(dt) {
  if (!G.catchRing) {
    const mk = (r0, r1, col, op) => { const g = new THREE.RingGeometry(r0, r1, 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false })); m.renderOrder = 3; scene.add(m); return m; };
    G.catchRing = { outer: mk(0.92, 1, 0xffffff, 0), inner: mk(0.5, 0.56, 0xffffff, 0) };
  }
  const R = G.catchRing, h = G.human;
  let th = null;
  if (h && h.state === 'active' && !h.ball && G.phase === 'play') for (const b of G.balls) { const t = threatTo(h, b); if (t && (!th || t.tc < th.tc)) th = t; }
  const btn = $('.tb-catch');
  if (!th || th.tc > 0.9) { R.outer.material.opacity = damp(R.outer.material.opacity, 0, 14, dt); R.inner.material.opacity = damp(R.inner.material.opacity, 0, 14, dt); if (btn) btn.classList.remove('ready'); return; }
  const W = 0.13 + r01(h.r('catch')) * 0.24 + 0.05;
  const ideal = W * 0.5, err = th.tc - ideal;
  const good = Math.abs(err) < W * 0.38;
  const r = clamp(0.53 + err * 4.2, 0.25, 4);
  for (const m of [R.outer, R.inner]) m.position.set(h.pos.x, 0.02, h.pos.z);
  R.outer.scale.setScalar(r); R.outer.material.color.set(good ? 0x39ff8a : err > 0 ? 0xffffff : 0xff5a3a);
  R.outer.material.opacity = 0.9; R.inner.material.opacity = 0.65; R.inner.material.color.set(good ? 0x39ff8a : 0xffcc33);
  if (btn) btn.classList.toggle('ready', good);
}
G.render = (dt) => {
  updateCatchRing(dt);
  for (const p of G.players) p.pose(dt);
  for (const b of G.balls) { if (b.state === 'held') b.update(0); b.visual(dt); }
  if (G.phase === 'play' || G.phase === 'gameover' || G.phase === 'countdown') recCapture();
};
