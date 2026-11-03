// ================= GAME OBJECTS: players, balls, rules =================
const G = {
  phase: 'menu', teams: [], players: [], balls: [], time: 0, gameNo: 1, wins: [0, 0], human: null, diff: DIFFS[1],
  templates: {}, clips: {}, matchStats: null, events: [], lastReplayAt: -99, pendingReplay: null, hype: 0, gameStartT: 0, maxDeficit: [0, 0],
};
const CAPSULE_R = 0.27;
const BENCH_Z = -6.25;

function makeStats() { return { throws: 0, hits: 0, catches: 0, dodges: 0, blocks: 0, outs: 0, fumbles: 0, perfect: 0, returns: 0 }; }

class Player {
  constructor(data, team, idx) {
    this.data = data; this.team = team; this.idx = idx; this.side = team.side;
    const tpl = G.templates[data.avatar.id];
    this.char = new Character(tpl, G.clips[data.avatar.id], data, team.uni, team.data);
    scene.add(this.char.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.targetYaw = 0;
    this.stats = makeStats(); this.seasonStats = makeStats();
    // marker ring
    const ringGeo = new THREE.RingGeometry(0.36, 0.46, 40); ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: team.uni.p, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    this.ring.position.y = 0.012; this.ring.renderOrder = 2; scene.add(this.ring);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.position.y = 0.008; this.blob = blob; scene.add(blob);
    this.reset();
  }
  get name() { return this.data.last; }
  get full() { return this.data.first + ' ' + this.data.last; }
  get height() { return this.data.height; }
  get forward() { return _v3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  reset() {
    this.state = 'active'; this.ball = null; this.action = null; this.duck = false; this.jumpY = 0; this.jumpV = 0; this.airborne = false;
    this.stamina = 1; this.catchT = 0; this.catchLen = 0; this.catchCD = 0; this.blocking = false; this.jukeT = 0; this.jukeCD = 0; this.jukeDir = 0;
    this.hitT = 0; this.flash = 0; this.secureT = 0; this.celebrate = null; this.target = null; this.evaded = new Set(); this.returnT = 0;
    this.vel.set(0, 0, 0); this.charge = 0; this.chargePhase = 0; this.chargeT = 0; this.fakeT = 0; this.bit = 0; this.recover = 0;
    this.ai = { think: 0, goal: null, react: new Map(), holdT: 0, plan: null, fakeDone: false, lane: 0, strafe: 0, strafeT: 0 };
    this.ring.material.opacity = 0;
  }
  // ---- ratings incl. situational modifiers (clutch, captain rally, stamina) ----
  r(k) {
    let v = this.data.ratings[k];
    const act = this.team.activeCount();
    if (act <= 2) v += (this.data.ratings.clutch - 75) * 0.3;
    if (this.team.rally) v += this.data.arch === 'CAPTAIN' ? 10 : 4;
    if (k === 'pow' || k === 'speed' || k === 'acc') v -= (1 - this.stamina) * 8;
    return clamp(v, 30, 105);
  }
  isActive() { return this.state === 'active'; }
  hitbox() { // capsule segment (world) + radius
    const H = this.height; const top = this.duck ? H * 0.58 : H;
    const y0 = this.jumpY + 0.25, y1 = this.jumpY + top - 0.2;
    return { a: _v1.set(this.pos.x, y0, this.pos.z), b: _v2.set(this.pos.x, y1, this.pos.z), r: CAPSULE_R * this.data.build };
  }
  maxSpeed(sprint) {
    let s = 3.0 + r01(this.r('speed')) * 1.9;
    if (sprint && this.stamina > 0.12) s *= 1.36;
    if (this.action && this.action.type === 'charge') s *= 0.55;
    if (this.duck) s *= 0.35;
    if (this.blocking) s *= 0.6;
    if (this.recover > 0) s *= 0.6;
    if (this.ball) s *= 0.95;
    return s;
  }
  bounds() { return this.side < 0 ? [-COURT.HX + 0.3, -0.28] : [0.28, COURT.HX - 0.3]; }
  // ---------- core update ----------
  update(dt, intent) {
    if (this.state === 'hit') return this.updateHit(dt);
    if (this.state === 'out' || this.state === 'bench' || this.state === 'returning') return this.updateOff(dt);
    if (this.state === 'celebrate' || this.state === 'idle') { this.vel.multiplyScalar(Math.exp(-8 * dt)); this.pos.addScaledVector(this.vel, dt); this.faceUpdate(dt); return; }
    const I = intent || {};
    // timers
    this.catchCD = Math.max(0, this.catchCD - dt); this.jukeCD = Math.max(0, this.jukeCD - dt); this.recover = Math.max(0, this.recover - dt);
    this.secureT = Math.max(0, this.secureT - dt); this.bit = Math.max(0, this.bit - dt);
    if (this.catchT > 0) { this.catchT -= dt; if (this.catchT <= 0) { this.catchT = 0; this.catchCD = 0.45; this.recover = 0.3; } }
    // duck
    this.duck = !!I.duck && !this.airborne && !(this.action && this.action.type === 'throw');
    // block stance
    this.blocking = !!(I.block && this.ball && !this.action);
    // catch
    if (I.catch && !this.ball && this.catchT <= 0 && this.catchCD <= 0 && !this.airborne) {
      this.catchLen = this.catchT = 0.13 + r01(this.r('catch')) * 0.24; this.catchStart = G.time;
      if (this.action && this.action.type === 'charge') this.action = null;
    }
    // juke
    if (I.juke && this.jukeCD <= 0 && !this.airborne && this.stamina > 0.08) {
      let dx = I.move ? I.move.x : 0, dz = I.move ? I.move.y : 0;
      if (I.jukeDir) { dx = I.jukeDir.x; dz = I.jukeDir.y; }
      if (Math.hypot(dx, dz) < 0.2) { dx = 0; dz = Math.random() < 0.5 ? -1 : 1; }
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const imp = 5.2 + r01(this.r('dodge')) * 3.6;
      this.vel.x = dx * imp; this.vel.z = dz * imp; this.jukeT = 0.3; this.jukeCD = 0.62 - r01(this.r('dodge')) * 0.18; this.stamina -= 0.09;
      this.jukeDir = Math.sign(-(dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw))) || 1;
      this.evaded.clear();
      FX.dustPuff(this.pos, 5, 0.8); AUDIO.squeak();
      if (this.action && this.action.type === 'charge') this.action = null;
    }
    // jump
    if (I.jump && !this.airborne && !this.duck) { this.jumpV = 3.7 + r01(this.r('dodge')) * 0.6; this.airborne = true; this.stamina -= 0.05; if (this.action && this.action.type === 'charge') this.action = null; }
    if (this.airborne) { this.jumpV -= 11.5 * dt; this.jumpY += this.jumpV * dt; if (this.jumpY <= 0) { this.jumpY = 0; this.airborne = false; this.jumpV = 0; FX.dustPuff(this.pos, 6, 0.6); AUDIO.step(); } }
    // throwing
    this.updateThrow(dt, I);
    // movement
    const sprint = !!I.sprint;
    const ms = this.maxSpeed(sprint);
    const mv = I.move || { x: 0, y: 0 }; const ml = Math.min(1, Math.hypot(mv.x, mv.y));
    const tx = ml > 0.05 ? mv.x / Math.hypot(mv.x, mv.y) * ms * ml : 0, tz = ml > 0.05 ? mv.y / Math.hypot(mv.x, mv.y) * ms * ml : 0;
    const accel = (this.airborne ? 4 : 15 + r01(this.r('dodge')) * 9);
    if (this.jukeT > 0) { this.jukeT -= dt; this.vel.multiplyScalar(Math.exp(-3.5 * dt)); }
    else { this.vel.x = damp(this.vel.x, tx, accel * 0.5, dt); this.vel.z = damp(this.vel.z, tz, accel * 0.5, dt); }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const [bx0, bx1] = this.bounds();
    this.pos.x = clamp(this.pos.x, bx0, bx1); this.pos.z = clamp(this.pos.z, -COURT.HZ + 0.3, COURT.HZ - 0.3);
    // stamina
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (sprint && spd > 3.5) this.stamina -= dt * (0.26 - r01(this.r('sta')) * 0.14);
    else this.stamina += dt * (0.08 + r01(this.data.ratings.sta) * 0.08);
    this.stamina = clamp(this.stamina, 0, 1);
    // facing
    if (I.face != null) this.targetYaw = I.face;
    else if (spd > 0.6 && this.jukeT <= 0) this.targetYaw = Math.atan2(this.vel.x, this.vel.z);
    this.faceUpdate(dt);
    // pick up loose balls
    if (!this.ball && this.catchT <= 0) for (const b of G.balls) if (b.canPickup(this)) { b.pickup(this); break; }
  }
  faceUpdate(dt) { this.yaw += angDiff(this.yaw, this.targetYaw) * (1 - Math.exp(-14 * dt)); }
  updateThrow(dt, I) {
    const A = this.action;
    if (A && A.type === 'throw') { A.t += dt; if (!A.released && A.t >= 0.06) { A.released = true; this.launch(A); } if (A.t > 0.5) this.action = null; return; }
    if (A && A.type === 'fake') { A.t += dt; if (A.t > 0.42) { this.action = null; if (A.resume && this.ball) this.action = { type: 'charge', t: 0.16 }; } return; }
    if (!this.ball) { if (A && A.type === 'charge') this.action = null; return; }
    if (I.fake && (!A || A.type === 'charge')) {
      this.action = { type: 'fake', t: 0, resume: false }; this.chargePhase = 0; G.onFake(this); return;
    }
    if (I.throwStart && !A && !this.blocking && this.catchT <= 0) { this.action = { type: 'charge', t: 0 }; this.chargePhase = 0; this.charge = 0; }
    if (this.action && this.action.type === 'charge') {
      this.action.t += dt;
      this.chargePhase += dt / (0.86 - r01(this.r('pow')) * 0.12);
      const ph = this.chargePhase % 2; this.charge = ph <= 1 ? ph : 2 - ph;
      if (I.throwRelease) {
        const c = Math.max(0.3, this.charge);
        const perfect = this.charge >= 0.86 && this.charge <= 0.97;
        this.action = { type: 'throw', t: 0, released: false, charge: c, perfect, target: I.target || this.target, aimDir: I.aimDir };
      }
    }
  }
  launch(A) {
    const b = this.ball; if (!b) return;
    const sprinting = Math.hypot(this.vel.x, this.vel.z) > 4.5;
    const pow = this.r('pow'), acc = this.r('acc');
    let speed = (13.5 + r01(pow) * 13.5) * (0.55 + 0.45 * A.charge);
    if (A.perfect) speed *= 1.12;
    let err = lerp(0.12, 0.024, r01(acc)) * (A.perfect ? 0.3 : 1) * (sprinting ? 1.5 : 1) * (A.charge < 0.45 ? 1.25 : 1) * (this.team.isHuman ? 1 : 1 / G.diffFor(this).acc) * (this.airborne ? 1.3 : 1);
    // origin
    const f = this.forward.clone();
    const o = this.char.handPos('R', new THREE.Vector3());
    o.addScaledVector(f, 0.25); o.y = Math.max(o.y, 1.0 + this.jumpY);
    // aim
    let T;
    const tgt = A.target && A.target.isActive() ? A.target : null;
    if (tgt) {
      const aimH = tgt.duck ? tgt.height * 0.42 : tgt.height * 0.6;
      T = new THREE.Vector3(tgt.pos.x, aimH + tgt.jumpY, tgt.pos.z);
      const lead = 0.25 + r01(this.r('awr')) * 0.7;
      for (let it = 0; it < 2; it++) {
        const d = Math.hypot(T.x - o.x, T.z - o.z); const t = d / speed;
        T.x = tgt.pos.x + tgt.vel.x * t * lead; T.z = tgt.pos.z + tgt.vel.z * t * lead;
      }
    } else {
      const dir = A.aimDir ? new THREE.Vector3(A.aimDir.x, 0, A.aimDir.y).normalize() : f;
      T = o.clone().addScaledVector(dir, 12); T.y = 1.1;
    }
    const dx = T.x - o.x, dz = T.z - o.z; const dh = Math.hypot(dx, dz); const t = dh / speed;
    const vy = (T.y - o.y + 0.5 * GRAV * t * t) / t;
    const yawE = gauss() * err, pitchE = gauss() * err * 0.7;
    const c = Math.cos(yawE), s = Math.sin(yawE);
    const vx = (dx * c - dz * s) / t, vz = (dx * s + dz * c) / t;
    const v = new THREE.Vector3(vx, vy + pitchE * speed, vz);
    b.launch(this, o, v, { perfect: A.perfect, target: tgt, power: clamp((v.length() - 12) / 18, 0, 1) });
    this.ball = null; this.stats.throws++; if (A.perfect) this.stats.perfect++;
    AUDIO.throw(b.power);
    if (A.perfect && this.team.isHuman && this === G.human) COMM.callout('PERFECT', 'RELEASE', '#ffcc33', 0.9);
    G.onThrow(this, b);
  }
  updateHit(dt) {
    this.hitT += dt; this.vel.multiplyScalar(Math.exp(-4 * dt)); this.pos.addScaledVector(this.vel, dt);
    if (this.airborne) { this.jumpV -= 11.5 * dt; this.jumpY += this.jumpV * dt; if (this.jumpY <= 0) { this.jumpY = 0; this.airborne = false; } }
    if (this.hitT > 0.85) { this.state = 'out'; this.walkTarget = this.team.benchSpot(this); }
  }
  updateOff(dt) {
    const tgt = this.state === 'returning' ? this.returnSpot : this.walkTarget;
    if (this.state === 'bench') { this.vel.set(0, 0, 0); this.pos.lerp(this.walkTarget, 1 - Math.exp(-6 * dt)); this.targetYaw = 0; this.faceUpdate(dt); return; }
    const d = _v1.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z); const dist = d.length();
    const sp = this.state === 'returning' ? 5.2 : 1.35;
    if (dist < 0.08) {
      if (this.state === 'out') { this.state = 'bench'; }
      else { this.state = 'active'; this.team.onReturned(this); }
      this.vel.set(0, 0, 0); return;
    }
    d.normalize(); this.vel.x = damp(this.vel.x, d.x * sp, 6, dt); this.vel.z = damp(this.vel.z, d.z * sp, 6, dt);
    if (dist < 0.5) this.vel.multiplyScalar(dist / 0.5 + 0.2);
    this.pos.addScaledVector(this.vel, dt);
    this.targetYaw = Math.atan2(this.vel.x, this.vel.z); this.faceUpdate(dt);
  }
  // ---------- being hit / outcomes ----------
  knockOut(by, ball, cause) {
    if (this.state !== 'active') return;
    this.state = 'hit'; this.hitT = 0; this.action = null; this.duck = false; this.blocking = false; this.catchT = 0;
    if (this.ball) { const b = this.ball; this.ball = null; b.drop(this, new THREE.Vector3(gauss(), 2, gauss())); }
    if (ball) { this.vel.set(ball.vel.x * 0.09, 0, ball.vel.z * 0.09); }
    this.flash = 1; this.stats.outs++;
    if (this === G.human) G.autoSwitch();
    this.team.onOut(this);
  }
  // ---------- visual sync ----------
  pose(dt) {
    const c = this.char;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let full = null;
    if (this.state === 'bench') full = 'sit';
    else if (this.state === 'celebrate') full = this.celebrate || 'cheer';
    else if (this.duck) full = 'crouch';
    c.root.position.set(this.pos.x, this.jumpY, this.pos.z);
    c.root.rotation.y = this.yaw;
    if (this.state === 'bench') c.root.position.y = -0.04;
    c.animate(dt, this.state === 'bench' || this.state === 'celebrate' ? 0 : speed, full);
    // procedural layer
    const P = { armW: 0 };
    const A = this.action;
    if (this.state === 'hit') {
      const k = Math.max(0, 1 - this.hitT / 0.8);
      Object.assign(P, POSE.hit, { armW: k }); P.spine = POSE.hit.spine.map(v => v * k);
    } else if (this.state === 'active') {
      if (A && A.type === 'charge') {
        const k = smooth(Math.min(1, A.t / 0.16)); const m = mixPose(POSE.hold, POSE.windup, k);
        Object.assign(P, m, { armW: 1, lw: 0.85 });
        P.spine[1] -= this.charge * 0.12;
      } else if (A && A.type === 'throw') {
        const t = A.t; let m, w = 1;
        if (t < 0.07) m = mixPose(POSE.windup, POSE.release, smooth(t / 0.07));
        else if (t < 0.24) m = mixPose(POSE.release, POSE.follow, smooth((t - 0.07) / 0.17));
        else { m = POSE.follow; w = 1 - smooth(clamp((t - 0.24) / 0.26, 0, 1)); m = { ...m, spine: m.spine.map(v => v * w) }; }
        Object.assign(P, m, { armW: w, lw: 0.8 });
      } else if (A && A.type === 'fake') {
        const t = A.t; let m;
        if (t < 0.1) m = mixPose(POSE.windup, POSE.release, smooth(t / 0.1) * 0.8);
        else m = mixPose(mixPose(POSE.windup, POSE.release, 0.8), POSE.hold, smooth(clamp((t - 0.1) / 0.3, 0, 1)));
        Object.assign(P, m, { armW: 1 });
      } else if (this.catchT > 0) {
        const k = smooth(clamp((this.catchLen - this.catchT) / 0.05, 0, 1)); Object.assign(P, POSE.catchReady, { armW: k });
      } else if (this.secureT > 0) {
        Object.assign(P, POSE.secure, { armW: Math.min(1, this.secureT / 0.15) });
      } else if (this.blocking) {
        Object.assign(P, POSE.block, { armW: 1 });
      } else if (this.ball) {
        Object.assign(P, POSE.hold, { armW: 1, lw: speed > 2.5 ? 0.25 : 0.7 });
      }
      if (this.airborne && P.armW < 0.5) { Object.assign(P, POSE.jump, { armW: 0.7 }); }
      if (this.airborne) { P.legW = 0.75 * smooth(clamp(this.jumpY / 0.35, 0, 1)); P.legs = LEGS_TUCK; }
      if (this.jukeT > 0) { const k = this.jukeT / 0.3; P.spine = P.spine || [0, 0, 0]; P.spine = [P.spine[0] + 0.12 * k, P.spine[1], P.spine[2] + this.jukeDir * 0.42 * k]; }
      // head tracking
      const look = G.lookTargetFor(this);
      if (look) { const want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z); P.head = [0, clamp(angDiff(this.yaw, want), -0.9, 0.9)]; }
    }
    c.applyPose(P);
    // flash
    this.flash = Math.max(0, this.flash - dt * 3.5); c.setFlash(this.flash * 0.9);
    // markers
    this.blob.position.set(this.pos.x, 0.008, this.pos.z); this.blob.visible = this.state !== 'bench';
    this.blob.scale.setScalar(1 - Math.min(0.4, this.jumpY));
    const ctrl = this === G.human && this.state === 'active';
    const isTarget = G.human && G.human.target === this && G.human.ball && this.state === 'active';
    this.ring.position.set(this.pos.x, 0.012, this.pos.z);
    const wantOp = ctrl ? 0.95 : isTarget ? 0.9 : 0;
    this.ring.material.opacity = damp(this.ring.material.opacity, wantOp, 12, dt);
    if (ctrl) this.ring.material.color.set(this.team.uni.p === '#ffffff' ? '#ffcc33' : '#ffcc33');
    else if (isTarget) this.ring.material.color.set('#ff3b3b');
    this.ring.scale.setScalar(isTarget ? 1 + Math.sin(G.time * 10) * 0.08 : 1);
  }
}

