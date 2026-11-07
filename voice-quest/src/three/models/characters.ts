import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { mat, matUnique, SNOW, candyStripeMat } from '../materials';
import { add, capsule, cyl, damp, eye, mesh, shadowBlob, smile, sphere, starGeo } from './kit';

// ---------------------------------------------------------------- items

export type ItemKind = 'hat' | 'scarf' | 'carrot' | 'buttons' | 'ball' | 'present' | 'mitten' | 'bell' | 'sock';

export function makeItem(kind: ItemKind, color?: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'hat': {
      const c = color ?? 0x263238;
      const brim = mesh(cyl(0.42, 0.42, 0.05, 28), mat(c, { rough: 0.5 }));
      g.add(brim);
      const top = mesh(cyl(0.27, 0.29, 0.5, 28), mat(c, { rough: 0.5 }));
      top.position.y = 0.27;
      g.add(top);
      const band = mesh(cyl(0.295, 0.295, 0.09, 28), mat(0xd32f2f, { rough: 0.4 }));
      band.position.y = 0.08;
      g.add(band);
      const holly = mesh(sphere(0.05), mat(0xe53935, { rough: 0.3 }));
      holly.position.set(0.18, 0.12, 0.24);
      g.add(holly);
      break;
    }
    case 'scarf': {
      const c = color ?? 0x43a047;
      const t = mesh(new THREE.TorusGeometry(0.35, 0.1, 10, 24), mat(c, { rough: 0.9 }));
      t.rotation.x = Math.PI / 2;
      g.add(t);
      for (const x of [-0.08, 0.1]) {
        const tail = mesh(new THREE.BoxGeometry(0.16, 0.5, 0.06), mat(c, { rough: 0.9 }));
        tail.position.set(x + 0.2, -0.22, 0.3);
        tail.rotation.z = x * 2;
        g.add(tail);
      }
      for (let i = 0; i < 3; i++) {
        const s = mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 24), mat(0xffffff, { rough: 0.9 }));
        s.rotation.x = Math.PI / 2;
        s.position.y = -0.06 + i * 0.06;
        s.scale.setScalar(1.04);
        if (i === 1) g.add(s);
      }
      break;
    }
    case 'carrot': {
      const cone = mesh(new THREE.ConeGeometry(0.1, 0.5, 14), mat(0xff7a1a, { rough: 0.5 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.z = 0.25;
      g.add(cone);
      for (let i = 0; i < 3; i++) {
        const leaf = mesh(new THREE.ConeGeometry(0.03, 0.2, 6), mat(0x43a047));
        leaf.position.set(Math.sin(i * 2) * 0.03, 0.05, -0.05);
        leaf.rotation.set(-1.2, 0, (i - 1) * 0.5);
        g.add(leaf);
      }
      break;
    }
    case 'buttons': {
      for (let i = 0; i < 3; i++) {
        const b = mesh(sphere(0.09, 12, 10), mat(0x212121, { rough: 0.35 }));
        b.scale.set(1, 1, 0.6);
        b.position.set((i - 1) * 0.22, Math.abs(i - 1) * -0.04, 0);
        g.add(b);
      }
      break;
    }
    case 'ball': {
      const m = mesh(sphere(0.32, 24, 18), mat(color ?? 0xe53935, { rough: 0.35 }));
      g.add(m);
      const stripe = mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 32), mat(0xffffff, { rough: 0.35 }));
      g.add(stripe);
      const stripe2 = stripe.clone();
      stripe2.rotation.y = Math.PI / 2;
      g.add(stripe2);
      break;
    }
    case 'present': {
      g.add(makePresent(color ?? 0x8e24aa, 0xfdd835, 0.6));
      break;
    }
    case 'mitten': {
      const m = mesh(sphere(0.22, 16, 12), mat(color ?? 0xe53935, { rough: 0.9 }));
      m.scale.set(1, 1.3, 0.6);
      g.add(m);
      const th = mesh(sphere(0.09, 10, 8), mat(color ?? 0xe53935, { rough: 0.9 }));
      th.position.set(0.18, 0.05, 0);
      g.add(th);
      const cuff = mesh(cyl(0.2, 0.2, 0.12, 16), mat(0xffffff, { rough: 0.95 }));
      cuff.position.y = -0.27;
      cuff.scale.z = 0.6;
      g.add(cuff);
      break;
    }
    case 'bell':
      g.add(makeBell(0.35));
      break;
    case 'sock': {
      const s = mesh(capsule(0.14, 0.4), mat(0xd32f2f, { rough: 0.9 }));
      g.add(s);
      const foot = mesh(capsule(0.14, 0.2), mat(0xd32f2f, { rough: 0.9 }));
      foot.rotation.z = Math.PI / 2;
      foot.position.set(0.12, -0.28, 0);
      g.add(foot);
      const cuff = mesh(cyl(0.17, 0.17, 0.15, 16), mat(0xffffff, { rough: 0.95 }));
      cuff.position.y = 0.3;
      g.add(cuff);
      break;
    }
  }
  return g;
}

