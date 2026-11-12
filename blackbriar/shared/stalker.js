// The Monitor's mind. Most of the night it stalks and toys with the crew (lurking at the end of halls, following,
// pranks); a few times a night it hunts, with warning; at 4:00 it lays siege to the office. It is a mannequin:
// it never moves while anyone is looking at it, so every relocation happens out of sight.
import { CONFIG } from './config.js';
import { DOORS, LOCKERS, SEARCHABLE, LAIR, PATROL, WATCH_POINTS, roomAt, groundY, solidRects, segBlocked, doorCenter } from './level.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const angDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const turnTo = (a, b, k) => a + Math.max(-k, Math.min(k, angDiff(a, b)));
const OFFICE_DOOR_OUT = { x: 21.5, z: 2.3 };

function fresh() { return { hunts: 0, lastHunt: -999, stare: {}, agit: 0, siege: null, last: '' }; }
export function resetStalker(S) { S.dir = fresh(); }

// can player p see the point (x, z) — on screen and nothing solid in between (used to keep relocations unseen)
function inViewOf(S, p, x, z, rects, slack = 0.25) {
  if (p.hidden) return false;
  const d = dist(p.x, p.z, x, z); if (d > 36) return false;
  const facing = Math.atan2(-Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0));
  if (d > 1.5 && Math.abs(angDiff(facing, Math.atan2(x - p.x, z - p.z))) > CONFIG.monitor.viewFreezeHalf + slack) return false;
  return !segBlocked(p.x, p.z, x, z, rects, { sight: true });
}
const seenByAny = (S, alive, x, z, rects) => alive.some(p => inViewOf(S, p, x, z, rects));
const sameFloor = (a, b) => Math.abs(groundY(a.x, a.z) - groundY(b.x, b.z)) < 0.6;

// teleport somewhere nobody can see, preferring the lair among the stored mannequins
function vanish(S, alive, rects, restFor) {
  const m = S.mon, spots = [LAIR, ...PATROL.map(([x, z]) => ({ x, z }))];
  let pick = null;
  for (let k = 0; k < 12 && !pick; k++) { const s = k === 0 ? LAIR : spots[(S.rand() * spots.length) | 0]; if (!seenByAny(S, alive, s.x, s.z, rects) && alive.every(p => dist(p.x, p.z, s.x, s.z) > 10)) pick = s; }
  if (pick) relocate(S, pick.x, pick.z);
  if (m.state === 'hunt') S.emit({ t: 'hunt', on: 0 });
  S.setMon('rest', { restFor: restFor ?? (8 + S.rand() * 10), target: null, seenT: 0, creep: false });
}
function relocate(S, x, z) { const m = S.mon; m.x = x; m.z = z; m.path = null; m.tpN = (m.tpN || 0) + 1; }

// a hidden spot at a given distance band from player p, same floor, open floor, optionally with sight of p
function spotNear(S, p, alive, rects, dmin, dmax, needSight, tries = 60) {
  let best = null;
  for (let k = 0; k < tries; k++) {
    let x, z;
    if (k < WATCH_POINTS.length && needSight) { x = WATCH_POINTS[k].x; z = WATCH_POINTS[k].z; }
    else { const a = S.rand() * 6.283, r = dmin + S.rand() * (dmax - dmin); x = p.x + Math.sin(a) * r; z = p.z + Math.cos(a) * r; }
    const d = dist(x, z, p.x, p.z); if (d < dmin || d > dmax) continue;
    if (!roomAt(x, z) || !sameFloor({ x, z }, p) || !S.navFree(x, z)) continue;
    if (needSight && segBlocked(x, z, p.x, p.z, rects, { sight: true })) continue;
    if (seenByAny(S, alive, x, z, rects)) continue;
    if (alive.some(o => dist(o.x, o.z, x, z) < Math.min(dmin, 6))) continue;
    const score = (needSight ? -Math.abs(d - (dmin + dmax) / 2) : 0) + S.rand() * 3 - S.lightAt(x, z) * 2;
    if (!best || score > best.s) best = { x, z, s: score };
  }
  return best;
}

