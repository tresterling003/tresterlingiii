import * as THREE from 'three';
import type { Uniform } from '../data/schema';
import { DIM, type Build } from '../anim/skeleton';
import { orientY, type Pose, type RootTransform } from '../anim/pose';

// ---------------------------------------------------------------------------
// Procedural football player: a jointed body built from shaped primitives
// (helmet shell + facemask, shoulder-pad jersey, pants, socks, cleats), with
// every segment driven from the shared skeleton pose. Built entirely in code,
// so there are no third-party licensing constraints. A GLB athlete can replace
// it through render/glbPlayer.ts using the same pose data.
// ---------------------------------------------------------------------------

export interface PlayerVisual {
  object: THREE.Object3D;
  applyPose(pose: Pose, root: RootTransform): void;
  dispose(): void;
}

const SKIN_TONES = ['#8d5524', '#6b4226', '#c68642', '#e0ac69', '#4a2f1d', '#a0663b', '#f1c27d'];

// --- shared geometry (unit-length limbs scaled per player) ------------------
function lathe(profile: [number, number][], segs = 18): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

let GEO: ReturnType<typeof buildGeometry> | null = null;
function geo() {
  if (!GEO) GEO = buildGeometry();
  return GEO;
}

function buildGeometry() {
  // Torso: waist (y=0) → neck (y≈0.58). Shoulder pads give the wide top.
  const torso = lathe(
    [
      [0.0, -0.02],
      [0.148, -0.02],
      [0.152, 0.06],
      [0.165, 0.16],
      [0.185, 0.27],
      [0.205, 0.36],
      [0.225, 0.43],
      [0.232, 0.47],
      [0.222, 0.51],
      [0.18, 0.55],
      [0.11, 0.575],
      [0.075, 0.58],
      [0.0, 0.58],
    ],
    24,
  );
  torso.scale(1.18, 1, 0.66);
  torso.computeVertexNormals();
  // Shoulder pad caps (epaulets) — covered by the jersey sleeve.
  const padCap = new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  padCap.scale(1.0, 0.8, 1.15);
  // Collar
  const collar = new THREE.TorusGeometry(0.075, 0.018, 8, 18);
  collar.rotateX(Math.PI / 2);
  // Hips / pants top
  const hips = lathe(
    [
      [0.0, -0.15],
      [0.11, -0.15],
      [0.155, -0.1],
      [0.168, -0.02],
      [0.16, 0.06],
      [0.152, 0.11],
      [0.0, 0.11],
    ],
    20,
  );
  hips.scale(1.12, 1, 0.82);
  hips.computeVertexNormals();
  const belt = new THREE.CylinderGeometry(0.153, 0.153, 0.03, 20, 1, true);
  belt.scale(1.12, 1, 0.82);
  // Limbs: Y from 0 → 1 (scaled by bone length).
  const thigh = lathe([[0.0, 0.0], [0.092, 0.0], [0.098, 0.12], [0.088, 0.45], [0.072, 0.82], [0.066, 1.0], [0.0, 1.02]]);
  const kneePad = new THREE.SphereGeometry(0.06, 12, 10);
  kneePad.scale(1.0, 1.15, 0.75);
  const shinPants = lathe([[0.0, -0.02], [0.067, -0.02], [0.062, 0.12], [0.0, 0.12]]);
  const sock = lathe([[0.0, 0.08], [0.06, 0.08], [0.058, 0.3], [0.045, 0.7], [0.036, 0.95], [0.0, 1.0]]);
  const upperArm = lathe([[0.0, -0.03], [0.058, -0.03], [0.062, 0.1], [0.052, 0.6], [0.045, 0.95], [0.0, 1.0]]);
  const sleeve = lathe([[0.0, -0.06], [0.082, -0.06], [0.08, 0.22], [0.072, 0.3], [0.0, 0.3]]);
  const forearm = lathe([[0.0, -0.02], [0.046, -0.02], [0.05, 0.25], [0.04, 0.85], [0.034, 1.0], [0.0, 1.0]]);
  const tape = new THREE.CylinderGeometry(0.037, 0.04, 0.06, 12, 1, true);
  const hand = new THREE.CapsuleGeometry(0.036, 0.07, 4, 10);
  hand.scale(1.15, 1, 0.65);
  hand.translate(0, 0.07, 0);
  // Cleat: ankle at origin, sole at y = -ankleH.
  const cleat = new THREE.CapsuleGeometry(0.048, 0.19, 6, 12);
  cleat.rotateX(Math.PI / 2);
  cleat.scale(1, 0.82, 1);
  cleat.translate(0, -0.045, 0.06);
  const sole = new THREE.BoxGeometry(0.092, 0.018, 0.28);
  sole.translate(0, -0.078, 0.06);
  // Helmet (frame at neck base, Y up, Z forward)
  const helmetTop = new THREE.SphereGeometry(0.148, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const helmetLow = new THREE.SphereGeometry(0.148, 28, 10, Math.PI * 0.5 + 0.92, Math.PI * 2 - 1.84, Math.PI * 0.42, Math.PI * 0.36);
  for (const g of [helmetTop, helmetLow]) {
    g.scale(0.97, 1.0, 1.1);
    g.translate(0, 0.19, -0.012);
  }
  const stripe = new THREE.TorusGeometry(0.152, 0.012, 6, 28, Math.PI * 0.9);
  stripe.rotateY(Math.PI / 2);
  stripe.rotateX(-Math.PI * 0.05);
  stripe.scale(1, 1.0, 1.1);
  stripe.translate(0, 0.19, -0.012);
  const face = new THREE.SphereGeometry(0.1, 16, 12);
  face.scale(0.86, 1.08, 0.95);
  face.translate(0, 0.165, 0.04);
  const neck = new THREE.CylinderGeometry(0.062, 0.07, 0.12, 12);
  neck.translate(0, 0.045, 0);
  // Facemask: horizontal bars wrapping the front + a center bar.
  const maskParts: THREE.BufferGeometry[] = [];
  for (const [y, r, arc] of [
    [0.155, 0.168, 2.1],
    [0.112, 0.162, 1.9],
    [0.075, 0.148, 1.6],
  ] as [number, number, number][]) {
    const bar = new THREE.TorusGeometry(r, 0.0085, 6, 22, arc);
    bar.rotateX(Math.PI / 2);
    bar.rotateY(arc / 2 - Math.PI / 2);
    bar.scale(0.95, 1, 1.12);
    bar.translate(0, y, -0.008);
    maskParts.push(bar);
  }
  for (const xOff of [-0.045, 0.045]) {
    const v = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6);
    v.translate(xOff, 0.115, 0.178);
    v.rotateX(0.0);
    maskParts.push(v);
  }
  const facemask = mergeGeometries(maskParts);
  const ear = new THREE.CylinderGeometry(0.03, 0.03, 0.302, 12);
  ear.rotateZ(Math.PI / 2);
  ear.translate(0, 0.16, -0.01);
  // Numbers: curved strips on the jersey chest/back.
  // Tapered to follow the jersey between y≈0.18 and y≈0.42 (scaled per player).
  const numFront = new THREE.CylinderGeometry(0.229, 0.19, 0.24, 16, 1, true, -0.62, 1.24);
  const numBack = new THREE.CylinderGeometry(0.229, 0.19, 0.24, 16, 1, true, Math.PI - 0.62, 1.24);
  // Ball
  const ball = new THREE.SphereGeometry(0.085, 18, 12);
  ball.scale(1, 1, 1.66);
  return {
    torso,
    padCap,
    collar,
    hips,
    belt,
    thigh,
    kneePad,
    shinPants,
    sock,
    upperArm,
    sleeve,
    forearm,
    tape,
    hand,
    cleat,
    sole,
    helmetTop,
    helmetLow,
    stripe,
    face,
    neck,
    facemask,
    ear,
    numFront,
    numBack,
    ball,
  };
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Minimal merge for non-indexed + indexed primitives with position/normal/uv.
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.attributes.position.count;
    iCount += p.index ? p.index.count : p.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, vo * 3);
    nor.set(p.attributes.normal.array as Float32Array, vo * 3);
    if (p.index) for (let i = 0; i < p.index.count; i++) idx[io++] = p.index.getX(i) + vo;
    else for (let i = 0; i < p.attributes.position.count; i++) idx[io++] = i + vo;
    vo += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// --- materials ---------------------------------------------------------------
