// Builds the school: architecture, props, baked lighting, doors, lockers, fixtures. Returns handles the game animates.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { ROOMS, WALLS, DOORS, WINDOWS, FURNITURE, LOCKERS, LOCKER_W, LOCKER_D, LOCKER_H, SEARCHABLE, LIGHTS, BINS, TOOL_RACK, COMPUTER, COT, VENT, T, BUCKET, TEACHER_DESK, POOL_BASIN, roomAt, groundY, segBlocked, rng } from '../shared/level.js';

const BAKE = { scale: { value: 1 } };
// static lighting is baked per vertex from every ceiling fixture, with walls occluding; it is added as indirect diffuse.
function bakeMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBake = BAKE.scale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uBake;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vBake * uBake;');
  };
  mat.customProgramCacheKey = () => 'bake';
  return mat;
}
const OCC = WALLS.filter(w => !w.glass).concat(FURNITURE.filter(f => f.h > 1.7));
function bakeAt(px, py, pz, nx, ny, nz) {
  let r = 0.012, g = 0.013, b = 0.015; // a little darkness, never pure black
  const sx = px + nx * 0.06, sz = pz + nz * 0.06, sy = py + ny * 0.06;
  for (const L of LIGHTS) {
    if (L.state === 'off') continue;
    const dx = L.x - sx, dy = L.y - 0.05 - sy, dz = L.z - sz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 14 * 14) continue;
    const d = Math.sqrt(d2), lam = Math.max(0, (dx * nx + dy * ny + dz * nz) / d);
    const emit = L.bulb ? 1 : 0.25 + 0.75 * Math.max(0, dy / d); // troffers throw light downward
    if (lam <= 0 && ny < 0.5) { if (!(ny < -0.5)) continue; }
    if (segBlocked(sx, sz, L.x, L.z, OCC)) continue;
    const k = L.i * (L.state === 'flicker' ? 0.55 : 1) * (L.emergency ? 0.6 : 1) * 2.4 / (d2 + 0.8);
    const direct = k * (ny < -0.5 ? 0.18 : lam) * emit, bounce = k * 0.22;
    const c = new THREE.Color(L.color);
    r += (direct + bounce) * c.r; g += (direct + bounce) * c.g; b += (direct + bounce) * c.b;
  }
  // contact darkening near floors, corners and ceilings
  let ao = 1;
  if (ny > 0.5) { let md = 9; for (const w of OCC) { const ex = Math.max(w.x0 - px, 0, px - w.x1), ez = Math.max(w.z0 - pz, 0, pz - w.z1); md = Math.min(md, Math.hypot(ex, ez)); } ao *= 0.55 + 0.45 * Math.min(1, md / 0.35); }
  if (Math.abs(ny) < 0.5) ao *= 0.5 + 0.5 * Math.min(1, py / 0.45);
  return [r * ao, g * ao, b * ao];
}

// ---- static mesh collector: everything static is merged per material, then baked ----
class Collector {
  constructor() { this.buckets = new Map(); }
  add(geo, mat, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
  }
  box(mat, x, y, z, sx, sy, sz, ry = 0, rounded = 0) {
    const geo = rounded ? new RoundedBoxGeometry(sx, sy, sz, 2, rounded) : new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    this.add(geo, mat, m);
  }
  mesh(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) { this.add(geo, mat, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s))); }
  finish(scene) {
    for (const [mat, list] of this.buckets) {
      const g = mergeGeometries(list, false); const p = g.attributes.position, n = g.attributes.normal, bake = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const c = bakeAt(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); bake[i * 3] = c[0]; bake[i * 3 + 1] = c[1]; bake[i * 3 + 2] = c[2]; }
      g.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
      const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.receiveShadow = true; scene.add(m);
    }
  }
}
// a subdivided quad: origin o, axes u and v (unit vectors), lengths, steps; uv computed by fn(world point)
function quadGrid(o, u, v, ul, vl, us, vs, uvf) {
  const pos = [], uv = [], nor = [], n = new THREE.Vector3().crossVectors(u, v).normalize();
  const P = (a, b) => new THREE.Vector3().copy(o).addScaledVector(u, a).addScaledVector(v, b);
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const a = P(us[i], vs[j]), b = P(us[i + 1], vs[j]), c = P(us[i + 1], vs[j + 1]), d = P(us[i], vs[j + 1]);
    for (const q of [a, b, c, a, c, d]) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); const t = uvf(q); uv.push(t[0], t[1]); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const steps = (len, s) => { const a = [0]; for (let x = s; x < len - 1e-3; x += s) a.push(x); a.push(len); return a; };