function canHunt(S, prog) {
  const dir = S.dir, cap = CONFIG.monitor.huntsPerNight[Math.min(S.day, 3) - 1];
  return prog > CONFIG.monitor.huntAfter && dir.hunts < cap && (S.time || 0) - dir.lastHunt > CONFIG.monitor.huntGap;
}
function startHunt(S, p, alive, rects, provoked) {
  const m = S.mon, dir = S.dir; dir.hunts++; dir.lastHunt = S.time || 0;
  // it comes from somewhere you are not looking
  if (dist(m.x, m.z, p.x, p.z) > 24 || !sameFloor(m, p)) { const s = spotNear(S, p, alive, rects, 15, 22, false); if (s) relocate(S, s.x, s.z); }
  S.setMon('hunt', { target: p.pid, huntT: 0, lostT: 0, lastKnown: { x: p.x, z: p.z }, sawHide: false, bangT: 0 });
  S.emit({ t: 'hunt', on: 1, pid: p.pid, provoked: !!provoked });
}

// ---------------- pranks: harmless, always out of sight ----------------
function prank(S, p, alive, rects) {
  const m = S.mon, kinds = [];
  const doors = DOORS.filter(d => { const c = doorCenter(d), s = S.doors[d.id], dd = dist(c.x, c.z, p.x, p.z); return !d.lock && d.id !== 'd_office' && !s.bolted && dd > 3 && dd < 14 && Math.abs((d.y || 0) - groundY(p.x, p.z)) < 0.6 && !seenByAny(S, alive, c.x, c.z, rects); });
  if (doors.length) kinds.push('door', 'door');
  const lockers = LOCKERS.filter(l => { if (!SEARCHABLE[l.id] || S.lockers[l.id]?.open) return false; const dd = dist(l.x, l.z, p.x, p.z); return dd > 3 && dd < 13 && groundY(p.x, p.z) > -1 && !seenByAny(S, alive, l.x, l.z, rects); });
  if (lockers.length) kinds.push('slam', 'slam');
  kinds.push('lights', 'knock', 'prints', 'watcher', 'watcher', 'whisper');
  if (S.dir.last !== 'name' && S.rand() < 0.35) kinds.push('name');
  if (!S.cart.holder && dist(S.cart.x, S.cart.z, p.x, p.z) < 16 && dist(S.cart.x, S.cart.z, p.x, p.z) > 4 && !seenByAny(S, alive, S.cart.x, S.cart.z, rects)) kinds.push('cart');
  let k = kinds[(S.rand() * kinds.length) | 0]; if (k === S.dir.last) k = kinds[(S.rand() * kinds.length) | 0];
  S.dir.last = k;
  const behind = (r) => { const f = { x: -Math.sin(p.yaw || 0), z: -Math.cos(p.yaw || 0) }; return { x: p.x - f.x * r, z: p.z - f.z * r }; };
  switch (k) {
    case 'door': { const d = doors[(S.rand() * doors.length) | 0], s = S.doors[d.id]; s.open = !s.open; const c = doorCenter(d); S.emit({ t: 'door', id: d.id, open: s.open, bolted: false, by: 'monitor', x: c.x, z: c.z }); break; }
    case 'slam': { const l = lockers[(S.rand() * lockers.length) | 0]; S.emit({ t: 'prank', k: 'slam', id: l.id, x: l.x, z: l.z }); break; }
    case 'lights': S.emit({ t: 'scare', k: 'lightsout', x: p.x, z: p.z, r: 10, d: 10 + S.rand() * 10 }); break;
    case 'knock': { const b = behind(3 + S.rand() * 3); S.emit({ t: 'prank', k: 'knock', x: b.x, z: b.z, n: 3 + ((S.rand() * 3) | 0) }); break; }
    case 'whisper': { const b = behind(1.2); S.emit({ t: 'prank', k: 'whisper', x: b.x, z: b.z }, { to: p.pid }); break; }
    case 'watcher': S.emit({ t: 'scare', k: 'watcher', seed: (S.rand() * 1e9) | 0 }, { to: p.pid }); break;
    case 'name': S.emit({ t: 'pa', text: `${p.name || 'Custodian'}. ${p.name || 'Custodian'}. You are not in your assigned room.` }); break;
    case 'cart': { const a = S.rand() * 6.283; S.cart.x += Math.sin(a) * 1.2; S.cart.z += Math.cos(a) * 0.4; S.cart.yaw += (S.rand() - 0.5) * 2; if (!roomAt(S.cart.x, S.cart.z)) { S.cart.x -= Math.sin(a) * 1.2; S.cart.z -= Math.cos(a) * 0.4; } S.emit({ t: 'cart', x: S.cart.x, z: S.cart.z, yaw: S.cart.yaw, holder: null }); S.emit({ t: 'prank', k: 'roll', x: S.cart.x, z: S.cart.z }); break; }
    case 'prints': { // muddy bare footprints that come up behind you and stop at your heels
      const pts = [], f = { x: -Math.sin(p.yaw || 0), z: -Math.cos(p.yaw || 0) }, side = { x: f.z, z: -f.x }, gy = groundY(p.x, p.z);
      for (let i = 14; i >= 1; i--) { const r = i * 0.62, s = (i % 2 ? 1 : -1) * 0.13, x = p.x - f.x * r + side.x * s, z = p.z - f.z * r + side.z * s; if (!roomAt(x, z) || Math.abs(groundY(x, z) - gy) > 0.3) continue; pts.push([+x.toFixed(2), +z.toFixed(2)]); }
      S.emit({ t: 'prank', k: 'prints', pts, yaw: Math.atan2(f.x, f.z), y: gy }); break;
    }
  }
  return k;
}

