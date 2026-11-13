// Scares: something peeking at you around a corner (it snaps back when you notice), a figure standing in a far doorway, local power cuts.
// Timing comes from the shared sim (scare events); what you see is drawn here.
import * as THREE from 'three';
import { WALLS, FURNITURE, solidRects, segBlocked, groundY, roomAt, insideFurniture, rng } from '../shared/level.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let C = null; // context from main: { scene, camera, P, audio, makeGhost, doors(), flash }

export function initScares(ctx) { C = ctx; }

// ---------------- the watcher ----------------
const W = { g: null, on: false, seenT: 0, life: 0, firstSeen: false, gone: 0, x: 0, z: 0 };
const v3 = new THREE.Vector3();
function los(x0, z0, x1, z1) { return !segBlocked(x0, z0, x1, z1, solidRects(C.doors()).filter(r => r.door || r.h == null || r.h > 1.75), { sight: true }); }
function sameFloor(x, z) { return Math.abs(groundY(x, z) - groundY(C.P.x, C.P.z)) < 0.6; }
function inView(x, z, y = 1.4, cone = 0.62) {
  const cam = C.camera; v3.set(x, y, z).sub(cam.position); const d = v3.length(); v3.divideScalar(d);
  const f = new THREE.Vector3(); cam.getWorldDirection(f); return f.dot(v3) > Math.cos(cone);
}
function ghost() { if (!W.g) { W.g = C.makeGhost(); if (!W.g) return null; } return W.g; }
export function spawnWatcher(seed) {
  if (W.on || K.on) return;
  if ((seed % 100) < 70 && spawnPeek(seed)) return; const R = rng(seed || 1), P = C.P;
  let best = null;
  for (let k = 0; k < 220; k++) {
    const ang = P.yaw + Math.PI * (0.45 + R() * 1.1) * (R() < 0.5 ? 1 : -1), d = 7 + R() * 11;
    const x = P.x - Math.sin(ang) * d, z = P.z - Math.cos(ang) * d;
    if (!roomAt(x, z) || !sameFloor(x, z) || insideFurniture(x, z, 0.35)) continue;
    if (!los(P.x, P.z, x, z) || inView(x, z, 1.4, 0.7)) continue;
    const score = d + (roomAt(x, z) !== roomAt(P.x, P.z) ? 4 : 0) + R() - (C.lightAt ? C.lightAt(x, z) * 6 : 0); // dark spots and other rooms are better // doorways and other rooms are better
    if (!best || score > best.s) best = { x, z, s: score };
  }
  if (!best) return;
  const g = ghost(); if (!g) return; if (g.root.parent !== C.scene) C.scene.add(g.root); g.root.position.set(0, 0, 0); g.root.rotation.set(0, 0, 0);
  W.x = best.x; W.z = best.z; W.on = true; W.seenT = 0; W.life = 0; W.firstSeen = false; W.lightT = 0;
  W.g.root.visible = true; W.g.root.position.set(W.x, groundY(W.x, W.z), W.z);
}
function vanish(flick) { W.on = false; if (W.g) W.g.root.visible = false; if (flick) { flickerT = 0.5; flickX = W.x; flickZ = W.z; C.audio.tone({ f: 55, f2: 38, v: 0.12, d: 1.2, lp: 200, wet: 0.7, pos: { x: W.x, y: 1, z: W.z } }); } }
function updateWatcher(dt, t) {
  if (!W.on) return; const P = C.P, g = W.g; W.life += dt;
  const dx = P.x - W.x, dz = P.z - W.z, d = Math.hypot(dx, dz);
  g.root.rotation.y = Math.atan2(dx, dz); g.scr = W.firstSeen ? 0.35 : 0.05;
  g.update(dt, 'idle', 1, t, 0);
  const seen = inView(W.x, W.z, 1.6, 0.5) && los(P.x, P.z, W.x, W.z);
  if (seen) {
    if (!W.firstSeen) { W.firstSeen = true; C.audio.tone({ f: 70, f2: 64, v: 0.1, d: 2.2, lp: 260, wet: 0.8 }); C.audio.tone({ f: 1180, f2: 1130, v: 0.012, d: 2.4, type: 'triangle', wet: 0.9 }); C.onSeen && C.onSeen(); }
    W.seenT += dt; if (C.P.light && d < 11) W.lightT += dt;
  }
  if (d < 5.5 || W.seenT > 2.6 || W.lightT > 0.5) vanish(true);
  else if (W.life > 40 && !seen) vanish(false);
}