export function makePresent(box: number, ribbon: number, size = 1, h = 1): THREE.Group {
  const g = new THREE.Group();
  const s = size;
  const b = mesh(new THREE.BoxGeometry(s, s * h, s), mat(box, { rough: 0.45 }));
  b.position.y = (s * h) / 2;
  g.add(b);
  const rm = mat(ribbon, { rough: 0.3, metal: 0.2 });
  const r1 = mesh(new THREE.BoxGeometry(s * 1.02, s * h * 1.01, s * 0.16), rm);
  r1.position.y = (s * h) / 2;
  g.add(r1);
  const r2 = mesh(new THREE.BoxGeometry(s * 0.16, s * h * 1.01, s * 1.02), rm);
  r2.position.y = (s * h) / 2;
  g.add(r2);
  for (const sgn of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(s * 0.14, s * 0.045, 8, 16), rm);
    loop.position.set(sgn * s * 0.12, s * h + s * 0.1, 0);
    loop.rotation.set(0, Math.PI / 2, sgn * 0.6);
    g.add(loop);
  }
  return g;
}

export function makeBell(size = 0.5): THREE.Group {
  const g = new THREE.Group();
  const pts = [0.02, 0.18, 0.22, 0.24, 0.28, 0.36, 0.46, 0.5].map((r, i, a) => new THREE.Vector2(r * size * 2, (a.length - 1 - i) * size * 0.14));
  const body = mesh(new THREE.LatheGeometry(pts, 24), mat(0xffc93c, { rough: 0.2, metal: 0.85 }));
  (body.material as THREE.Material).side = THREE.DoubleSide;
  g.add(body);
  const clapper = mesh(sphere(size * 0.16), mat(0xb8860b, { metal: 0.8, rough: 0.3 }));
  clapper.position.y = -size * 0.05;
  g.add(clapper);
  const bow = mesh(new THREE.TorusGeometry(size * 0.2, size * 0.07, 8, 16), mat(0xd32f2f));
  bow.position.y = size * 1.05;
  g.add(bow);
  return g;
}

export function makeCoin(): THREE.Mesh {
  const m = mesh(cyl(0.35, 0.35, 0.08, 24), mat(0xffc93c, { rough: 0.2, metal: 0.9, emissive: 0x6b4a00, emissiveIntensity: 0.4 }));
  m.rotation.x = Math.PI / 2;
  return m;
}

export function makeStar(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const s = mesh(starGeo(0.5 * scale, 0.22 * scale, 0.16 * scale), mat(0xffe55c, { rough: 0.15, metal: 0.4, emissive: 0xffb300, emissiveIntensity: 0.9 }));
  g.add(s);
  const light = new THREE.PointLight(0xffe08a, 2, 5, 2);
  g.add(light);
  return g;
}

// ---------------------------------------------------------------- snowman

export type SnowmanSlot = 'hat' | 'scarf' | 'carrot' | 'buttons';

