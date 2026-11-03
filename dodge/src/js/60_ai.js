// ================= AI =================
const LANES = [-3.3, -2.0, -0.7, 0.7, 2.0, 3.3];

// predict how a flying ball meets this player: {tc, dist, y, ball}
function threatTo(p, b) {
  if (b.state !== 'flying' || !b.live || !b.thrower || b.thrower.team === p.team) return null;
  const rx = p.pos.x - b.pos.x, rz = p.pos.z - b.pos.z;
  const vh2 = b.vel.x * b.vel.x + b.vel.z * b.vel.z; if (vh2 < 1) return null;
  const tc = (rx * b.vel.x + rz * b.vel.z) / vh2;
  if (tc < -0.02 || tc > 1.1) return null;
  const px = b.pos.x + b.vel.x * tc, pz = b.pos.z + b.vel.z * tc;
  const y = b.pos.y + b.vel.y * tc - 0.5 * GRAV * tc * tc;
  const dist = Math.hypot(px - p.pos.x, pz - p.pos.z);
  if (dist > 0.85 || y > p.height + 0.25 || y < -0.1) return null;
  return { tc, dist, y, ball: b };
}

function assignFetchers(team) {
  const free = team.players.filter(p => p.state === 'active' && !p.ball && p !== G.human);
  for (const p of free) p.ai.fetch = null;
  const balls = G.balls.filter(b => b.state === 'loose' && b.pos.x * team.side > -0.5 && b.pickCD <= 0 && Math.abs(b.pos.x) < COURT.HX + 0.1 && Math.abs(b.pos.z) < COURT.HZ + 0.1);
  const pairs = [];
  for (const b of balls) for (const p of free) pairs.push([Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) + (G.rush ? Math.abs(b.pos.z - p.pos.z) * 2 : 0), p, b]);
  pairs.sort((a, b) => a[0] - b[0]);
  const usedP = new Set(), usedB = new Set();
  for (const [, p, b] of pairs) { if (usedP.has(p) || usedB.has(b)) continue; p.ai.fetch = b; usedP.add(p); usedB.add(b); }
}

