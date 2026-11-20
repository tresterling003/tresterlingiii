// The old town: tall half-timbered townhouses shoulder to shoulder along cobbled streets.
// Every house is a few painted quads; a whole quarter is merged into a handful of meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './world.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const T = 256; // atlas tile size, 4×4 tiles
const PLASTER = ['#fff3d8', '#f4cf88', '#cfe0f2', '#f4c6bc', '#ffffff', '#d6ecd2', '#f6e6a0', '#e0d2ee'].map(c => new THREE.Color(c));
const ROOFS = ['#6a7480', '#b0533a', '#6e4c3c'].map(c => new THREE.Color(c));
const SHUTTERS = ['#3a6a9a', '#4a7a4a', '#9a3a32', '#2f7a7a'];

// ---------------------------------------------------------------- painted textures
function paintAtlas() {
  const c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = c.height = e.width = e.height = 1024;
  const g = c.getContext('2d'), k = e.getContext('2d'), R = rng(77);
  k.fillStyle = '#000'; k.fillRect(0, 0, 1024, 1024);
  const at = (col, row) => [col * T, row * T];
  const plaster = (x, y) => {
    g.fillStyle = '#f3eee4'; g.fillRect(x, y, T, T);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,100,70' : '255,255,255'},${0.03 + R() * 0.05})`; g.fillRect(x + R() * T, y + R() * T, 2 + R() * 7, 2 + R() * 7); }
  };
  const beam = (x, y, w, h) => { g.fillStyle = '#3c2616'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,220,170,.08)'; g.fillRect(x, y, w, Math.min(2, h)); };
  const brace = (x1, y1, x2, y2) => { g.strokeStyle = '#3c2616'; g.lineWidth = 11; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const stone = (x, y, tone = 0) => {
    g.fillStyle = '#5a544c'; g.fillRect(x, y, T, T);
    for (let r = 0; r < 10; r++) for (let q = -1; q < 6; q++) {
      const v = 0.82 + R() * 0.3 + tone, bw = 46 + R() * 14, ox = (r % 2) * 25;
      g.fillStyle = `rgb(${150 * v | 0},${142 * v | 0},${130 * v | 0})`;
      g.fillRect(x + q * 52 + ox + 2, y + r * 26 + 2, bw - 4, 22);
    }
  };
  const window_ = (x, y, w, h, shutter, glow = true) => {
    g.fillStyle = '#2e2016'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#5a7890'); gr.addColorStop(0.5, '#24323e'); gr.addColorStop(1, '#3a5266');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x + 6, y + h * 0.6); g.lineTo(x + w * 0.45, y + 6); g.lineTo(x + w * 0.62, y + 6); g.lineTo(x + 14, y + h * 0.8); g.fill();
    g.fillStyle = '#2e2016'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.45, w, 6);
    g.fillStyle = '#4a3424'; g.fillRect(x - 10, y + h + 4, w + 20, 9); // sill
    if (shutter) for (const sx of [x - 6 - 30, x + w + 6]) {
      g.fillStyle = shutter; g.fillRect(sx, y - 6, 30, h + 12);
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < h + 12; i += 9) g.fillRect(sx + 3, y - 6 + i, 24, 3);
    }
    if (glow) { k.fillStyle = '#ffcf7a'; k.fillRect(x, y, w, h); k.fillStyle = '#000'; k.fillRect(x + w / 2 - 3, y, 6, h); k.fillRect(x, y + h * 0.45, w, 6); }
  };
  // row 0: upper-floor bays, timber framing in four patterns
  for (let v = 0; v < 4; v++) {
    const [x, y] = at(v, 0);
    plaster(x, y);
    beam(x, y, T, 14); beam(x, y + T - 14, T, 14); beam(x, y, 12, T); beam(x + T - 12, y, 12, T);
    if (v === 0) { brace(x + 12, y + T - 14, x + 60, y + 180); brace(x + T - 12, y + T - 14, x + T - 60, y + 180); }
    if (v === 1) { beam(x + 50, y, 10, T); beam(x + T - 60, y, 10, T); }
    if (v === 2) { brace(x + 12, y + 14, x + 56, y + T - 14); brace(x + T - 12, y + 14, x + T - 56, y + T - 14); }
    if (v === 3) { beam(x, y + 128, 60, 10); beam(x + T - 60, y + 128, 60, 10); }
    window_(x + 84, y + 52, 88, 128, SHUTTERS[v]);
  }
  // row 1: ground-floor bays in stone: a door, a shop window, small windows, an arch
  { const [x, y] = at(0, 1); stone(x, y);
    g.fillStyle = '#3a2618'; g.beginPath(); g.moveTo(x + 70, y + T); g.lineTo(x + 70, y + 90); g.arc(x + 128, y + 90, 58, Math.PI, 0); g.lineTo(x + 186, y + T); g.fill();
    g.fillStyle = '#6a4428'; g.beginPath(); g.moveTo(x + 80, y + T); g.lineTo(x + 80, y + 94); g.arc(x + 128, y + 94, 48, Math.PI, 0); g.lineTo(x + 176, y + T); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 92; i < 176; i += 16) g.fillRect(x + i, y + 60, 3, T - 60);
    g.fillStyle = '#2a2a2e'; g.fillRect(x + 84, y + 120, 88, 8); g.fillRect(x + 84, y + 200, 88, 8); g.beginPath(); g.arc(x + 160, y + 170, 6, 0, 7); g.fill();
    g.fillStyle = '#ffd890'; g.fillRect(x + 116, y + 70, 24, 18); k.fillStyle = '#ffcf7a'; k.fillRect(x + 116, y + 70, 24, 18); }
  { const [x, y] = at(1, 1); stone(x, y, 0.05);
    window_(x + 30, y + 64, 196, 140, null);
    g.fillStyle = 'rgba(0,0,0,.6)'; for (let i = 1; i < 4; i++) g.fillRect(x + 30 + i * 49, y + 64, 3, 140);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2ead8' : '#b83a30'; g.beginPath(); g.moveTo(x + 18 + i * 27.5, y + 20); g.lineTo(x + 45 + i * 27.5, y + 20); g.lineTo(x + 45 + i * 27.5, y + 52); g.lineTo(x + 18 + i * 27.5, y + 46); g.fill(); } }
  { const [x, y] = at(2, 1); stone(x, y, -0.04); window_(x + 40, y + 80, 62, 90, null); window_(x + 154, y + 80, 62, 90, null); }
  { const [x, y] = at(3, 1); stone(x, y, 0.02);
    g.fillStyle = '#2e2016'; g.beginPath(); g.moveTo(x + 84, y + 200); g.lineTo(x + 84, y + 110); g.arc(x + 128, y + 110, 44, Math.PI, 0); g.lineTo(x + 172, y + 200); g.fill();
    g.fillStyle = '#2a3a48'; g.beginPath(); g.moveTo(x + 92, y + 196); g.lineTo(x + 92, y + 112); g.arc(x + 128, y + 112, 36, Math.PI, 0); g.lineTo(x + 164, y + 196); g.fill();
    k.fillStyle = '#ffcf7a'; k.beginPath(); k.moveTo(x + 92, y + 196); k.lineTo(x + 92, y + 112); k.arc(x + 128, y + 112, 36, Math.PI, 0); k.lineTo(x + 164, y + 196); k.fill(); }
  // row 2: plain walls for sides and backs, dark wood, plain stone
  { const [x, y] = at(0, 2); plaster(x, y); beam(x, y, T, 14); beam(x, y + T - 14, T, 14); beam(x, y, 12, T); beam(x + T - 12, y, 12, T); beam(x + 122, y, 12, T); }
  { const [x, y] = at(1, 2); plaster(x, y); beam(x, y, T, 14); beam(x, y + T - 14, T, 14); beam(x, y, 12, T); beam(x + T - 12, y, 12, T); window_(x + 98, y + 70, 60, 84, null); }
  { const [x, y] = at(2, 2); g.fillStyle = '#3c2616'; g.fillRect(x, y, T, T); g.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 0; i < T; i += 32) g.fillRect(x, y + i, T, 4); }
  { const [x, y] = at(3, 2); stone(x, y, -0.06); }
  // row 3: a gable end with a little round window
  { const [x, y] = at(0, 3); plaster(x, y); beam(x, y + T - 14, T, 14); beam(x + 122, y, 12, T);
    g.fillStyle = '#2e2016'; g.beginPath(); g.arc(x + 128, y + 150, 30, 0, 7); g.fill(); g.fillStyle = '#2a3a48'; g.beginPath(); g.arc(x + 128, y + 150, 22, 0, 7); g.fill();
    k.fillStyle = '#ffcf7a'; k.beginPath(); k.arc(x + 128, y + 150, 22, 0, 7); k.fill(); }
  const tex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: tex(c), glow: tex(e) };
}
function paintTiles(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(kind === 'roof' ? 5 : 9);
  if (kind === 'roof') {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let q = -1; q < 9; q++) {
      const v = 200 + R() * 55 | 0, ox = (r % 2) * 16;
      g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.moveTo(q * 32 + ox + 1, r * 32); g.lineTo(q * 32 + ox + 31, r * 32); g.lineTo(q * 32 + ox + 31, r * 32 + 26); g.quadraticCurveTo(q * 32 + ox + 16, r * 32 + 33, q * 32 + ox + 1, r * 32 + 26); g.fill();
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(q * 32 + ox, r * 32 + 28, 32, 4);
    }
  } else {
    g.fillStyle = '#4a443e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 230; i++) {
      const x = R() * 256, y = R() * 256, rr = 7 + R() * 7, v = 0.75 + R() * 0.4;
      for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
        g.fillStyle = `rgb(${142 * v | 0},${134 * v | 0},${124 * v | 0})`; g.beginPath(); g.ellipse(x + dx, y + dy, rr, rr * 0.8, R() * 3, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(x + dx - 2, y + dy - 2, rr * 0.5, rr * 0.35, 0, 0, 7); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- geometry
class Builder {
  constructor() { this.p = []; this.uv = []; this.c = []; this.i = []; }
  quad(a, b, c, d, uv, col) { // a b c d: counter-clockwise seen from the front
    const n = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v.x, v.y, v.z);
    this.uv.push(...uv);
    for (let k = 0; k < 4; k++) this.c.push(col.r, col.g, col.b);
    this.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  tri(a, b, c, uv, col) {
    const n = this.p.length / 3;
    for (const v of [a, b, c]) this.p.push(v.x, v.y, v.z);
    this.uv.push(...uv);
    for (let k = 0; k < 3; k++) this.c.push(col.r, col.g, col.b);
    this.i.push(n, n + 1, n + 2);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
const M = 0.004; // keep away from tile edges
const tileUV = (col, row) => { const u0 = col / 4 + M, u1 = (col + 1) / 4 - M, v0 = 1 - (row + 1) / 4 + M, v1 = 1 - row / 4 - M; return [u0, v0, u1, v0, u1, v1, u0, v1]; };

// Build every townhouse of a settlement plan. Returns nothing; adds meshes, physics and doors to the scenery.
export function buildTownhouses(sc, plan, s) {
  const rows = plan.rows || [];
  if (!rows.length) return;
  const atlas = paintAtlas(), roofT = paintTiles('roof'), cobT = paintTiles('cobble');
  const facadeMat = new THREE.MeshLambertMaterial({ map: atlas.map, vertexColors: true, emissiveMap: atlas.glow, emissive: new THREE.Color(0xffb860), emissiveIntensity: 0 });
  const roofMat = new THREE.MeshLambertMaterial({ map: roofT, vertexColors: true });
  sc.townMat = facadeMat;
  const quarters = new Map(), Q = (x, z) => { const k = (x > s.x ? 1 : 0) + (z > s.z ? 2 : 0); if (!quarters.has(k)) quarters.set(k, { f: new Builder(), r: new Builder(), deco: [], cx: 0, cz: 0, n: 0 }); return quarters.get(k); };
  const white = new THREE.Color(1, 1, 1), stoneCol = new THREE.Color(0.96, 0.94, 0.9), wood = new THREE.Color(1, 1, 1);
  const flowerCols = [0xe8506e, 0xf2c94c, 0xc86ae8, 0xf28a3c, 0xff6a50, 0xfafafa].map(c => new THREE.Color(c));
  const leaf = new THREE.Color(0x4a8a3a), boxCol = new THREE.Color(0x6a4428), potCol = new THREE.Color(0xa85a3a);
  const deco = (geo, col, list) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); list.push(geo.index ? geo.toNonIndexed() : geo); };

  rows.forEach((h, idx) => {
    const R = rng(h.seed + 1), q = Q(h.x, h.z), B = q.f, RB = q.r;
    q.cx += h.x; q.cz += h.z; q.n++;
    const y0 = sc.h(h.x, h.z) - 0.1, F = V3(Math.sin(h.rot), 0, Math.cos(h.rot)), L = V3(Math.cos(h.rot), 0, -Math.sin(h.rot));
    const C = V3(h.x, y0, h.z), P = (l, f, y) => C.clone().addScaledVector(L, l).addScaledVector(F, f).setY(y0 + y);
    const w = h.w, d = h.d, gH = 3.9, fH = 3.2, up = h.floors - 1, j = 0.55, top = gH + up * fH;
    const nb = Math.max(1, Math.round(w / 3.0)), bw = w / nb, doorBay = Math.floor(nb / 2);
    const tint = PLASTER[h.tint];
    // ground floor, front
    for (let k = 0; k < nb; k++) {
      const l0 = -w / 2 + k * bw, l1 = l0 + bw;
      const tile = k === doorBay ? 0 : h.role ? 1 : [1, 2, 3, 2][(h.seed >> (k + 2)) & 3];
      B.quad(P(l0, d / 2, 0), P(l1, d / 2, 0), P(l1, d / 2, gH), P(l0, d / 2, gH), tileUV(tile, 1), stoneCol);
    }
    // upper floors jut out over the street
    for (let f = 0; f < up; f++) for (let k = 0; k < nb; k++) {
      const l0 = -w / 2 + k * bw, l1 = l0 + bw, yb = gH + f * fH;
      B.quad(P(l0, d / 2 + j, yb), P(l1, d / 2 + j, yb), P(l1, d / 2 + j, yb + fH), P(l0, d / 2 + j, yb + fH), tileUV((h.bay + (k % 2) * (f % 2 ? 2 : 1)) % 4, 0), tint);
      if (R() < (f === 0 ? 0.55 : 0.3)) { // a flower box under the window
        const bx = C.clone().addScaledVector(L, (l0 + l1) / 2).addScaledVector(F, d / 2 + j + 0.25).setY(y0 + yb + fH * 0.2);
        const box = new THREE.BoxGeometry(bw * 0.42, 0.3, 0.4); box.rotateY(h.rot); box.translate(bx.x, bx.y, bx.z); deco(box, boxCol, q.deco);
        for (let m = 0; m < 5; m++) { const b = new THREE.IcosahedronGeometry(0.2 + R() * 0.1, 0); const o = (m - 2) * bw * 0.085; b.translate(bx.x + L.x * o + F.x * 0.05, bx.y + 0.28 + R() * 0.12, bx.z + L.z * o + F.z * 0.05); deco(b, m % 2 ? leaf : flowerCols[Math.floor(R() * flowerCols.length)], q.deco); }
      }
    }
    // underside of the jetty
    if (up > 0) B.quad(P(-w / 2, d / 2, gH), P(w / 2, d / 2, gH), P(w / 2, d / 2 + j, gH), P(-w / 2, d / 2 + j, gH), tileUV(2, 2), wood);
    // sides and back
    const nd = Math.max(1, Math.round(d / 3.2)), dd = d / nd;
    for (const sd of [-1, 1]) {
      for (let k = 0; k < nd; k++) {
        const f0 = d / 2 - k * dd, f1 = f0 - dd;
        const A = sd > 0 ? [f0, f1] : [f1, f0];
        B.quad(P(sd * w / 2, A[0], 0), P(sd * w / 2, A[1], 0), P(sd * w / 2, A[1], gH), P(sd * w / 2, A[0], gH), tileUV(3, 2), stoneCol);
        for (let f = 0; f < up; f++) { const yb = gH + f * fH, ext = k === 0 ? j : 0, a0 = sd > 0 ? f0 + ext : f1, a1 = sd > 0 ? f1 : f0 + ext; B.quad(P(sd * w / 2, a0, yb), P(sd * w / 2, a1, yb), P(sd * w / 2, a1, yb + fH), P(sd * w / 2, a0, yb + fH), tileUV(k % 2, 2), tint); }
      }
    }
    for (let k = 0; k < nb; k++) {
      const l1 = -w / 2 + k * bw, l0 = l1 + bw;
      B.quad(P(l0, -d / 2, 0), P(l1, -d / 2, 0), P(l1, -d / 2, gH), P(l0, -d / 2, gH), tileUV(3, 2), stoneCol);
      for (let f = 0; f < up; f++) { const yb = gH + f * fH; B.quad(P(l0, -d / 2, yb), P(l1, -d / 2, yb), P(l1, -d / 2, yb + fH), P(l0, -d / 2, yb + fH), tileUV(1, 2), tint); }
    }
    // roof
    const rc = ROOFS[h.roof], o = 0.45, fr = d / 2 + j + o, bk = -d / 2 - o, rr = (s2, len) => [0, 0, len / 3, 0, len / 3, s2 / 3, 0, s2 / 3];
    if (!h.gable) {
      const rh = (d + j) * 0.55, ridgeF = j / 2, wl = w / 2 + 0.04;
      const slopeF = Math.hypot(fr - ridgeF, rh), slopeB = Math.hypot(ridgeF - bk, rh);
      RB.quad(P(-wl, fr, top), P(wl, fr, top), P(wl, ridgeF, top + rh), P(-wl, ridgeF, top + rh), rr(slopeF, w), rc);
      RB.quad(P(wl, bk, top), P(-wl, bk, top), P(-wl, ridgeF, top + rh), P(wl, ridgeF, top + rh), rr(slopeB, w), rc);
      for (const sd of [-1, 1]) { const a = P(sd * w / 2, sd > 0 ? d / 2 + j : -d / 2, top), b = P(sd * w / 2, sd > 0 ? -d / 2 : d / 2 + j, top), c = P(sd * w / 2, ridgeF, top + rh); const u = tileUV(0, 3); B.tri(a, b, c, [u[0], u[1], u[2], u[3], (u[0] + u[2]) / 2, u[5]], tint); }
      if (h.chimney) { const cl = (R() - 0.5) * w * 0.5; chimney(B, P, cl, -d / 4, top + rh * 0.5, top + rh + 1.4, stoneCol); }
    } else {
      // gable to the street: the pointed end faces you, like the old towns
      const rh = w * 0.78, wl = w / 2 + o;
      const slope = Math.hypot(wl, rh);
      RB.quad(P(-wl, bk, top), P(-wl, fr, top), P(0, fr, top + rh), P(0, bk, top + rh), rr(slope, d + j + 2 * o), rc);
      RB.quad(P(wl, fr, top), P(wl, bk, top), P(0, bk, top + rh), P(0, fr, top + rh), rr(slope, d + j + 2 * o), rc);
      const u = tileUV(0, 3), tuv = [u[0], u[1], u[2], u[3], (u[0] + u[2]) / 2, u[5]];
      B.tri(P(-w / 2, d / 2 + j, top), P(w / 2, d / 2 + j, top), P(0, d / 2 + j, top + rh), tuv, tint);
      B.tri(P(w / 2, -d / 2, top), P(-w / 2, -d / 2, top), P(0, -d / 2, top + rh), tuv, tint);
      if (h.chimney) chimney(B, P, w * 0.22, -d * 0.2, top + rh * 0.3, top + rh * 0.85 + 1.2, stoneCol);
    }
    // potted plants by the door
    if (R() < 0.45) for (const sd of [-1, 1]) {
      const l = -w / 2 + doorBay * bw + bw / 2 + sd * bw * 0.42, pp = P(l, d / 2 + 0.45, 0);
      const pot = new THREE.CylinderGeometry(0.32, 0.24, 0.55, 8); pot.translate(pp.x, pp.y + 0.27, pp.z); deco(pot, potCol, q.deco);
      const bush = new THREE.IcosahedronGeometry(0.48, 0); bush.translate(pp.x, pp.y + 0.85, pp.z); deco(bush, R() < 0.5 ? leaf : flowerCols[Math.floor(R() * 5)], q.deco);
    }
    // solid, and a door you can walk through
    sc.phys.box(h.x + F.x * (j / 2), h.z + F.z * (j / 2), w / 2, d / 2, h.rot);
    const dl = -w / 2 + doorBay * bw + bw / 2, dp = C.clone().addScaledVector(L, dl);
    const kind = h.role || 'home';
    sc.doors.push({ id: `${s.id}:t${idx}`, kind, name: 'townhouse', sign: h.sign, role: h.role, x: dp.x + F.x * (d / 2 + 0.5), z: dp.z + F.z * (d / 2 + 0.5), ox: dp.x + F.x * (d / 2 + 2.6), oz: dp.z + F.z * (d / 2 + 2.6), rot: h.rot, town: s.name, sid: s.id, color: s.color });
    if (h.sign) sc.sign(dp.x + F.x * (d / 2 + 1.0) + L.x * (bw * 0.5 + 0.6), dp.z + F.z * (d / 2 + 1.0) + L.z * (bw * 0.5 + 0.6), h.rot, h.sign);
  });
  // merge each quarter into a few meshes
  const decoMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const q of quarters.values()) {
    const cx = q.cx / q.n, cz = q.cz / q.n;
    for (const [b, m] of [[q.f, facadeMat], [q.r, roofMat]]) {
      const mesh = new THREE.Mesh(b.geometry(), m); mesh.castShadow = mesh.receiveShadow = true; sc.group.add(mesh); sc.far.push({ obj: mesh, x: cx, z: cz });
    }
    if (q.deco.length) { const mesh = new THREE.Mesh(mergeGeometries(q.deco), decoMat); mesh.castShadow = true; sc.group.add(mesh); sc.far.push({ obj: mesh, x: cx, z: cz }); }
  }
  cobbles(sc, s, plan, cobT);
}
function chimney(B, P, l, f, y0, y1, col) {
  const s = 0.45, u = tileUV(3, 2);
  B.quad(P(l - s, f + s, y0), P(l + s, f + s, y0), P(l + s, f + s, y1), P(l - s, f + s, y1), u, col);
  B.quad(P(l + s, f - s, y0), P(l - s, f - s, y0), P(l - s, f - s, y1), P(l + s, f - s, y1), u, col);
  B.quad(P(l + s, f + s, y0), P(l + s, f - s, y0), P(l + s, f - s, y1), P(l + s, f + s, y1), u, col);
  B.quad(P(l - s, f - s, y0), P(l - s, f + s, y0), P(l - s, f + s, y1), P(l - s, f - s, y1), u, col);
  B.quad(P(l - s, f + s, y1), P(l + s, f + s, y1), P(l + s, f - s, y1), P(l - s, f - s, y1), tileUV(2, 2), col);
}
// cobblestones over every street, with world-space texture so overlaps match exactly
function cobbles(sc, s, plan, tex) {
  const B = new Builder(), col = new THREE.Color(1, 1, 1), S = 2.4, r = s.r;
  const at = (x, z) => V3(x, sc.h(x, z) + 0.06, z);
  const quad = (x0, z0, x1, z1) => B.quad(at(x0, z1), at(x1, z1), at(x1, z0), at(x0, z0), [x0 / S, -z1 / S, x1 / S, -z1 / S, x1 / S, -z0 / S, x0 / S, -z0 / S], col);
  const inside = (x, z) => Math.hypot(x - s.x, z - s.z) < r - 9;
  const strip = (cx, cz, half, alongX) => {
    for (let t = -r; t < r; t += 6) {
      const x0 = alongX ? s.x + t : cx - half, x1 = alongX ? s.x + t + 6 : cx + half, z0 = alongX ? cz - half : s.z + t, z1 = alongX ? cz + half : s.z + t + 6;
      if (inside((x0 + x1) / 2, (z0 + z1) / 2)) quad(x0, z0, x1, z1);
    }
  };
  strip(s.x, 0, 8.8, false); strip(0, s.z, 8.8, true);
  for (let i = -4; i <= 4; i++) { if (!i) continue; strip(s.x + 46 * i, 0, 5.6, false); strip(0, s.z + 46 * i, 5.6, true); }
  // the plaza and the ring road
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    for (const [ri, ro] of [[0.01, 34], [r - 22, r - 10]]) {
      const p = (rad, a) => [s.x + Math.cos(a) * rad, s.z + Math.sin(a) * rad];
      const [ax, az] = p(ro, a0), [bx, bz] = p(ro, a1), [cx, cz] = p(ri, a1), [dx, dz] = p(ri, a0);
      const v = [at(ax, az), at(dx, dz), at(cx, cz), at(bx, bz)];
      B.quad(v[0], v[1], v[2], v[3], [ax / S, -az / S, dx / S, -dz / S, cx / S, -cz / S, bx / S, -bz / S], col);
    }
  }
  const m = new THREE.Mesh(B.geometry(), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  sc.group.add(m);
  sc.far.push({ obj: m, x: s.x, z: s.z });
}
