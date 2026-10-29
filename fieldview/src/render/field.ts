import * as THREE from 'three';
import { YARD_M } from '../core/units';
import { FIELD_WIDTH, HALF_WIDTH, HASH_FROM_SIDELINE, NUMBERS_TOP_FROM_SIDELINE, NUMBER_HEIGHT, END_ZONE, fieldCenterX, type Hash } from '../data/field';

// ---------------------------------------------------------------------------
// High-school field: 5-yd mowing bands, 4" lines, hash marks at 53'4", inbound
// marks, yard numbers (tops 9 yd from the sideline), goal posts and a simple
// stadium surround. Built around the ball: world origin = ball spot.
// ---------------------------------------------------------------------------

const LINE_W = 4 * 0.0254; // 4 inches
const HASH_LEN = 2 * 0.3048; // 2 feet

export class FieldView {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(yardLine: number, hash: Hash, opts: { quality: 'low' | 'high' }) {
    this.build(yardLine, hash, opts.quality);
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private build(L: number, hash: Hash, quality: 'low' | 'high') {
    const cx = fieldCenterX(hash) * YARD_M;
    // field y (yards) → world Z. Offense's own goal line is at y = +L.
    const Zof = (yFromOwnGoal: number) => -(L - yFromOwnGoal) * YARD_M;
    const xSide = (s: number) => cx + s * HALF_WIDTH * YARD_M;

    // --- grass -------------------------------------------------------------
    const grassTex = this.track(makeGrassTexture());
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.anisotropy = quality === 'high' ? 8 : 2;
    const bands: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const light = new THREE.Color('#3f7a35');
    const dark = new THREE.Color('#356b2d');
    const ez = new THREE.Color('#2f6127');
    const pushQuad = (x0: number, z0: number, x1: number, z1: number, c: THREE.Color) => {
      const v = [x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1];
      bands.push(...v);
      for (let i = 0; i < 6; i++) colors.push(c.r, c.g, c.b);
      for (let i = 0; i < v.length; i += 3) uvs.push(v[i] / 2.2, v[i + 2] / 2.2);
    };
    const margin = 14 * YARD_M;
    for (let y = -END_ZONE; y < 100 + END_ZONE; y += 5) {
      const inEz = y < 0 || y >= 100;
      const c = inEz ? ez : Math.floor(y / 5) % 2 === 0 ? light : dark;
      pushQuad(xSide(-1) - margin, Zof(y), xSide(1) + margin, Zof(y + 5), c);
    }
    // Surround beyond the end lines
    pushQuad(xSide(-1) - margin, Zof(-END_ZONE - 25), xSide(1) + margin, Zof(-END_ZONE), dark);
    pushQuad(xSide(-1) - margin, Zof(100 + END_ZONE), xSide(1) + margin, Zof(100 + END_ZONE + 25), dark);
    const g = this.track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(bands, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const grassMat = this.track(new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 0.95, metalness: 0 }));
    const grass = new THREE.Mesh(g, grassMat);
    grass.receiveShadow = true;
    this.group.add(grass);