// ---------------- the peek: a head around a corner that snaps back the moment you notice it ----------------
const K = { on: false, piv: null, st: '', t: 0, seenT: 0, o: null, lean: 0, leanTo: 0, slide: 0, steps: [] };
function spawnPeek(seed) {
  const R = rng(seed + 7), P = C.P, cands = [];
  const blk = solidRects(C.doors());
  for (const w of WALLS) {
    if (w.glass) continue; const ax = (w.x1 - w.x0) > (w.z1 - w.z0); // long axis
    const len = ax ? w.x1 - w.x0 : w.z1 - w.z0; if (len < 0.6) continue;
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const ex = ax ? (end < 0 ? w.x0 : w.x1) : (w.x0 + w.x1) / 2, ez = ax ? (w.z0 + w.z1) / 2 : (end < 0 ? w.z0 : w.z1);
      const ox = ax ? end : 0, oz = ax ? 0 : end, sx = ax ? 0 : side, sz = ax ? side : 0, off = (ax ? w.z1 - w.z0 : w.x1 - w.x0) / 2 + 0.33;
      const bx = ex - ox * 0.42 + sx * off, bz = ez - oz * 0.42 + sz * off, hx = ex + ox * 0.2 + sx * off, hz = ez + oz * 0.2 + sz * off;
      const d = Math.hypot(hx - P.x, hz - P.z); if (d < 5 || d > 22) continue;
      if (!roomAt(bx, bz) || !sameFloor(bx, bz) || insideFurniture(bx, bz, 0.3)) continue;
      if (blk.some(r => bx > r.x0 - 0.2 && bx < r.x1 + 0.2 && bz > r.z0 - 0.2 && bz < r.z1 + 0.2)) continue;
      if (!roomAt(hx, hz) || segBlocked(bx, bz, hx, hz, blk)) continue; // a real outside corner: nothing between body and head
      if (!los(P.x, P.z, hx, hz) || los(P.x, P.z, bx, bz)) continue; // the head shows, the body is hidden by the wall
      if (inView(hx, hz, 1.9, 0.75)) continue; // be there when they turn around
      cands.push({ bx, bz, hx, hz, lx: ox, lz: oz, rx: -ox, rz: -oz, s: -Math.abs(d - 11) + R() * 4 });
    }
  }
  // the alcove beside the end of a locker bank (or tall shelving): flattened in the gap, leaning out past the lockers
  for (const f of FURNITURE) {
    if (!(f.h > 1.7) || f.y0 != null && Math.abs(f.y0 - groundY(P.x, P.z)) > 0.6) continue;
    const ax = (f.x1 - f.x0) > (f.z1 - f.z0), dep = ax ? f.z1 - f.z0 : f.x1 - f.x0; if (dep > 0.8) continue;
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const ox = ax ? end : 0, oz = ax ? 0 : end, sx = ax ? 0 : side, sz = ax ? side : 0;
      const ex = ax ? (end < 0 ? f.x0 : f.x1) : (f.x0 + f.x1) / 2, ez = ax ? (f.z0 + f.z1) / 2 : (end < 0 ? f.z0 : f.z1);
      const bx = ex + ox * 0.3, bz = ez + oz * 0.3, hx = ex + ox * 0.14 + sx * (dep / 2 + 0.22), hz = ez + oz * 0.14 + sz * (dep / 2 + 0.22);
      const d = Math.hypot(hx - P.x, hz - P.z); if (d < 5 || d > 22) continue;
      if (!roomAt(bx, bz) || !roomAt(hx, hz) || !sameFloor(bx, bz)) continue;
      if (blk.some(r => bx > r.x0 - 0.16 && bx < r.x1 + 0.16 && bz > r.z0 - 0.16 && bz < r.z1 + 0.16)) continue;
      if (segBlocked(bx, bz, hx, hz, blk)) continue;
      if (!los(P.x, P.z, hx, hz) || los(P.x, P.z, bx, bz)) continue;
      if (inView(hx, hz, 1.9, 0.75)) continue;
      cands.push({ bx, bz, hx, hz, lx: sx, lz: sz, rx: ox, rz: oz, s: -Math.abs(d - 10) + R() * 4 + 1 });
    }
  }
  if (!cands.length) return false;
  cands.sort((a, b) => b.s - a.s); const c = cands[0], g = ghost(); if (!g) return false;
  if (!K.piv) { K.piv = new THREE.Group(); C.scene.add(K.piv); }
  K.piv.add(g.root); g.root.position.set(0, 0, 0); g.root.rotation.set(0, 0, 0); g.root.visible = true; K.piv.visible = true;
  K.piv.position.set(c.bx, groundY(c.bx, c.bz), c.bz); K.piv.rotation.set(0, Math.atan2(P.x - c.bx, P.z - c.bz), 0);
  // which way to roll so the head moves out past the corner
  K.piv.updateMatrixWorld(true); const right = new THREE.Vector3(1, 0, 0).applyQuaternion(K.piv.quaternion); K.dir = Math.sign(right.x * c.lx + right.z * c.lz) || 1;
  K.on = true; K.st = 'peek'; K.t = 0; K.seenT = 0; K.o = c; K.lean = 0; K.leanTo = Math.asin(Math.min(0.6, Math.hypot(c.hx - c.bx, c.hz - c.bz) / 2.0)) + 0.06; K.slide = 0; K.hx = c.hx; K.hz = c.hz; K.steps = [];
  return true;
}
function updatePeek(dt, t) {
  for (let i = K.steps.length - 1; i >= 0; i--) { const s = K.steps[i]; s.t -= dt; if (s.t <= 0) { C.audio.monStep(s.p); K.steps.splice(i, 1); } }
  if (!K.on) return; const P = C.P, g = W.g; K.t += dt;
  K.lean += (K.leanTo - K.lean) * (1 - Math.pow(K.st === 'snap' ? 1e-9 : 0.02, dt));
  // roll about the feet: the body stays behind the wall, the head comes out past the corner
  g.root.rotation.set(0, 0, -K.dir * K.lean); g.root.position.set(-K.dir * K.slide, 0, 0);
  const rel = Math.atan2(P.x - K.piv.position.x, P.z - K.piv.position.z) - K.piv.rotation.y;
  g.scr = K.st === 'snap' ? 0.6 : 0.15; g.update(dt, 'idle', 1, t, rel);
  if (K.st === 'peek') {
    const d = Math.hypot(P.x - K.hx, P.z - K.hz);
    if (inView(K.hx, K.hz, 2.0, 0.42) && los(P.x, P.z, K.hx, K.hz) && !window.__peekHold) K.seenT += dt; // __peekHold: test hook to photograph it
    if (K.seenT > 0.28 || (d < 3.5 && !window.__peekHold)) { // noticed: gone in a blink, running
      K.st = 'snap'; K.t = 0; K.leanTo = -0.05; C.audio.tone({ f: 260, f2: 90, v: 0.05, d: 0.12, type: 'triangle', wet: 0.4, pos: { x: K.hx, y: 1.8, z: K.hz } });
      const ox = K.o.rx, oz = K.o.rz; for (let k = 0; k < 7; k++) K.steps.push({ t: 0.15 + k * 0.17, p: { x: K.o.bx + ox * (0.8 + k * 0.9), y: 0.1, z: K.o.bz + oz * (0.8 + k * 0.9) } });
      if (C.onSeen) C.onSeen();
    } else if (K.t > 45) { K.on = false; K.piv.visible = false; }
  } else if (K.st === 'snap') { K.slide = Math.min(0.9, K.slide + dt * 6); if (K.t > 0.2) { K.on = false; K.piv.visible = false; } }
}

