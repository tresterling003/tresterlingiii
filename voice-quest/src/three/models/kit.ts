import * as THREE from 'three';
import { mat } from '../materials';

export function add<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x = 0, y = 0, z = 0): T {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

export const sphere = (r: number, ws = 24, hs = 18) => new THREE.SphereGeometry(r, ws, hs);
export const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 16);
export const cyl = (rt: number, rb: number, h: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Cartoon eye: white + pupil + highlight. Returns the group so it can blink (scale.y). */
export function eye(r = 0.09, pupilColor = 0x2b1d14): THREE.Group {
  const g = new THREE.Group();
  const white = mesh(sphere(r, 16, 12), mat(0xffffff, { rough: 0.2 }), false);
  white.scale.set(1, 1.15, 0.6);
  g.add(white);
  const pupil = mesh(sphere(r * 0.62, 16, 12), mat(pupilColor, { rough: 0.2 }), false);
  pupil.position.set(0, -r * 0.1, r * 0.38);
  pupil.scale.set(1, 1.1, 0.5);
  g.add(pupil);
  const hl = mesh(sphere(r * 0.22, 8, 6), mat(0xffffff, { rough: 0, emissive: 0xffffff, emissiveIntensity: 0.6 }), false);
  hl.position.set(r * 0.25, r * 0.22, r * 0.62);
  g.add(hl);
  return g;
}

/** Curved smile made from a torus arc. Flip = frown. */
export function smile(radius = 0.1, tube = 0.018, color = 0x5a2620, arc = Math.PI * 0.8): THREE.Mesh {
  const m = mesh(new THREE.TorusGeometry(radius, tube, 8, 20, arc), mat(color, { rough: 0.4 }), false);
  m.rotation.z = Math.PI + (Math.PI - arc) / 2;
  return m;
}

/** Five-point star shape. */
export function starShape(outer = 0.5, inner = 0.22): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function starGeo(outer = 0.5, inner = 0.22, depth = 0.18): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(starShape(outer, inner), { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
  g.center();
  return g;
}

export function shadowBlob(r = 0.5): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(40,60,110,0.35)');
  gr.addColorStop(1, 'rgba(40,60,110,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
