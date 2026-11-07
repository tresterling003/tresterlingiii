import * as THREE from 'three';
import { mat, SNOW, woodTex, brickTex } from '../materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl, mesh, sphere, starGeo } from './kit';
import { makePresent } from './characters';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function makePine(h = 4, snowy = true, ornaments = false): THREE.Group {
  const g = new THREE.Group();
  const trunk = mesh(cyl(0.14 * h * 0.25, 0.2 * h * 0.25, h * 0.25, 8), mat(0x6d4c41, { rough: 0.9 }));
  trunk.position.y = h * 0.12;
  g.add(trunk);
  const greens = [0x1b5e20, 0x226b2a, 0x2e7d32];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const r = h * 0.32 * (1 - i * 0.2);
    const th = h * 0.36;
    const y = h * 0.22 + i * h * 0.19;
    const cone = mesh(new THREE.ConeGeometry(r, th, 9, 1), mat(greens[i % 3], { rough: 0.8, flat: true }));
    cone.position.y = y + th / 2;
    cone.rotation.y = i * 0.6;
    g.add(cone);
    if (snowy) {
      const cap = mesh(new THREE.ConeGeometry(r * 0.72, th * 0.45, 9, 1), mat(0xf7fbff, { rough: 0.9, flat: true }));
      cap.position.y = y + th * 0.79;
      cap.rotation.y = i * 0.6 + 0.2;
      g.add(cap);
    }
    if (ornaments) {
      const n = 6 - i;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + i;
        const o = mesh(sphere(h * 0.025, 10, 8), mat([0xe53935, 0xfdd835, 0x1e88e5, 0xab47bc][(k + i) % 4], { rough: 0.15, metal: 0.5 }));
        o.position.set(Math.cos(a) * r * 0.85, y + th * 0.18, Math.sin(a) * r * 0.85);
        g.add(o);
      }
    }
  }
  return bakeStatic(g);
}

export interface HouseOpts {
  w: number;
  d: number;
  h: number;
  wall: string;
  roof: number;
  door?: number;
  chimney?: boolean;
  brick?: boolean;
  sign?: THREE.Object3D;
}