export function buildWorld(scene, renderer, opts = {}) {
  TX.setAniso(renderer.capabilities.getMaxAnisotropy());
  const col = new Collector();
  const out = { doors: {}, lockers: {}, fixtures: [], clocks: [], screens: {}, interact: [] };
  const R = rng(42);
  const std = (o) => bakeMaterial(new THREE.MeshStandardMaterial(o));
  // ---------- materials ----------
  const hallFloorT = TX.vctChecker(), classFloorT = TX.vctPlain([206, 196, 170], 7, [150, 132, 98]), officeFloorT = TX.vctPlain([150, 152, 148], 8), conc = TX.concrete();
  const rep = (t, k) => { for (const m of ['map', 'normalMap', 'roughnessMap']) if (t[m]) t[m].repeat.set(k, k); return t; };
  const floorMats = {
    hall: std({ map: hallFloorT.map, normalMap: hallFloorT.normalMap, roughnessMap: hallFloorT.roughnessMap, roughness: 0.55, metalness: 0, envMapIntensity: 0.55 }),
    class: std({ map: classFloorT.map, normalMap: classFloorT.normalMap, roughnessMap: classFloorT.roughnessMap, roughness: 0.6, envMapIntensity: 0.45 }),
    office: std({ map: officeFloorT.map, normalMap: officeFloorT.normalMap, roughnessMap: officeFloorT.roughnessMap, roughness: 0.7, envMapIntensity: 0.3 }),
    closet: std({ map: conc.map, normalMap: conc.normalMap, roughness: 0.75, color: 0x9a9890 }),
    service: std({ map: conc.map, normalMap: conc.normalMap, roughness: 0.7, color: 0x8a8880 }),
  };
  floorMats.storage = floorMats.service;
  const lcorrT = TX.vctPlain([178, 176, 166], 12, [120, 60, 50]), lockT = TX.vctPlain([150, 168, 178], 13), deckT = TX.vctChecker([226, 230, 232], [120, 170, 196], 14);
  floorMats.lcorr = std({ map: lcorrT.map, normalMap: lcorrT.normalMap, roughnessMap: lcorrT.roughnessMap, roughness: 1, envMapIntensity: 0.4 });
  floorMats.lockers = std({ map: lockT.map, normalMap: lockT.normalMap, roughnessMap: lockT.roughnessMap, roughness: 1, envMapIntensity: 0.4 });
  floorMats.pool = std({ map: deckT.map, normalMap: deckT.normalMap, roughness: 0.35, envMapIntensity: 0.7 });
  floorMats.gym = std({ map: TX.woodGrain([196, 150, 98], 21), roughness: 0.38, envMapIntensity: 0.8 });
  floorMats.stair = floorMats.service;
  const wallSets = {
    hall: TX.paintedWall({ upper: [226, 220, 204], lower: [146, 166, 132], stripe: [52, 84, 58], bandTop: 1.1, ceil: 2.95, seed: 4 }),
    class: TX.paintedWall({ upper: [228, 219, 190], lower: [196, 184, 150], stripe: [120, 96, 60], bandTop: 1.0, ceil: 2.95, seed: 5 }),
    closet: TX.paintedWall({ upper: [176, 178, 170], ceil: 2.6, seed: 6, block: true }),
    office: TX.paintedWall({ upper: [196, 200, 186], lower: [122, 136, 120], bandTop: 1.0, ceil: 2.7, seed: 7, block: true }),
    service: TX.paintedWall({ upper: [150, 148, 140], lower: [104, 102, 96], bandTop: 1.0, ceil: 2.7, seed: 8, block: true }),
  };
  wallSets.storage = wallSets.service;
  wallSets.stair = TX.paintedWall({ upper: [180, 182, 176], lower: [120, 124, 120], bandTop: 1.0, ceil: 3, seed: 15, block: true });
  wallSets.lcorr = TX.paintedWall({ upper: [214, 210, 196], lower: [64, 94, 140], stripe: [200, 170, 60], bandTop: 1.1, ceil: 3, seed: 16, block: true });
  wallSets.gym = TX.paintedWall({ upper: [222, 214, 190], lower: [120, 36, 40], stripe: [230, 190, 60], bandTop: 2.0, ceil: 7.5, seed: 17, block: true });
  wallSets.lockers = TX.paintedWall({ upper: [226, 230, 228], lower: [70, 110, 150], bandTop: 1.3, ceil: 2.8, seed: 18, block: true });
  wallSets.pool = TX.paintedWall({ upper: [204, 226, 230], lower: [90, 150, 176], stripe: [30, 80, 120], bandTop: 1.4, ceil: 6.5, seed: 19, block: true });
  const wallMats = {}; for (const k in wallSets) { const w = wallSets[k]; wallMats[k] = std({ map: w.map, normalMap: w.normalMap, roughnessMap: w.roughnessMap, roughness: 1, envMapIntensity: 0.25 }); }
  const ceilT = TX.ceilingTiles(); const ceilMat = std({ map: ceilT.map, normalMap: ceilT.normalMap, roughness: 0.95 });
  const M = {
    trim: std({ color: 0x2e2f2c, roughness: 0.5, metalness: 0.4 }),
    steel: std({ color: 0x8a8d8c, roughness: 0.4, metalness: 0.7 }),
    darkSteel: std({ color: 0x3d4140, roughness: 0.45, metalness: 0.6 }),
    chrome: std({ color: 0xd6d8d8, roughness: 0.18, metalness: 1 }),
    black: std({ color: 0x141414, roughness: 0.6 }),
    rubber: std({ color: 0x1d1d1b, roughness: 0.8 }),
    wood: std({ map: TX.woodGrain(), roughness: 0.55 }),
    woodDark: std({ map: TX.woodGrain([110, 72, 42], 3), roughness: 0.5 }),
    doorWood: std({ map: TX.woodGrain([168, 122, 74], 5), roughness: 0.45 }),
    plasticBlue: std({ color: 0x2a4f86, roughness: 0.45 }),
    plasticOrange: std({ color: 0xc8662a, roughness: 0.5 }),
    yellow: std({ color: 0xd6b21e, roughness: 0.45 }),
    lockerBody: std({ color: 0x9e1f1a, roughness: 0.45, metalness: 0.35 }),
    lockerIn: std({ color: 0x2a0d0b, roughness: 0.7, metalness: 0.2 }),
    cabinet: std({ color: 0x8b8f87, roughness: 0.5, metalness: 0.4 }),
    board: std({ map: TX.textCanvas(1024, 384, (x, w, h) => { x.fillStyle = '#1f3a2e'; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(220,230,225,.04)'; x.fillRect(Math.random() * w, Math.random() * h, 200, 30); } x.fillStyle = 'rgba(235,238,230,.85)'; x.font = '44px "Comic Sans MS", cursive'; x.fillText('Thursday 11 June 1998', 60, 90); x.font = '38px "Comic Sans MS", cursive'; x.fillText('Period 7 - remain in your seats', 60, 160); x.fillText('Roll will be taken at 4', 60, 220); x.globalAlpha = .5; x.fillText('HERE   HERE   HERE   HERE', 60, 320); }), roughness: 0.9 }),
    cork: std({ map: TX.corkBoard(), roughness: 0.9 }),
    cloth: std({ color: 0x4d5a4e, roughness: 0.95 }),
    blanket: std({ color: 0x6b2e2a, roughness: 0.95 }),
    box: std({ color: 0xa2805a, roughness: 0.85 }),
    white: std({ color: 0xe7e5df, roughness: 0.6 }),
    glassTint: new THREE.MeshPhysicalMaterial({ color: 0xbfd2cf, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.2, depthWrite: false }),
    grille: std({ map: TX.grille(), roughness: 0.6, metalness: 0.3 }),
    red: std({ color: 0xa8201a, roughness: 0.4 }),
    pipe: std({ color: 0x6c6e66, roughness: 0.5, metalness: 0.5 }),
    concreteDark: std({ map: conc.map, color: 0x6a6862, roughness: 0.9 }),
  };
  // ---------- floors and ceilings ----------
  const floorRect = (fm, x0, z0, x1, z1, y, size) => col.add(quadGrid(new THREE.Vector3(x0, y, z1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), x1 - x0, z1 - z0, steps(x1 - x0, 0.5), steps(z1 - z0, 0.5), (q) => [q.x / size, -q.z / size]), fm);
  for (const [id, r] of Object.entries(ROOMS)) {
    const fm = floorMats[id], size = id === 'gym' ? 3 : ['hall', 'class', 'office', 'lcorr', 'lockers', 'pool'].includes(id) ? 2.4 : 4;
    if (r.stair) {
      floorRect(fm, -2, r.z0, 0, r.z1, 0, 4); floorRect(fm, -12, r.z0, -10, r.z1, -4, 4);
      for (let k = 0; k < 16; k++) { const x1 = -2 - k * 0.5, top = -(k + 1) * 0.25; col.box(M.concreteDark, x1 - 0.25, (top - 4) / 2, (r.z0 + r.z1) / 2, 0.5, top + 4, r.z1 - r.z0); col.box(M.steel, x1 - 0.03, top + 0.005, (r.z0 + r.z1) / 2, 0.06, 0.012, r.z1 - r.z0 - 0.02); }
      for (const z of [r.z0 + 0.12, r.z1 - 0.12]) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(8, 4), 8), M.steel); rail.position.set(-6, -2 + 0.95, z); rail.rotation.z = Math.atan2(8, -4) + Math.PI; rail.rotation.z = -Math.PI / 2 + Math.atan2(4, 8); scene.add(rail); }
      col.add(quadGrid(new THREE.Vector3(r.x0, 3.0, r.z0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), r.x1 - r.x0, r.z1 - r.z0, steps(r.x1 - r.x0, 0.6), steps(r.z1 - r.z0, 0.6), (q) => [q.x / 2.4, q.z / 2.4]), M.concreteDark);
      continue;
    }
    if (id === 'pool') { const B = POOL_BASIN; floorRect(fm, r.x0, r.z0, r.x1, B.z0, r.y, size); floorRect(fm, r.x0, B.z1, r.x1, r.z1, r.y, size); floorRect(fm, r.x0, B.z0, B.x0, B.z1, r.y, size); floorRect(fm, B.x1, B.z0, r.x1, B.z1, r.y, size); }
    else floorRect(fm, r.x0, r.z0, r.x1, r.z1, r.y, size);
    const cm = ['service', 'storage', 'closet', 'gym', 'pool'].includes(id) ? M.concreteDark : ceilMat;
    col.add(quadGrid(new THREE.Vector3(r.x0, r.y + r.ceil, r.z0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), r.x1 - r.x0, r.z1 - r.z0, steps(r.x1 - r.x0, 0.6), steps(r.z1 - r.z0, 0.6), (q) => [q.x / 2.4, q.z / 2.4]), cm);
  }
  // ---------- walls ----------
  const faceWall = (x0, z0, x1, z1, y0, y1, nx, nz, roomHint) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.01 || y1 <= y0) return;
    if (!roomHint && len > 0.6) { // split a long wall run so each room gets its own face
      const n = Math.ceil(len / 0.25), at = (k) => roomAt(x0 + (x1 - x0) * (k + 0.5) / n + nx * 0.1, z0 + (z1 - z0) * (k + 0.5) / n + nz * 0.1);
      let k0 = 0, r0 = at(0);
      for (let k = 1; k <= n; k++) { const r = k < n ? at(k) : '__end'; if (r !== r0) { if (r0) faceWall(x0 + (x1 - x0) * k0 / n, z0 + (z1 - z0) * k0 / n, x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, y0, y1, nx, nz, r0); k0 = k; r0 = r; } }
      return;
    }
    const mx = (x0 + x1) / 2 + nx * 0.1, mz = (z0 + z1) / 2 + nz * 0.1;
    const room = roomHint || roomAt(mx, mz); if (!room) return;
    const ws = wallSets[room], ceil = ROOMS[room].ceil;
    const u = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), v = new THREE.Vector3(0, 1, 0);
    let o = new THREE.Vector3(x0, y0, z0), uu = u;
    if (new THREE.Vector3().crossVectors(u, v).dot(new THREE.Vector3(nx, 0, nz)) < 0) { o = new THREE.Vector3(x1, y0, z1); uu = u.clone().negate(); }
    const ry0 = ROOMS[room].y, vs = [0]; for (const y0r of [0.1, 0.35, 0.8, 1.1, 1.2, 2.0, ceil - 0.35]) { const y = y0r + ry0; if (y > y0 + 0.01 && y < y1 - 0.01) vs.push(y - y0); } vs.push(y1 - y0);
    const ry = ROOMS[room].y;
    col.add(quadGrid(o, uu, v, len, y1 - y0, steps(len, 0.5), vs, (q) => [(q.x + q.z) / ws.uSize, (q.y - ry) / ws.ceil]), wallMats[room]);
  };
  const faces = (w, y0, y1) => {
    faceWall(w.x0, w.z0, w.x1, w.z0, y0, y1, 0, -1); faceWall(w.x0, w.z1, w.x1, w.z1, y0, y1, 0, 1);
    faceWall(w.x0, w.z0, w.x0, w.z1, y0, y1, -1, 0); faceWall(w.x1, w.z0, w.x1, w.z1, y0, y1, 1, 0);
  };
  for (const w of WALLS) {
    if (w.glass) { faces(w, 0, 1.05); faces(w, 2.15, w.h); continue; }
    faces(w, w.y0, w.y0 + w.h);
  }
  for (const d of DOORS) { // lintel above every doorway
    // up to the top of the wall the doorway is cut through
    let top = null; for (const w of WALLS) { const touch = d.axis === 'x' ? Math.abs((w.z0 + w.z1) / 2 - d.z) < 0.15 && (Math.abs(w.x1 - d.a0) < 0.05 || Math.abs(w.x0 - d.a1) < 0.05) : Math.abs((w.x0 + w.x1) / 2 - d.x) < 0.15 && (Math.abs(w.z1 - d.a0) < 0.05 || Math.abs(w.z0 - d.a1) < 0.05); if (touch) top = Math.max(top ?? -99, w.y0 + w.h); }
    if (top == null) top = d.y + 2.95;
    if (d.axis === 'x') faces({ x0: d.a0, z0: d.z - T / 2, x1: d.a1, z1: d.z + T / 2 }, d.y + 2.12, top); else faces({ x0: d.x - T / 2, z0: d.a0, x1: d.x + T / 2, z1: d.a1 }, d.y + 2.12, top);
  }
  // ---------- windows: classroom glass onto the hallway ----------
  for (const w of WINDOWS) {
    const len = w.a1 - w.a0, cx = (w.a0 + w.a1) / 2;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, w.y1 - w.y0), M.glassTint); glass.position.set(cx, (w.y0 + w.y1) / 2, w.z); scene.add(glass);
    for (const [y, h] of [[w.y0, 0.06], [w.y1, 0.06]]) col.box(M.trim, cx, y, w.z, len + 0.1, h, T + 0.04);
    for (let k = 0; k <= 4; k++) col.box(M.trim, w.a0 + k * len / 4, (w.y0 + w.y1) / 2, w.z, 0.05, w.y1 - w.y0, T + 0.04);
    col.box(M.trim, cx, w.y0 - 0.03, w.z + 0.12, len, 0.03, 0.12); // sill
  }
  // ---------- doors ----------
  for (const d of DOORS) {
    const len = d.a1 - d.a0, ht = 2.1, isX = d.axis === 'x';
    // frame
    const fz = isX ? d.z : null, fx = isX ? null : d.x;
    const dy = d.y;
    const jamb = (a) => isX ? col.box(M.trim, a, dy + ht / 2, fz, 0.06, ht, T + 0.06) : col.box(M.trim, fx, dy + ht / 2, a, T + 0.06, ht, 0.06);
    jamb(d.a0 - 0.03); jamb(d.a1 + 0.03);
    isX ? col.box(M.trim, (d.a0 + d.a1) / 2, dy + ht + 0.03, fz, len + 0.12, 0.06, T + 0.06) : col.box(M.trim, fx, dy + ht + 0.03, (d.a0 + d.a1) / 2, T + 0.06, 0.06, len + 0.12);
    // the leaf, hinged at a0
    const pivot = new THREE.Group();
    if (isX) pivot.position.set(d.a0, d.y, d.z); else pivot.position.set(d.x, d.y, d.a0);
    const leafMat = d.kind === 'classroom' ? M.doorWood : d.kind === 'steel' ? M.darkSteel : d.kind === 'service' ? M.steel : M.cabinet;
    const leaf = new THREE.Group(); pivot.add(leaf);
    const th = d.kind === 'steel' ? 0.07 : 0.045, wdt = len - 0.04;
    const panel = new THREE.Mesh(new RoundedBoxGeometry(wdt, ht - 0.03, th, 2, 0.008), leafMat.clone()); panel.material.onBeforeCompile = leafMat.onBeforeCompile;
    panel.geometry.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(panel.geometry.attributes.position.count * 3).fill(0.35), 3));
    panel.position.set(wdt / 2 + 0.02, ht / 2, 0); leaf.add(panel);
    if (!isX) leaf.rotation.y = -Math.PI / 2;
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d2, roughness: 0.2, metalness: 1 });
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10).rotateZ(Math.PI / 2), handleMat); h.position.set(wdt - 0.06, 1.0, s * (th / 2 + 0.035)); leaf.add(h); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14).rotateX(Math.PI / 2), handleMat); r.position.set(wdt - 0.02, 1.0, s * (th / 2 + 0.01)); leaf.add(r); }
    for (const y of [0.25, 1.85]) { const hg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, th + 0.01), handleMat); hg.position.set(0.02, y, 0); leaf.add(hg); }
    if (d.kind === 'classroom' || d.kind === 'steel') { // narrow vision panel
      const gw = d.kind === 'steel' ? 0.2 : 0.14, gh = d.kind === 'steel' ? 0.26 : 0.75;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ color: 0x9fb2b0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 }));
      for (const s of [-1, 1]) { const g2 = gl.clone(); g2.position.set(wdt * 0.62, 1.48, s * (th / 2 + 0.002)); if (s < 0) g2.rotation.y = Math.PI; leaf.add(g2); }
      // cut the panel visually with a dark recess behind the glass
      const rec = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshBasicMaterial({ color: 0x0b0c0c })); rec.position.set(wdt * 0.62, 1.48, th / 2 + 0.001); leaf.add(rec);
      const rec2 = rec.clone(); rec2.rotation.y = Math.PI; rec2.position.z = -th / 2 - 0.001; leaf.add(rec2);
    }
    let bolt = null;
    if (d.bolt) { // heavy slide bolt on the inside (south) face
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.02), handleMat); plate.position.set(wdt - 0.18, 1.32, th / 2 + 0.01); leaf.add(plate);
      bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.3, metalness: 1 })); bolt.position.set(wdt - 0.2, 1.32, th / 2 + 0.035); leaf.add(bolt);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), handleMat); knob.position.set(0, 0, 0.04); bolt.add(knob);
      const keeper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), handleMat); keeper.position.set(d.a1 + 0.03, 1.32, d.z + T / 2 + 0.03); scene.add(keeper);
      // steel kick plate + sign
      const kp = new THREE.Mesh(new THREE.BoxGeometry(wdt - 0.1, 0.25, th + 0.006), M.steel); kp.position.set(wdt / 2, 0.15, 0); leaf.add(kp);
    }
    scene.add(pivot);
    out.doors[d.id] = { d, pivot, angle: 0, target: 0, bolt, boltT: 0 };
    // room sign beside the door (hallway side)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.14), new THREE.MeshStandardMaterial({ map: TX.textCanvas(256, 104, (x, w, h) => { x.fillStyle = d.kind === 'steel' ? '#26346a' : '#3b3a36'; x.fillRect(0, 0, w, h); x.fillStyle = '#f1efe6'; x.font = `bold ${d.label.length > 4 ? 26 : 54}px Helvetica, Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(d.label, w / 2, h / 2 + 2); }), roughness: 0.4 }));
    if (isX) { const side = d.z > 1 ? -1 : 1; sign.position.set(d.a1 + 0.3, 1.6, d.z + side * (T / 2 + 0.005)); if (side < 0) sign.rotation.y = Math.PI; }
    else { const east = d.x - T / 2 - 0.005, west = d.x + T / 2 + 0.005; if (d.y < 0) { sign.position.set(west, d.y + 1.6, d.a1 + 0.3); sign.rotation.y = Math.PI / 2; } else if (d.id === 'd_stair') { sign.position.set(west, 1.6, d.a1 + 0.35); sign.rotation.y = Math.PI / 2; } else { sign.position.set(east, 1.6, d.a1 + 0.3); sign.rotation.y = -Math.PI / 2; } }
    scene.add(sign);
  }
  // ---------- lockers (instanced) ----------
  const nL = LOCKERS.length;
  const bodyGeo = new RoundedBoxGeometry(LOCKER_W - 0.01, LOCKER_H - 0.1, LOCKER_D, 2, 0.008);
  const faceT = TX.lockerFace();
  const faceMat = bakeMaterial(new THREE.MeshStandardMaterial({ map: faceT.map, normalMap: faceT.normalMap, roughnessMap: faceT.roughnessMap, metalness: 0.35, roughness: 1, envMapIntensity: 0.7 }));
  const atlas = TX.numberAtlas(101, nL);
  const plateMat = bakeMaterial(new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.35, metalness: 0.4 }));
  const pmc = plateMat.onBeforeCompile;
  plateMat.onBeforeCompile = (sh) => { pmc(sh); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aNum;').replace('#include <uv_vertex>', `#include <uv_vertex>\n{ float c = mod(aNum, ${atlas.userData.cols}.0), r = floor(aNum / ${atlas.userData.cols}.0); vMapUv = (uv + vec2(c, ${atlas.userData.rows - 1}.0 - r)) / vec2(${atlas.userData.cols}.0, ${atlas.userData.rows}.0); }`); };
  plateMat.customProgramCacheKey = () => 'plate';
  const mkInst = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.receiveShadow = true; scene.add(im); return im; };
  const faceGeo = new THREE.PlaneGeometry(LOCKER_W - 0.02, LOCKER_H - 0.12);
  const plateGeo = new THREE.PlaneGeometry(0.075, 0.035);
  const handleGeo = new THREE.BoxGeometry(0.025, 0.06, 0.012);
  const bodies = mkInst(bodyGeo, M.lockerBody, nL), fronts = mkInst(faceGeo, faceMat, nL), plates = mkInst(plateGeo, plateMat, nL * 2), handles = mkInst(handleGeo, M.chrome, nL * 2);
  const bakeB = new Float32Array(nL * 3), bakeF = new Float32Array(nL * 3), bakeP = new Float32Array(nL * 6), bakeH = new Float32Array(nL * 6), nums = new Float32Array(nL * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  LOCKERS.forEach((L, i) => {
    const facing = L.side === 'n' ? 0 : Math.PI, fz = L.side === 'n' ? 1 : -1;
    q.setFromAxisAngle(Y, facing);
    bodies.setMatrixAt(i, m4.compose(new THREE.Vector3(L.x, 0.1 + (LOCKER_H - 0.1) / 2, L.z), q, one));
    const fzPos = L.z + fz * (LOCKER_D / 2 + 0.002);
    const hide = SEARCHABLE[L.id];
    fronts.setMatrixAt(i, m4.compose(new THREE.Vector3(L.x, 0.1 + (LOCKER_H - 0.12) / 2 + 0.01, fzPos), q, hide ? new THREE.Vector3(1, 0.49, 1).setY(0.5) : one));
    if (hide) fronts.setMatrixAt(i, m4.compose(new THREE.Vector3(L.x, 0.1 + (LOCKER_H - 0.12) / 4 + 0.01, fzPos), q, new THREE.Vector3(1, 0.5, 1)));
    for (let t = 0; t < 2; t++) {
      const ty = t ? 0.1 + (LOCKER_H - 0.1) * 0.75 : 0.1 + (LOCKER_H - 0.1) * 0.25;
      plates.setMatrixAt(i * 2 + t, m4.compose(new THREE.Vector3(L.x, ty + 0.27, fzPos + fz * 0.003), q, (hide && t) ? new THREE.Vector3(0, 0, 0) : one));
      handles.setMatrixAt(i * 2 + t, m4.compose(new THREE.Vector3(L.x + (L.side === 'n' ? 1 : -1) * 0.12, ty, fzPos + fz * 0.008), q, (hide && t) ? new THREE.Vector3(0, 0, 0) : one));
      nums[i * 2 + t] = t ? i : i; // upper and lower tier share the column number
      const c = bakeAt(L.x, ty, fzPos, 0, 0, fz); bakeP.set(c, (i * 2 + t) * 3); bakeH.set(c, (i * 2 + t) * 3);
    }
    const c = bakeAt(L.x, 1.0, fzPos, 0, 0, fz); bakeB.set(c, i * 3); bakeF.set(c, i * 3);
    if (hide) { // the openable upper tier: a real hinged door with an interior behind it
      const ty = 0.1 + (LOCKER_H - 0.1) * 0.75, hgt = (LOCKER_H - 0.12) / 2;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(LOCKER_W - 0.04, hgt - 0.02), new THREE.MeshStandardMaterial({ map: TX.textCanvas(64, 128, (x, w, h) => { x.fillStyle = '#1d0907'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a1410'; x.fillRect(4, 18, w - 8, 4); x.fillStyle = '#777'; x.fillRect(w / 2 - 2, 26, 4, 12); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }), roughness: 0.8 }));
      inner.position.set(L.x, ty, fzPos + fz * 0.001); inner.rotation.y = facing; scene.add(inner);
      const hingeX = L.x - (L.side === 'n' ? 1 : -1) * (LOCKER_W / 2 - 0.01);
      const piv = new THREE.Group(); piv.position.set(hingeX, ty, fzPos + fz * 0.004); piv.rotation.y = facing; scene.add(piv);
      const doorGeo = new THREE.PlaneGeometry(LOCKER_W - 0.02, hgt); const uv = doorGeo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 0.5 + uv.getY(k) * 0.5);
      const dm = new THREE.MeshStandardMaterial({ map: faceT.map, normalMap: faceT.normalMap, roughnessMap: faceT.roughnessMap, metalness: 0.35, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.7 });
      const dmesh = new THREE.Mesh(doorGeo, dm); dmesh.position.x = (LOCKER_W - 0.02) / 2 * (L.side === 'n' ? 1 : 1); piv.add(dmesh);
      const pl = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ map: TX.textCanvas(64, 32, (x) => { x.fillStyle = '#c9c4b2'; x.fillRect(0, 0, 64, 32); x.fillStyle = '#111'; x.font = 'bold 22px Helvetica'; x.textAlign = 'center'; x.fillText(String(L.num), 32, 24); }), roughness: 0.35 }));
      pl.position.set((LOCKER_W - 0.02) / 2, 0.27, 0.003); piv.add(pl);
      const hd = new THREE.Mesh(handleGeo, M.chrome); hd.position.set(LOCKER_W - 0.09, 0, 0.008); piv.add(hd);
      let item = null;
      if (SEARCHABLE[L.id].item === 'clue:attendance') { item = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ map: TX.textCanvas(128, 166, (x, w, h) => { x.fillStyle = '#efe9d6'; x.fillRect(0, 0, w, h); x.fillStyle = '#223'; x.font = 'bold 10px Courier'; x.fillText('ATTENDANCE  RM 014', 8, 16); x.font = '9px Courier'; for (let k = 0; k < 14; k++) { x.fillStyle = '#334'; x.fillText(['ARDEN M', 'BELL T', 'CASTELLANO R', 'DORSEY K', 'EVANS J', 'FORD L', 'GRAY P', 'HUNT S', 'IBARRA C', 'JONES W', 'KIM H', 'LOWE D', 'MAYS A', 'NOLAN E'][k], 8, 32 + k * 9.5); x.fillStyle = '#a11'; x.fillText('ABSENT  R.V.', 74, 32 + k * 9.5); } }), roughness: 0.9, side: THREE.DoubleSide })); item.position.set(L.x, ty - 0.12, L.z + fz * 0.05); item.rotation.y = facing; item.rotation.x = -0.25; scene.add(item); }
      out.lockers[L.id] = { L, piv, angle: 0, target: 0, item, side: L.side };
      out.interact.push({ kind: 'locker', id: L.id, x: L.x, y: ty, z: fzPos + fz * 0.15 });
    }
  });
  for (const [im, arr] of [[bodies, bakeB], [fronts, bakeF], [plates, bakeP], [handles, bakeH]]) { im.geometry = im.geometry.clone(); im.geometry.setAttribute('bake', new THREE.InstancedBufferAttribute(arr, 3)); im.instanceMatrix.needsUpdate = true; }
  plates.geometry.setAttribute('aNum', new THREE.InstancedBufferAttribute(nums, 1));
  // locker base plinths
  for (const L of LOCKERS) col.box(M.rubber, L.x, 0.05, L.z, LOCKER_W, 0.1, LOCKER_D - 0.04);
  // ---------- ceiling fixtures ----------
  const diff = TX.prismatic();
  for (const L of LIGHTS) {
    if (L.bulb) { // bare bulb with cage
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 4 })); b.position.set(L.x, L.y - 0.22, L.z); scene.add(b);
      col.box(M.black, L.x, L.y - 0.1, L.z, 0.02, 0.2, 0.02);
      out.fixtures.push({ L, mat: b.material, base: 4 }); continue;
    }
    if (L.emergency) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 2.5 })); b.position.set(L.x, L.y - 0.1, L.z); scene.add(b); out.fixtures.push({ L, mat: b.material, base: 2.5 }); continue; }
    if (L.high) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.35, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })); g.position.set(L.x, L.y + 0.2, L.z); scene.add(g); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3), M.black); rod.position.set(L.x, L.y + 1.8, L.z); scene.add(rod);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: L.color, emissiveIntensity: 0 })); lens.position.set(L.x, L.y + 0.03, L.z); scene.add(lens); out.fixtures.push({ L, mat: lens.material, base: 4 }); continue; }
    const ceil = L.y + 0.02, rot = L.room === 'hall' || L.room === 'service' || L.room === 'lcorr' ? Math.PI / 2 : 0;
    col.box(M.white, L.x, ceil - 0.025, L.z, rot ? 1.24 : 0.64, 0.05, rot ? 0.64 : 1.24);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: diff, color: 0xffffff, emissive: L.color, emissiveMap: diff, emissiveIntensity: 0, roughness: 0.3 }));
    lens.rotation.y = rot; lens.position.set(L.x, ceil - 0.052, L.z); scene.add(lens);
    out.fixtures.push({ L, mat: lens.material, base: 3.2 });
  }
  // water stains on individual ceiling tiles (placed, not repeated)
  { const stain = TX.textCanvas(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 6, 64, 64, 62); g.addColorStop(0, 'rgba(120,92,50,.32)'); g.addColorStop(0.65, 'rgba(140,108,60,.2)'); g.addColorStop(0.9, 'rgba(110,80,40,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(64, 64, 60, 50, 0.4, 0, 7); x.fill(); });
    const sm = new THREE.MeshStandardMaterial({ map: stain, transparent: true, depthWrite: false, roughness: 1 });
    for (let k = 0; k < 22; k++) { const r = Object.values(ROOMS)[R() * 6 | 0]; if (r.ceil > 2.9 && R() < 0.3) continue; const s = 0.3 + R() * 0.5; const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * (0.7 + R() * 0.5)).rotateX(Math.PI / 2), sm); m.position.set(r.x0 + 0.5 + R() * (r.x1 - r.x0 - 1), r.ceil - 0.002, r.z0 + 0.4 + R() * (r.z1 - r.z0 - 0.8)); m.rotation.y = R() * 3; scene.add(m); } }
  // a dropped fixture and a missing tile near the dark end of the hallway
  { const f = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.6 })); f.add(box); f.position.set(34.5, 2.55, 1.0); f.rotation.set(0.5, 0, 0.25); scene.add(f);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5), M.black); w.position.set(34.5 + s * 0.2, 2.75, 1.2); scene.add(w); }
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.position.set(31.5, 2.948, 0.6); scene.add(hole); }
  // return-air grilles in the ceiling
  for (let x = 4.5; x < 40; x += 9) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58).rotateX(Math.PI / 2), M.grille); g.position.set(x, 2.947, 1.8); scene.add(g); }
  // ---------- hallway dressing ----------
  // chained exit doors at the west end, with an EXIT sign that still glows
  out.chain = new THREE.Group(); scene.add(out.chain);
  for (let k = 0; k < 14; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12), M.chrome); l.position.set(0.16, 1.0 + Math.sin(k * 0.45) * 0.03, 1.35 + k * 0.065); l.rotation.y = k % 2 ? Math.PI / 2 : 0; out.chain.add(l); }
  { const lk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0xb08a2a, metalness: 0.9, roughness: 0.3 })); lk.position.set(0.17, 0.92, 1.8); out.chain.add(lk); }
  { const ex = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.42), new THREE.MeshStandardMaterial({ map: TX.textCanvas(256, 110, (x, w, h) => { x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8231d'; x.font = 'bold 74px Helvetica'; x.textAlign = 'center'; x.fillText('EXIT', w / 2, 82); }), emissive: 0xff3a30, emissiveIntensity: 0.6, emissiveMap: null })); ex.position.set(0.16, 2.35, 1.8); scene.add(ex); }
  // painted-over room plate (Room 014): a faint outline; made legible as a clue on Day 2
  const plate014 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13), new THREE.MeshStandardMaterial({ map: TX.textCanvas(256, 110, (x, w, h) => { x.fillStyle = '#e2ddcc'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(120,110,80,.35)'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = 'rgba(110,100,70,.22)'; x.font = 'bold 60px Helvetica'; x.textAlign = 'center'; x.fillText('014', w / 2, 78); }), roughness: 0.9 }));
  plate014.position.set(0.105, 1.6, 2.75); plate014.rotation.y = Math.PI / 2; scene.add(plate014); out.plate014 = plate014;
  out.interact.push({ kind: 'plate', x: 0.3, y: 1.6, z: 2.75 });
  // notice boards, fire extinguisher cabinets, fountain, clock, switches
  for (const [x, z, ry] of [[6.2, 0.11, 0], [27.5, 3.49, Math.PI]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), M.cork); b.position.set(x, 1.55, z + (ry ? -0.0 : 0.0) + (ry ? -LOCKER_D - 0.01 : LOCKER_D + 0.01) * 0); }
  const cork = (x, y, z, ry) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), M.cork); b.position.set(x, y, z); b.rotation.y = ry; scene.add(b); col.box(M.trim, x, y, z - Math.cos(ry) * 0.005, 1.14, 0.74, 0.01, ry); };
  cork(9.5, 2.45, 0.11, 0); // above the classroom door would clash; keep high on the frame side
  cork(4.0, 1.55, -8.89, 0); // (inside classroom, west of board)
  const extCab = (x, z, ry) => { col.box(M.red, x, 1.2, z, 0.3, 0.6, 0.14, ry); const g = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.5), M.glassTint); g.position.set(x + Math.sin(ry) * 0.075, 1.2, z + Math.cos(ry) * 0.075); g.rotation.y = ry; scene.add(g); const e = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 14), M.red); e.position.set(x, 1.15, z); scene.add(e); };
  extCab(9.65, -0.12, Math.PI); // classroom side of the wall, by the door
  extCab(22.6, 3.48, Math.PI); // hallway, right of the office door
  { const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.04), M.red); p.position.set(23.0, 1.25, 3.47); scene.add(p); }
  // water fountain
  col.box(M.steel, 20.9, 0.85, 0.33, 0.45, 0.12, 0.42); col.box(M.steel, 20.9, 0.55, 0.2, 0.2, 0.5, 0.15);
  // hallway clock
  const hallClock = makeClock(); hallClock.mesh.position.set(16.0, 2.55, 0.11); scene.add(hallClock.mesh); out.clocks.push(hallClock);
  // switches beside doors
  for (const d of DOORS) { const c = d.axis === 'x' ? [d.a0 - 0.2, 1.2, d.z + (d.z > 1 ? -T / 2 - 0.01 : T / 2 + 0.01)] : [d.x - T / 2 - 0.01, 1.2, d.a0 - 0.2]; col.box(M.white, c[0], c[1], c[2], d.axis === 'x' ? 0.07 : 0.015, 0.11, d.axis === 'x' ? 0.015 : 0.07); }
  // ---------- classroom ----------
  const deskTop = new THREE.BoxGeometry(0.64, 0.025, 0.48), leg = new THREE.CylinderGeometry(0.012, 0.012, 0.72, 6);
  for (const f of FURNITURE) {
    if (f.kind === 'desk') {
      const { cx, cz, rot } = f; const m = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz);
      const add = (g, mat, x, y, z, rx = 0) => col.add(g, mat, m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), one)));
      add(deskTop, M.wood, 0, 0.735, 0);
      for (const [a, b] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]]) add(leg, M.darkSteel, a, 0.36, b);
      add(new THREE.BoxGeometry(0.56, 0.12, 0.38), M.darkSteel, 0, 0.64, -0.02); // book box
      // chair behind the desk (facing the board, north)
      add(new THREE.BoxGeometry(0.4, 0.03, 0.38), M.plasticBlue, 0, 0.44, 0.48);
      add(new THREE.BoxGeometry(0.4, 0.3, 0.025), M.plasticBlue, 0, 0.72, 0.68, -0.12);
      for (const [a, b] of [[-0.17, 0.32], [0.17, 0.32], [-0.17, 0.64], [0.17, 0.64]]) add(new THREE.CylinderGeometry(0.01, 0.01, 0.44, 6), M.chrome, a, 0.22, b);
    }
  }
  col.box(M.woodDark, 9.8, 0.74, -8.12, 1.6, 0.04, 0.75); col.box(M.woodDark, 9.12, 0.37, -8.12, 0.3, 0.72, 0.7); col.box(M.woodDark, 10.48, 0.37, -8.12, 0.3, 0.72, 0.7);
  col.box(M.woodDark, 9.8, 0.4, -8.45, 1.0, 0.6, 0.03);
  { const b = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.35), M.board); b.position.set(13.2, 1.55, -8.89); scene.add(b); col.box(M.trim, 13.2, 0.86, -8.86, 4.7, 0.04, 0.08); col.box(M.white, 13.0, 0.89, -8.8, 0.15, 0.015, 0.02); }
  col.box(M.cabinet, 8.35, 0.6, -5.3, 0.48, 1.2, 2.18); col.box(M.cabinet, 17.65, 0.95, -7.9, 0.48, 1.9, 1.98);
  for (let k = 0; k < 4; k++) col.box(M.chrome, 8.6, 0.25 + k * 0.28, -5.3, 0.02, 0.02, 0.3);
  const classClock = makeClock(); classClock.mesh.position.set(16.5, 2.4, -8.89); scene.add(classClock.mesh); out.clocks.push(classClock);
  // exterior windows on the east wall, blinds down, night outside
  for (let k = 0; k < 3; k++) { const z = -7.5 + k * 2.6; const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshStandardMaterial({ map: TX.textCanvas(128, 128, (x, w, h) => { x.fillStyle = '#0c1220'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 6) { x.fillStyle = 'rgba(200,198,185,.75)'; x.fillRect(0, y, w, 4); } }), roughness: 0.6 })); w.position.set(17.89, 1.65, z); w.rotation.y = -Math.PI / 2; scene.add(w); col.box(M.trim, 17.88, 1.0, z, 0.06, 0.04, 1.7); }
  // ---------- janitor closet ----------
  for (let k = 0; k < 4; k++) col.box(M.steel, 4.0, 0.3 + k * 0.5, 6.48, 3.7, 0.03, 0.44);
  for (const x of [2.18, 5.82]) for (const z of [6.27, 6.69]) col.box(M.steel, x, 1.0, z, 0.03, 2.0, 0.03);
  for (let k = 0; k < 14; k++) { const x = 2.4 + R() * 3.2, y = 0.33 + (k % 4) * 0.5; if (R() < 0.5) col.mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 10), [M.plasticBlue, M.yellow, M.white, M.plasticOrange][k % 4], x, y + 0.12, 6.45); else col.box(M.box, x, y + 0.1, 6.45, 0.28, 0.2, 0.3); }
  col.box(M.white, 2.35, 0.82, 4.4, 0.48, 0.16, 0.78); col.box(M.white, 2.35, 0.4, 4.4, 0.1, 0.8, 0.1); col.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2), M.chrome, 2.25, 1.0, 4.4, 0, 0, 0.6);
  // mop bucket with wringer
  { const b = new THREE.Group(); const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.36, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8b31c, roughness: 0.4, side: THREE.DoubleSide })); bk.position.y = 0.26; b.add(bk); const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5 })); w.position.set(0.12, 0.5, 0); b.add(w); const water = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a5236, roughness: 0.05 })); water.position.y = 0.36; b.add(water); for (const s of [-1, 1]) for (const t of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.black); c.position.set(s * 0.17, 0.04, t * 0.17); b.add(c); } b.position.set(3.2, 0, 5.0); scene.add(b); }
  // tool rack: pegs plus a vacuum and a mop that read clearly as "take me"
  col.box(M.woodDark, 5.84, 1.25, 5.1, 0.04, 1.0, 1.7);
  out.rackVac = makeVacuumModel(); out.rackVac.root.position.set(5.68, 0.05, 4.7); out.rackVac.root.rotation.set(0, -Math.PI / 2, -0.12); scene.add(out.rackVac.root);
  out.rackMop = makeMopModel(); out.rackMop.root.position.set(5.72, 0.05, 5.6); out.rackMop.root.rotation.set(0, -Math.PI / 2, -0.08); scene.add(out.rackMop.root);
  out.interact.push({ kind: 'rack', x: TOOL_RACK.x, y: 1.0, z: TOOL_RACK.z });
  // ---------- maintenance office ----------
  col.box(M.woodDark, 26.25, 0.74, 5.6, 1.3, 0.04, 2.0); col.box(M.darkSteel, 26.25, 0.36, 4.75, 1.2, 0.72, 0.04); col.box(M.darkSteel, 26.25, 0.36, 6.45, 1.2, 0.72, 0.04);
  col.box(M.darkSteel, 26.6, 0.36, 5.6, 0.5, 0.72, 0.5);
  // the computer: a beige retro monitor whose screen is a live canvas
  { const mon = new THREE.Group(); const body = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.36, 0.38, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.5 })); mon.add(body);
    const sc = document.createElement('canvas'); sc.width = 320; sc.height = 240; const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.25), new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.9, roughness: 0.15 })); scr.position.set(0, 0.01, 0.191); mon.add(scr);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 16), body.material); base.position.y = -0.2; mon.add(base);
    mon.position.set(26.35, 0.98, 5.35); mon.rotation.y = -Math.PI / 2; scene.add(mon);
    out.screens.pc = { canvas: sc, tex: st };
    col.box(M.white, 25.95, 0.775, 5.35, 0.16, 0.02, 0.44); col.box(M.white, 25.95, 0.775, 5.75, 0.08, 0.02, 0.05);
    // CCTV monitor: shows a live camera render
    const cc = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.28, 0.3, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a2b2a, roughness: 0.5 })); cc.position.set(26.45, 0.94, 6.15); cc.rotation.y = -Math.PI / 2 + 0.25; scene.add(cc);
    out.cctvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff })); out.cctvScreen.position.set(0, 0.0, 0.151); cc.add(out.cctvScreen); }
  out.interact.push({ kind: 'computer', x: COMPUTER.x, y: 1.0, z: COMPUTER.z });
  // workbench + pegboard + vice
  col.box(M.wood, 23.7, 0.9, 9.57, 3.4, 0.05, 0.62); for (const x of [22.1, 25.3]) for (const z of [9.3, 9.84]) col.box(M.darkSteel, x, 0.45, z, 0.05, 0.9, 0.05);
  col.box(M.box, 23.7, 1.6, 9.88, 3.0, 1.0, 0.02);
  for (let k = 0; k < 10; k++) col.box(k % 3 ? M.darkSteel : M.red, 22.5 + k * 0.28, 1.5 + (k % 3) * 0.18, 9.85, 0.04, 0.22, 0.02);
  col.box(M.darkSteel, 25.0, 1.0, 9.55, 0.2, 0.12, 0.16);
  // cot
  col.box(M.darkSteel, 20.52, 0.3, 7.65, 0.8, 0.04, 2.0); for (const z of [6.7, 8.6]) for (const x of [20.17, 20.87]) col.box(M.darkSteel, x, 0.15, z, 0.03, 0.3, 0.03);
  col.box(M.cloth, 20.52, 0.37, 7.65, 0.74, 0.1, 1.92, 0, 0.03); col.box(M.blanket, 20.52, 0.44, 7.9, 0.76, 0.05, 1.3, 0, 0.02); col.box(M.white, 20.52, 0.46, 6.95, 0.5, 0.08, 0.32, 0, 0.03);
  out.interact.push({ kind: 'cot', x: COT.x, y: 0.5, z: COT.z });
  // steel shelving with supplies
  for (let k = 0; k < 4; k++) col.box(M.steel, 26.67, 0.3 + k * 0.52, 8.45, 0.44, 0.03, 2.48);
  for (let k = 0; k < 10; k++) col.box(M.box, 26.67, 0.45 + (k % 4) * 0.52, 7.4 + (k * 0.47) % 2.2, 0.38, 0.26, 0.4);
  const officeClock = makeClock(); officeClock.mesh.position.set(23.5, 2.25, 9.89); officeClock.mesh.rotation.y = Math.PI; scene.add(officeClock.mesh); out.clocks.push(officeClock);
  // the contract, pinned beside the door
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: TX.textCanvas(300, 400, (x, w, h) => { x.fillStyle = '#f0ece0'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d1d1d'; x.font = 'bold 18px Courier'; x.fillText('NIGHT CREW CONTRACT', 20, 40); x.font = '14px Courier'; const L = ['Prepare Blackbriar High', 'for reopening.', '', 'Pay: per item removed', 'and per area restored.', '', 'YOU MUST BE INSIDE THIS', 'OFFICE, WITH THE BOLT', 'ENGAGED, BEFORE 4:00 AM.', '', 'Do not answer the', 'attendance announcements.', '', '  - Halberd Facilities']; L.forEach((l, i) => { x.fillStyle = i >= 6 && i <= 8 ? '#a11' : '#222'; x.fillText(l, 20, 80 + i * 20); }); }), roughness: 0.9 }));
    p.position.set(20.6, 1.5, 3.72); scene.add(p); }
  // ---------- service corridor + storage ----------
  for (const z of [-5.5, 11.5]) {} // (endcaps are walls)
  for (const [y, zz] of [[2.45, 0], [2.3, 0.15]]) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - zz * 0.15, 0.06 - zz * 0.15, 18, 10).rotateX(Math.PI / 2), M.pipe); pipe.position.set(43.6 - zz, y, 3); scene.add(pipe); }
  { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 39, 6).rotateZ(Math.PI / 2), M.darkSteel); c.position.set(20, 2.75, 0.15); scene.add(c); }
  for (let k = 0; k < 6; k++) col.box(M.plasticOrange, 43.2, 0.45 + k * 0.12, -1.9, 0.45, 0.04, 0.45);
  for (const z of [7.62, 9.92]) { for (let k = 0; k < 4; k++) col.box(M.steel, 47, 0.25 + k * 0.6, z, 4.0, 0.03, 0.45); for (let k = 0; k < 12; k++) col.box(M.box, 45.3 + (k % 6) * 0.65, 0.4 + Math.floor(k / 6) * 0.6, z, 0.5, 0.3, 0.4); }
  col.box(M.box, 40.6, 0.3, 8.7, 0.7, 0.6, 0.6); col.box(M.box, 40.6, 0.75, 9.2, 0.6, 0.4, 0.5);
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), M.grille); g.position.set(VENT.x, VENT.y, VENT.z); scene.add(g); out.vent = g; }
  out.interact.push({ kind: 'vent', x: VENT.x, y: VENT.y, z: VENT.z + 0.3 });
  // stage chairs and a broken desk leaning in the corridor for line-of-sight breaks
  col.box(M.wood, 41.0, 0.6, -4.0, 0.7, 0.04, 0.5, 0.6);
  // ---------- bins (emptying points) ----------
  for (const b of BINS) { const g = new THREE.Group(); const can = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.72, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a5e46, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide })); can.position.y = 0.36; g.add(can); const liner = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16).rotateX(-Math.PI / 2), M.black); liner.position.y = 0.55; g.add(liner); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 6, 20).rotateX(Math.PI / 2), M.darkSteel); rim.position.y = 0.72; g.add(rim); g.position.set(b.x, 0, b.z); scene.add(g); out.interact.push({ kind: 'bin', id: b.id, x: b.x, y: 0.7, z: b.z }); }
  // ---------- athletics floor ----------
  buildAthletics(scene, col, M, std, out);
  // bucket in the closet: rinse the mop here; the teacher's desk can be searched
  out.interact.push({ kind: 'bucket', x: BUCKET.x, y: 0.4, z: BUCKET.z });
  out.interact.push({ kind: 'desk', x: TEACHER_DESK.x, y: 0.7, z: TEACHER_DESK.z });
  // ---------- interactables for doors ----------
  for (const d of DOORS) { const c = d.axis === 'x' ? { x: (d.a0 + d.a1) / 2, z: d.z } : { x: d.x, z: (d.a0 + d.a1) / 2 }; out.interact.push({ kind: 'door', id: d.id, x: d.id === 'd_office' ? 21.3 : c.x, y: d.y + 1.05, z: c.z }); }
  out.interact.push({ kind: 'bolt', x: 21.85, y: 1.32, z: 3.72 });

  col.finish(scene);
  out.bake = BAKE; out.M = M;
  return out;
}