export class Snowman extends THREE.Group {
  slots: Record<SnowmanSlot, THREE.Object3D>;
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private browL!: THREE.Mesh;
  private browR!: THREE.Mesh;
  private mouthHappy!: THREE.Group;
  private mouthSad!: THREE.Group;
  private head = new THREE.Group();
  private t = Math.random() * 10;
  happy = false;
  dancing = 0;
  constructor(scarfColor = 0x43a047, hatColor = 0x263238) {
    super();
    this.add(this.body);
    this.add(shadowBlob(1.1));
    const snow = SNOW();
    const bottom = mesh(sphere(0.95, 32, 24), snow);
    bottom.position.y = 0.85;
    bottom.scale.y = 0.92;
    this.body.add(bottom);
    const mid = mesh(sphere(0.7, 32, 24), snow);
    mid.position.y = 2.05;
    this.body.add(mid);
    add(this.body, this.head, 0, 2.95, 0);
    const head = mesh(sphere(0.5, 32, 24), snow);
    this.head.add(head);
    for (const x of [-0.17, 0.17]) {
      const e = eye(0.09, 0x111111);
      e.position.set(x, 0.1, 0.43);
      this.head.add(e);
    }
    this.browL = mesh(capsule(0.025, 0.12), mat(0x333333), false);
    this.browL.rotation.z = Math.PI / 2;
    this.browL.position.set(-0.17, 0.27, 0.45);
    this.browR = this.browL.clone();
    this.browR.position.x = 0.17;
    this.head.add(this.browL, this.browR);
    // coal mouths
    const coalMat = mat(0x1d1d1d, { rough: 0.6 });
    this.mouthHappy = new THREE.Group();
    this.mouthSad = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.6;
      const c1 = mesh(sphere(0.035, 8, 6), coalMat, false);
      c1.position.set(Math.sin(a) * 0.22, -0.13 - Math.cos(a) * 0.08 + 0.08, 0.45 - Math.abs(a) * 0.04);
      this.mouthHappy.add(c1);
      const c2 = c1.clone();
      c2.position.y = -0.2 + Math.cos(a) * 0.06;
      this.mouthSad.add(c2);
    }
    this.head.add(this.mouthHappy, this.mouthSad);
    // arms
    const stick = mat(0x6d4c41, { rough: 0.8 });
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      add(this.body, arm, 0.62 * s, 2.2, 0);
      const a = mesh(cyl(0.035, 0.05, 1.0, 6), stick);
      a.position.x = 0.45 * s;
      a.rotation.z = (Math.PI / 2) * -s + 0.0;
      arm.add(a);
      for (const fy of [0.15, -0.12]) {
        const f = mesh(cyl(0.02, 0.025, 0.25, 5), stick);
        f.position.set(0.88 * s, fy * 0.5, 0);
        f.rotation.z = -s * (Math.PI / 2 - fy * 4);
        arm.add(f);
      }
      arm.rotation.z = s * 0.4;
    }
    // slots
    const hat = makeItem('hat', hatColor);
    hat.position.set(0, 0.38, 0);
    hat.rotation.z = 0.12;
    this.head.add(hat);
    const scarf = makeItem('scarf', scarfColor);
    scarf.position.set(0, 2.55, 0);
    scarf.scale.set(1.25, 1, 1.25);
    this.body.add(scarf);
    const nose = makeItem('carrot');
    nose.position.set(0, -0.02, 0.42);
    this.head.add(nose);
    const buttons = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = mesh(sphere(0.08, 12, 10), coalMat);
      b.position.set(0, 1.85 + i * 0.22 - 0.1, 0.66 - Math.abs(i - 1) * 0.04);
      buttons.add(b);
    }
    this.body.add(buttons);
    this.slots = { hat, scarf, carrot: nose, buttons };
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  setHas(slot: SnowmanSlot, has: boolean): void {
    this.slots[slot].visible = has;
  }

  setHappy(h: boolean): void {
    this.happy = h;
  }

  dance(seconds = 3): void {
    this.dancing = seconds;
  }

  update(dt: number, reduced: boolean): void {
    this.t += dt;
    this.mouthHappy.visible = this.happy;
    this.mouthSad.visible = !this.happy;
    const browTilt = this.happy ? 0.25 : -0.35;
    this.browL.rotation.z = Math.PI / 2 + browTilt;
    this.browR.rotation.z = Math.PI / 2 - browTilt;
    if (this.dancing > 0) {
      this.dancing -= dt;
      const k = this.t * 7;
      this.body.rotation.z = reduced ? 0 : Math.sin(k) * 0.18;
      this.body.position.y = Math.abs(Math.sin(k)) * (reduced ? 0.05 : 0.3);
      this.armL.rotation.z = -0.4 - Math.sin(k) * 0.9;
      this.armR.rotation.z = 0.4 + Math.sin(k) * 0.9;
      this.head.rotation.y = Math.sin(k * 0.5) * 0.4;
    } else {
      this.body.rotation.z = damp(this.body.rotation.z, Math.sin(this.t) * 0.03, 4, dt);
      this.body.position.y = damp(this.body.position.y, 0, 6, dt);
      this.armL.rotation.z = damp(this.armL.rotation.z, (this.happy ? -0.7 : -0.15) + Math.sin(this.t * 2) * 0.12, 4, dt);
      this.armR.rotation.z = damp(this.armR.rotation.z, (this.happy ? 0.7 : 0.15) - Math.sin(this.t * 2.3) * 0.12, 4, dt);
      this.head.rotation.y = damp(this.head.rotation.y, Math.sin(this.t * 0.6) * 0.2, 3, dt);
      this.head.rotation.x = this.happy ? 0 : 0.12;
    }
  }
}

// ---------------------------------------------------------------- reindeer