/** Cosy cottage with snowy roof, glowing windows, chimney and icicles. Front faces +z. */
export function makeHouse(o: HouseOpts): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: o.brick ? brickTex(o.wall, [o.w / 2, o.h / 2]) : woodTex(o.wall, [o.w / 2, o.h / 2]), roughness: 0.85 });
  const walls = mesh(new THREE.BoxGeometry(o.w, o.h, o.d), wallMat);
  walls.position.y = o.h / 2;
  g.add(walls);
  // stone base
  const base = mesh(new THREE.BoxGeometry(o.w + 0.15, 0.4, o.d + 0.15), mat(0x90a4ae, { rough: 0.95 }));
  base.position.y = 0.2;
  g.add(base);
  // roof prism
  const rh = o.w * 0.45;
  const shape = new THREE.Shape();
  const ov = 0.45;
  shape.moveTo(-o.w / 2 - ov, 0);
  shape.lineTo(0, rh);
  shape.lineTo(o.w / 2 + ov, 0);
  shape.lineTo(-o.w / 2 - ov, 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: o.d + ov * 2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(o.d + ov * 2) / 2);
  const roof = mesh(roofGeo, mat(o.roof, { rough: 0.7 }));
  roof.position.y = o.h;
  g.add(roof);
  // snow on roof (two slanted slabs)
  const slope = Math.atan2(rh, o.w / 2 + ov);
  const slabLen = Math.hypot(rh, o.w / 2 + ov) + 0.1;
  for (const s of [-1, 1]) {
    const slab = mesh(new THREE.BoxGeometry(slabLen, 0.28, o.d + ov * 2 + 0.15), SNOW());
    slab.position.set((s * (o.w / 2 + ov)) / 2, o.h + rh / 2 + 0.14, 0);
    slab.rotation.z = -s * slope;
    g.add(slab);
  }
  // rounded snow ridge
  const ridge = mesh(new THREE.CapsuleGeometry(0.22, o.d + ov * 2 - 0.2, 4, 10), SNOW());
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = o.h + rh + 0.12;
  g.add(ridge);
  // icicles
  const ice = mat(0xdff4ff, { rough: 0.1, transparent: true, opacity: 0.85 });
  for (const s of [-1, 1]) {
    for (let z = -o.d / 2 - ov + 0.3; z < o.d / 2 + ov; z += 0.45) {
      const len = rnd(0.2, 0.55);
      const ic = mesh(new THREE.ConeGeometry(0.05, len, 5), ice, false);
      ic.rotation.x = Math.PI;
      ic.position.set(s * (o.w / 2 + ov - 0.05), o.h - len / 2, z);
      g.add(ic);
    }
  }
  // door
  const door = mesh(new THREE.BoxGeometry(o.w * 0.24, o.h * 0.55, 0.1), new THREE.MeshStandardMaterial({ map: woodTex('#' + new THREE.Color(o.door ?? 0x8d2a1d).getHexString()), roughness: 0.6 }));
  door.position.set(0, o.h * 0.275 + 0.2, o.d / 2 + 0.05);
  g.add(door);
  const knob = mesh(sphere(0.05, 8, 6), mat(0xffd54f, { metal: 0.8, rough: 0.3 }), false);
  knob.position.set(o.w * 0.08, o.h * 0.3 + 0.2, o.d / 2 + 0.12);
  g.add(knob);
  const wreath = mesh(new THREE.TorusGeometry(0.18, 0.07, 8, 16), mat(0x2e7d32, { rough: 0.9 }), false);
  wreath.position.set(0, o.h * 0.45 + 0.2, o.d / 2 + 0.13);
  g.add(wreath);
  // windows
  const glow = mat(0xffd27a, { emissive: 0xffb347, emissiveIntensity: 1.4, rough: 0.4 });
  const frame = mat(0xffffff, { rough: 0.6 });
  const winPos: [number, number, number, number][] = [
    [-o.w * 0.32, o.h * 0.55, o.d / 2 + 0.03, 0],
    [o.w * 0.32, o.h * 0.55, o.d / 2 + 0.03, 0],
    [o.w / 2 + 0.03, o.h * 0.55, 0, Math.PI / 2],
    [-o.w / 2 - 0.03, o.h * 0.55, 0, -Math.PI / 2],
  ];
  for (const [x, y, z, ry] of winPos) {
    const wg = new THREE.Group();
    const pane = mesh(new THREE.PlaneGeometry(0.7, 0.75), glow, false);
    wg.add(pane);
    const f1 = mesh(new THREE.BoxGeometry(0.8, 0.07, 0.06), frame, false);
    f1.position.y = 0.4;
    const f2 = f1.clone(); f2.position.y = -0.4;
    const f3 = mesh(new THREE.BoxGeometry(0.07, 0.85, 0.06), frame, false); f3.position.x = 0.4;
    const f4 = f3.clone(); f4.position.x = -0.4;
    const c1 = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), frame, false);
    const c2 = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), frame, false);
    const sill = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), SNOW(), false);
    sill.position.set(0, -0.45, 0.06);
    wg.add(f1, f2, f3, f4, c1, c2, sill);
    wg.position.set(x, y, z);
    wg.rotation.y = ry;
    g.add(wg);
  }
  if (o.chimney !== false) {
    const ch = mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), new THREE.MeshStandardMaterial({ map: brickTex('#a1483a', [1, 2]), roughness: 0.9 }));
    ch.position.set(o.w * 0.25, o.h + rh * 0.6 + 0.4, -o.d * 0.2);
    g.add(ch);
    const cap = mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), SNOW());
    cap.position.set(ch.position.x, ch.position.y + 0.75, ch.position.z);
    g.add(cap);
  }
  if (o.sign) {
    o.sign.position.set(0, o.h + 0.2, o.d / 2 + 0.6);
    g.add(o.sign);
  }
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh) { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; } });
  return bakeStatic(g);
}