export interface UniformMaterials {
  helmet: THREE.MeshStandardMaterial;
  stripe: THREE.MeshStandardMaterial;
  facemask: THREE.MeshStandardMaterial;
  jersey: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  socks: THREE.MeshStandardMaterial;
  cleats: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  tape: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  uniform: Uniform;
}

export function makeUniformMaterials(u: Uniform): UniformMaterials {
  const std = (color: string, roughness: number, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness, ...extra });
  return {
    helmet: std(u.helmet, 0.28, 0.15, { side: THREE.DoubleSide }),
    stripe: std(u.numbers, 0.35),
    facemask: std(u.facemask, 0.45, 0.3),
    jersey: std(u.jersey, 0.82),
    pants: std(u.pants, 0.62),
    socks: std(u.socks, 0.85),
    cleats: std(u.cleats, 0.5),
    sole: std('#e8e8e8', 0.6),
    belt: std('#151515', 0.6),
    glove: std(u.jersey === '#ffffff' ? '#202020' : u.jersey, 0.7),
    tape: std('#f2f2f2', 0.8),
    inner: std('#111111', 0.9, 0, { side: THREE.BackSide }),
    uniform: u,
  };
}

export function disposeUniformMaterials(m: UniformMaterials) {
  for (const [k, v] of Object.entries(m)) if (k !== 'uniform') (v as THREE.Material).dispose();
}