export class Reindeer extends THREE.Group {
  private legs: THREE.Group[] = [];
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail!: THREE.Mesh;
  private nose!: THREE.Mesh;
  private noseLight: THREE.PointLight;
  private collar = new THREE.Group();
  private blanket!: THREE.Mesh;
  private antlerBulbs = new THREE.Group();
  private t = 0;
  private phase = 0;
  constructor() {
    super();
    const fur = mat(0x9a6a43, { rough: 0.85 });
    const belly = mat(0xe8cfae, { rough: 0.9 });
    const hoof = mat(0x3e2723, { rough: 0.5 });
    this.add(this.body);
    this.add(shadowBlob(1.0));
    const torso = mesh(capsule(0.42, 0.9), fur);
    torso.position.y = 1.2;
    torso.rotation.set(Math.PI / 2, 0, 0); // capsule lies along z
    this.body.add(torso);
    const bel = mesh(capsule(0.34, 0.7), belly);
    bel.rotation.set(Math.PI / 2, 0, 0);
    bel.position.set(0, 1.08, 0);
    bel.scale.set(0.95, 1, 0.9);
    this.body.add(bel);
    // legs
    for (const [x, z] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 1.0, z);
      const l = mesh(capsule(0.1, 0.6), fur);
      l.position.y = -0.4;
      leg.add(l);
      const h = mesh(cyl(0.11, 0.12, 0.12, 12), hoof);
      h.position.y = -0.82;
      leg.add(h);
      this.body.add(leg);
      this.legs.push(leg);
    }
    // neck & head
    const neck = mesh(capsule(0.2, 0.5), fur);
    neck.position.set(0, 1.65, 0.7);
    neck.rotation.x = 0.6;
    this.body.add(neck);
    add(this.body, this.head, 0, 2.05, 0.95);
    const skull = mesh(sphere(0.32, 24, 18), fur);
    skull.scale.set(1, 0.95, 1.1);
    this.head.add(skull);
    const snout = mesh(sphere(0.22, 20, 14), belly);
    snout.position.set(0, -0.1, 0.28);
    snout.scale.set(1, 0.8, 1.1);
    this.head.add(snout);
    this.nose = mesh(sphere(0.09, 14, 10), mat(0x3e2723, { rough: 0.3 }));
    this.nose.position.set(0, -0.04, 0.5);
    this.head.add(this.nose);
    this.noseLight = new THREE.PointLight(0xff3030, 0, 3, 2);
    this.noseLight.position.copy(this.nose.position);
    this.head.add(this.noseLight);
    for (const x of [-0.14, 0.14]) {
      const e = eye(0.075, 0x1a1a1a);
      e.position.set(x, 0.1, 0.26);
      this.head.add(e);
      const ear = mesh(sphere(0.1, 12, 8), fur);
      ear.scale.set(0.5, 1.4, 0.4);
      ear.position.set(x * 2.4, 0.15, -0.05);
      ear.rotation.z = x > 0 ? -1.0 : 1.0;
      this.head.add(ear);
    }
    const m = smile(0.08, 0.015, 0x3e2723);
    m.position.set(0, -0.2, 0.44);
    this.head.add(m);
    // antlers
    const am = mat(0xd7b98e, { rough: 0.7 });
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(0.15 * s, 0.25, -0.05);
      a.rotation.z = -0.35 * s;
      const main = mesh(capsule(0.045, 0.5), am);
      main.position.y = 0.25;
      a.add(main);
      for (const [y, ang, len] of [[0.2, 0.9, 0.22], [0.38, -0.7, 0.2], [0.5, 0.8, 0.16]]) {
        const b = mesh(capsule(0.035, len), am);
        b.position.set(Math.sign(ang) * 0.08 * s, y + 0.05, 0);
        b.rotation.z = -ang * s;
        a.add(b);
        const bulb = mesh(sphere(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: [0xff4d4d, 0x4dff88, 0x4dc3ff][Math.floor(y * 10) % 3], toneMapped: false }), false);
        bulb.position.set(Math.sign(ang) * 0.17 * s, y + 0.12, 0);
        this.antlerBulbs.add(bulb);
        a.add(bulb);
      }
      this.head.add(a);
    }
    // tail
    this.tail = mesh(sphere(0.13, 12, 8), belly);
    this.tail.position.set(0, 1.35, -0.85);
    this.body.add(this.tail);
    // blanket
    this.blanket = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.7, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1), matUnique(0x1e88e5, 0.8));
    (this.blanket.material as THREE.Material).side = THREE.DoubleSide;
    this.blanket.rotation.set(Math.PI / 2, 0, 0);
    this.blanket.position.y = 1.22;
    this.body.add(this.blanket);
    // collar with bells
    const band = mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 20), mat(0xc62828));
    band.rotation.x = Math.PI / 2 + 0.6;
    band.position.set(0, 1.75, 0.78);
    this.collar.add(band);
    for (let i = -1; i <= 1; i++) {
      const b = makeBell(0.1);
      b.position.set(i * 0.14, 1.55, 0.95);
      this.collar.add(b);
    }
    this.body.add(this.collar);
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.setLook({ blanket: '#1e88e5', redNose: false, bellCollar: false, antlerLights: false });
  }

  setLook(l: { blanket: string; redNose: boolean; bellCollar: boolean; antlerLights: boolean }): void {
    (this.blanket.material as THREE.MeshStandardMaterial).color.set(l.blanket);
    this.nose.material = l.redNose ? mat(0xff2a2a, { emissive: 0xff0000, emissiveIntensity: 1.2, rough: 0.2 }) : mat(0x3e2723, { rough: 0.3 });
    this.noseLight.intensity = l.redNose ? 3 : 0;
    this.collar.visible = l.bellCollar;
    this.antlerBulbs.visible = l.antlerLights;
  }

  update(dt: number, speed: number, grounded: boolean): void {
    this.t += dt;
    this.phase += dt * (3 + speed * 1.3);
    const amp = grounded ? Math.min(1, speed / 4) * 0.8 : 0.5;
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * amp;
    this.legs[1].rotation.x = Math.sin(this.phase + 0.5) * amp;
    this.legs[2].rotation.x = -s * amp;
    this.legs[3].rotation.x = -Math.sin(this.phase + 0.5) * amp;
    if (!grounded) for (const l of this.legs) l.rotation.x = damp(l.rotation.x, l.position.z > 0 ? -0.9 : 0.9, 10, dt);
    this.body.position.y = grounded ? Math.abs(Math.cos(this.phase)) * 0.12 * Math.min(1, speed / 3) : 0;
    this.body.rotation.x = grounded ? Math.sin(this.phase * 2) * 0.03 : -0.1;
    this.head.rotation.x = Math.sin(this.phase * 2) * 0.05 + (speed < 0.5 ? Math.sin(this.t) * 0.06 : 0);
    this.tail.position.y = 1.35 + Math.sin(this.t * 10) * 0.03;
    for (const [i, b] of this.antlerBulbs.children.entries()) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHSL((this.t * 0.3 + i * 0.15) % 1, 1, 0.6);
  }
}