// ---------------- the main tick ----------------
export function tickStalker(S, dt) {
  const m = S.mon, C = CONFIG.monitor, dir = S.dir || (S.dir = fresh());
  const rects = solidRects(S.doors), lock = S.phase === 'lockdown', prog = S.shiftT / CONFIG.shiftSeconds;
  const alive = [...S.players.values()].filter(p => p.connected && !p.downed && !p.out);
  const outside = alive.filter(p => !S.isInOffice(p));
  for (const p of alive) if (p.blinkT > 0) p.blinkT -= dt;
  m.stateT += dt;
  // ---- the mannequin rule ----
  const watchers = alive.filter(p => !p.hidden && !(p.blinkT > 0) && S.playerSees(p, m, rects));
  const wasFrozen = !!m.frozen; m.frozen = watchers.length > 0 && m.state !== 'dormant';
  if (m.frozen !== wasFrozen) S.emit({ t: 'monfreeze', on: m.frozen ? 1 : 0, x: m.x, z: m.z });
  // ---- staring at it provokes it ----
  for (const p of alive) {
    const close = watchers.includes(p) && dist(m.x, m.z, p.x, p.z) < 13;
    dir.stare[p.pid] = close ? (dir.stare[p.pid] || 0) + dt : Math.max(0, (dir.stare[p.pid] || 0) - dt * 0.5);
    if (dir.stare[p.pid] > C.stareLimit && !lock && m.state !== 'hunt' && !S.isInOffice(p)) {
      dir.stare[p.pid] = 0;
      if (canHunt(S, prog) || S.day > 1 && S.rand() < 0.5) { S.emit({ t: 'toast', msg: 'You looked at it for too long.' }, { to: p.pid }); m.pendingHunt = p.pid; }
      else m.vanishWhenUnseen = true;
    }
  }
  // noise makes it restless
  for (const n of (S.noises || [])) if (dist(n.x, n.z, m.x, m.z) < n.r * 1.5) dir.agit = Math.min(1, dir.agit + 0.02);
  S.noises = []; dir.agit = Math.max(0, dir.agit - dt * 0.01);
  if (m.frozen) { m.moving = 0; m.seenT = (m.seenT || 0) + dt; return; }
  // everything below happens only while nobody is looking
  if (m.vanishWhenUnseen) { m.vanishWhenUnseen = false; return vanish(S, alive, rects); }
  if (m.pendingHunt && m.state !== 'hunt') { const p = alive.find(q => q.pid === m.pendingHunt); m.pendingHunt = null; if (p) return startHunt(S, p, alive, rects, true); }
  if (lock && m.state !== 'hunt' && m.state !== 'siege') {
    if (outside.length) return startHunt(S, outside[(S.rand() * outside.length) | 0], alive, rects);
    if (alive.length) return S.setMon('siege', { step: 'approach' });
  }
  const st = m.state, tgt = alive.find(p => p.pid === m.target);
  if (st === 'dormant') {
    m.moving = 0;
    if (S.shiftT > (S.day === 1 ? C.firstNightGrace : C.firstNightGrace * 0.5)) S.setMon('rest', { restFor: 5 });
  } else if (st === 'rest') {
    m.moving = 0;
    if (m.stateT < m.restFor * (1 - dir.agit * 0.5)) return;
    const pool = outside.length ? outside : [];
    if (!pool.length) { // everyone is safe in the office: it reminds them it is there
      if (alive.length && S.rand() < 0.5) S.emit({ t: 'prank', k: 'knock', x: 21.5, z: 3.3, n: 3 }); else if (alive.length) S.emit({ t: 'sfx', k: 'rattle', x: 21.5, z: 3.6 });
      return S.setMon('rest', { restFor: 14 + S.rand() * 12 });
    }
    const p = pool[(S.rand() * pool.length) | 0];
    const w = { lurk: 0.32, shadow: 0.26, prank: 0.42, hunt: canHunt(S, prog) ? 0.1 + 0.25 * prog + dir.agit * 0.3 : 0 };
    let r = S.rand() * (w.lurk + w.shadow + w.prank + w.hunt);
    if ((r -= w.hunt) < 0) return startHunt(S, p, alive, rects);
    if ((r -= w.lurk) < 0) {
      const s = spotNear(S, p, alive, rects, 9, 18, true);
      if (s) { relocate(S, s.x, s.z); m.yaw = Math.atan2(p.x - s.x, p.z - s.z); return S.setMon('lurk', { target: p.pid, lurkFor: 14 + S.rand() * 12, seenT: 0 }); }
    }
    if ((r -= w.shadow) < 0) {
      const s = spotNear(S, p, alive, rects, 10, 15, false);
      if (s) { relocate(S, s.x, s.z); return S.setMon('shadow', { target: p.pid, shadowFor: 22 + S.rand() * 18, seenT: 0, closeT: 0 }); }
    }
    prank(S, p, alive, rects);
    S.setMon('rest', { restFor: Math.max(6, 20 - prog * 12) + S.rand() * 10 });
  } else if (st === 'lurk') {
    m.moving = 0;
    if (!tgt || S.isInOffice(tgt)) return vanish(S, alive, rects);
    const d = dist(m.x, m.z, tgt.x, tgt.z);
    if (d < 5.5 || m.seenT > 2.8 || m.stateT > m.lurkFor) return vanish(S, alive, rects);
    // each time you look away after seeing it, it is a little closer (and facing you)
    if (m.seenT > 0.3 && d > 7) { if (!m.path || m.pathT > 0.8) S.planPath(tgt.x, tgt.z); m.pathT += dt; S.followPath(2.4, dt, rects); }
    else m.yaw = turnTo(m.yaw, Math.atan2(tgt.x - m.x, tgt.z - m.z), dt * 4);
    m.lookX = tgt.x; m.lookZ = tgt.z;
  } else if (st === 'shadow') {
    if (!tgt || S.isInOffice(tgt) || m.stateT > m.shadowFor || (m.seenT > 1.6)) return vanish(S, alive, rects);
    const f = { x: -Math.sin(tgt.yaw || 0), z: -Math.cos(tgt.yaw || 0) }, gx = tgt.x - f.x * 7, gz = tgt.z - f.z * 7, d = dist(m.x, m.z, tgt.x, tgt.z);
    if (d > 4.5) { if (!m.path || m.pathT > 0.6) S.planPath(roomAt(gx, gz) ? gx : tgt.x, roomAt(gx, gz) ? gz : tgt.z); m.pathT += dt; S.followPath(Math.min(3.4, 1.6 + d * 0.15), dt, rects); }
    else m.moving = 0;
    m.lookX = tgt.x; m.lookZ = tgt.z;
    if (d < 6) { m.closeT += dt; if (m.closeT > 3) { m.closeT = -6; S.emit({ t: 'prank', k: 'breathe', x: m.x, z: m.z }, { to: tgt.pid }); } }
  } else if (st === 'hunt') {
    m.huntT += dt;
    let t = tgt;
    if (!t || t.downed || t.out) { t = outside.sort((a, b) => dist(a.x, a.z, m.x, m.z) - dist(b.x, b.z, m.x, m.z))[0]; if (t) m.target = t.pid; }
    if (!t) return vanish(S, alive, rects, 30);
    const d = dist(m.x, m.z, t.x, t.z), sees = !t.hidden && !segBlocked(m.x, m.z, t.x, t.z, rects, { sight: true });
    if (sees) { m.lastKnown = { x: t.x, z: t.z }; m.lostT = 0; } else m.lostT += dt;
    if (S.isInOffice(t) && !S.doors.d_office.open) { // safe behind the door: it tries the handle, then gives up
      m.bangT += dt; if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 1) { if (!m.path || m.pathT > 1) S.planPath(OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z); m.pathT += dt; S.followPath(C.speed.chase, dt, rects); }
      else { m.moving = 0; if (m.bangT % 1.2 < dt) S.emit({ t: 'sfx', k: 'doorbang', x: 21.5, z: 3.6 }); }
      if (m.bangT > 6) return vanish(S, alive, rects, 35);
      return;
    }
    if (t.hidden && !m.sawHide) { // it did not see you get in
      const lk = m.lastKnown; if (lk && dist(m.x, m.z, lk.x, lk.z) > 1) { if (!m.path || m.pathT > 1) S.planPath(lk.x, lk.z); m.pathT += dt; S.followPath(C.speed.search, dt, rects); }
      else { m.moving = 0; m.yaw += dt * 1.5; }
      if (m.lostT > 9) return vanish(S, alive, rects, 30);
      return;
    }
    const gx = t.hidden ? t.hx : (sees ? t.x : m.lastKnown.x), gz = t.hidden ? t.hz : (sees ? t.z : m.lastKnown.z);
    if (!m.path || m.pathT > 0.3) S.planPath(gx, gz); m.pathT += dt;
    S.followPath(C.speed.chase * C.unseenSprint, dt, rects);
    m.lookX = t.x; m.lookZ = t.z;
    if ((t.hidden ? dist(m.x, m.z, t.hx, t.hz) < 1.3 : d < C.catchRadius && sees)) { if (t.hidden) S.emit({ t: 'prank', k: 'rip', id: t.hidden, x: t.hx, z: t.hz }); S.emit({ t: 'hunt', on: 0 }); S.catchPlayer(t); return; }
    if (m.huntT > C.huntMax || (m.lostT > 9 && d > 16)) return vanish(S, alive, rects, 35);
  } else if (st === 'siege') {
    tickSiege(S, dt, alive, rects);
  }
}