export function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x263238, { rough: 0.4, metal: 0.6 });
  const pole = mesh(cyl(0.06, 0.09, 2.8, 10), iron);
  pole.position.y = 1.4;
  g.add(pole);
  const lamp = mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.45, 6), mat(0xfff1c1, { emissive: 0xffd27a, emissiveIntensity: 1.6 }));
  lamp.position.y = 3.0;
  g.add(lamp);
  const hat = mesh(new THREE.ConeGeometry(0.32, 0.25, 6), iron);
  hat.position.y = 3.35;
  g.add(hat);
  const snow = mesh(new THREE.ConeGeometry(0.26, 0.12, 6), SNOW());
  snow.position.y = 3.48;
  g.add(snow);
  const bow = mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12), mat(0xd32f2f), false);
  bow.position.set(0, 2.3, 0.08);
  g.add(bow);
  return bakeStatic(g);
}

export function makeFence(len: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xa1785a, { rough: 0.9 });
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const p = mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood);
    p.position.set(-len / 2 + (i / n) * len, 0.5, 0);
    g.add(p);
    const c = mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), SNOW(), false);
    c.position.set(p.position.x, 1.03, 0);
    g.add(c);
  }
  for (const y of [0.35, 0.75]) {
    const r = mesh(new THREE.BoxGeometry(len, 0.1, 0.06), wood);
    r.position.y = y;
    g.add(r);
  }
  return bakeStatic(g);
}

export function makeRock(s = 1): THREE.Mesh {
  const m = mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x8a96a8, { rough: 0.95, flat: true }));
  m.scale.set(1, 0.6, 0.9);
  m.rotation.set(Math.random(), Math.random(), Math.random());
  return m;
}

export function makeMountains(radius = 170, count = 26): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd(-0.08, 0.08);
    const h = rnd(35, 75);
    const r = rnd(25, 45);
    const rr = radius + rnd(-15, 25);
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), mat(0x7f93b8, { rough: 1, flat: true }));
    body.position.y = h / 2 - 2;
    m.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, h * 0.45, 7, 1), mat(0xffffff, { rough: 1, flat: true }));
    cap.position.y = h - 2 - h * 0.225 + 0.5;
    m.add(cap);
    m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    m.rotation.y = rnd(0, 6);
    g.add(m);
  }
  return g;
}

/** Big plaza Christmas tree with ornaments, a glowing star, and presents. */
export function makeGrandTree(): THREE.Group {
  const g = makePine(12, true, true);
  const star = mesh(starGeo(0.9, 0.4, 0.3), mat(0xffe55c, { emissive: 0xffc400, emissiveIntensity: 1.2, metal: 0.4, rough: 0.2 }));
  star.position.y = 12.8;
  star.name = 'treeStar';
  star.userData.dynamic = true;
  g.add(star);
  const pl = new THREE.PointLight(0xffe08a, 6, 18, 2);
  pl.position.y = 12.5;
  g.add(pl);
  const cols: [number, number][] = [[0xe53935, 0xfdd835], [0x1e88e5, 0xffffff], [0x43a047, 0xe53935], [0x8e24aa, 0xfdd835], [0xfb8c00, 0x1e88e5]];
  for (let i = 0; i < 9; i++) {
    const [a, b] = cols[i % cols.length];
    const p = makePresent(a, b, rnd(0.6, 1.0), rnd(0.7, 1.2));
    const ang = (i / 9) * Math.PI * 2;
    p.position.set(Math.cos(ang) * 4.6, 0, Math.sin(ang) * 4.6);
    p.rotation.y = ang;
    g.add(p);
  }
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  return bakeStatic(g);
}