// ---------------------------------------------------------------- toy robot (built in the factory)

export type RobotPart = 'wheels' | 'body' | 'head' | 'arms' | 'antenna';

export class ToyRobot extends THREE.Group {
  parts: Record<RobotPart, THREE.Group> = { wheels: new THREE.Group(), body: new THREE.Group(), head: new THREE.Group(), arms: new THREE.Group(), antenna: new THREE.Group() };
  private t = 0;
  alive = false;
  private eyesMat = new THREE.MeshBasicMaterial({ color: 0x3df5ff, toneMapped: false });
  constructor(colors: Partial<Record<RobotPart, number>> = {}) {
    super();
    for (const p of Object.values(this.parts)) this.add(p);
    this.setColors(colors);
  }

  setColors(c: Partial<Record<RobotPart, number>>): void {
    for (const p of Object.values(this.parts)) p.clear();
    const wc = c.wheels ?? 0x1e88e5;
    for (const x of [-0.55, 0.55]) {
      const w = mesh(cyl(0.32, 0.32, 0.22, 24), mat(wc, { rough: 0.4 }));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.32, 0);
      this.parts.wheels.add(w);
      const hub = mesh(cyl(0.12, 0.12, 0.25, 12), mat(0xeeeeee, { metal: 0.6, rough: 0.3 }));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.32, 0);
      this.parts.wheels.add(hub);
    }
    const bc = c.body ?? 0xe53935;
    const torso = mesh(new THREE.BoxGeometry(0.95, 0.8, 0.7), mat(bc, { rough: 0.35 }));
    torso.position.y = 0.95;
    this.parts.body.add(torso);
    const panel = mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), mat(0xfafafa, { rough: 0.3 }));
    panel.position.set(0, 0.98, 0.36);
    this.parts.body.add(panel);
    for (let i = 0; i < 3; i++) {
      const btn = mesh(sphere(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: [0xff5252, 0xffeb3b, 0x69f0ae][i], toneMapped: false }), false);
      btn.position.set(-0.15 + i * 0.15, 0.98, 0.39);
      this.parts.body.add(btn);
    }
    const hc = c.head ?? 0xfdd835;
    const head = mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), mat(hc, { rough: 0.35 }));
    head.position.y = 1.65;
    this.parts.head.add(head);
    const visor = mesh(new THREE.BoxGeometry(0.55, 0.22, 0.05), mat(0x263238, { rough: 0.2 }));
    visor.position.set(0, 1.68, 0.31);
    this.parts.head.add(visor);
    for (const x of [-0.13, 0.13]) {
      const e = mesh(sphere(0.06, 10, 8), this.eyesMat, false);
      e.position.set(x, 1.68, 0.34);
      this.parts.head.add(e);
    }
    const ac = c.arms ?? 0x43a047;
    for (const s of [-1, 1]) {
      const arm = mesh(capsule(0.09, 0.45), mat(ac, { rough: 0.4 }));
      arm.position.set(0.6 * s, 0.95, 0);
      arm.rotation.z = 0.3 * s;
      this.parts.arms.add(arm);
      const claw = mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI * 1.4), mat(0xbdbdbd, { metal: 0.6, rough: 0.3 }));
      claw.position.set(0.72 * s, 0.62, 0);
      this.parts.arms.add(claw);
    }
    const tc = c.antenna ?? 0x8e24aa;
    const rod = mesh(cyl(0.025, 0.025, 0.35, 8), mat(0x9e9e9e, { metal: 0.6, rough: 0.3 }));
    rod.position.y = 2.08;
    this.parts.antenna.add(rod);
    const ball = mesh(sphere(0.09, 12, 8), mat(tc, { emissive: tc, emissiveIntensity: 0.8 }));
    ball.position.y = 2.3;
    this.parts.antenna.add(ball);
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  show(part: RobotPart, v: boolean): void {
    this.parts[part].visible = v;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.alive) {
      this.parts.head.rotation.y = Math.sin(this.t * 2) * 0.4;
      this.parts.arms.rotation.x = Math.sin(this.t * 6) * 0.2;
      this.position.y = Math.abs(Math.sin(this.t * 5)) * 0.15;
      this.eyesMat.color.setHSL(0.5 + Math.sin(this.t * 3) * 0.05, 1, 0.6);
    }
    this.parts.antenna.rotation.z = Math.sin(this.t * 3) * 0.15;
  }
}