// wall clock with a canvas face (the game updates it to the shift time)
export function makeClock() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 })); face.position.z = 0.03; g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 8, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 })); rim.position.z = 0.03; g.add(rim);
  const draw = (min) => { const x = c.getContext('2d'); x.fillStyle = '#f2efe6'; x.fillRect(0, 0, 128, 128); x.translate(64, 64); x.strokeStyle = '#222';
    for (let i = 0; i < 12; i++) { x.save(); x.rotate(i * Math.PI / 6); x.lineWidth = i % 3 ? 2 : 4; x.beginPath(); x.moveTo(0, -54); x.lineTo(0, -46); x.stroke(); x.restore(); }
    const h = (min / 60) % 12, m = min % 60; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.sin(h / 12 * 6.283) * 28, -Math.cos(h / 12 * 6.283) * 28); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.sin(m / 60 * 6.283) * 44, -Math.cos(m / 60 * 6.283) * 44); x.stroke(); x.setTransform(1, 0, 0, 1, 0, 0); t.needsUpdate = true; };
  draw(22 * 60);
  return { mesh: g, draw, last: -1 };
}
// ---------- tool models (shared by the rack, the first-person view and remote players) ----------
export function makeVacuumModel() {
  // cordless stick vacuum: motor pod + clear bin + grip at the top, 1 m wand, floor head at the bottom (origin = floor head)
  const root = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x7ac142, roughness: 0.35, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2322, roughness: 0.45, metalness: 0.2 });
  const head = new THREE.Group(); root.add(head);
  const hb = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.06, 0.13, 3, 0.02), dark); hb.position.y = 0.035; head.add(hb);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.02), green); stripe.position.set(0, 0.065, 0.055); head.add(stripe);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.27, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a6a2a, roughness: 0.9 })); brush.position.set(0, 0.022, 0.04); head.add(brush);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10), dark); neck.position.set(0, 0.09, -0.03); neck.rotation.x = -0.6; head.add(neck);
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1, 10), new THREE.MeshStandardMaterial({ color: 0xb8bcbb, roughness: 0.25, metalness: 0.9 })); root.add(wand);
  const pod = new THREE.Group(); root.add(pod);
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 18, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xe8f0f0, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); bin.rotation.x = Math.PI / 2; bin.position.z = 0.02; pod.add(bin);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.95 })); fill.rotation.x = Math.PI / 2; fill.position.z = 0.02; fill.scale.set(1, 0.001, 1); pod.add(fill);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 18), green); motor.rotation.x = Math.PI / 2; motor.position.z = 0.17; pod.add(motor);
  const vent = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 18), dark); vent.position.z = 0.23; pod.add(vent);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20, Math.PI * 1.2), dark); grip.rotation.set(0, Math.PI / 2, Math.PI * 0.9); grip.position.set(0, 0.07, 0.16); pod.add(grip);
  const batt = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.1, 0.07, 2, 0.01), dark); batt.position.set(0, -0.07, 0.17); pod.add(batt);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.03), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x44ff44, emissiveIntensity: 0 })); led.position.set(0, 0.06, 0.12); pod.add(led);
  // default pose: standing upright, pod at ~1 m
  const setPose = (headPos, podPos) => { // both in root-local space
    head.position.copy(headPos); pod.position.copy(podPos);
    const a = new THREE.Vector3(headPos.x, headPos.y + 0.09, headPos.z), b = podPos.clone().add(new THREE.Vector3(0, -0.02, -0.08));
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    wand.position.copy(mid); wand.scale.set(1, len, 1); wand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    pod.lookAt(root.localToWorld(a.clone()).add(new THREE.Vector3(0, 0, 0)));
  };
  head.position.set(0, 0, 0); pod.position.set(0, 1.0, -0.15);
  const a = new THREE.Vector3(0, 0.09, 0), b = new THREE.Vector3(0, 0.98, -0.23); wand.position.copy(a.clone().add(b).multiplyScalar(0.5)); wand.scale.y = a.distanceTo(b); wand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  pod.rotation.x = -Math.PI / 2 + 0.25;
  return { root, head, wand, pod, fill, led, brush, green };
}
export function makeMopModel() {
  const root = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.35, metalness: 0.4 })); handle.position.y = 0.72; root.add(handle);
  const head = new THREE.Group(); root.add(head);
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.4 })); clamp.position.y = 0.06; head.add(clamp);
  const strandMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d2, roughness: 0.95 });
  const strands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.006, 0.18, 4), strandMat, 70); const m = new THREE.Matrix4(); const r = rng(2);
  for (let i = 0; i < 70; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 0.1; m.compose(new THREE.Vector3(Math.cos(a) * d * 0.4, 0.02, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 1.1 * d * 10, 0, -Math.cos(a) * 1.1 * d * 10)), new THREE.Vector3(1, 0.6 + r() * 0.5, 1)); strands.setMatrixAt(i, m); }
  head.add(strands);
  return { root, head, handle, strands, strandMat };
}

