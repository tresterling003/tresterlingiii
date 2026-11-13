// The Monitor's mind. It is a mannequin that stalks the crew: it never walks while anyone is looking at it, but it does
// other things in plain sight — it scuttles away across the ceiling, it jerks closer a step at a time when you try to stare
// it down. Nothing runs on a timer you can learn: each worker gets their own beats, drawn at random — long silences,
// sudden clusters, sounds with nothing behind them, glimpses, pranks, and a few real hunts. At 4:00 it lays siege to the office.
import { CONFIG } from './config.js';
import { ROOMS, DOORS, LOCKERS, SEARCHABLE, LAIR, PATROL, WATCH_POINTS, roomAt, groundY, segBlocked, solidRects, doorCenter } from './level.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const angDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const turnTo = (a, b, k) => a + Math.max(-k, Math.min(k, angDiff(a, b)));
const OFFICE_DOOR_OUT = { x: 21.5, z: 2.3 };
export const POSE = { stand: 0, crawl: 1, ceil: 2 };

// how hard the night is (the host picks): Sissy = little scares, Bed Wetter = the real thing, Nightmare = extreme
const FEAR = [
  { beats: 1.7, hunts: [1, 1, 2], gap: 170, windup: [5.5, 2.5], charge: [2.6, 0.08], hold: [3, 3], spd: [0.92, 0, 2.0], siege: [1, 2, 2] },
  { beats: 1.0, hunts: [2, 3, 4], gap: 110, windup: [3.2, 2.3], charge: [1.6, 0.28], hold: [8, 7], spd: [1.08, 0.15, 2.6], siege: [2, 3, 4] },
  { beats: 0.62, hunts: [3, 4, 5], gap: 75, windup: [1.8, 1.4], charge: [1.0, 0.4], hold: [15, 10], spd: [1.15, 0.35, 3.1], siege: [3, 4, 5] },
];
const fearOf = (S) => FEAR[S.fear ?? 1] || FEAR[1];
function fresh() { return { hunts: 0, lastHunt: -999, stare: {}, stareLim: {}, agit: 0, siege: null, last: [], next: {} }; }
export function resetStalker(S) { S.dir = fresh(); }

function inViewOf(S, p, x, z, rects, slack = 0.25) {
  if (p.hidden) return false;
  const d = dist(p.x, p.z, x, z); if (d > 36) return false;
  const facing = Math.atan2(-Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0));
  if (d > 1.5 && Math.abs(angDiff(facing, Math.atan2(x - p.x, z - p.z))) > (p.hf || CONFIG.monitor.viewFreezeHalf) + slack) return false;
  return !segBlocked(p.x, p.z, x, z, rects, { sight: true });
}
const seenByAny = (S, alive, x, z, rects) => alive.some(p => inViewOf(S, p, x, z, rects));
const sameFloor = (a, b) => Math.abs(groundY(a.x, a.z) - groundY(b.x, b.z)) < 0.6;
const lowCeiling = (x, z) => { const r = ROOMS[roomAt(x, z)]; return !r || r.ceil <= 3.3; }; // it clings to ceilings it can reach
const expo = (S) => -Math.log(1 - S.rand() * 0.999); // exponential(1): mostly short, sometimes very long
const facingOf = (p) => Math.atan2(-Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0));