// ---------- team runtime ----------
class TeamRT {
  constructor(data, idx, side, uni, isHuman) {
    this.data = data; this.idx = idx; this.side = side; this.uni = uni; this.isHuman = isHuman;
    this.players = []; this.outQueue = []; this.rally = false; this.volleyAt = 0;
  }
  activeCount() { let n = 0; for (const p of this.players) if (p.state === 'active') n++; return n; }
  active() { return this.players.filter(p => p.state === 'active'); }
  get opp() { return G.teams[1 - this.idx]; }
  benchSpot(p) { const i = this.outQueue.indexOf(p); return new THREE.Vector3(this.side * (2.4 + Math.max(0, i) * 1.05), 0, BENCH_Z + 0.35); }
  onOut(p) {
    this.outQueue.push(p);
    this.outQueue.forEach(q => { if (q.state === 'bench' || q.state === 'out') q.walkTarget = this.benchSpot(q); });
    G.onPlayerOut(p);
  }
  returnOne() {
    const p = this.outQueue.shift(); if (!p) return null;
    this.outQueue.forEach(q => { if (q.state === 'bench' || q.state === 'out') q.walkTarget = this.benchSpot(q); });
    p.reset(); p.state = 'returning';
    if (p.pos.z > -COURT.HZ) p.pos.z = -COURT.HZ - 0.4;
    p.returnSpot = new THREE.Vector3(this.side * rand(5.5, 7.5), 0, rand(-2.8, 1.5));
    p.stats.returns++;
    return p;
  }
  onReturned(p) { p.targetYaw = this.side < 0 ? Math.PI / 2 : -Math.PI / 2; }
}