// ---------------- local power cut ----------------
let LO = null, flickerT = 0, flickX = 0, flickZ = 0;
export function startLightsOut(m) { LO = { x: m.x, z: m.z, r: m.r, d: m.d, t: 0 }; C.audio.tone({ f: 120, f2: 40, v: 0.25, d: 0.5, lp: 400, wet: 0.5, pos: { x: m.x, y: 2.5, z: m.z } }); C.audio.noise && C.audio.noise({ f: 300, q: 1, v: 0.12, d: 0.3 }); }
// the lights die one after another down the hall, coming toward you; then it is dark where you stand
export function startCreep(m) { LO = { creep: true, x0: m.x0, z0: m.z0, x1: m.x, z1: m.z, x: m.x0, z: m.z0, r: 3, d: m.d, t: 0, pop: 0, crawl: m.crawl, crawled: false }; C.audio.tone({ f: 60, f2: 45, v: 0.2, d: 1.5, lp: 200, wet: 0.8, pos: { x: m.x0, y: 2.6, z: m.z0 } }); }
function creepStep(dt) {
  const L = LO, u = Math.min(1, L.t / 3), e = u * u * (3 - 2 * u);
  L.x = L.x0 + (L.x1 - L.x0) * e; L.z = L.z0 + (L.z1 - L.z0) * e; L.r = 3 + 6 * e;
  if (u < 1 && L.t > L.pop) { L.pop += 0.38 + Math.random() * 0.2; // a tube dies at the edge of the dark
    const dx = L.x1 - L.x, dz = L.z1 - L.z, dd = Math.hypot(dx, dz) || 1, ex = L.x + dx / dd * L.r * 0.8, ez = L.z + dz / dd * L.r * 0.8, pos = { x: ex, y: 2.7, z: ez };
    C.audio.tone({ f: 120, f2: 45, v: 0.16, d: 0.35, lp: 500, wet: 0.7, pos }); C.audio.noise({ f: 3800, q: 4, v: 0.06, d: 0.05, pos, wet: 0.6 }); }
  if (L.crawl && !L.crawled && L.t > 3.5 + Math.min(1.5, L.d * 0.3)) { L.crawled = true; // something moves in the dark with you
    const a = Math.random() * 6.283; C.audio.scramble({ x: C.P.x + Math.sin(a) * 7, y: 0.1, z: C.P.z + Math.cos(a) * 7 }, { x: C.P.x + Math.sin(a + 0.9) * 4, y: 0.1, z: C.P.z + Math.cos(a + 0.9) * 4 }, 1.1, false, 0.9); }
}
function loAmount(t) {
  if (!LO) return 0; const a = LO.t;
  if (LO.creep) { if (a < 3 + LO.d) return 1; return Math.sin(a * 41) > 0 ? 1 : 0; }
  if (a < 1.6) return Math.sin(a * 37) + Math.sin(a * 61) > 0.3 ? 1 : 0.2; // stutter
  if (a < 1.6 + LO.d) return 1;
  if (a < 3.2 + LO.d) return Math.sin(a * 41) > 0 ? 1 : 0;
  return 0;
}
// multiplier for a fixture at (x, z)
export function scareLight(x, z, t) {
  let k = 1;
  if (LO) { const a = loAmount(t), dd = Math.hypot(x - LO.x, z - LO.z); if (dd < LO.r) k *= 1 - a; }
  if (flickerT > 0 && Math.hypot(x - flickX, z - flickZ) < 9) k *= Math.sin(t * 90) > 0 ? 0.1 : 1;
  return k;
}
function updateLO(dt, t) {
  if (flickerT > 0) flickerT -= dt;
  if (!LO) { C.bake.black.value.w = 0; return; }
  LO.t += dt; if (LO.creep) creepStep(dt); const a = loAmount(t); C.bake.black.value.set(LO.x, LO.z, LO.r, a);
  if (C.envBase == null) C.envBase = C.scene.environmentIntensity; const inside = Math.hypot(C.P.x - LO.x, C.P.z - LO.z) < LO.r ? 1 : 0; C.scene.environmentIntensity = C.envBase * (1 - 0.88 * a * inside);
  if (LO.t > (LO.creep ? 4.6 : 3.4) + LO.d) { LO = null; C.bake.black.value.w = 0; C.scene.environmentIntensity = C.envBase; }
}