function chooseTarget(p) {
  const opp = p.team.opp; const act = opp.active(); if (!act.length) return null;
  const D = G.diffFor(p); let best = null, bs = -1e9;
  const few = act.length <= 2;
  for (const o of act) {
    const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    let s = 50 - d * 2.4 + (99 - o.r('dodge')) * 0.32 + (99 - o.r('catch')) * (o.ball ? 0.08 : 0.3);
    if (o.action && o.action.type === 'charge') s += 9;
    if (o.recover > 0 || o.catchCD > 0) s += 12;
    if (o.bit > 0) s += 16;
    if (o.airborne) s -= 6;
    if (o === G.human) s += 5 * D.aggression;
    if (few) s += p.team.players.filter(t => t !== p && t.target === o).length * 18;
    s += Math.random() * 8;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

function planRelease(ai, pr) {
  const perfectPlan = Math.random() < pr;
  ai.releaseAt = perfectPlan ? rand(0.885, 0.945) : (Math.random() < 0.6 ? rand(0.55, 0.82) : rand(0.98, 1.0));
  ai.overshoot = !perfectPlan && Math.random() < 0.12; if (ai.overshoot) ai.releaseAt = rand(0.5, 0.8);
}
function aiIntent(p, dt) {
  const I = { move: { x: 0, y: 0 } };
  const ai = p.ai, team = p.team, opp = team.opp, D = G.diffFor(p);
  const side = p.side;
  // ---------- threat response ----------
  let threat = null;
  for (const b of G.balls) { const t = threatTo(p, b); if (t && (!threat || t.tc < threat.tc)) threat = t; }
  if (threat) {
    const b = threat.ball; let R = ai.react.get(b);
    if (!R) {
      const delay = (0.3 - r01(p.r('awr')) * 0.13 - r01(p.r('dodge')) * 0.06) * D.react + rand(-0.03, 0.05);
      R = { at: (b.launchT || G.time) + delay, done: false }; ai.react.set(b, R);
    }
    if (!R.done && G.time >= R.at) {
      R.done = true;
      const catchSkill = r01(p.r('catch'));
      const pCatch = clamp((catchSkill * 0.9 + 0.05) * D.catchSkill * (1 - b.power * 0.4) + (p.data.arch === 'WALL' ? 0.15 : 0), 0, 0.9);
      const lowBall = threat.y < 0.55, highBall = threat.y > p.height * 0.62;
      if (p.ball) R.kind = Math.random() < 0.55 + catchSkill * 0.35 ? 'block' : 'juke';
      else if (Math.random() < pCatch && threat.y > 0.45 && threat.y < p.height + 0.1) R.kind = 'catch';
      else if (lowBall && Math.random() < 0.7) R.kind = 'jump';
      else if (highBall && Math.random() < 0.6) R.kind = 'duck';
      else R.kind = 'juke';
      if (R.kind === 'catch') { G.dbg.tries++;
        const win = 0.13 + r01(p.r('catch')) * 0.24;
        const err = gauss() * (0.085 - r01(p.r('awr')) * 0.045) / D.catchSkill;
        R.catchAt = G.time + Math.max(0, threat.tc - win * 0.5 + err);
      }
      if (R.kind === 'jump') R.jumpAt = G.time + Math.max(0, threat.tc - 0.22);
      if (R.kind === 'duck') R.duckUntil = G.time + threat.tc + 0.3;
      if (R.kind === 'juke') {
        const px = -b.vel.z, pz = b.vel.x; const l = Math.hypot(px, pz) || 1;
        let s = Math.random() < 0.5 ? 1 : -1;
        const nz = p.pos.z + s * pz / l * 1.2; if (Math.abs(nz) > COURT.HZ - 0.5) s = -s;
        R.jukeDir = { x: s * px / l, y: s * pz / l };
      }
    }
    if (R.done) {
      if (R.kind === 'catch') { I.face = Math.atan2(-b.vel.x, -b.vel.z); I.hold = true; if (G.time >= R.catchAt) I.catch = true; }
      if (R.kind === 'block') { I.block = true; I.face = Math.atan2(-b.vel.x, -b.vel.z); }
      if (R.kind === 'jump' && G.time >= R.jumpAt) I.jump = true;
      if (R.kind === 'duck' && G.time < R.duckUntil) I.duck = true;
      if (R.kind === 'juke') { I.juke = true; I.jukeDir = R.jukeDir; }
    }
  }
  if (ai.biteUntil && G.time < ai.biteUntil) { if (ai.biteKind === 'duck') I.duck = true; else if (ai.biteKind === 'jump') I.jump = true; else { I.juke = true; I.jukeDir = ai.biteDir; } }
  if (ai.duckHold && G.time < ai.duckHold) I.duck = true;

  // ---------- with ball ----------
  if (p.ball) {
    ai.holdT += dt;
    if (!p.target || !p.target.isActive() || Math.random() < dt * 0.4) p.target = chooseTarget(p);
    const tgt = p.target;
    if (ai.attackX == null) { ai.attackX = side * rand(1.6, 4.2) * (G.rush ? 1.4 : 1); ai.attackZ = clamp((tgt ? tgt.pos.z * 0.5 : 0) + rand(-1.2, 1.2), -3.6, 3.6); }
    const dx = ai.attackX - p.pos.x, dz = ai.attackZ - p.pos.z; const dd = Math.hypot(dx, dz);
    const A = p.action;
    const charging = A && A.type === 'charge';
    if (dd > 0.4 && !charging) { I.move = { x: dx / dd, y: dz / dd }; I.sprint = dd > 2.5; }
    else if (!charging) { ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafe = rand(-1, 1); ai.strafeT = rand(0.4, 1.0); } I.move = { x: 0, y: ai.strafe * 0.5 }; }
    else I.move = { x: 0, y: ai.strafe * 0.25 };
    if (tgt) I.face = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
    // volleys when opponents are down to their last players
    const few = opp.activeCount() <= 2;
    const holders = team.players.filter(t => t.state === 'active' && t.ball);
    let ready = dd < 0.9 || ai.holdT > 2.4 || (G.rush && Math.abs(p.pos.x) > 2.2);
    if (few && holders.length >= 2 && !team.isHuman) {
      if (!team.volleyAt || G.time > team.volleyAt + 1.2) team.volleyAt = G.time + 0.9;
      ready = G.time > team.volleyAt - 0.75;
    }
    const pace = 0.85 + D.aggression * 0.2;
    if (ai.patience == null) ai.patience = rand(0.8, 2.5) / pace;
    if (!A && ready && !p.blocking && p.catchT <= 0 && ai.holdT > (G.rush ? 0.3 : ai.patience) && tgt) {
      ai.patience = null;
      I.throwStart = true;
      const pr = D.perfect * (0.5 + r01(p.r('acc')) * 0.8);
      planRelease(ai, pr);
      ai.fakePlan = !ai.fakeDone && Math.random() < 0.08 + r01(p.r('awr')) * 0.2;
    }
    if (charging) {
      if (ai.fakePlan && p.charge > 0.45 && !ai.fakeDone) { I.fake = true; ai.fakeDone = true; ai.fakePlan = false; }
      else {
        const ph = p.chargePhase; const rising = (ph % 2) <= 1;
        const hit = ai.overshoot ? ph > 1.25 && p.charge <= ai.releaseAt : rising && p.charge >= ai.releaseAt;
        if (hit || ph > 2.4) { I.throwRelease = true; I.target = tgt; ai.attackX = null; }
      }
    }
    if (ai.fakeDone && !A && ai.holdT > 0.2 && tgt && ready) { I.throwStart = true; planRelease(ai, D.perfect * (0.5 + r01(p.r('acc')) * 0.8)); ai.fakePlan = false; }
    return I;
  }
  ai.attackX = null; p.target = null;
  if (I.hold || p.catchT > 0) { I.move = { x: 0, y: 0 }; return I; }
  // ---------- fetch a ball ----------
  const fb = ai.fetch;
  if (fb && fb.state === 'loose') {
    const dx = fb.pos.x - p.pos.x, dz = fb.pos.z - p.pos.z; const d = Math.hypot(dx, dz);
    const risky = opp.players.some(o => o.state === 'active' && o.ball) && Math.abs(fb.pos.x) < 1.5;
    if (!risky || d < 3 || G.rush || Math.random() < 0.02) { I.move = { x: dx / (d || 1), y: dz / (d || 1) }; I.sprint = d > 1.2; return I; }
  }
  // ---------- positioning ----------
  const threatened = opp.players.some(o => o.state === 'active' && o.ball);
  const act = team.active().sort((a, b) => a.pos.z - b.pos.z);
  const li = act.indexOf(p); const lane = LANES[Math.round((li + 0.5) / act.length * LANES.length - 0.5)] ?? 0;
  if (ai.homeT == null || G.time > ai.homeT) { ai.homeX = side * (threatened ? rand(5.2, 8.0) : rand(3.4, 6.2)); ai.homeT = G.time + rand(1.2, 2.6); ai.zOff = rand(-0.6, 0.6); }
  const hx = ai.homeX, hz = clamp(lane + ai.zOff, -COURT.HZ + 0.5, COURT.HZ - 0.5);
  const dx = hx - p.pos.x, dz = hz - p.pos.z; const d = Math.hypot(dx, dz);
  if (d > 0.3) { I.move = { x: dx / d * Math.min(1, d), y: dz / d * Math.min(1, d) }; I.sprint = d > 3; }
  // face most dangerous opponent
  let dang = null, dd = 1e9;
  for (const o of opp.players) if (o.state === 'active') { const s = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) - (o.ball ? 6 : 0); if (s < dd) { dd = s; dang = o; } }
  if (dang && d < 1.0) I.face = Math.atan2(dang.pos.x - p.pos.x, dang.pos.z - p.pos.z);
  // ready-catch stance for strong catchers vs charging opponents
  if (!threat && dang && dang.ball && dang.action && dang.action.type === 'charge' && dang.target === p) {
    I.face = Math.atan2(dang.pos.x - p.pos.x, dang.pos.z - p.pos.z);
  }
  return I;
}

// opponents may bite on a fake
function aiOnFake(thrower) {
  for (const o of thrower.team.opp.players) {
    if (o.state !== 'active' || o === G.human) continue;
    const aimed = thrower.target === o || Math.hypot(o.pos.x - thrower.pos.x, o.pos.z - thrower.pos.z) < 7;
    if (!aimed) continue;
    const resist = r01(o.r('awr')) * 0.85 + (G.diffFor(o).react < 1 ? 0.1 : 0);
    if (Math.random() > resist) {
      o.ai.biteUntil = G.time + 0.18; o.ai.biteKind = pick(['juke', 'juke', 'duck', 'jump']);
      const s = Math.random() < 0.5 ? 1 : -1; o.ai.biteDir = { x: 0, y: s }; o.bit = 0.9;
      if (thrower.target === o && thrower.team.isHuman) COMM.say('fake', { t: thrower.name, v: o.name });
    }
  }
}