// ---------------- 4:00 AM: the headcount. Watch the cameras; hold the door. ----------------
function tickSiege(S, dt, alive, rects) {
  const m = S.mon, C = CONFIG.monitor, dir = S.dir, door = S.doors.d_office;
  const sg = dir.siege || (dir.siege = { tries: 0, need: C.siegeTries[Math.min(S.day, 3) - 1], waitT: 6 + S.rand() * 6, holdT: 0, tryT: 0 });
  if (m.step === 'away') { m.moving = 0; sg.waitT -= dt; if (sg.waitT <= 0) m.step = 'approach'; return; }
  if (m.step === 'approach') {
    if (!sg.placed) { sg.placed = true; if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 16 || !sameFloor(m, OFFICE_DOOR_OUT)) { const pts = [[33, 1.8], [10, 1.8], [36, 2.2], [6, 2.2]].filter(([x, z]) => !seenByAny(S, alive, x, z, rects)); if (pts.length) { const [x, z] = pts[(S.rand() * pts.length) | 0]; relocate(S, x, z); } } }
    if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 0.6) { if (!m.path || m.pathT > 1) S.planPath(OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z); m.pathT += dt; S.followPath(2.1, dt, rects); return; }
    m.moving = 0; m.yaw = 0; // facing the door
    if (door.open || !door.bolted) { const p = alive.filter(q => S.isInOffice(q)).sort((a, b) => dist(a.x, a.z, 21.5, 3.6) - dist(b.x, b.z, 21.5, 3.6))[0]; if (p) { door.open = true; S.emit({ t: 'door', id: 'd_office', open: true, bolted: false, by: 'monitor' }); S.catchPlayer(p); } return; }
    m.step = 'try'; sg.tryT = 0; sg.holdT = 0; sg.dur = 4 + S.rand() * 2.5; S.emit({ t: 'trydoor', on: 1, dur: sg.dur, n: sg.tries + 1, of: sg.need });
    return;
  }
  if (m.step === 'try') {
    sg.tryT += dt; if (alive.some(p => p.hold && S.isInOffice(p) && dist(p.x, p.z, 21.5, 4.2) < 2.2)) sg.holdT += dt;
    if (sg.tryT < sg.dur) return;
    if (!door.bolted || sg.holdT < sg.dur * C.siegeHold) { // the bolt gives
      door.open = true; door.bolted = false; S.emit({ t: 'door', id: 'd_office', open: true, bolted: false, by: 'monitor' }); S.emit({ t: 'trydoor', on: 0, held: 0 });
      const p = alive.filter(q => S.isInOffice(q)).sort((a, b) => dist(a.x, a.z, 21.5, 3.6) - dist(b.x, b.z, 21.5, 3.6))[0]; if (p) S.catchPlayer(p); return;
    }
    sg.tries++; S.emit({ t: 'trydoor', on: 0, held: 1, n: sg.tries, of: sg.need });
    if (sg.tries >= sg.need) { S.emit({ t: 'pa', text: 'Headcount complete. Everyone is accounted for.' }); S.endShift(false); return; }
    // walk off somewhere the cameras can see, then come back
    const pts = [[30, 1.8], [13, 1.8], [6, 2.2], [36, 1.8], [42, 4]]; const g = pts[(S.rand() * pts.length) | 0];
    m.step = 'leave'; m.goal = { x: g[0], z: g[1] }; sg.waitT = 7 + S.rand() * 9;
    return;
  }
  if (m.step === 'leave') {
    if (dist(m.x, m.z, m.goal.x, m.goal.z) > 0.8) { if (!m.path || m.pathT > 1) S.planPath(m.goal.x, m.goal.z); m.pathT += dt; S.followPath(2.1, dt, rects); }
    else { m.step = 'away'; sg.placed = true; }
  }
}
