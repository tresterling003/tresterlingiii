import * as THREE from 'three';
import type { HeroLook } from '../../types';
import { mat, matUnique } from '../materials';
import { add, capsule, cyl, damp, eye, mesh, smile, sphere, starGeo } from './kit';

export type HeroAction = 'none' | 'celebrate' | 'wave' | 'collect' | 'interact';

/** The player's young adventurer, built from soft rounded shapes with a simple bone hierarchy. */
export class Hero extends THREE.Group {
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eyes: THREE.Group[] = [];
  private mouthSmile!: THREE.Mesh;
  private mouthOpen!: THREE.Mesh;
  private hatSlot = new THREE.Group();
  private scarfTail!: THREE.Mesh;
  private coatMat = matUnique('#e53935', 0.7);
  private hatMat = matUnique('#1e88e5', 0.8);
  private scarfMat = matUnique('#fdd835', 0.85);
  private skinMat = matUnique('#f2c19b', 0.6);
  private hairMat = matUnique('#5d3a1a', 0.7);
  private t = 0;
  private walkPhase = 0;
  private blinkT = 2;
  private action: HeroAction = 'none';
  private actionT = 0;
  private squash = 1;
  /** item floating above the head while carrying */
  carrySlot = new THREE.Group();

  constructor(look?: HeroLook) {
    super();
    this.add(this.body);
    const bootMat = mat(0x6b3f22, { rough: 0.6 });
    const mittenMat = this.scarfMat;

    // legs (pivot at hip)
    for (const [leg, x] of [[this.legL, -0.14], [this.legR, 0.14]] as const) {
      add(this.body, leg, x, 0.5, 0);
      const pant = mesh(capsule(0.1, 0.22), mat(0x37474f, { rough: 0.8 }));
      pant.position.y = -0.18;
      leg.add(pant);
      const boot = mesh(sphere(0.14, 16, 12), bootMat);
      boot.scale.set(0.9, 0.65, 1.25);
      boot.position.set(0, -0.4, 0.04);
      leg.add(boot);
      const cuff = mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 16), mat(0xffffff, { rough: 0.95 }));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.31;
      leg.add(cuff);
    }

    // coat body
    const coat = mesh(new THREE.LatheGeometry([0.05, 0.3, 0.33, 0.32, 0.27, 0.18, 0.05].map((r, i) => new THREE.Vector2(r, i * 0.11)), 24), this.coatMat);
    coat.position.y = 0.42;
    this.body.add(coat);
    const hem = mesh(new THREE.TorusGeometry(0.31, 0.05, 8, 24), mat(0xffffff, { rough: 0.95 }));
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.48;
    this.body.add(hem);
    for (let i = 0; i < 3; i++) {
      const b = mesh(sphere(0.035, 8, 6), mat(0xffd54f, { rough: 0.3, metal: 0.4 }), false);
      b.position.set(0, 0.62 + i * 0.1, 0.3 - i * 0.012);
      this.body.add(b);
    }
    // belt
    const belt = mesh(cyl(0.325, 0.33, 0.06, 24), mat(0x3e2723, { rough: 0.5 }));
    belt.position.y = 0.6;
    this.body.add(belt);
    const buckle = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), mat(0xffd54f, { rough: 0.3, metal: 0.6 }), false);
    buckle.position.set(0, 0.6, 0.33);
    this.body.add(buckle);

    // arms (pivot at shoulder)
    for (const [arm, x] of [[this.armL, -0.3], [this.armR, 0.3]] as const) {
      add(this.body, arm, x, 0.98, 0);
      const sleeve = mesh(capsule(0.085, 0.24), this.coatMat);
      sleeve.position.y = -0.17;
      arm.add(sleeve);
      const mitt = mesh(sphere(0.1, 14, 10), mittenMat);
      mitt.position.y = -0.38;
      mitt.scale.set(1, 1.1, 0.9);
      arm.add(mitt);
      const thumb = mesh(sphere(0.045, 8, 6), mittenMat, false);
      thumb.position.set(x > 0 ? -0.06 : 0.06, -0.34, 0.06);
      arm.add(thumb);
      arm.rotation.z = x > 0 ? 0.25 : -0.25;
    }

    // scarf
    const scarf = mesh(new THREE.TorusGeometry(0.2, 0.075, 10, 24), this.scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.07;
    this.body.add(scarf);
    this.scarfTail = mesh(new THREE.BoxGeometry(0.13, 0.32, 0.05), this.scarfMat);
    this.scarfTail.geometry.translate(0, -0.16, 0);
    this.scarfTail.position.set(0.12, 1.07, 0.18);
    this.scarfTail.rotation.set(0.25, 0, 0.15);
    this.body.add(this.scarfTail);

    // head
    add(this.body, this.head, 0, 1.4, 0);
    const face = mesh(sphere(0.38, 32, 24), this.skinMat);
    face.scale.set(1, 0.95, 0.95);
    this.head.add(face);
    const hair = mesh(sphere(0.395, 24, 16, ), this.hairMat);
    hair.scale.set(1, 0.95, 0.95);
    hair.position.set(0, 0.03, -0.04);
    (hair.geometry as THREE.SphereGeometry).dispose();
    hair.geometry = new THREE.SphereGeometry(0.395, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hair.rotation.x = -0.35;
    this.head.add(hair);
    for (const x of [-0.13, 0.13]) {
      const e = eye(0.085);
      e.position.set(x, 0.02, 0.32);
      this.head.add(e);
      this.eyes.push(e);
      const cheek = mesh(sphere(0.06, 12, 8), mat(0xff8a80, { rough: 0.8, transparent: true, opacity: 0.6 }), false);
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.set(x * 1.7, -0.1, 0.3);
      this.head.add(cheek);
      const ear = mesh(sphere(0.07, 12, 8), this.skinMat);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(x > 0 ? 0.37 : -0.37, -0.02, 0);
      this.head.add(ear);
    }
    const nose = mesh(sphere(0.045, 12, 8), mat(0xf0a98a, { rough: 0.6 }), false);
    nose.position.set(0, -0.06, 0.37);
    this.head.add(nose);
    this.mouthSmile = smile(0.08, 0.016);
    this.mouthSmile.position.set(0, -0.14, 0.345);
    this.head.add(this.mouthSmile);
    this.mouthOpen = mesh(sphere(0.07, 16, 12), mat(0x7a2b2b, { rough: 0.5 }), false);
    this.mouthOpen.scale.set(1, 0.8, 0.4);
    this.mouthOpen.position.set(0, -0.15, 0.34);
    this.mouthOpen.visible = false;
    this.head.add(this.mouthOpen);
    this.head.add(this.hatSlot);
    this.carrySlot.position.set(0, 2.5, 0);
    this.add(this.carrySlot);

    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.setLook(look ?? { coat: '#e53935', hat: '#1e88e5', scarf: '#fdd835', skin: '#f2c19b', hair: '#5d3a1a', hatStyle: 'beanie' });
  }

  setLook(l: HeroLook): void {
    this.coatMat.color.set(l.coat);
    this.hatMat.color.set(l.hat);
    this.scarfMat.color.set(l.scarf);
    this.skinMat.color.set(l.skin);
    this.hairMat.color.set(l.hair);
    this.hatSlot.clear();
    const white = mat(0xffffff, { rough: 0.95 });
    switch (l.hatStyle) {
      case 'beanie': {
        const cap = mesh(new THREE.SphereGeometry(0.4, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), this.hatMat);
        cap.position.y = 0.06;
        cap.scale.set(1, 1.05, 1);
        this.hatSlot.add(cap);
        const fold = mesh(new THREE.TorusGeometry(0.39, 0.06, 10, 28), this.hatMat);
        fold.rotation.x = Math.PI / 2;
        fold.position.y = 0.08;
        this.hatSlot.add(fold);
        const pom = mesh(sphere(0.11, 14, 10), white);
        pom.position.y = 0.5;
        this.hatSlot.add(pom);
        break;
      }
      case 'elf': {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.18) * i * 0.03, i * 0.07, -Math.pow(i / 10, 2) * 0.35));
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 20, 0.1, 12, false);
        // taper the tube by scaling vertices along its length
        const pos = tube.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const ring = Math.floor(i / 13) / 20;
          const c = curve.getPoint(ring);
          const v = new THREE.Vector3().fromBufferAttribute(pos, i).sub(c).multiplyScalar(3.6 * (1 - ring) + 0.1).add(c);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        tube.computeVertexNormals();
        const hat = mesh(tube, mat(0x2e7d32, { rough: 0.8 }));
        hat.position.y = 0.12;
        this.hatSlot.add(hat);
        const band = mesh(new THREE.TorusGeometry(0.38, 0.06, 10, 28), mat(0xe53935, { rough: 0.8 }));
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.12;
        this.hatSlot.add(band);
        const bell = mesh(sphere(0.07, 12, 8), mat(0xffd54f, { rough: 0.25, metal: 0.7 }));
        bell.position.set(pts[10].x, 0.12 + pts[10].y, pts[10].z);
        this.hatSlot.add(bell);
        break;
      }
      case 'antlers': {
        const band = mesh(new THREE.TorusGeometry(0.39, 0.03, 8, 28, Math.PI), mat(0x6d4c41));
        band.rotation.y = Math.PI / 2;
        band.position.y = 0.05;
        this.hatSlot.add(band);
        const am = mat(0x8d6e63, { rough: 0.7 });
        for (const s of [-1, 1]) {
          const a = new THREE.Group();
          a.position.set(0.3 * s, 0.32, 0);
          a.rotation.z = -0.4 * s;
          const main = mesh(capsule(0.04, 0.35), am);
          main.position.y = 0.17;
          a.add(main);
          for (const [y, r] of [[0.15, 0.9], [0.3, -0.8]]) {
            const b = mesh(capsule(0.03, 0.15), am);
            b.position.set(0.06 * s * Math.sign(r), y, 0);
            b.rotation.z = -r * s;
            a.add(b);
          }
          this.hatSlot.add(a);
        }
        break;
      }
      case 'crown': {
        const crown = mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.18, 24, 1, true), mat(0xffd54f, { rough: 0.25, metal: 0.8 }));
        crown.position.y = 0.4;
        (crown.material as THREE.Material).side = THREE.DoubleSide;
        this.hatSlot.add(crown);
        for (let i = 0; i < 5; i++) {
          const s = mesh(starGeo(0.08, 0.035, 0.03), mat(0xfff59d, { rough: 0.2, metal: 0.6, emissive: 0xffd54f, emissiveIntensity: 0.4 }));
          const a = (i / 5) * Math.PI * 2;
          s.position.set(Math.sin(a) * 0.29, 0.55, Math.cos(a) * 0.29);
          s.rotation.y = a;
          this.hatSlot.add(s);
        }
        break;
      }
      case 'earmuffs': {
        const band = mesh(new THREE.TorusGeometry(0.4, 0.035, 8, 28, Math.PI), this.hatMat);
        band.rotation.y = Math.PI / 2;
        band.position.y = 0;
        this.hatSlot.add(band);
        for (const s of [-1, 1]) {
          const muff = mesh(sphere(0.14, 16, 12), white);
          muff.position.set(0.38 * s, -0.02, 0);
          muff.scale.set(0.7, 1, 1);
          this.hatSlot.add(muff);
        }
        break;
      }
    }
    this.hatSlot.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  play(a: HeroAction): void {
    this.action = a;
    this.actionT = 0;
  }

  get busy(): boolean {
    return this.action !== 'none';
  }

  /** speed: horizontal speed (m/s), vy: vertical velocity, grounded flag */
  animate(dt: number, speed: number, vy: number, grounded: boolean, reduced: boolean): void {
    this.t += dt;
    const run = Math.min(1, speed / 6);
    this.walkPhase += dt * (4 + speed * 1.6);
    const sw = Math.sin(this.walkPhase);
    let legAmp = grounded ? 0.9 * Math.min(1, speed / 3) : 0.2;
    let armSwing = grounded ? 0.8 * Math.min(1, speed / 3) : 0;

    // base pose
    let armLz = -0.25, armRz = 0.25, armLx = -sw * armSwing, armRx = sw * armSwing;
    let headTilt = 0, bodyLean = run * 0.18, bodyY = 0, spin = 0;
    const bob = grounded ? Math.abs(Math.sin(this.walkPhase)) * 0.06 * Math.min(1, speed / 2) : 0;
    const breathe = Math.sin(this.t * 2.2) * 0.012;

    if (!grounded) {
      armLz = vy > 0 ? -1.9 : -1.2;
      armRz = vy > 0 ? 1.9 : 1.2;
      armLx = armRx = 0;
    }

    let open = false;
    if (this.action !== 'none') {
      this.actionT += dt;
      const k = this.actionT;
      legAmp = 0;
      armSwing = 0;
      switch (this.action) {
        case 'celebrate': {
          armLz = -2.6 + Math.sin(k * 14) * 0.25;
          armRz = 2.6 - Math.sin(k * 14) * 0.25;
          armLx = armRx = 0;
          bodyY = Math.abs(Math.sin(k * 6)) * 0.35;
          spin = reduced ? 0 : Math.min(1, k / 1.2) * Math.PI * 2;
          open = true;
          if (k > 1.6) this.action = 'none';
          break;
        }
        case 'wave': {
          armRz = 2.4;
          armRx = 0;
          this.armR.rotation.y = Math.sin(k * 10) * 0.5;
          headTilt = 0.15;
          open = k < 0.8;
          if (k > 1.4) { this.action = 'none'; this.armR.rotation.y = 0; }
          break;
        }
        case 'collect': {
          armLz = -2.2; armRz = 2.2; armLx = armRx = -0.3;
          bodyY = Math.sin(Math.min(1, k / 0.5) * Math.PI) * 0.25;
          open = true;
          if (k > 0.6) this.action = 'none';
          break;
        }
        case 'interact': {
          armRx = -1.4; armRz = 0.2;
          headTilt = 0.1;
          if (k > 0.7) this.action = 'none';
          break;
        }
      }
    }

    this.legL.rotation.x = damp(this.legL.rotation.x, sw * legAmp, 18, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, -sw * legAmp, 18, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armLz, 14, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armRz, 14, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armLx, 14, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armRx, 14, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyLean, 8, dt);
    this.body.rotation.y = spin;
    this.head.rotation.x = damp(this.head.rotation.x, headTilt - bodyLean * 0.6, 8, dt);
    this.head.rotation.z = Math.sin(this.t * 1.3) * 0.04 * (1 - run);
    // squash & stretch
    const targetSquash = grounded ? 1 : vy > 0 ? 1.08 : 0.97;
    this.squash = damp(this.squash, targetSquash, 12, dt);
    this.body.scale.set(1 / Math.sqrt(this.squash), this.squash + breathe, 1 / Math.sqrt(this.squash));
    this.body.position.y = bob + bodyY;
    this.scarfTail.rotation.x = 0.25 + run * 0.9 + Math.sin(this.t * 7) * 0.08 * run;

    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 && this.blinkT > 0;
    if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink ? 0.1 : 1;
    this.mouthSmile.visible = !open;
    this.mouthOpen.visible = open;
    this.carrySlot.rotation.y += dt * 1.5;
    this.carrySlot.position.y = 2.45 + Math.sin(this.t * 3) * 0.08;
  }

  /** Called when landing from a jump to trigger squash. */
  land(): void {
    this.squash = 0.82;
  }
}