    // --- white lines (merged) ------------------------------------------------
    const lp: number[] = [];
    const rect = (x0: number, z0: number, x1: number, z1: number, h = 0.004) => {
      lp.push(x0, h, z0, x1, h, z1, x1, h, z0, x0, h, z0, x0, h, z1, x1, h, z1);
    };
    const W = LINE_W / 2;
    // Sidelines and end lines (outside edge of the field of play)
    for (const s of [-1, 1]) rect(xSide(s) - (s > 0 ? 0 : 2 * LINE_W), Zof(-END_ZONE), xSide(s) + (s > 0 ? 2 * LINE_W : 0), Zof(100 + END_ZONE));
    for (const y of [-END_ZONE, 100 + END_ZONE]) rect(xSide(-1), Zof(y) - W * 2, xSide(1), Zof(y) + W * 2);
    // Yard lines every 5 yards, goal lines
    for (let y = 0; y <= 100; y += 5) rect(xSide(-1), Zof(y) - W * (y % 50 === 0 ? 1.5 : 1), xSide(1), Zof(y) + W * (y % 50 === 0 ? 1.5 : 1));
    // Hash marks + inbound marks at every yard
    const hashX = [-1, 1].map((s) => cx + s * (HALF_WIDTH - HASH_FROM_SIDELINE) * YARD_M);
    for (let y = 1; y < 100; y++) {
      if (y % 5 === 0) continue;
      const z = Zof(y);
      for (const hx of hashX) rect(hx - HASH_LEN / 2, z - W, hx + HASH_LEN / 2, z + W);
      for (const s of [-1, 1]) {
        const inner = xSide(s) - s * 4 * 0.0254;
        rect(Math.min(inner, inner - s * HASH_LEN), z - W, Math.max(inner, inner - s * HASH_LEN), z + W);
      }
    }
    // Try-line (3-yard line in NFHS) marks
    for (const y of [3, 97]) rect(cx - 0.5 * YARD_M, Zof(y) - W, cx + 0.5 * YARD_M, Zof(y) + W);
    const lg = this.track(new THREE.BufferGeometry());
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.computeVertexNormals();
    const lineMat = this.track(new THREE.MeshStandardMaterial({ color: '#f4f4ef', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    const lines = new THREE.Mesh(lg, lineMat);
    lines.receiveShadow = true;
    this.group.add(lines);

    // --- yard numbers ---------------------------------------------------------
    for (let y = 10; y <= 90; y += 10) {
      const n = y <= 50 ? y : 100 - y;
      for (const s of [-1, 1]) {
        const tex = this.track(makeNumberTexture(n, y === 50 ? 0 : y < 50 ? 1 : -1));
        const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
        const geo = this.track(new THREE.PlaneGeometry(3.2 * YARD_M, NUMBER_HEIGHT * YARD_M));
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        // tops of numbers toward the field center; bottoms toward the sideline
        m.rotation.z = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        const xCenter = xSide(s) - s * (NUMBERS_TOP_FROM_SIDELINE - NUMBER_HEIGHT / 2) * YARD_M;
        m.position.set(xCenter, 0.006, Zof(y));
        m.receiveShadow = true;
        this.group.add(m);
      }
    }

    // --- goal posts ----------------------------------------------------------
    const postMat = this.track(new THREE.MeshStandardMaterial({ color: '#f2d22e', roughness: 0.5 }));
    for (const y of [-END_ZONE, 100 + END_ZONE]) {
      const z = Zof(y) + (y < 0 ? -0.3 : 0.3);
      const gp = new THREE.Group();
      const pole = (h: number, r: number) => new THREE.Mesh(this.track(new THREE.CylinderGeometry(r, r, h, 10)), postMat);
      const base = pole(3.05, 0.09);
      base.position.set(cx, 1.52, z);
      const cross = pole(23 * 0.3048 + 4 * 0.0254, 0.06);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(cx, 3.05, z);
      gp.add(base, cross);
      for (const s of [-1, 1]) {
        const up = pole(6.1, 0.05);
        up.position.set(cx + s * 11.6 * 0.3048, 3.05 + 3.05, z);
        gp.add(up);
      }
      gp.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.group.add(gp);
    }

    // --- stadium surround (simple, readable, not distracting) -----------------
    const standMat = this.track(new THREE.MeshStandardMaterial({ color: '#5d636b', roughness: 0.9 }));
    const seatMat = this.track(new THREE.MeshStandardMaterial({ color: '#2b3a55', roughness: 0.85 }));
    const wallMat = this.track(new THREE.MeshStandardMaterial({ color: '#4a5563', roughness: 0.9 }));
    for (const s of [-1, 1]) {
      const x0 = xSide(s) + s * 12 * YARD_M;
      const len = 80 * YARD_M;
      const zMid = Zof(50);
      // wall
      const wall = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.4, 1.2, len * 1.4)), wallMat);
      wall.position.set(x0, 0.6, zMid);
      this.group.add(wall);
      // stepped bleachers
      for (let r = 0; r < 12; r++) {
        const step = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.85, 0.45, len)), r % 2 ? standMat : seatMat);
        step.position.set(x0 + s * (0.8 + r * 0.85), 1.2 + r * 0.45, zMid);
        this.group.add(step);
      }
      // light towers
      for (const zz of [Zof(20), Zof(80)]) {
        const tower = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.25, 0.35, 28, 8)), standMat);
        tower.position.set(x0 + s * 13, 14, zz);
        const bank = new THREE.Mesh(this.track(new THREE.BoxGeometry(5, 2.4, 0.6)), this.track(new THREE.MeshStandardMaterial({ color: '#dfe6ee', emissive: '#7f8790', roughness: 0.4 })));
        bank.position.set(x0 + s * 13, 28.5, zz);
        bank.lookAt(cx, 0, zz);
        this.group.add(tower, bank);
      }
    }
    // end-zone backdrop
    for (const y of [-END_ZONE - 12, 100 + END_ZONE + 12]) {
      const wall = new THREE.Mesh(this.track(new THREE.BoxGeometry(FIELD_WIDTH * YARD_M + 40, 3, 0.5)), wallMat);
      wall.position.set(cx, 1.5, Zof(y));
      this.group.add(wall);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function makeGrassTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  // deterministic value noise
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 256 * 256; i++) {
    const n = 0.82 + rnd() * 0.18;
    const blade = rnd() < 0.06 ? 0.9 : 1;
    img.data[i * 4] = 230 * n * blade;
    img.data[i * 4 + 1] = 245 * n * blade;
    img.data[i * 4 + 2] = 225 * n * blade;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** dir: +1 arrow points toward the offense's own goal, -1 the other way, 0 none */
function makeNumberTexture(n: number, dir: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4ef';
  g.font = '700 300px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 256, 172);
  if (dir !== 0) {
    g.beginPath();
    const ax = dir > 0 ? 22 : 490;
    g.moveTo(ax, 160);
    g.lineTo(ax + (dir > 0 ? 44 : -44), 132);
    g.lineTo(ax + (dir > 0 ? 44 : -44), 188);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