const numberTextures = new Map<string, THREE.CanvasTexture>();
function numberTexture(n: number, color: string, outline: string): THREE.CanvasTexture {
  const key = `${n}|${color}|${outline}`;
  let tex = numberTextures.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.font = '700 132px "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = outline;
  g.strokeText(String(n), 128, 86);
  g.fillStyle = color;
  g.fillText(String(n), 128, 86);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  numberTextures.set(key, tex);
  return tex;
}

const _dir = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _mid = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

export class ProceduralPlayer implements PlayerVisual {
  readonly object = new THREE.Group();
  private pelvis = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private upper: THREE.Group[] = [];
  private fore: THREE.Group[] = [];
  private hands: THREE.Group[] = [];
  private thighs: THREE.Group[] = [];
  private shins: THREE.Group[] = [];
  private feet: THREE.Group[] = [];
  private numberMats: THREE.MeshStandardMaterial[] = [];
  private skin: THREE.MeshStandardMaterial;
  number = 0;

  constructor(
    mats: UniformMaterials,
    number: number,
    build: Build,
    seed: number,
    opts: { shadows: boolean } = { shadows: true },
  ) {
    this.number = number;
    const G = geo();
    const h = build.height;
    const w = build.width;
    this.skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[seed % SKIN_TONES.length], roughness: 0.65 });
    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = opts.shadows;
      parent.add(mesh);
      return mesh;
    };

    // Pelvis
    add(this.pelvis, G.hips, mats.pants, w * h, h, w * h);
    add(this.pelvis, G.belt, mats.belt, w * h * 1.01, h, w * h * 1.01).position.y = 0.095 * h;

    // Torso (jersey over shoulder pads)
    const tw = w * h;
    add(this.torso, G.torso, mats.jersey, tw, h, tw * (0.95 + 0.05 * w));
    for (const s of [1, -1]) {
      const cap = add(this.torso, G.padCap, mats.jersey, tw, h, tw);
      cap.position.set(s * 0.19 * tw, 0.475 * h, 0);
      cap.rotation.z = -s * 0.32;
    }
    add(this.torso, G.collar, mats.jersey, tw, h, tw).position.y = 0.57 * h;
    const numColor = mats.uniform.numbers;
    const outline = mats.uniform.jersey;
    const tex = numberTexture(number, numColor, shade(outline, numColor));
    for (const back of [false, true]) {
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, alphaTest: 0.2, depthWrite: false });
      this.numberMats.push(m);
      const strip = new THREE.Mesh(back ? G.numBack : G.numFront, m);
      strip.userData.number = number;
      // ellipse radius of the torso around y = 0.3
      strip.scale.set(1.18 * tw * 1.025, h, 0.66 * tw * (0.95 + 0.05 * w) * 1.07);
      strip.position.y = back ? 0.31 * h : 0.29 * h;
      strip.renderOrder = 2;
      this.torso.add(strip);
    }

    // Head + helmet
    add(this.head, G.neck, this.skin, w, h, w).userData.skin = true;
    add(this.head, G.face, this.skin, h, h, h).userData.skin = true;
    add(this.head, G.helmetTop, mats.helmet, h, h, h);
    add(this.head, G.helmetLow, mats.helmet, h, h, h);
    const inner = add(this.head, G.helmetTop, mats.inner, h * 0.985, h * 0.985, h * 0.985);
    inner.castShadow = false;
    add(this.head, G.stripe, mats.stripe, h, h, h);
    add(this.head, G.facemask, mats.facemask, h, h, h);
    add(this.head, G.ear, mats.helmet, h, h, h).scale.set(h * 0.9, h, h);

    for (let s = 0; s < 2; s++) {
      const ua = new THREE.Group();
      add(ua, G.upperArm, this.skin, w, DIM.upperArm * h, w).userData.skin = true;
      add(ua, G.sleeve, mats.jersey, w * 1.05, h, w * 1.05);
      const fa = new THREE.Group();
      add(fa, G.forearm, this.skin, w, DIM.forearm * h, w).userData.skin = true;
      add(fa, G.tape, mats.tape, w, h, w).position.y = DIM.forearm * h * 0.92;
      const hd = new THREE.Group();
      add(hd, G.hand, mats.glove, w * h, h, w * h);
      const th = new THREE.Group();
      add(th, G.thigh, mats.pants, w, DIM.thigh * h, w);
      const kp = add(th, G.kneePad, mats.pants, w, h, w);
      kp.position.set(0, DIM.thigh * h * 0.93, 0.045 * w);
      const sh = new THREE.Group();
      add(sh, G.shinPants, mats.pants, w, h, w);
      add(sh, G.sock, mats.socks, w, DIM.shin * h, w);
      const ft = new THREE.Group();
      add(ft, G.cleat, mats.cleats, h, h, h);
      add(ft, G.sole, mats.sole, h, h, h);
      this.upper.push(ua);
      this.fore.push(fa);
      this.hands.push(hd);
      this.thighs.push(th);
      this.shins.push(sh);
      this.feet.push(ft);
    }
    this.object.add(this.pelvis, this.torso, this.head, ...this.upper, ...this.fore, ...this.hands, ...this.thighs, ...this.shins, ...this.feet);
  }

  applyPose(p: Pose, root: RootTransform) {
    this.object.position.set(root.X, 0, root.Z);
    this.object.rotation.set(0, root.yaw, 0);
    this.pelvis.position.copy(p.pelvis);
    this.pelvis.quaternion.copy(p.pelvisQ);
    this.torso.position.copy(p.pelvis);
    this.torso.quaternion.copy(p.torsoQ);
    this.head.position.copy(p.neck);
    this.head.quaternion.copy(p.headQ);
    for (let s = 0; s < 2; s++) {
      // arms: elbow bends backward → the arm's front is away from the bend
      bendRef(p.shoulder[s], p.elbow[s], p.wrist[s], -1);
      seg(this.upper[s], p.shoulder[s], p.elbow[s]);
      seg(this.fore[s], p.elbow[s], p.wrist[s]);
      this.hands[s].position.copy(p.wrist[s]);
      this.hands[s].quaternion.copy(p.handQ[s]);
      bendRef(p.hip[s], p.knee[s], p.ankle[s], 1);
      seg(this.thighs[s], p.hip[s], p.knee[s]);
      seg(this.shins[s], p.knee[s], p.ankle[s]);
      this.feet[s].position.copy(p.ankle[s]);
      this.feet[s].quaternion.copy(p.footQ[s]);
    }
  }

  dispose() {
    this.skin.dispose();
    for (const m of this.numberMats) m.dispose();
  }
}