// ---------------------------------------------------------------- animals

export type AnimalKind = 'puppy' | 'kitty' | 'penguin' | 'owl' | 'bunny';

export class Animal extends THREE.Group {
  private body = new THREE.Group();
  private head = new THREE.Group();
  private t = Math.random() * 10;
  private tail: THREE.Object3D | null = null;
  hop = 0;
  constructor(public kind: AnimalKind) {
    super();
    this.add(this.body);
    this.add(shadowBlob(0.5));
    const pal: Record<AnimalKind, [number, number]> = { puppy: [0xc8935a, 0xf5e1c8], kitty: [0x9e9e9e, 0xf5f5f5], penguin: [0x263238, 0xffffff], owl: [0x8d6e63, 0xd7ccc8], bunny: [0xffffff, 0xffcdd2] };
    const [c1, c2] = pal[kind];
    const m1 = mat(c1, { rough: 0.85 });
    const m2 = mat(c2, { rough: 0.85 });
    const torso = mesh(sphere(0.35, 20, 16), m1);
    torso.scale.set(1, kind === 'penguin' || kind === 'owl' ? 1.3 : 1, kind === 'puppy' || kind === 'kitty' ? 1.3 : 1);
    torso.position.y = 0.4;
    this.body.add(torso);
    const tummy = mesh(sphere(0.26, 16, 12), m2);
    tummy.position.set(0, 0.36, 0.17);
    tummy.scale.set(1, 1.1, 0.6);
    this.body.add(tummy);
    const headY = kind === 'penguin' || kind === 'owl' ? 0.95 : 0.8;
    add(this.body, this.head, 0, headY, kind === 'puppy' || kind === 'kitty' ? 0.3 : 0.05);
    const h = mesh(sphere(0.3, 20, 16), m1);
    this.head.add(h);
    for (const x of [-0.11, 0.11]) {
      const e = eye(kind === 'owl' ? 0.1 : 0.07, 0x111111);
      e.position.set(x, 0.05, 0.25);
      this.head.add(e);
    }
    if (kind === 'puppy') {
      for (const s of [-1, 1]) {
        const ear = mesh(sphere(0.13, 12, 8), mat(0x8d5a2b, { rough: 0.9 }));
        ear.scale.set(0.5, 1.2, 0.8);
        ear.position.set(0.26 * s, -0.05, 0);
        ear.rotation.z = 0.3 * s;
        this.head.add(ear);
      }
      const snout = mesh(sphere(0.13, 12, 8), m2);
      snout.position.set(0, -0.08, 0.25);
      this.head.add(snout);
      const n = mesh(sphere(0.05, 8, 6), mat(0x111111, { rough: 0.2 }));
      n.position.set(0, -0.03, 0.37);
      this.head.add(n);
      this.tail = mesh(capsule(0.05, 0.2), m1);
      this.tail.position.set(0, 0.55, -0.42);
      this.tail.rotation.x = -0.8;
      this.body.add(this.tail);
    } else if (kind === 'kitty') {
      for (const s of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.1, 0.18, 4), m1);
        ear.position.set(0.17 * s, 0.25, 0);
        ear.rotation.z = -0.3 * s;
        this.head.add(ear);
      }
      const n = mesh(sphere(0.035, 8, 6), mat(0xff8a80));
      n.position.set(0, -0.04, 0.29);
      this.head.add(n);
      const tail = mesh(new THREE.TorusGeometry(0.25, 0.045, 8, 16, Math.PI), m1);
      tail.position.set(0, 0.6, -0.45);
      tail.rotation.y = Math.PI / 2;
      this.tail = tail;
      this.body.add(tail);
    } else if (kind === 'penguin') {
      const beak = mesh(new THREE.ConeGeometry(0.06, 0.16, 8), mat(0xff9800));
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, -0.05, 0.33);
      this.head.add(beak);
      for (const s of [-1, 1]) {
        const flip = mesh(sphere(0.12, 10, 8), m1);
        flip.scale.set(0.3, 1, 0.6);
        flip.position.set(0.34 * s, 0.45, 0);
        this.body.add(flip);
        const foot = mesh(sphere(0.08, 10, 8), mat(0xff9800));
        foot.scale.set(1, 0.4, 1.4);
        foot.position.set(0.12 * s, 0.03, 0.1);
        this.body.add(foot);
      }
      const hat = mesh(new THREE.ConeGeometry(0.2, 0.35, 16), mat(0xd32f2f));
      hat.position.y = 0.38;
      hat.rotation.z = 0.2;
      this.head.add(hat);
    } else if (kind === 'owl') {
      const beak = mesh(new THREE.ConeGeometry(0.04, 0.1, 6), mat(0xffb300));
      beak.rotation.x = Math.PI / 2 + 0.4;
      beak.position.set(0, -0.06, 0.3);
      this.head.add(beak);
      for (const s of [-1, 1]) {
        const tuft = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), m1);
        tuft.position.set(0.17 * s, 0.28, 0);
        tuft.rotation.z = -0.4 * s;
        this.head.add(tuft);
        const wing = mesh(sphere(0.18, 10, 8), mat(0x6d4c41, { rough: 0.9 }));
        wing.scale.set(0.35, 1, 0.8);
        wing.position.set(0.33 * s, 0.45, -0.02);
        this.body.add(wing);
      }
    } else if (kind === 'bunny') {
      for (const s of [-1, 1]) {
        const ear = mesh(capsule(0.07, 0.35), m1);
        ear.position.set(0.1 * s, 0.4, -0.05);
        ear.rotation.z = -0.15 * s;
        this.head.add(ear);
      }
      const n = mesh(sphere(0.04, 8, 6), mat(0xff8a80));
      n.position.set(0, -0.04, 0.29);
      this.head.add(n);
      this.tail = mesh(sphere(0.1, 10, 8), mat(0xffffff, { rough: 1 }));
      this.tail.position.set(0, 0.35, -0.38);
      this.body.add(this.tail);
    }
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  update(dt: number, moving: boolean): void {
    this.t += dt;
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
    const hopY = this.hop > 0 ? Math.sin((this.hop / 0.6) * Math.PI) * 0.6 : 0;
    this.body.position.y = (moving ? Math.abs(Math.sin(this.t * 9)) * 0.12 : Math.sin(this.t * 2) * 0.015) + hopY;
    this.head.rotation.z = Math.sin(this.t * 1.5) * 0.12;
    if (this.tail) this.tail.rotation.z = Math.sin(this.t * (this.kind === 'puppy' ? 14 : 3)) * 0.5;
    if (this.kind === 'penguin') this.body.rotation.z = moving ? Math.sin(this.t * 9) * 0.15 : 0;
  }
}