// ---------------- phantoms: it is there for an instant, then it is not ----------------
const PH = { on: false, t: 0, dur: 0 }, _cw = new THREE.Vector3();
export function phantom(x, z, dur = 0.2, scr = 1.1) {
  if (W.on) vanish(false); const g = ghost(); if (!g) return false; if (g.root.parent !== C.scene) C.scene.add(g.root);
  g.root.visible = true; g.root.position.set(x, groundY(x, z), z); g.root.rotation.set(0, Math.atan2(C.P.x - x, C.P.z - z), 0); g.scr = scr; g.lock = true; g.update(0.016, 'idle', 1, 0, 0);
  PH.on = true; PH.t = 0; PH.dur = dur; facePhantom(); return true;
}
function facePhantom() { const g = W.g; g.root.updateMatrixWorld(true); C.camera.getWorldPosition(_cw); g.face.lookAt(_cw); g.face.rotateZ(0.4); }
function updatePhantom(dt) { if (!PH.on) return; PH.t += dt; if (PH.t > PH.dur) { PH.on = false; W.g.root.visible = false; W.g.lock = false; } else { W.g.update(dt, 'idle', 1, 0, 0); facePhantom(); } }
export function updateScares(dt, t) { if (!C) return; updateWatcher(dt, t); updatePeek(dt, t); updateLO(dt, t); updatePhantom(dt); }
export function clearScares() { if (W.on) vanish(false); if (PH.on) { PH.on = false; W.g.root.visible = false; } if (K.on) { K.on = false; K.piv.visible = false; } LO = null; if (C) C.bake.black.value.w = 0; }
export function scareDebug() { return { peek: K.on ? { st: K.st, hx: K.hx, hz: K.hz, bx: K.o.bx, bz: K.o.bz } : null, stand: W.on ? { x: W.x, z: W.z } : null }; }