function relocate(S, x, z) { const m = S.mon; m.x = x; m.z = z; m.path = null; m.tpN = (m.tpN || 0) + 1; }
function vanish(S, alive, rects, restFor) {
  const m = S.mon, spots = [LAIR, ...PATROL.map(([x, z]) => ({ x, z }))];
  let pick = null;
  for (let k = 0; k < 14 && !pick; k++) { const s = k === 0 ? LAIR : spots[(S.rand() * spots.length) | 0]; if (!seenByAny(S, alive, s.x, s.z, rects) && alive.every(p => dist(p.x, p.z, s.x, s.z) > 10)) pick = s; }
  if (pick) relocate(S, pick.x, pick.z);
  if (m.state === 'hunt') S.emit({ t: 'hunt', on: 0 });
  m.pz = POSE.stand;
  S.setMon('rest', { restFor: restFor ?? (4 + S.rand() * 8), target: null, seenT: 0 });
}
function spotNear(S, p, alive, rects, dmin, dmax, needSight, opts = {}) {
  let best = null;
  for (let k = 0; k < (opts.tries || 70); k++) {
    let x, z;
    if (k < WATCH_POINTS.length && needSight && opts.angle == null) { x = WATCH_POINTS[k].x; z = WATCH_POINTS[k].z; }
    else { const base = opts.angle != null ? opts.angle + (S.rand() - 0.5) * (opts.spread || 0.6) : S.rand() * 6.283, r = dmin + S.rand() * (dmax - dmin); x = p.x + Math.sin(base) * r; z = p.z + Math.cos(base) * r; }
    const d = dist(x, z, p.x, p.z); if (d < dmin || d > dmax) continue;
    if (!roomAt(x, z) || !sameFloor({ x, z }, p) || !S.navFree(x, z)) continue;
    if (needSight && segBlocked(x, z, p.x, p.z, rects, { sight: true })) continue;
    if (!opts.allowSeen && seenByAny(S, alive, x, z, rects)) continue;
    if (alive.some(o => dist(o.x, o.z, x, z) < Math.min(dmin, 6))) continue;
    const score = (needSight ? -Math.abs(d - (dmin + dmax) / 2) : 0) + S.rand() * 3 - S.lightAt(x, z) * 1.5;
    if (!best || score > best.s) best = { x, z, s: score };
  }
  return best;
}
function canHunt(S, prog) {
  const dir = S.dir, F = fearOf(S), cap = F.hunts[Math.min(S.day, 3) - 1];
  return prog > CONFIG.monitor.huntAfter && dir.hunts < cap && (S.time || 0) - dir.lastHunt > F.gap;
}
export function startHunt(S, p, alive, rects, how) {
  const m = S.mon, dir = S.dir; dir.hunts++; dir.lastHunt = S.time || 0;
  const d0 = dist(m.x, m.z, p.x, p.z);
  if (how !== 'charge' && (d0 < 15 || d0 > 26 || !sameFloor(m, p))) { const s = spotNear(S, p, alive, rects, 16, 24, false) || spotNear(S, p, alive, rects, 12, 30, false, { tries: 140 }); if (s) relocate(S, s.x, s.z); }
  m.pz = lowCeiling(m.x, m.z) && S.rand() < 0.4 ? POSE.ceil : POSE.crawl;
  S.setMon('hunt', { target: p.pid, huntT: 0, lostT: 0, lastKnown: { x: p.x, z: p.z }, sawHide: false, bangT: 0, watchT: 0, holdLimit: fearOf(S).hold[0] + S.rand() * fearOf(S).hold[1], crawl: true, windup: how === 'charge' ? fearOf(S).charge[0] : fearOf(S).windup[0] + S.rand() * fearOf(S).windup[1] });
  // you always get a warning: it drops onto all fours somewhere you can hear it
  S.emit({ t: 'monfx', k: 'drop', x: m.x, z: m.z, pz: m.pz });
  S.emit({ t: 'hunt', on: 1, pid: p.pid, loud: how === 'charge' ? 0 : 1, flicker: S.rand() < 0.55 ? 1 : 0, x: m.x, z: m.z });
}
// it crawls after you as fast as you move, a little faster — run and it barely gains, stop and it closes in
function huntSpeed(S, t) { const C = CONFIG, shoe = S.upgrades.shoes ? 1.15 : 1, v = !t.mv ? 0 : t.sp ? C.sprintSpeed * shoe : t.cr ? C.crouchSpeed * shoe : C.walkSpeed * shoe, F = fearOf(S).spd; return Math.max(F[2], Math.min(6.2, v * F[0] + F[1])); }
// a visible exit: it drops and scuttles away (across the ceiling where it can reach one) to somewhere you cannot see
function flee(S, from, alive, rects, opts = {}) {
  const m = S.mon, here = dist(m.x, m.z, from.x, from.z);
  const s = opts.goal || spotNear(S, from, alive, rects, Math.max(8, here + 3), 24, false) || spotNear(S, from, alive, rects, 6, 30, false, { tries: 120 });
  if (!s) return vanish(S, alive, rects);
  S.setMon('flee', { goal: { x: s.x, z: s.z }, unseenT: 0, target: from.pid, fleeSpeed: opts.speed || 6.2 + S.rand() * 1.6 });
  m.pz = lowCeiling(m.x, m.z) && S.rand() < 0.75 ? POSE.ceil : POSE.crawl;
  S.emit({ t: 'monfx', k: 'drop', x: m.x, z: m.z, pz: m.pz });
}