/** Sets _ref to the side of the limb the joint bends toward (sign 1) or away (-1). */
function bendRef(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, sign: number) {
  _mid.addVectors(a, c).multiplyScalar(0.5);
  _ref.subVectors(b, _mid).multiplyScalar(sign);
  if (_ref.lengthSq() < 1e-6) _ref.copy(FWD);
}

function seg(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  g.position.copy(a);
  _dir.subVectors(b, a).normalize();
  orientY(_dir, _ref, g.quaternion);
}

function shade(hex: string, against: string): string {
  // Outline color: a darker/lighter version of the jersey for contrast.
  const c = new THREE.Color(hex);
  const n = new THREE.Color(against);
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  const nl = n.r * 0.3 + n.g * 0.59 + n.b * 0.11;
  return '#' + (Math.abs(lum - nl) > 0.4 ? c.clone().multiplyScalar(0.6) : lum > 0.5 ? new THREE.Color('#111') : new THREE.Color('#fff')).getHexString();
}

export function makeBall(): THREE.Mesh {
  const G = geo();
  const ball = new THREE.Mesh(G.ball, new THREE.MeshStandardMaterial({ color: '#6b3418', roughness: 0.55 }));
  ball.castShadow = true;
  for (const z of [-0.085, 0.085]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.006, 6, 20), new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }));
    ring.position.z = z;
    ball.add(ring);
  }
  return ball;
}