// ======================= athletics floor props =======================
function buildAthletics(scene, col, M, std, out) {
  const Y = -4;
  // court lines over the maple floor
  const lines = TX.textCanvas(2048, 1400, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(250,250,250,.9)'; x.lineWidth = 8; const sx = w / 23.6, sz = h / 16.9;
    x.strokeRect(1 * sx, 1 * sz, 21.6 * sx, 14.9 * sz); x.beginPath(); x.moveTo(11.8 * sx, 1 * sz); x.lineTo(11.8 * sx, 15.9 * sz); x.stroke(); x.beginPath(); x.arc(11.8 * sx, 8.45 * sz, 1.8 * sx, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(160,30,40,.85)'; for (const cx of [1, 22.6]) { x.beginPath(); x.arc(cx * sx, 8.45 * sz, 6.75 * sx, cx < 5 ? -Math.PI / 2 : Math.PI / 2, cx < 5 ? Math.PI / 2 : Math.PI * 1.5); x.stroke(); }
    x.fillStyle = 'rgba(120,28,36,.85)'; x.font = 'bold 120px Arial'; x.textAlign = 'center'; x.fillText('BOBCATS', w / 2, h / 2 + 40); });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(23.6, 16.9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lines, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1 }));
  lm.position.set(-28, Y + 0.002, -2.45); scene.add(lm);
  // bleachers: stepped rows along the north wall
  for (let k = 0; k < 5; k++) { col.box(M.woodDark, -28, Y + 0.2 + k * 0.38, -11.25 - k * 0.55, 21, 0.06, 0.5); col.box(M.darkSteel, -28, Y + 0.1 + k * 0.38, -11.3 - k * 0.55, 21, 0.2 + k * 0.38 * 0, 0.05); }
  for (let k = 0; k < 5; k++) col.box(M.darkSteel, -28, Y + (k * 0.38) / 2 + 0.1, -11.25 - k * 0.55, 21, k * 0.38 + 0.2, 0.04);
  // hoops on both end walls
  for (const [x, dir] of [[-39.7, 1], [-16.3, -1]]) { col.box(M.steel, x + dir * 0.5, Y + 3.0, -5.5, 1.0, 0.08, 0.08); col.box(M.white, x + dir * 1.0, Y + 3.3, -5.5, 0.04, 1.05, 1.8); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 6, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd2501c, metalness: 0.6, roughness: 0.4 })); rim.position.set(x + dir * 1.28, Y + 3.05, -5.5); scene.add(rim); const net = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, wireframe: true })); net.position.set(x + dir * 1.28, Y + 2.84, -5.5); scene.add(net); }
  // mats, ball cart, scoreboard
  col.box(M.plasticBlue, -36, Y + 0.3, 4.15, 4, 0.6, 3.3, 0, 0.04);
  col.box(M.darkSteel, -18, Y + 0.5, 4.0, 1.2, 0.04, 0.8); for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), M.plasticOrange); b.position.set(-18.45 + (k % 5) * 0.22, Y + 0.65 + Math.floor(k / 5) * 0.2, 3.85 + (k % 2) * 0.25); scene.add(b); }
  { const sb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshStandardMaterial({ map: TX.textCanvas(512, 224, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#d33'; x.font = 'bold 30px monospace'; x.fillText('HOME', 40, 50); x.fillText('GUEST', 360, 50); x.font = 'bold 70px monospace'; x.fillText('14', 50, 130); x.fillText('00', 370, 130); x.fillStyle = '#fc3'; x.font = 'bold 44px monospace'; x.fillText('00:00', 190, 200); }), emissive: 0xffffff, emissiveIntensity: 0.25 })); sb.position.set(-28, Y + 5.2, -13.89); scene.add(sb); }
  // locker room: blue lockers, benches, sinks and mirror
  const blue = std({ color: 0x2c5a8c, roughness: 0.45, metalness: 0.35 });
  for (let x = -25.7; x < -16.6; x += 0.4) col.box(blue, x + 0.2, Y + 0.95, 6.7, 0.38, 1.9, 0.48);
  for (let x = -25.7; x < -18.6; x += 0.4) col.box(blue, x + 0.2, Y + 0.95, 15.57, 0.38, 1.9, 0.5);
  for (const z of [10.2, 13.2]) { col.box(M.wood, -21, Y + 0.43, z, 6, 0.05, 0.36); for (const x of [-23.6, -21, -18.4]) col.box(M.darkSteel, x, Y + 0.2, z, 0.05, 0.4, 0.3); }
  for (const z of [12.2, 13.4, 14.6]) { col.box(M.white, -16.35, Y + 0.85, z, 0.4, 0.15, 0.5); }
  { const mir = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x9aa8ad, metalness: 1, roughness: 0.05 })); mir.position.set(-16.12, Y + 1.6, 13.4); mir.rotation.y = -Math.PI / 2; scene.add(mir); }
  // the natatorium: basin, water, lane ropes, ladders, lifeguard chair
  const B = POOL_BASIN, tile = std({ map: TX.vctChecker([230, 236, 240], [70, 140, 190], 22).map, roughness: 0.25 });
  const bx = (B.x0 + B.x1) / 2, bz = (B.z0 + B.z1) / 2, bw = B.x1 - B.x0, bd = B.z1 - B.z0;
  col.box(tile, bx, Y - B.depth, bz, bw, 0.05, bd);
  for (const [x, z, sx, sz] of [[bx, B.z0, bw, 0.05], [bx, B.z1, bw, 0.05], [B.x0, bz, 0.05, bd], [B.x1, bz, 0.05, bd]]) col.box(tile, x, Y - B.depth / 2, z, sx, B.depth, sz);
  for (const [x, z, sx, sz] of [[bx, B.z0 - 0.15, bw + 0.6, 0.3], [bx, B.z1 + 0.15, bw + 0.6, 0.3], [B.x0 - 0.15, bz, 0.3, bd], [B.x1 + 0.15, bz, 0.3, bd]]) col.box(M.white, x, Y + 0.02, z, sx, 0.05, sz);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e7f9a, transparent: true, opacity: 0.72, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.4, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }));
  water.position.set(bx, B.water, bz); scene.add(water); out.water = water;
  for (let k = 1; k < 5; k++) { const z = B.z0 + k * bd / 5; const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, bw, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xd23c3c : 0x2c62c8, roughness: 0.5 })); rope.position.set(bx, B.water + 0.03, z); scene.add(rope); }
  for (const z of [B.z0 + 0.6, B.z1 - 0.6]) for (const s of [-0.2, 0.2]) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 6, 16, Math.PI), M.chrome); l.position.set(B.x1 + 0.05, Y + 0.2, z + s); l.rotation.y = Math.PI / 2; scene.add(l); }
  col.box(M.white, -28.85, Y + 1.1, 15.1, 0.6, 0.05, 0.6); for (const [a, b] of [[-29.1, 14.85], [-28.6, 14.85], [-29.1, 15.35], [-28.6, 15.35]]) col.box(M.white, a, Y + 0.55, b, 0.05, 1.1, 0.05); col.box(M.white, -28.85, Y + 1.5, 15.38, 0.6, 0.8, 0.05);
  { const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: TX.textCanvas(512, 160, (x, w, h) => { x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#b11'; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.fillText('NO RUNNING', w / 2, 70); x.fillStyle = '#123'; x.font = '30px Arial'; x.fillText('POOL CLOSED 6/11/98', w / 2, 125); }), roughness: 0.7 })); sign.position.set(-36, Y + 2.2, 23.89); sign.rotation.y = Math.PI; scene.add(sign); }
}
function waterNormal() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = Math.sin(i / N * 6.283 * 3 + Math.sin(j / N * 6.283 * 2) * 1.5), b = Math.cos(j / N * 6.283 * 4 + Math.sin(i / N * 6.283 * 3)); const k = (j * N + i) * 4; img.data[k] = 128 + a * 50; img.data[k + 1] = 128 + b * 50; img.data[k + 2] = 255; img.data[k + 3] = 255; }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}
// ======================= janitor cart and robot vacuum =======================
export function makeCartModel() {
  const g = new THREE.Group(), grey = new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: 0.5, metalness: 0.3 }), yel = new THREE.MeshStandardMaterial({ color: 0xe0b51e, roughness: 0.4 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.5), grey); frame.position.y = 0.2; g.add(frame);
  const top = frame.clone(); top.position.y = 0.85; g.add(top);
  for (const [x, z] of [[-0.48, -0.23], [0.48, -0.23], [-0.48, 0.23], [0.48, 0.23]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7), grey); p.position.set(x, 0.53, z); g.add(p); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x111111 })); w.position.set(x, 0.05, z); g.add(w); }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5).rotateX(Math.PI / 2), grey); handle.position.set(-0.52, 0.98, 0); g.add(handle);
  // trash bag hoop on one end, mop bucket with wringer on the other
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 14), new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.65 })); bag.position.set(0.25, 0.57, 0); g.add(bag);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe0b51e, roughness: 0.4, side: THREE.DoubleSide })); bucket.position.set(-0.25, 0.37, 0); g.add(bucket);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5b5638, roughness: 0.05 })); water.position.set(-0.25, 0.48, 0); g.add(water);
  const wring = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), yel); wring.position.set(-0.25, 0.56, 0.12); g.add(wring);
  const spray = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x2c8ad8 })); spray.position.set(0.35, 0.98, 0.12); g.add(spray);
  return g;
}
export function makeRoombaModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.35, metalness: 0.2 })); body.position.y = 0.05; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.01, 28), new THREE.MeshStandardMaterial({ color: 0x5d6064, roughness: 0.2, metalness: 0.6 })); lid.position.y = 0.095; g.add(lid);
  const bump = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111 })); bump.rotation.x = Math.PI / 2; bump.position.y = 0.04; g.add(bump);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 2 })); led.position.set(0, 0.1, -0.08); g.add(led);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 3), new THREE.MeshStandardMaterial({ color: 0x777777 })); brush.position.set(0.12, 0.01, -0.1); g.add(brush);
  g.userData = { led, brush };
  return g;
}