// ---------------- harmless beats ----------------
function pickW(S, w) { // weighted pick that avoids repeating the last few beats
  let tot = 0; const e = Object.entries(w).map(([k, v]) => { const x = v * (S.dir.last.includes(k) ? 0.25 : 1); tot += x; return [k, x]; });
  let r = S.rand() * tot; for (const [k, x] of e) if ((r -= x) < 0) { S.dir.last = [k, ...S.dir.last].slice(0, 3); return k; }
  return e[0][0];
}
function sound(S, p) {
  const f = { x: -Math.sin(p.yaw || 0), z: -Math.cos(p.yaw || 0) }, side = S.rand() < 0.5 ? 1 : -1;
  const behind = (r) => ({ x: p.x - f.x * r, z: p.z - f.z * r });
  const F = S.fear ?? 1;
  const k = pickW(S, { skitter: [1.2, 3, 3][F], knock: 2, whisper: 1.4, runsteps: 1.6, thud: 1.2, slamfar: 1.2, giggle: 0.6, echo: 1.4, musicbox: [1.2, 0.8, 0.6][F], lockrow: [0.3, 1, 1.3][F], neck: [0, 0.35, 1.2][F], flashface: [0, 0.2, 0.9][F] });
  if (k === 'echo') { S.emit({ t: 'prank', k: 'echo', d: 5 + S.rand() * 5 }, { to: p.pid }); return k; }
  if (k === 'musicbox') { const a = S.rand() * 6.283, r = 8 + S.rand() * 7; S.emit({ t: 'prank', k: 'musicbox', x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, slow: F }); return k; }
  if (k === 'lockrow') { const a = behind(12 + S.rand() * 4), b = behind(2.5); S.emit({ t: 'prank', k: 'lockrow', x: a.x, z: a.z, x1: b.x, z1: b.z, n: 5 + ((S.rand() * 4) | 0) }); return k; }
  if (k === 'neck') { S.emit({ t: 'prank', k: 'neck', see: S.rand() < [0, 0.35, 0.7][F] ? 1 : 0 }, { to: p.pid }); return k; }
  if (k === 'flashface') { S.emit({ t: 'prank', k: 'flashface' }, { to: p.pid }); return k; }
  if (k === 'skitter') { const a = behind(4 + S.rand() * 3), b = { x: p.x + f.z * side * 5 + f.x * 2, z: p.z - f.x * side * 5 + f.z * 2 }; S.emit({ t: 'prank', k: 'skitter', x: a.x, z: a.z, x1: b.x, z1: b.z, y: groundY(p.x, p.z) + (ROOMS[roomAt(p.x, p.z)]?.ceil || 2.9) - 0.05 }, { to: p.pid }); }
  else if (k === 'knock') { const b = behind(3 + S.rand() * 4); S.emit({ t: 'prank', k: 'knock', x: b.x, z: b.z, n: 2 + ((S.rand() * 4) | 0) }); }
  else if (k === 'whisper') { const b = behind(1 + S.rand()); S.emit({ t: 'prank', k: 'whisper', x: b.x, z: b.z }, { to: p.pid }); }
  else if (k === 'runsteps') { const a = S.rand() * 6.283, r = 7 + S.rand() * 8; S.emit({ t: 'prank', k: 'runsteps', x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, x1: p.x + Math.sin(a + 1.2) * r, z1: p.z + Math.cos(a + 1.2) * r }); }
  else if (k === 'thud') { const b = behind(5 + S.rand() * 6); S.emit({ t: 'prank', k: 'thud', x: b.x, z: b.z }); }
  else if (k === 'slamfar') { const a = S.rand() * 6.283, r = 10 + S.rand() * 10; S.emit({ t: 'prank', k: 'slam', x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r }); }
  else { const b = behind(6 + S.rand() * 5); S.emit({ t: 'prank', k: 'giggle', x: b.x, z: b.z }, { to: p.pid }); }
  return k;
}
function prank(S, p, alive, rects) {
  const kinds = {};
  const doors = DOORS.filter(d => { const c = doorCenter(d), s = S.doors[d.id], dd = dist(c.x, c.z, p.x, p.z); return !d.lock && d.id !== 'd_office' && !s.bolted && dd > 3 && dd < 14 && Math.abs((d.y || 0) - groundY(p.x, p.z)) < 0.6 && !seenByAny(S, alive, c.x, c.z, rects); });
  if (doors.length) kinds.door = 2;
  const lockers = LOCKERS.filter(l => { if (!SEARCHABLE[l.id] || S.lockers[l.id]?.open) return false; const dd = dist(l.x, l.z, p.x, p.z); return dd > 3 && dd < 13 && groundY(p.x, p.z) > -1 && !seenByAny(S, alive, l.x, l.z, rects); });
  if (lockers.length) kinds.slam = 1.6;
  const F = S.fear ?? 1;
  kinds.lights = [0.6, 1.2, 1.4][F]; kinds.prints = 1.4; kinds.watcher = [1.4, 1.8, 2.2][F]; kinds.creep = [0.5, 1.1, 1.5][F];
  if (!S.dir.last.includes('name')) kinds.name = [0.2, 0.5, 0.8][F];
  if (!S.cart.holder && dist(S.cart.x, S.cart.z, p.x, p.z) < 16 && dist(S.cart.x, S.cart.z, p.x, p.z) > 4 && !seenByAny(S, alive, S.cart.x, S.cart.z, rects)) kinds.cart = 0.7;
  const k = pickW(S, kinds);
  switch (k) {
    case 'door': { const d = doors[(S.rand() * doors.length) | 0], s = S.doors[d.id]; s.open = !s.open; const c = doorCenter(d); S.emit({ t: 'door', id: d.id, open: s.open, bolted: false, by: 'monitor', x: c.x, z: c.z }); break; }
    case 'slam': { const l = lockers[(S.rand() * lockers.length) | 0]; S.emit({ t: 'prank', k: 'slam', id: l.id, x: l.x, z: l.z }); break; }
    case 'lights': S.emit({ t: 'scare', k: 'lightsout', x: p.x, z: p.z, r: 8 + S.rand() * 6, d: 5 + S.rand() * 16 }); break;
    case 'creep': { const f = { x: -Math.sin(p.yaw || 0), z: -Math.cos(p.yaw || 0) }, sgn = S.rand() < 0.6 ? 1 : -1; let a = null; // usually from the end of the hall you are looking down
      for (let r = 16; r >= 7 && !a; r -= 1.5) { const x = p.x + f.x * r * sgn, z = p.z + f.z * r * sgn; if (roomAt(x, z) && sameFloor({ x, z }, p)) a = { x, z }; }
      if (a) S.emit({ t: 'scare', k: 'creep', x0: a.x, z0: a.z, x: p.x, z: p.z, d: 2.5 + S.rand() * 3 * (F + 1), crawl: F > 0 ? 1 : 0 }); break; }
    case 'watcher': S.emit({ t: 'scare', k: 'watcher', seed: (S.rand() * 1e9) | 0 }, { to: p.pid }); break;
    case 'name': S.emit({ t: 'pa', text: S.rand() < 0.5 ? `${p.name || 'Custodian'}. ${p.name || 'Custodian'}. You are not in your assigned room.` : `${p.name || 'Custodian'}, please come to Room zero one four.` }); break;
    case 'cart': { const a = S.rand() * 6.283; S.cart.x += Math.sin(a) * 1.2; S.cart.z += Math.cos(a) * 0.4; S.cart.yaw += (S.rand() - 0.5) * 2; if (!roomAt(S.cart.x, S.cart.z)) { S.cart.x -= Math.sin(a) * 1.2; S.cart.z -= Math.cos(a) * 0.4; } S.emit({ t: 'cart', x: S.cart.x, z: S.cart.z, yaw: S.cart.yaw, holder: null }); S.emit({ t: 'prank', k: 'roll', x: S.cart.x, z: S.cart.z }); break; }
    case 'prints': {
      const pts = [], f = { x: -Math.sin(p.yaw || 0), z: -Math.cos(p.yaw || 0) }, side = { x: f.z, z: -f.x }, gy = groundY(p.x, p.z);
      for (let i = 14; i >= 1; i--) { const r = i * 0.62, sd = (i % 2 ? 1 : -1) * 0.13, x = p.x - f.x * r + side.x * sd, z = p.z - f.z * r + side.z * sd; if (!roomAt(x, z) || Math.abs(groundY(x, z) - gy) > 0.3) continue; pts.push([+x.toFixed(2), +z.toFixed(2)]); }
      S.emit({ t: 'prank', k: 'prints', pts, yaw: Math.atan2(f.x, f.z), y: gy }); break;
    }
  }
  return k;
}
function scheduleNext(S, p, prog) { // the gap before this worker's next beat: usually short-ish, now and then a long silence
  const base = (32 - 16 * prog - S.day * 2) * fearOf(S).beats, long = S.rand() < (S.fear === 2 ? 0.06 : 0.12);
  S.dir.next[p.pid] = (S.time || 0) + (long ? 50 + S.rand() * 80 : Math.max(4, base * (0.2 + expo(S) * 0.9)));
}