export function makeArch(color: number, w = 5, h = 4.2): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * (w / 2), Math.sin(a) * (h - w / 2) + (i === 0 || i === 20 ? 0 : 0), 0));
  }
  const legL = mesh(cyl(0.22, 0.22, h - (h - w / 2) * 0, 12), mat(color, { rough: 0.4 }));
  legL.position.set(-w / 2, (w / 2 > h ? h : h - (h - w / 2)) / 2, 0);
  const archGeo = new THREE.TorusGeometry(w / 2, 0.24, 12, 32, Math.PI);
  const arch = mesh(archGeo, mat(color, { rough: 0.4 }));
  arch.position.y = h - w / 2;
  g.add(arch);
  for (const s of [-1, 1]) {
    const leg = mesh(cyl(0.24, 0.3, h - w / 2, 12), mat(color, { rough: 0.4 }));
    leg.position.set((s * w) / 2, (h - w / 2) / 2, 0);
    g.add(leg);
    const cap = mesh(sphere(0.35, 12, 10), SNOW());
    cap.scale.y = 0.5;
    cap.position.set((s * w) / 2, 0.1, 0);
    g.add(cap);
  }
  void legL;
  void pts;
  return g;
}

export function makeBridge(len: number, w: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex('#a0703f'), roughness: 0.8 });
  const n = Math.floor(len / 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = mesh(new THREE.BoxGeometry(w, 0.14, 0.42), wood);
    p.position.set(0, 0.3 + Math.sin(t * Math.PI) * 0.6, -len / 2 + t * len);
    p.rotation.x = Math.cos(t * Math.PI) * -0.25;
    g.add(p);
  }
  const rail = mat(0x8d5a2b, { rough: 0.8 });
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const post = mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), rail);
      post.position.set((s * w) / 2, 0.8 + Math.sin(t * Math.PI) * 0.6, -len / 2 + t * len);
      g.add(post);
    }
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3((s * w) / 2, 1.3 + Math.sin(t * Math.PI) * 0.6, -len / 2 + t * len));
    }
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 6), rail);
    g.add(tube);
  }
  return bakeStatic(g);
}

/** Wooden signpost with an emoji picture (kids can't read, pictures guide them). */
export function makeSignpost(sprite: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), mat(0x8d5a2b));
  post.position.y = 1.1;
  g.add(post);
  sprite.position.y = 2.7;
  g.add(sprite);
  return g;
}

/** Many pines in a handful of draw calls (one InstancedMesh per material). */
export function instancedPines(spots: { x: number; y?: number; z: number; s: number }[]): THREE.Group {
  const out = new THREE.Group();
  const proto = makePine(1, true);
  proto.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  proto.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo.deleteAttribute('uv');
    const arr = byMat.get(m.material as THREE.Material) ?? [];
    arr.push(geo);
    byMat.set(m.material as THREE.Material, arr);
  });
  const mats = spots.map((p) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)), new THREE.Vector3(p.s, p.s * (0.9 + Math.random() * 0.3), p.s)));
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const im = new THREE.InstancedMesh(merged, m, mats.length);
    mats.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.castShadow = true;
    im.receiveShadow = true;
    out.add(im);
  }
  return out;
}

/**
 * Merge all static meshes under `root` that share a material into single meshes (fewer draw calls).
 * Lights, sprites and anything flagged userData.dynamic are kept as-is.
 */
export function bakeStatic<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const shadow = new Map<THREE.Material, boolean>();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o === root) return;
    let p: THREE.Object3D | null = o;
    while (p && p !== root) { if (p.userData.dynamic) return; p = p.parent; }
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = m.material as THREE.Material;
    const arr = groups.get(mat) ?? [];
    arr.push(g);
    groups.set(mat, arr);
    shadow.set(mat, (shadow.get(mat) ?? false) || m.castShadow);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow.get(mat) ?? true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