// ---------------------------------------------------------------- guide fairy "Twinkle"

export class Twinkle extends THREE.Group {
  private star: THREE.Mesh;
  private wings: THREE.Mesh[] = [];
  private t = 0;
  talking = false;
  light: THREE.PointLight;
  constructor() {
    super();
    this.star = mesh(starGeo(0.42, 0.22, 0.2), mat(0xfff176, { rough: 0.2, emissive: 0xffc400, emissiveIntensity: 0.7 }), false);
    this.add(this.star);
    for (const x of [-0.1, 0.1]) {
      const e = eye(0.06, 0x3a2a00);
      e.position.set(x, 0.05, 0.16);
      this.star.add(e);
    }
    const m = smile(0.06, 0.013, 0x8a4b00);
    m.position.set(0, -0.08, 0.17);
    this.star.add(m);
    const wm = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.6, roughness: 0.1, emissive: 0x6fd3ff, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), wm);
      w.scale.set(1, 0.6, 1);
      w.position.set(0.32 * s, 0.15, -0.12);
      this.add(w);
      this.wings.push(w);
    }
    this.light = new THREE.PointLight(0xfff0a0, 3, 7, 2);
    this.add(this.light);
  }
  update(dt: number): void {
    this.t += dt;
    this.star.rotation.z = Math.sin(this.t * 2) * 0.15;
    this.star.scale.setScalar(this.talking ? 1 + Math.abs(Math.sin(this.t * 14)) * 0.08 : 1);
    this.wings.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * (0.6 + Math.sin(this.t * 22) * 0.5)));
  }
}