// ---------------- the main tick ----------------
export function tickStalker(S, dt) {
  const m = S.mon, C = CONFIG.monitor, dir = S.dir || (S.dir = fresh());
  const rects = solidRects(S.doors), lock = S.phase === 'lockdown', prog = S.shiftT / CONFIG.shiftSeconds, now = S.time || 0;
  const alive = [...S.players.values()].filter(p => p.connected && !p.downed && !p.out);
  const outside = alive.filter(p => !S.isInOffice(p));
  m.stateT += dt; if (m.pz == null) m.pz = POSE.stand;
  // ---- the mannequin rule (some things it still does in plain sight: fleeing, the twitch) ----
  const watchers = alive.filter(p => !p.hidden && S.playerSees(p, m, rects));
  const wasFrozen = !!m.frozen; m.frozen = watchers.length > 0 && m.state !== 'dormant' && m.state !== 'flee';
  if (m.frozen !== wasFrozen) S.emit({ t: 'monfx', k: m.frozen ? 'freeze' : 'unfreeze', x: m.x, z: m.z });
  for (const n of (S.noises || [])) if (dist(n.x, n.z, m.x, m.z) < n.r * 1.5) dir.agit = Math.min(1, dir.agit + 0.02);
  S.noises = []; dir.agit = Math.max(0, dir.agit - dt * 0.01);
  // ---- staring at it: it does not stay still for you forever ----
  for (const p of alive) {
    const close = watchers.includes(p) && dist(m.x, m.z, p.x, p.z) < 14 && !['hunt', 'flee', 'siege', 'dormant', 'rest'].includes(m.state);
    dir.stare[p.pid] = close ? (dir.stare[p.pid] || 0) + dt : Math.max(0, (dir.stare[p.pid] || 0) - dt);
    if (!dir.stareLim[p.pid]) dir.stareLim[p.pid] = 2.2 + S.rand() * 4.5;
    if (dir.stare[p.pid] > dir.stareLim[p.pid] && !S.isInOffice(p) && !lock) {
      dir.stare[p.pid] = 0; dir.stareLim[p.pid] = 0;
      const r = S.rand();
      if (r < fearOf(S).charge[1] && canHunt(S, prog) && dist(m.x, m.z, p.x, p.z) > 9) return startHunt(S, p, alive, rects, 'charge');
      if (r < 0.82) return flee(S, p, alive, rects);
      S.emit({ t: 'scare', k: 'lightsout', x: m.x, z: m.z, r: 9, d: 2.5 + S.rand() * 2 }); m.vanishWhenUnseen = true; m.vanishAt = now + 1.4;
    }
  }
  if (m.vanishWhenUnseen && now > (m.vanishAt || 0)) { m.vanishWhenUnseen = false; return vanish(S, alive, rects); }
  // ---- in a hunt, your eyes hold it still; hold it long enough and it gives up and crawls off ----
  if (m.frozen && m.state === 'hunt') {
    m.watchT += dt;
    if (m.watchT > m.holdLimit) { const t = alive.find(q => q.pid === m.target) || watchers[0]; S.emit({ t: 'hunt', on: 0 }); return flee(S, t, alive, rects); }
    m.moving = 0; return;
  }
  if (m.state === 'hunt') m.watchT = Math.max(0, (m.watchT || 0) - dt * 0.5);
  if (m.frozen) { m.moving = 0; m.seenT = (m.seenT || 0) + dt; afterSeen(S, alive, rects); return; }
  // everything below happens while nobody is looking (or while it flees)
  if (lock && m.state !== 'hunt' && m.state !== 'siege' && m.state !== 'flee') {
    if (outside.length) return startHunt(S, outside[(S.rand() * outside.length) | 0], alive, rects);
    if (alive.length) { m.pz = POSE.stand; return S.setMon('siege', { step: 'approach' }); }
  }
  // ---- per-worker beats: the harmless ones fire whenever; the ones that need its body wait until it is free ----
  if (!lock && S.shiftT > C.firstNightGrace * (S.day === 1 ? 1 : 0.4)) for (const p of outside) {
    if (dir.next[p.pid] == null) { scheduleNext(S, p, prog); dir.next[p.pid] -= S.rand() * 10; continue; }
    if (now < dir.next[p.pid]) continue;
    const free = m.state === 'rest' || m.state === 'dormant';
    const w = { sound: 2.2, prank: 2, fake: 0.6 };
    if (free) { w.glimpse = 1.5; w.lurk = 1.6; w.shadow = 1.2; if (canHunt(S, prog)) w.hunt = (0.35 + 2.4 * Math.min(1, (now - dir.lastHunt) / 260)) * (0.4 + prog) * (1 + dir.agit); }
    const k = pickW(S, w);
    scheduleNext(S, p, prog);
    if (k === 'sound') sound(S, p);
    else if (k === 'prank') prank(S, p, alive, rects);
    else if (k === 'fake') S.emit({ t: 'prank', k: 'fake', x: p.x, z: p.z }, { to: p.pid });
    else if (k === 'hunt') return startHunt(S, p, alive, rects);
    else if (k === 'glimpse') { // it skitters across the far end of your view
      const fa = facingOf(p), side = S.rand() < 0.5 ? 1 : -1;
      const a = spotNear(S, p, alive, rects, 9, 17, true, { angle: fa + side * 1.05, spread: 0.35 });
      const b = a && spotNear(S, p, alive, rects, 9, 19, false, { angle: fa - side * 1.0, spread: 0.6 });
      if (a && b) { relocate(S, a.x, a.z); flee(S, p, alive, rects, { goal: b, speed: 7.5 }); }
      else sound(S, p);
    } else if (k === 'lurk') {
      const ceil = S.rand() < 0.4;
      const s = spotNear(S, p, alive, rects, ceil ? 6 : 9, ceil ? 12 : 18, true);
      if (s && (!ceil || lowCeiling(s.x, s.z))) { relocate(S, s.x, s.z); m.yaw = Math.atan2(p.x - s.x, p.z - s.z); m.pz = ceil ? POSE.ceil : POSE.stand; S.setMon('lurk', { target: p.pid, lurkFor: 10 + S.rand() * 16, seenT: 0, exit: S.rand() }); }
    } else if (k === 'shadow') {
      const s = spotNear(S, p, alive, rects, 10, 15, false);
      if (s) { relocate(S, s.x, s.z); m.pz = S.rand() < 0.3 ? POSE.crawl : POSE.stand; S.setMon('shadow', { target: p.pid, shadowFor: 18 + S.rand() * 22, seenT: 0, closeT: 0 }); }
    }
    break; // one worker per tick
  }
  const st = m.state, tgt = alive.find(p => p.pid === m.target);
  if (st === 'dormant') { m.moving = 0; if (S.shiftT > C.firstNightGrace * 0.5) S.setMon('rest', { restFor: 0 }); }
  else if (st === 'rest') { m.moving = 0; m.pz = POSE.stand; }
  else if (st === 'flee') {
    const g = m.goal; if (!m.path || m.pathT > 1.2) S.planPath(g.x, g.z); m.pathT += dt;
    const arrived = S.followPath(m.fleeSpeed, dt, rects);
    if (m.pz === POSE.ceil && !lowCeiling(m.x, m.z)) m.pz = POSE.crawl;
    if (!seenByAny(S, alive, m.x, m.z, rects)) m.unseenT += dt; else m.unseenT = 0;
    if (arrived || m.unseenT > 0.7 || m.stateT > 8) return vanish(S, alive, rects);
  } else if (st === 'lurk') {
    m.moving = 0;
    if (!tgt || S.isInOffice(tgt)) return vanish(S, alive, rects);
    const d = dist(m.x, m.z, tgt.x, tgt.z);
    if (d < 4.5 || m.stateT > m.lurkFor) return vanish(S, alive, rects);
    if (m.seenT > 0.4 && m.exit < 0.45) return vanish(S, alive, rects); // look away and back: gone
    if (m.seenT > 0.3 && d > 6.5 && m.pz === POSE.stand) { if (!m.path || m.pathT > 0.8) S.planPath(tgt.x, tgt.z); m.pathT += dt; S.followPath(2.4, dt, rects); } // closer each time you look away
    else m.yaw = turnTo(m.yaw, Math.atan2(tgt.x - m.x, tgt.z - m.z), dt * 5);
    m.lookX = tgt.x; m.lookZ = tgt.z;
  } else if (st === 'shadow') {
    if (!tgt || S.isInOffice(tgt) || m.stateT > m.shadowFor) return vanish(S, alive, rects);
    const f = { x: -Math.sin(tgt.yaw || 0), z: -Math.cos(tgt.yaw || 0) }, gx = tgt.x - f.x * 6.5, gz = tgt.z - f.z * 6.5, d = dist(m.x, m.z, tgt.x, tgt.z);
    if (d > 4) { if (!m.path || m.pathT > 0.6) S.planPath(roomAt(gx, gz) ? gx : tgt.x, roomAt(gx, gz) ? gz : tgt.z); m.pathT += dt; S.followPath(Math.min(3.6, 1.6 + d * 0.16), dt, rects); }
    else m.moving = 0;
    m.lookX = tgt.x; m.lookZ = tgt.z;
    if (d < 6) { m.closeT += dt; if (m.closeT > 2.5 + S.rand() * 4) { m.closeT = -8; S.emit({ t: 'prank', k: 'breathe', x: m.x, z: m.z }, { to: tgt.pid }); } }
  } else if (st === 'hunt') {
    m.huntT += dt;
    let t = tgt;
    if (!t || t.downed || t.out) { t = outside.sort((a, b) => dist(a.x, a.z, m.x, m.z) - dist(b.x, b.z, m.x, m.z))[0]; if (t) m.target = t.pid; }
    if (!t) return vanish(S, alive, rects, 30);
    if (m.windup > 0) { m.windup -= dt; m.moving = 0; m.yaw = turnTo(m.yaw, Math.atan2(t.x - m.x, t.z - m.z), dt * 3); return; }
    m.pz = m.pz === POSE.ceil && lowCeiling(m.x, m.z) && dist(m.x, m.z, t.x, t.z) > 4 ? POSE.ceil : POSE.crawl;
    const d = dist(m.x, m.z, t.x, t.z), sees = !t.hidden && !segBlocked(m.x, m.z, t.x, t.z, rects, { sight: true });
    if (sees) { m.lastKnown = { x: t.x, z: t.z }; m.lostT = 0; } else m.lostT += dt;
    if (S.isInOffice(t) && !S.doors.d_office.open) {
      m.bangT += dt; m.pz = POSE.stand;
      if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 1) { if (!m.path || m.pathT > 1) S.planPath(OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z); m.pathT += dt; S.followPath(C.speed.chase, dt, rects); }
      else { m.moving = 0; if (m.bangT % 1.2 < dt) S.emit({ t: 'sfx', k: 'doorbang', x: 21.5, z: 3.6 }); }
      if (m.bangT > 4 + S.rand() * 5) return vanish(S, alive, rects, 35);
      return;
    }
    if (t.hidden && !m.sawHide) {
      const lk = m.lastKnown; if (lk && dist(m.x, m.z, lk.x, lk.z) > 1) { if (!m.path || m.pathT > 1) S.planPath(lk.x, lk.z); m.pathT += dt; S.followPath(C.speed.search, dt, rects); }
      else { m.moving = 0; m.yaw += dt * 1.5; m.pz = POSE.stand; }
      if (m.lostT > 6 + S.rand() * 6) return vanish(S, alive, rects, 30);
      return;
    }
    const gx = t.hidden ? t.hx : (sees ? t.x : m.lastKnown.x), gz = t.hidden ? t.hz : (sees ? t.z : m.lastKnown.z);
    if (!m.path || m.pathT > 0.3) S.planPath(gx, gz); m.pathT += dt;
    S.followPath(huntSpeed(S, t), dt, rects);
    m.lookX = t.x; m.lookZ = t.z;
    if ((t.hidden ? dist(m.x, m.z, t.hx, t.hz) < 1.3 : d < C.catchRadius && sees)) { if (t.hidden) S.emit({ t: 'prank', k: 'rip', id: t.hidden, x: t.hx, z: t.hz }); S.emit({ t: 'hunt', on: 0 }); S.catchPlayer(t); return; }
    if (m.huntT > C.huntMax || (m.lostT > 10 && d > 18)) return vanish(S, alive, rects, 35);
  } else if (st === 'siege') tickSiege(S, dt, alive, rects);
}
// what it does while you are still looking at it
function afterSeen(S, alive, rects) {
  const m = S.mon, tgt = alive.find(p => p.pid === m.target);
  if (m.state === 'lurk' && m.exit >= 0.45 && m.seenT > 1.2 + m.exit * 2.5) return flee(S, tgt || alive[0], alive, rects);
  if (m.state === 'shadow' && m.seenT > 0.9) return flee(S, tgt || alive[0], alive, rects);
}