// ---------- balls ----------
const BALL_GEO = new THREE.SphereGeometry(BALL_R, 28, 18);
function ballMaterial() {
  const tex = canvasTex(256, 128, (x) => {
    x.fillStyle = '#d4202a'; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); }
    x.strokeStyle = 'rgba(40,0,0,.55)'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32, 128); x.stroke(); }
    x.fillStyle = '#ffffff'; x.font = 'bold 22px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('DNL', 64, 72); x.fillText('DNL', 192, 72);
  });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.48, metalness: 0, envMapIntensity: 0.8 });
}
class Ball {
  constructor(i, mat) {
    this.i = i;
    this.mesh = new THREE.Mesh(BALL_GEO, mat); this.mesh.castShadow = true; scene.add(this.mesh);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.spin = new THREE.Vector3();
    this.trail = []; const tm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.trailMeshes = []; for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(BALL_GEO, tm.clone()); m.visible = false; scene.add(m); this.trailMeshes.push(m); }
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.glow = glow; scene.add(glow);
    this.reset(new THREE.Vector3());
  }
  reset(p) { this.state = 'loose'; this.pos.copy(p); this.vel.set(0, 0, 0); this.holder = null; this.thrower = null; this.live = false; this.target = null; this.ignore = new Set(); this.minDist = new Map(); this.outT = 0; this.pickCD = 0; this.trail.length = 0; this.restT = 0; }
  canPickup(p) {
    if (this.state !== 'loose' || this.pickCD > 0) return false;
    if (this.pos.y > 1.25 || this.vel.lengthSq() > 64) return false;
    if (this.pos.x * p.side < -0.6) return false; // other half
    return Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z) < 0.6;
  }
  pickup(p) {
    this.state = 'held'; this.holder = p; p.ball = this; this.live = false; this.thrower = null; this.vel.set(0, 0, 0);
    p.ai.holdT = 0; p.ai.fakeDone = false; AUDIO.step();
    G.onPickup(p, this);
  }
  drop(p, v) { this.state = 'loose'; this.holder = null; this.live = false; this.vel.copy(v); this.pickCD = 0.4; }
  launch(p, o, v, info) {
    this.state = 'flying'; this.holder = null; this.thrower = p; this.live = true; this.pos.copy(o); this.vel.copy(v);
    this.perfect = info.perfect; this.target = info.target; this.power = info.power; this.ignore = new Set(); this.minDist = new Map(); this.launchT = G.time;
    this.spin.set(gauss() * 8, gauss() * 3, gauss() * 8 + 12); this.trail.length = 0;
  }
  deaden() {
    if (!this.live) return; this.live = false; this.state = 'loose';
    // dodge credit: target came close and survived
    for (const [p, d] of this.minDist) if (d < 1.1 && p.isActive() && p.team !== this.thrower.team) { p.stats.dodges++; G.onDodge(p, this, d); }
  }
  update(dt) {
    this.pickCD = Math.max(0, this.pickCD - dt);
    if (this.state === 'held') {
      const h = this.holder; if (!h) { this.state = 'loose'; return; }
      if (h.blocking || h.secureT > 0) { h.char.handPos('R', _v1); h.char.handPos('L', _v2); this.pos.copy(_v1).lerp(_v2, 0.5); }
      else h.char.handPos('R', this.pos);
      this.vel.set(0, 0, 0); this.trail.length = 0;
      return;
    }
    const sp = this.vel.length();
    const n = Math.max(1, Math.ceil(sp * dt / 0.07));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      this.vel.y -= GRAV * h;
      this.pos.addScaledVector(this.vel, h);
      // floor
      if (this.pos.y < BALL_R) {
        this.pos.y = BALL_R;
        if (this.vel.y < -0.6) { const iv = -this.vel.y; this.vel.y = iv * 0.6; this.vel.x *= 0.82; this.vel.z *= 0.82; AUDIO.bounce(iv); if (iv > 3) FX.dustPuff(this.pos, 3, 0.4); }
        else { this.vel.y = 0; }
        this.deaden();
      }
      // walls
      if (Math.abs(this.pos.x) > 12.6) { this.pos.x = Math.sign(this.pos.x) * 12.6; this.vel.x *= -0.5; this.deaden(); AUDIO.bounce(Math.abs(this.vel.x) + 2); }
      if (this.pos.z < -7.4) { this.pos.z = -7.4; this.vel.z *= -0.5; this.deaden(); AUDIO.bounce(Math.abs(this.vel.z) + 2); }
      if (this.pos.z > 7.0) { this.pos.z = 7.0; this.vel.z *= -0.5; this.deaden(); AUDIO.bounce(Math.abs(this.vel.z) + 2); }
      // players
      if (this.state === 'flying' || (this.state === 'loose' && sp > 2)) this.collidePlayers();
    }
    // rolling friction
    if (this.pos.y <= BALL_R + 0.001) { this.vel.x *= Math.exp(-1.1 * dt); this.vel.z *= Math.exp(-1.1 * dt); }
    // spin visual
    this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.z += this.spin.z * dt; this.spin.multiplyScalar(Math.exp(-0.8 * dt));
    if (this.pos.y <= BALL_R + 0.01) { this.mesh.rotation.x += this.vel.z * dt / BALL_R; this.mesh.rotation.z -= this.vel.x * dt / BALL_R; }
    // ball-boy: return dead balls resting out of bounds
    const outOfCourt = Math.abs(this.pos.x) > COURT.HX + 0.15 || Math.abs(this.pos.z) > COURT.HZ + 0.15;
    if (this.state === 'loose' && outOfCourt && this.vel.length() < 1.2) {
      this.outT += dt;
      if (this.outT > 0.9) {
        const side = Math.sign(this.pos.x) || 1; this.outT = 0;
        this.pos.set(side * (COURT.HX - 0.9), 0.9, clamp(this.pos.z, -COURT.HZ + 0.8, COURT.HZ - 0.8));
        this.vel.set(-side * 1.2, 1.5, 0); FX.dustPuff(this.pos, 4, 0.3);
      }
    } else this.outT = 0;
    // center line stall: a ball resting right on the line nudges to the emptier side
    if (this.state === 'loose' && Math.abs(this.pos.x) < 0.3 && this.vel.length() < 0.2 && G.phase === 'play') { this.restT += dt; if (this.restT > 2.5) { this.vel.x = (Math.random() < 0.5 ? -1 : 1) * 1.2; this.restT = 0; } }
  }
  collidePlayers() {
    for (const p of G.players) {
      if (p.state !== 'active') continue;
      if (this.ignore.has(p)) continue;
      const hb = p.hitbox();
      // closest point on segment
      const ab = _v3.copy(hb.b).sub(hb.a); const t = clamp(_v3.dot(_q1.set(this.pos.x - hb.a.x, this.pos.y - hb.a.y, this.pos.z - hb.a.z, 0)) / ab.lengthSq(), 0, 1);
      const cx = hb.a.x + ab.x * t, cy = hb.a.y + ab.y * t, cz = hb.a.z + ab.z * t;
      const d = Math.hypot(this.pos.x - cx, this.pos.y - cy, this.pos.z - cz);
      if (this.live && this.thrower && p.team !== this.thrower.team) {
        const prev = this.minDist.get(p); if (prev === undefined || d < prev) this.minDist.set(p, d);
      }
      if (d > hb.r + BALL_R) continue;
      // contact!
      const nrm = new THREE.Vector3(this.pos.x - cx, this.pos.y - cy, this.pos.z - cz).normalize();
      if (this.live && this.thrower && p.team !== this.thrower.team) { G.resolveContact(this, p, nrm, cy); }
      else if (p.team === (this.thrower && this.thrower.team) && this.live) { this.ignore.add(p); continue; }
      else {
        // dead ball bump
        const vn = this.vel.dot(nrm); if (vn < 0) this.vel.addScaledVector(nrm, -1.6 * vn);
        this.pos.copy(_v1.set(cx, cy, cz).addScaledVector(nrm, hb.r + BALL_R + 0.01));
      }
      return;
    }
  }
  visual(dt) {
    this.mesh.position.copy(this.pos);
    const fast = this.state === 'flying' && this.live;
    if (fast) { this.trail.unshift(this.pos.clone()); if (this.trail.length > 9) this.trail.pop(); } else if (this.trail.length) this.trail.pop();
    this.trailMeshes.forEach((m, k) => {
      const p = this.trail[k + 1]; if (!p) { m.visible = false; return; }
      m.visible = true; m.position.copy(p); const f = 1 - (k + 1) / 10; m.scale.setScalar(f * 0.95);
      m.material.opacity = f * (this.perfect ? 0.55 : 0.32); m.material.color.set(this.perfect ? 0xffb030 : 0xffffff);
    });
    // glow ring on loose balls on the human's side
    const g = this.glow; const show = this.state === 'loose' && G.human && this.pos.x * G.human.side > -0.6 && G.phase === 'play' && this.vel.length() < 4;
    g.position.set(this.pos.x, 0.015, this.pos.z); g.material.opacity = damp(g.material.opacity, show ? 0.55 + Math.sin(G.time * 6) * 0.2 : 0, 10, dt);
  }
}