// ---------------------------------------------------------------- alphabet friends

let font: Font | null = null;
function getFont(): Font {
  if (!font) font = new FontLoader().parse(fontJson as unknown as ConstructorParameters<typeof Font>[0]);
  return font;
}

export class LetterFriend extends THREE.Group {
  private body = new THREE.Group();
  private eyesG: THREE.Group[] = [];
  private feet: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private t = Math.random() * 5;
  private blink = 2;
  excited = 0;
  constructor(public letter: string, public color: number) {
    super();
    this.add(this.body);
    this.add(shadowBlob(0.8));
    const geo = new TextGeometry(letter, { font: getFont(), size: 1.3, depth: 0.45, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 4 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2);
    const m = mesh(geo, mat(color, { rough: 0.3 }));
    m.position.y = 0.35;
    this.body.add(m);
    const w = bb.max.x - bb.min.x;
    for (const x of [-0.17, 0.17]) {
      const e = eye(0.12);
      e.position.set(x, 1.15, 0.33);
      this.body.add(e);
      this.eyesG.push(e);
    }
    const mo = smile(0.1, 0.022);
    mo.position.set(0, 0.88, 0.35);
    this.body.add(mo);
    const limb = mat(0xffffff, { rough: 0.5 });
    for (const s of [-1, 1]) {
      const f = mesh(sphere(0.16, 14, 10), mat(0x37474f, { rough: 0.5 }));
      f.scale.set(1, 0.55, 1.4);
      f.position.set(0.25 * s, 0.1, 0.08);
      this.add(f);
      this.feet.push(f);
      const leg = mesh(cyl(0.04, 0.04, 0.3, 6), limb);
      leg.position.set(0.25 * s, 0.25, 0);
      this.body.add(leg);
      const a = mesh(capsule(0.05, 0.35), limb);
      a.position.set((w / 2 + 0.1) * s, 0.9, 0);
      a.rotation.z = 0.6 * s;
      this.body.add(a);
      this.arms.push(a);
    }
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }
  update(dt: number, reduced: boolean): void {
    this.t += dt;
    if (this.excited > 0) this.excited -= dt;
    const ex = this.excited > 0;
    const k = ex ? 9 : 3;
    this.body.position.y = Math.abs(Math.sin(this.t * k)) * (ex ? (reduced ? 0.15 : 0.5) : 0.08);
    this.body.rotation.z = Math.sin(this.t * k * 0.5) * (ex ? 0.2 : 0.05);
    this.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * -(0.6 + (ex ? 1.6 + Math.sin(this.t * 14) * 0.4 : Math.sin(this.t * 2) * 0.2))));
    this.blink -= dt;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyesG) e.scale.y = this.blink < 0.12 ? 0.1 : 1;
  }
}

/** Big candy cane. */
export function makeCandyCane(h = 2.4): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(0, (i / 8) * h, 0));
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    pts.push(new THREE.Vector3(0.35 - Math.cos(a) * 0.35, h + Math.sin(a) * 0.35, 0));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.11, 12, false);
  const m = mesh(geo, candyStripeMat());
  return m;
}