// ---------------- 4:00 AM: the headcount. Watch the cameras; hold the door. ----------------
function tickSiege(S, dt, alive, rects) {
  const m = S.mon, C = CONFIG.monitor, dir = S.dir, door = S.doors.d_office;
  const sg = dir.siege || (dir.siege = { tries: 0, need: fearOf(S).siege[Math.min(S.day, 3) - 1], waitT: 4 + S.rand() * 10, holdT: 0, tryT: 0 });
  if (m.step === 'away') { m.moving = 0; sg.waitT -= dt; if (sg.waitT <= 0) m.step = 'approach'; return; }
  if (m.step === 'approach') {
    if (!sg.placed) { sg.placed = true; if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 16 || !sameFloor(m, OFFICE_DOOR_OUT)) { const pts = [[33, 1.8], [10, 1.8], [36, 2.2], [6, 2.2]].filter(([x, z]) => !seenByAny(S, alive, x, z, rects)); if (pts.length) { const [x, z] = pts[(S.rand() * pts.length) | 0]; relocate(S, x, z); } } }
    if (dist(m.x, m.z, OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z) > 0.6) { if (!m.path || m.pathT > 1) S.planPath(OFFICE_DOOR_OUT.x, OFFICE_DOOR_OUT.z); m.pathT += dt; S.followPath(m.pz ? 3.4 : 2.1, dt, rects); return; }
    m.moving = 0; m.yaw = 0; m.pz = POSE.stand;
    if (door.open || !door.bolted) { const p = alive.filter(q => S.isInOffice(q)).sort((a, b) => dist(a.x, a.z, 21.5, 3.6) - dist(b.x, b.z, 21.5, 3.6))[0]; if (p) { door.open = true; S.emit({ t: 'door', id: 'd_office', open: true, bolted: false, by: 'monitor' }); S.catchPlayer(p); } return; }
    m.step = 'try'; sg.tryT = 0; sg.holdT = 0; sg.dur = 3.5 + S.rand() * 3.5; S.emit({ t: 'trydoor', on: 1, dur: sg.dur, n: sg.tries + 1, of: sg.need });
    return;
  }
  if (m.step === 'try') {
    sg.tryT += dt; if (alive.some(p => p.hold && S.isInOffice(p) && dist(p.x, p.z, 21.5, 4.2) < 2.2)) sg.holdT += dt;
    if (sg.tryT < sg.dur) return;
    if (!door.bolted || sg.holdT < sg.dur * C.siegeHold) {
      door.open = true; door.bolted = false; S.emit({ t: 'door', id: 'd_office', open: true, bolted: false, by: 'monitor' }); S.emit({ t: 'trydoor', on: 0, held: 0 });
      const p = alive.filter(q => S.isInOffice(q)).sort((a, b) => dist(a.x, a.z, 21.5, 3.6) - dist(b.x, b.z, 21.5, 3.6))[0]; if (p) S.catchPlayer(p); return;
    }
    sg.tries++; S.emit({ t: 'trydoor', on: 0, held: 1, n: sg.tries, of: sg.need });
    if (sg.tries >= sg.need) { S.emit({ t: 'pa', text: 'Headcount complete. Everyone is accounted for.' }); S.endShift(false); return; }
    const pts = [[30, 1.8], [13, 1.8], [6, 2.2], [36, 1.8], [42, 4]]; const g = pts[(S.rand() * pts.length) | 0];
    m.step = 'leave'; m.goal = { x: g[0], z: g[1] }; sg.waitT = 4 + S.rand() * 14; m.pz = S.rand() < 0.5 ? POSE.ceil : POSE.stand;
    return;
  }
  if (m.step === 'leave') {
    if (dist(m.x, m.z, m.goal.x, m.goal.z) > 0.8) { if (!m.path || m.pathT > 1) S.planPath(m.goal.x, m.goal.z); m.pathT += dt; S.followPath(m.pz ? 3.4 : 2.1, dt, rects); }
    else { m.step = 'away'; sg.placed = true; m.pz = POSE.stand; }
  }
}
