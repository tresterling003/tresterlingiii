// Procedural PBR texture sets, drawn once at load. Real-world scale is noted for each.
import * as THREE from 'three';
import { rng } from '../shared/level.js';

let ANISO = 8;
export function setAniso(a) { ANISO = a; }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, repeat = true) { const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
// height canvas -> tangent-space normal map
function normalFrom(hc, strength = 2) {
  const w = hc.width, h = hc.height, d = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, x] = cv(w, h); const out = x.createImageData(w, h), o = out.data;
  const H = (i, j) => d[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * strength, dy = (H(i, j + 1) - H(i, j - 1)) * strength, l = Math.hypot(dx, dy, 1), k = (j * w + i) * 4;
    o[k] = (-dx / l * 0.5 + 0.5) * 255; o[k + 1] = (dy / l * 0.5 + 0.5) * 255; o[k + 2] = (1 / l * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0); return tex(c, false);
}
function speckle(x, w, h, R, n, cols, size = 2) { for (let i = 0; i < n; i++) { x.fillStyle = cols[R() * cols.length | 0]; const s = size * (0.5 + R()); x.fillRect(R() * w, R() * h, s, s * (0.6 + R() * 0.8)); } }

// Vinyl composition tile, 30 cm squares in a green / off-white checker. Texture covers 2.4 m x 2.4 m (8x8 tiles).
export function vctChecker(colA = [214, 210, 196], colB = [64, 116, 82], seed = 3) {
  const N = 1024, n = 8, s = N / n, R = rng(seed);
  const [c, x] = cv(N, N), [hc, hx] = cv(N, N), [rc, rx] = cv(N, N);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, N, N); rx.fillStyle = '#e6e6e6'; rx.fillRect(0, 0, N, N);
  x.fillStyle = '#6b6a62'; x.fillRect(0, 0, N, N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const base = (i + j) % 2 ? colB : colA, v = (R() - 0.5) * 10;
    x.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`; x.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    // VCT chips
    x.save(); x.beginPath(); x.rect(i * s + 1.5, j * s + 1.5, s - 3, s - 3); x.clip();
    const chips = (i + j) % 2 ? ['rgba(40,80,55,.5)', 'rgba(110,160,120,.35)', 'rgba(30,50,40,.4)'] : ['rgba(170,165,150,.45)', 'rgba(240,238,228,.4)', 'rgba(140,135,120,.3)'];
    speckle(x, N, N, R, 260, chips, 2.4);
    x.restore();
    hx.fillStyle = '#d8d8d8'; hx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    const rough = 70 + R() * 40 | 0; rx.fillStyle = `rgb(${rough},${rough},${rough})`; rx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  // scuffs and heel marks
  for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(30,28,25,${0.08 + R() * 0.18})`; x.lineWidth = 0.6 + R() * 1.6; x.beginPath(); const a = R() * N, b = R() * N; x.moveTo(a, b); x.quadraticCurveTo(a + (R() - .5) * 40, b + (R() - .5) * 40, a + (R() - .5) * 60, b + (R() - .5) * 30); x.stroke(); }
  for (let i = 0; i < 900; i++) { rx.fillStyle = `rgba(${R() < .5 ? 255 : 0},${0},0,.05)`; }
  // wax swirl variation in roughness
  for (let i = 0; i < 80; i++) { const g = rx.createRadialGradient(R() * N, R() * N, 0, R() * N, R() * N, 40 + R() * 120); g.addColorStop(0, `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},.08)`); g.addColorStop(1, 'rgba(0,0,0,0)'); rx.fillStyle = g; rx.fillRect(0, 0, N, N); }
  return { map: tex(c), normalMap: normalFrom(hc, 3), roughnessMap: tex(rc, false), size: 2.4 };
}
// single-colour speckled VCT for classroom / office (30 cm tiles, covers 2.4 m)
export function vctPlain(col, seed, accent) {
  const N = 1024, n = 8, s = N / n, R = rng(seed);
  const [c, x] = cv(N, N), [hc, hx] = cv(N, N), [rc, rx] = cv(N, N);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, N, N); x.fillStyle = '#5c5a54'; x.fillRect(0, 0, N, N); rx.fillStyle = '#ddd'; rx.fillRect(0, 0, N, N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const acc = accent && R() < 0.06, b = acc ? accent : col, v = (R() - 0.5) * 12;
    x.fillStyle = `rgb(${b[0] + v | 0},${b[1] + v | 0},${b[2] + v | 0})`; x.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    x.save(); x.beginPath(); x.rect(i * s + 1.5, j * s + 1.5, s - 3, s - 3); x.clip(); speckle(x, N, N, R, 240, ['rgba(60,55,45,.35)', 'rgba(250,245,230,.35)', 'rgba(120,110,95,.3)'], 2.2); x.restore();
    hx.fillStyle = '#d0d0d0'; hx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); const r = 80 + R() * 50 | 0; rx.fillStyle = `rgb(${r},${r},${r})`; rx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  for (let i = 0; i < 50; i++) { x.strokeStyle = `rgba(30,28,25,${0.06 + R() * 0.15})`; x.lineWidth = 1 + R(); x.beginPath(); const a = R() * N, b = R() * N; x.moveTo(a, b); x.lineTo(a + (R() - .5) * 50, b + (R() - .5) * 30); x.stroke(); }
  return { map: tex(c), normalMap: normalFrom(hc, 3), roughnessMap: tex(rc, false), size: 2.4 };
}
// sealed concrete, covers 4 m
export function concrete(seed = 9, tint = [128, 126, 120]) {
  const N = 512, R = rng(seed); const [c, x] = cv(N, N), [hc, hx] = cv(N, N);
  x.fillStyle = `rgb(${tint})`; x.fillRect(0, 0, N, N); hx.fillStyle = '#808080'; hx.fillRect(0, 0, N, N);
  for (let i = 0; i < 2500; i++) { const v = R() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${R() * 0.06})`; const s = 2 + R() * 26; x.beginPath(); x.arc(R() * N, R() * N, s, 0, 7); x.fill(); hx.fillStyle = `rgba(${v},${v},${v},${R() * 0.1})`; hx.fillRect(R() * N, R() * N, 2, 2); }
  for (let i = 0; i < 10; i++) { x.strokeStyle = 'rgba(40,38,35,.25)'; x.lineWidth = 1; x.beginPath(); let a = R() * N, b = R() * N; x.moveTo(a, b); for (let k = 0; k < 8; k++) { a += (R() - .5) * 50; b += (R() - .5) * 50; x.lineTo(a, b); } x.stroke(); }
  return { map: tex(c), normalMap: normalFrom(hc, 1.5), size: 4 };
}
// painted wall: u covers 2 m horizontally, v covers the full height (0..ceil). Lower band + stripe + rubber base.
export function paintedWall({ upper, lower, stripe, bandTop = 1.2, ceil = 2.95, seed = 4, block = false }) {
  const W = 512, H = 768, R = rng(seed); const [c, x] = cv(W, H), [hc, hx] = cv(W, H), [rc, rx] = cv(W, H);
  const yPx = (y) => H - y / ceil * H;
  x.fillStyle = `rgb(${upper})`; x.fillRect(0, 0, W, H); hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H); rx.fillStyle = '#9a9a9a'; rx.fillRect(0, 0, W, H);
  if (lower) { x.fillStyle = `rgb(${lower})`; x.fillRect(0, yPx(bandTop), W, H); rx.fillStyle = '#707070'; rx.fillRect(0, yPx(bandTop), W, H); }
  if (stripe) { x.fillStyle = `rgb(${stripe})`; x.fillRect(0, yPx(bandTop + 0.06), W, yPx(bandTop) - yPx(bandTop + 0.06)); }
  if (block) { // painted concrete block coursing: 40 cm x 20 cm
    hx.strokeStyle = '#3a3a3a'; hx.lineWidth = 3;
    for (let y = 0; y < ceil; y += 0.2) { hx.beginPath(); hx.moveTo(0, yPx(y)); hx.lineTo(W, yPx(y)); hx.stroke(); const off = (Math.round(y / 0.2) % 2) * 0.2; for (let u = off; u < 2; u += 0.4) { hx.beginPath(); hx.moveTo(u / 2 * W, yPx(y)); hx.lineTo(u / 2 * W, yPx(y + 0.2)); hx.stroke(); } }
  }
  // roller texture and age
  for (let i = 0; i < 3000; i++) { const v = R() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${R() * 0.035})`; x.fillRect(R() * W, R() * H, 1 + R() * 4, 1 + R() * 4); hx.fillStyle = `rgba(${v},${v},${v},.06)`; hx.fillRect(R() * W, R() * H, 1, 1); }
  for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(40,38,32,${0.05 + R() * 0.12})`; x.lineWidth = 1 + R() * 2; const a = R() * W, b = yPx(0.15 + R() * 0.9); x.beginPath(); x.moveTo(a, b); x.lineTo(a + (R() - .5) * 60, b + (R() - .5) * 8); x.stroke(); }
  // rubber cove base, 10 cm
  x.fillStyle = '#22221f'; x.fillRect(0, yPx(0.1), W, H); rx.fillStyle = '#bbb'; rx.fillRect(0, yPx(0.1), W, H); hx.fillStyle = '#b0b0b0'; hx.fillRect(0, yPx(0.1), W, 3);
  return { map: tex(c), normalMap: normalFrom(hc, block ? 4 : 1.2), roughnessMap: tex(rc, false), uSize: 2, ceil };
}
// suspended ceiling: 60 cm acoustic tiles in a white T-bar grid. Covers 2.4 m.
export function ceilingTiles(seed = 5) {
  const N = 1024, n = 4, s = N / n, R = rng(seed); const [c, x] = cv(N, N), [hc, hx] = cv(N, N);
  x.fillStyle = '#d9d7cf'; x.fillRect(0, 0, N, N); hx.fillStyle = '#909090'; hx.fillRect(0, 0, N, N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = (R() - .5) * 10; x.fillStyle = `rgb(${226 + v | 0},${224 + v | 0},${214 + v | 0})`; x.fillRect(i * s + 6, j * s + 6, s - 12, s - 12);
    for (let k = 0; k < 420; k++) { // fissures
      const px = i * s + 8 + R() * (s - 16), py = j * s + 8 + R() * (s - 16), l = 2 + R() * 7, a = R() * 6.28;
      x.strokeStyle = `rgba(120,118,108,${0.15 + R() * 0.25})`; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
      hx.strokeStyle = 'rgba(40,40,40,.5)'; hx.beginPath(); hx.moveTo(px, py); hx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); hx.stroke();
    }
    if (false) { const g = x.createRadialGradient(i * s + s / 2, j * s + s / 2, 4, i * s + s / 2, j * s + s / 2, s * 0.5); g.addColorStop(0, 'rgba(150,120,70,.35)'); g.addColorStop(0.7, 'rgba(160,130,80,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(i * s, j * s, s, s); }
    hx.fillStyle = '#a0a0a0'; hx.fillRect(i * s + 6, j * s + 6, s - 12, s - 12);
  }
  x.strokeStyle = '#f2f1ec'; x.lineWidth = 10; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, N); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(N, i * s); x.stroke(); }
  hx.strokeStyle = '#ffffff'; hx.lineWidth = 8; for (let i = 0; i <= n; i++) { hx.beginPath(); hx.moveTo(i * s, 0); hx.lineTo(i * s, N); hx.stroke(); hx.beginPath(); hx.moveTo(0, i * s); hx.lineTo(N, i * s); hx.stroke(); }
  return { map: tex(c), normalMap: normalFrom(hc, 2), size: 2.4 };
}
// red powder-coated locker door pair (upper + lower tier) for one 40 cm column, 1.86 m tall.
export function lockerFace() {
  const W = 256, H = 1024; const [c, x] = cv(W, H), [hc, hx] = cv(W, H), [rc, rx] = cv(W, H), R = rng(11);
  x.fillStyle = '#b3241e'; x.fillRect(0, 0, W, H); hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H); rx.fillStyle = '#6a6a6a'; rx.fillRect(0, 0, W, H);
  const door = (y0, y1) => {
    hx.fillStyle = '#a8a8a8'; hx.fillRect(10, y0 + 6, W - 20, y1 - y0 - 12); // pressed door panel
    hx.fillStyle = '#d0d0d0'; hx.fillRect(18, y0 + 14, W - 36, y1 - y0 - 28);
    // vent louvers at the top and bottom of each door
    for (const [a, b] of [[y0 + 26, y0 + 96], [y1 - 96, y1 - 26]]) for (let y = a; y < b; y += 11) {
      x.fillStyle = 'rgba(30,6,4,.85)'; x.fillRect(46, y, W - 92, 5); x.fillStyle = 'rgba(255,170,150,.25)'; x.fillRect(46, y + 5, W - 92, 2);
      hx.fillStyle = '#202020'; hx.fillRect(46, y, W - 92, 5); hx.fillStyle = '#ffffff'; hx.fillRect(46, y + 5, W - 92, 3);
    }
    // recessed lift handle pocket
    const hy = (y0 + y1) / 2; x.fillStyle = '#5a100c'; x.fillRect(W - 62, hy - 34, 34, 68); hx.fillStyle = '#303030'; hx.fillRect(W - 62, hy - 34, 34, 68);
    // number plate holder (the number itself is a separate instanced plate)
    x.fillStyle = 'rgba(60,10,8,.6)'; x.fillRect(W / 2 - 36, y0 + 104, 72, 30);
  };
  door(0, H / 2 - 4); door(H / 2 + 4, H);
  x.fillStyle = '#3a0806'; x.fillRect(0, H / 2 - 4, W, 8); x.fillRect(0, 0, 6, H); x.fillRect(W - 6, 0, 6, H);
  hx.fillStyle = '#000'; hx.fillRect(0, H / 2 - 4, W, 8); hx.fillRect(0, 0, 5, H); hx.fillRect(W - 5, 0, 5, H);
  // powder-coat orange peel, scratches, dents
  for (let i = 0; i < 4000; i++) { hx.fillStyle = `rgba(${R() < .5 ? 0 : 255},0,0,.05)`; hx.fillRect(R() * W, R() * H, 2, 2); }
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(230,200,190,${0.15 + R() * 0.3})`; x.lineWidth = 0.7; x.beginPath(); const a = R() * W, b = R() * H; x.moveTo(a, b); x.lineTo(a + (R() - .5) * 30, b + (R() - .5) * 8); x.stroke(); }
  for (let i = 0; i < 6; i++) { const g = x.createRadialGradient(R() * W, H * (0.6 + R() * 0.4), 2, 0, 0, 0); }
  for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(40,20,10,${0.05 + R() * 0.1})`; x.fillRect(R() * W, H - R() * 120, 10 + R() * 30, 4 + R() * 10); }
  return { map: tex(c, true, false), normalMap: normalFrom(hc, 4), roughnessMap: tex(rc, false, false) };
}
export function numberAtlas(start, count) { // 16 columns of 64x32 cells
  const cols = 16, rows = Math.ceil(count / cols), [c, x] = cv(cols * 64, rows * 32);
  x.fillStyle = '#c9c4b2'; x.fillRect(0, 0, c.width, c.height);
  x.font = 'bold 22px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let k = 0; k < count; k++) { const i = k % cols, j = (k / cols) | 0; x.fillStyle = '#1b1a17'; x.fillText(String(start + k), i * 64 + 32, j * 32 + 17); x.strokeStyle = '#7d7868'; x.strokeRect(i * 64 + 2, j * 32 + 2, 60, 28); }
  const t = tex(c, true, false); t.userData = { cols, rows }; return t;
}
export function prismatic() { // fluorescent troffer diffuser
  const [c, x] = cv(128, 256); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 256);
  for (let j = 0; j < 256; j += 4) for (let i = 0; i < 128; i += 4) { x.fillStyle = `rgba(200,205,215,${((i + j) / 4) % 2 ? .35 : .1})`; x.fillRect(i, j, 4, 4); }
  x.fillStyle = 'rgba(170,175,185,1)'; x.fillRect(0, 0, 128, 6); x.fillRect(0, 250, 128, 6); x.fillRect(0, 0, 6, 256); x.fillRect(122, 0, 6, 256);
  return tex(c, true, false);
}
export function grille() { const [c, x] = cv(256, 256); x.fillStyle = '#d8d6ce'; x.fillRect(0, 0, 256, 256); for (let i = 8; i < 256; i += 14) { x.fillStyle = '#2b2a27'; x.fillRect(8, i, 240, 7); x.fillStyle = '#f3f2ee'; x.fillRect(8, i + 7, 240, 2); } x.strokeStyle = '#a8a69e'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 248); return tex(c, true, false); }
export function woodGrain(base = [150, 104, 64], seed = 2) { const [c, x] = cv(512, 512), R = rng(seed); x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 160; i++) { const y = R() * 512; x.strokeStyle = `rgba(${R() < .5 ? '60,35,15' : '210,170,120'},${0.08 + R() * 0.15})`; x.lineWidth = 1 + R() * 3; x.beginPath(); x.moveTo(0, y); for (let k = 0; k < 512; k += 32) x.lineTo(k, y + Math.sin(k * 0.02 + i) * 5); x.stroke(); } return tex(c); }
export function textCanvas(w, h, draw) { const [c, x] = cv(w, h); draw(x, w, h); return tex(c, true, false); }
export function corkBoard(seed = 6) {
  return textCanvas(512, 320, (x, w, h) => {
    const R = rng(seed); x.fillStyle = '#a77d4f'; x.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${R() < .5 ? '80,50,25' : '210,170,120'},.25)`; x.fillRect(R() * w, R() * h, 2, 2); }
    x.strokeStyle = '#8c8c86'; x.lineWidth = 14; x.strokeRect(0, 0, w, h);
    const papers = [['#f4f1e6', 'SPRING DANCE', 'cancelled'], ['#f6e9a8', 'LOST: blue', 'backpack, rm 112'], ['#e9f0f4', 'ATTENDANCE', 'MATTERS'], ['#f4e3e3', 'Bobcats', '97-98'], ['#f1f1ec', 'Period 7', 'roll call']];
    for (const [col, a, b] of papers) { const px = 30 + R() * (w - 150), py = 30 + R() * (h - 130), rot = (R() - .5) * 0.2; x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = col; x.fillRect(0, 0, 110, 90); x.fillStyle = '#222'; x.font = 'bold 14px Arial'; x.fillText(a, 8, 26); x.font = '12px Arial'; x.fillText(b, 8, 46); for (let l = 0; l < 3; l++) x.fillRect(8, 58 + l * 9, 70 + R() * 20, 2); x.fillStyle = '#c33'; x.beginPath(); x.arc(55, 6, 4, 0, 7); x.fill(); x.restore(); }
  });
}
export function dirtTextures() {
  const R = rng(17);
  const mud = textCanvas(256, 256, (x, w, h) => { x.fillStyle = 'rgb(74,56,36)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${R() < .5 ? '40,28,16' : '120,95,62'},${0.15 + R() * 0.3})`; const s = 1 + R() * 6; x.beginPath(); x.arc(R() * w, R() * h, s, 0, 7); x.fill(); } });
  const dust = textCanvas(256, 256, (x, w, h) => { x.fillStyle = 'rgb(128,118,100)'; x.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${R() < .5 ? '80,72,60' : '170,160,140'},${0.2 + R() * 0.3})`; x.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } });
  mud.wrapS = mud.wrapT = dust.wrapS = dust.wrapT = THREE.RepeatWrapping;
  return { mud, dust };
}
