import * as THREE from 'three';
import type { Game, GameScene } from '../game';
import { VOICES } from '../core/tts';
import { colorTarget, COLORS, SHAPE_ACCEPT, simpleTarget, type ShapeName } from '../data/content';
import { Bursts, StringLights } from '../three/effects';
import { brickTex, mat, woodTex } from '../three/materials';
import { makePresent, ToyRobot, type RobotPart } from '../three/models/characters';
import { cyl, mesh, sphere, starShape } from '../three/models/kit';

type PartKind = 'toy' | 'shape' | RobotPart;

interface Part {
  kind: PartKind;
  color: string;
  shape?: ShapeName;
  obj: THREE.Group;
  state: 'belt' | 'held' | 'flying' | 'done' | 'falling';
  fly?: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; done: () => void };
  vy: number;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BELT_Y = 1.25;
const BELT_Z = 0;
const BELT_X0 = -8.5;
const BELT_X1 = 9;

function shapeGeo(s: ShapeName, size = 0.5, depth = 0.35): THREE.BufferGeometry {
  let shp: THREE.Shape;
  if (s === 'circle') {
    shp = new THREE.Shape();
    shp.absarc(0, 0, size, 0, Math.PI * 2, false);
  } else if (s === 'square') {
    shp = new THREE.Shape();
    const a = size * 0.88;
    shp.moveTo(-a, -a); shp.lineTo(a, -a); shp.lineTo(a, a); shp.lineTo(-a, a); shp.closePath();
  } else if (s === 'triangle') {
    shp = new THREE.Shape();
    shp.moveTo(0, size * 1.05); shp.lineTo(size * 1.0, -size * 0.75); shp.lineTo(-size * 1.0, -size * 0.75); shp.closePath();
  } else shp = starShape(size * 1.15, size * 0.5);
  const g = new THREE.ExtrudeGeometry(shp, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  g.center();
  return g;
}

export class FactoryScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
  music = 'factory' as const;
  private bursts = new Bursts();
  private parts: Part[] = [];
  private beltTex!: THREE.CanvasTexture;
  private rollers: THREE.Mesh[] = [];
  private machine = new THREE.Group();
  private machineLights: THREE.Mesh[] = [];
  private bins: { color: string; obj: THREE.Group; count: number; glow: THREE.Mesh }[] = [];
  private board = new THREE.Group();
  private holes: { shape: ShapeName; obj: THREE.Object3D; filled: boolean; pos: THREE.Vector3 }[] = [];
  private gizmo = new ToyRobot({ wheels: 0x607d8b, body: 0x26a69a, head: 0xffca28, arms: 0x90a4ae, antenna: 0xff7043 });
  private build = new ToyRobot();
  private buildPad!: THREE.Group;
  private held: Part | null = null;
  private raycaster = new THREE.Raycaster();
  private holdPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.6);
  private stage: 'sort' | 'shapes' | 'build' | 'done' = 'sort';
  private sorted = 0;
  private sortGoal = 6;
  private spawnT = 0;
  private busy = false;
  private t = 0;
  private machinePump = 0;
  private buildStep = 0;
  private buildPlan: { part: RobotPart; color: string; choose?: boolean }[] = [];
  private wantPart: { part: RobotPart; color: string } | null = null;
  private design: Partial<Record<RobotPart, number>> = {};
  private exitBtn: HTMLButtonElement;
  private lights: StringLights[] = [];
  private asked = new Set<number>();

  constructor(private g: Game) {
    this.buildRoom();
    this.exitBtn = document.createElement('button');
    this.exitBtn.className = 'exit-btn hidden';
    this.exitBtn.innerHTML = '🚪';
    this.exitBtn.setAttribute('aria-label', 'Back to the village');
    this.exitBtn.addEventListener('click', () => this.g.goto('village', { from: 'factory' }));
    g.ui.append(this.exitBtn);
  }

  get speed(): number {
    return { gentle: 0.9, normal: 1.4, zippy: 2.1 }[this.g.settings.gameplay];
  }

  private buildRoom(): void {
    const sc = this.scene;
    sc.background = new THREE.Color(0x3b2a3f);
    sc.fog = new THREE.Fog(0x3b2a3f, 25, 60);
    sc.add(new THREE.HemisphereLight(0xfff0e0, 0x5a3d2b, 1.0));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
    key.position.set(6, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12 });
    sc.add(key);
    for (const x of [-8, 0, 8]) {
      const p = new THREE.PointLight(0xffc98a, 18, 16, 2);
      p.position.set(x, 7, 2);
      sc.add(p);
      const lamp = mesh(new THREE.ConeGeometry(0.6, 0.6, 16, 1, true), mat(0x37474f, { metal: 0.5, rough: 0.4 }));
      lamp.position.set(x, 7.6, 2);
      sc.add(lamp);
      const bulb = mesh(sphere(0.22), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), false);
      bulb.position.set(x, 7.3, 2);
      sc.add(bulb);
    }
    // floor & walls
    const floor = mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: woodTex('#b07a46', [10, 8]), roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    sc.add(floor);
    const wall = mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshStandardMaterial({ map: brickTex('#a4503c', [12, 4]), roughness: 0.9 }));
    wall.position.set(0, 7, -8);
    sc.add(wall);
    for (const s of [-1, 1]) {
      const sw = wall.clone();
      sw.rotation.y = -s * Math.PI / 2;
      sw.position.set(s * 16, 7, 4);
      sc.add(sw);
    }
    // windows with snow outside
    for (const x of [-9, 9]) {
      const w = mesh(new THREE.PlaneGeometry(3.4, 2.6), mat(0xbfe3ff, { emissive: 0x8ec9ff, emissiveIntensity: 0.6 }), false);
      w.position.set(x, 5.5, -7.95);
      sc.add(w);
      const fr = mesh(new THREE.BoxGeometry(3.7, 2.9, 0.1), mat(0xffffff));
      fr.position.set(x, 5.5, -8.01);
      sc.add(fr);
    }
    // shelves with toys
    for (const [x, y] of [[-12, 2.2], [-12, 3.8], [12, 2.2], [12, 3.8]]) {
      const sh = mesh(new THREE.BoxGeometry(5, 0.15, 1.2), mat(0x8d5a2b));
      sh.position.set(x, y, -7.3);
      sc.add(sh);
      for (let i = 0; i < 4; i++) {
        const p = makePresent([0xe53935, 0x1e88e5, 0x43a047, 0xfdd835][i], 0xffffff, 0.6);
        p.position.set(x - 1.8 + i * 1.2, y + 0.08, -7.3);
        sc.add(p);
      }
    }
    // garland
    const pts = Array.from({ length: 9 }, (_, i) => v3(-15 + i * 3.75, 9 - (i % 2) * 0.6, -7.8));
    const sl = new StringLights(pts, 0.45);
    this.lights.push(sl);
    sc.add(sl.mesh);

    // conveyor belt
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const gc = c.getContext('2d')!;
    gc.fillStyle = '#2b2f36'; gc.fillRect(0, 0, 64, 64);
    gc.fillStyle = '#3d434d'; gc.fillRect(0, 0, 10, 64);
    gc.fillStyle = '#ffcc33'; gc.fillRect(30, 0, 4, 64);
    this.beltTex = new THREE.CanvasTexture(c);
    this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    this.beltTex.repeat.set(18, 1);
    this.beltTex.colorSpace = THREE.SRGBColorSpace;
    const beltLen = BELT_X1 - BELT_X0 + 1;
    const belt = mesh(new THREE.BoxGeometry(beltLen, 0.2, 1.8), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.6 }));
    belt.position.set((BELT_X0 + BELT_X1) / 2, BELT_Y - 0.1, BELT_Z);
    sc.add(belt);
    for (const s of [-1, 1]) {
      const rail = mesh(new THREE.BoxGeometry(beltLen, 0.3, 0.15), mat(0xffb300, { metal: 0.5, rough: 0.35 }));
      rail.position.set(belt.position.x, BELT_Y, BELT_Z + s * 0.95);
      sc.add(rail);
    }
    for (let x = BELT_X0; x <= BELT_X1; x += 1.2) {
      const leg = mesh(cyl(0.1, 0.1, BELT_Y - 0.2, 8), mat(0x546e7a, { metal: 0.6, rough: 0.4 }));
      leg.position.set(x, (BELT_Y - 0.2) / 2, BELT_Z + 0.7);
      sc.add(leg);
      const leg2 = leg.clone();
      leg2.position.z = BELT_Z - 0.7;
      sc.add(leg2);
      const r = mesh(cyl(0.16, 0.16, 1.8, 12), mat(0x90a4ae, { metal: 0.7, rough: 0.3 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(x, BELT_Y - 0.28, BELT_Z);
      sc.add(r);
      this.rollers.push(r);
    }
    // toy machine (left)
    const body = mesh(new THREE.BoxGeometry(3, 4, 3), mat(0x7e57c2, { rough: 0.4 }));
    body.position.y = 2;
    this.machine.add(body);
    const funnel = mesh(new THREE.CylinderGeometry(1.4, 0.5, 1.4, 20, 1, true), mat(0xffca28, { metal: 0.4, rough: 0.3 }));
    (funnel.material as THREE.Material).side = THREE.DoubleSide;
    funnel.position.y = 4.7;
    this.machine.add(funnel);
    for (let i = 0; i < 5; i++) {
      const l = mesh(sphere(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: [0xff5252, 0xffeb3b, 0x69f0ae, 0x40c4ff, 0xff80ab][i] }), false);
      l.position.set(-1 + i * 0.5, 3.4, 1.52);
      this.machine.add(l);
      this.machineLights.push(l);
    }
    const dial = mesh(cyl(0.45, 0.45, 0.1, 24), mat(0xffffff));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 2.3, 1.52);
    this.machine.add(dial);
    const mouth = mesh(new THREE.BoxGeometry(0.4, 1.4, 1.6), mat(0x212121));
    mouth.position.set(1.4, 1.6, 0);
    this.machine.add(mouth);
    this.machine.position.set(BELT_X0 - 1.6, 0, BELT_Z);
    this.machine.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    sc.add(this.machine);
    // chute (right)
    const chute = mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.4, 20, 1, true), mat(0x00897b, { rough: 0.4 }));
    (chute.material as THREE.Material).side = THREE.DoubleSide;
    chute.position.set(BELT_X1 + 1.2, 0.7, BELT_Z);
    sc.add(chute);

    // sorting bins
    const binColors = ['red', 'blue', 'yellow', 'green'];
    binColors.forEach((col, i) => {
      const gB = new THREE.Group();
      const cm = mat(COLORS[col].hex, { rough: 0.4 });
      const base = mesh(new THREE.BoxGeometry(2, 0.15, 1.6), cm);
      base.position.y = 0.08;
      gB.add(base);
      for (const [x, z, w, d] of [[0, 0.8, 2, 0.12], [0, -0.8, 2, 0.12], [1, 0, 0.12, 1.6], [-1, 0, 0.12, 1.6]] as const) {
        const side = mesh(new THREE.BoxGeometry(w, 1.1, d), cm);
        side.position.set(x, 0.6, z);
        gB.add(side);
      }
      const label = mesh(cyl(0.45, 0.45, 0.08, 24), mat(0xffffff));
      label.rotation.x = Math.PI / 2;
      label.position.set(0, 0.65, 0.88);
      gB.add(label);
      const dot = mesh(cyl(0.34, 0.34, 0.1, 24), mat(COLORS[col].hex, { rough: 0.3, emissive: COLORS[col].hex, emissiveIntensity: 0.25 }));
      dot.rotation.x = Math.PI / 2;
      dot.position.set(0, 0.65, 0.92);
      gB.add(dot);
      const glow = mesh(new THREE.RingGeometry(1.2, 1.45, 32), new THREE.MeshBasicMaterial({ color: COLORS[col].hex, transparent: true, opacity: 0 }), false);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.05;
      gB.add(glow);
      gB.position.set(-5.4 + i * 3.6, 0, 3.4);
      gB.userData.bin = col;
      sc.add(gB);
      this.bins.push({ color: col, obj: gB, count: 0, glow });
    });

    // shape board
    const boardM = mesh(new THREE.BoxGeometry(11, 0.4, 2.4), new THREE.MeshStandardMaterial({ map: woodTex('#d8a35d', [3, 1]), roughness: 0.6 }));
    boardM.position.y = 0.9;
    this.board.add(boardM);
    const legs = mesh(new THREE.BoxGeometry(10.6, 0.7, 2), mat(0x8d5a2b));
    legs.position.y = 0.35;
    this.board.add(legs);
    (['circle', 'square', 'triangle', 'star'] as ShapeName[]).forEach((s, i) => {
      const x = -4.1 + i * 2.75;
      const hole = mesh(shapeGeo(s, 0.62, 0.05), mat(0x3e2723, { rough: 0.9 }), false);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, 1.12, 0);
      hole.userData.hole = s;
      this.board.add(hole);
      this.holes.push({ shape: s, obj: hole, filled: false, pos: v3(x, 1.4, 3.4) });
    });
    this.board.position.set(0, -3, 3.4);
    this.board.visible = false;
    sc.add(this.board);

    // build pad + gizmo
    this.buildPad = new THREE.Group();
    const pad = mesh(cyl(1.6, 1.8, 0.35, 32), mat(0xeceff1, { metal: 0.3, rough: 0.4 }));
    pad.position.y = 0.17;
    this.buildPad.add(pad);
    const ring = mesh(new THREE.TorusGeometry(1.6, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0x40c4ff }), false);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    this.buildPad.add(ring);
    this.buildPad.add(this.build);
    this.build.position.y = 0.35;
    this.buildPad.position.set(-2, 0, -4.2);
    sc.add(this.buildPad);
    this.gizmo.position.set(4.5, 0, -3.8);
    this.gizmo.rotation.y = -0.4;
    this.gizmo.alive = true;
    sc.add(this.gizmo);
    sc.add(this.bursts.points);
    sc.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.receiveShadow = true; } });

    this.camera.position.set(0, 8.4, 12.5);
    this.camera.lookAt(0, 1.2, 0);
  }

  applySettings(): void {
    this.bursts.reduced = this.g.settings.reducedEffects;
    for (const l of this.lights) l.reduced = this.g.settings.reducedMotion;
  }

  // ------------------------------------------------------------------ part making
  private makePart(kind: PartKind, color: string, shape?: ShapeName): Part {
    const obj = new THREE.Group();
    const hex = COLORS[color].hex;
    const m = mat(hex, { rough: 0.35 });
    switch (kind) {
      case 'toy': {
        const which = Math.floor(Math.random() * 3);
        if (which === 0) {
          const b = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), m);
          b.position.y = 0.35;
          obj.add(b);
          const dot = mesh(sphere(0.12), mat(0xffffff), false);
          dot.position.set(0, 0.35, 0.36);
          obj.add(dot);
        } else if (which === 1) {
          const b = mesh(sphere(0.4, 20, 14), m);
          b.position.y = 0.4;
          obj.add(b);
          const st = mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24), mat(0xffffff), false);
          st.position.y = 0.4;
          obj.add(st);
        } else {
          // rubber duck style toy
          const bd = mesh(sphere(0.36, 16, 12), m);
          bd.scale.set(1.2, 0.8, 1);
          bd.position.y = 0.3;
          obj.add(bd);
          const hd = mesh(sphere(0.22, 16, 12), m);
          hd.position.set(0.25, 0.65, 0);
          obj.add(hd);
          const bk = mesh(new THREE.ConeGeometry(0.08, 0.2, 8), mat(0xff9800));
          bk.rotation.z = -Math.PI / 2;
          bk.position.set(0.5, 0.62, 0);
          obj.add(bk);
          for (const z of [-0.1, 0.1]) {
            const e = mesh(sphere(0.04), mat(0x111111), false);
            e.position.set(0.4, 0.72, z);
            obj.add(e);
          }
        }
        break;
      }
      case 'shape': {
        const s = mesh(shapeGeo(shape!, 0.55, 0.35), m);
        s.rotation.x = -Math.PI / 2;
        s.position.y = 0.25;
        obj.add(s);
        break;
      }
      case 'wheels': {
        for (const x of [-0.3, 0.3]) {
          const w = mesh(cyl(0.3, 0.3, 0.2, 20), m);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.3, 0);
          obj.add(w);
        }
        break;
      }
      case 'body': {
        const b = mesh(new THREE.BoxGeometry(0.8, 0.65, 0.6), m);
        b.position.y = 0.33;
        obj.add(b);
        break;
      }
      case 'head': {
        const h = mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), m);
        h.position.y = 0.25;
        obj.add(h);
        const vz = mesh(new THREE.BoxGeometry(0.45, 0.16, 0.05), mat(0x263238), false);
        vz.position.set(0, 0.27, 0.26);
        obj.add(vz);
        break;
      }
      case 'arms': {
        for (const x of [-0.25, 0.25]) {
          const a = mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 10), m);
          a.rotation.z = Math.PI / 2;
          a.position.set(x * 1.2, 0.15 + (x > 0 ? 0.2 : 0), 0);
          obj.add(a);
        }
        break;
      }
      case 'antenna': {
        const r = mesh(cyl(0.03, 0.03, 0.5, 8), mat(0x9e9e9e, { metal: 0.6 }));
        r.position.y = 0.25;
        obj.add(r);
        const b = mesh(sphere(0.14), mat(hex, { emissive: hex, emissiveIntensity: 0.6 }));
        b.position.y = 0.55;
        obj.add(b);
        break;
      }
    }
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    obj.position.set(BELT_X0 - 0.2, BELT_Y, BELT_Z + (Math.random() - 0.5) * 0.4);
    obj.userData.part = true;
    this.scene.add(obj);
    const p: Part = { kind, color, shape, obj, state: 'belt', vy: 0 };
    this.parts.push(p);
    this.machinePump = 0.4;
    this.g.audio.sfx('pop', Math.random());
    return p;
  }

  private removePart(p: Part): void {
    this.scene.remove(p.obj);
    this.parts = this.parts.filter((x) => x !== p);
    if (this.held === p) this.held = null;
  }

  private fly(p: Part, to: THREE.Vector3, dur: number, done: () => void): void {
    p.state = 'flying';
    p.fly = { from: p.obj.position.clone(), to: to.clone(), t: 0, dur, done };
    this.g.audio.sfx('whoosh');
  }

  // ------------------------------------------------------------------ lifecycle
  enter(): void {
    for (const p of [...this.parts]) this.removePart(p);
    this.stage = 'sort';
    this.sorted = 0;
    this.sortGoal = this.g.settings.gameplay === 'gentle' ? 5 : 6;
    this.asked.clear();
    for (const b of this.bins) {
      b.count = 0;
      b.obj.visible = this.g.settings.gameplay === 'zippy' || b.color !== 'green';
      b.obj.position.y = 0;
      b.obj.children.filter((c) => c.userData.sorted).forEach((c) => b.obj.remove(c));
    }
    // three bins centred when green hidden
    const vis = this.bins.filter((b) => b.obj.visible);
    vis.forEach((b, i) => b.obj.position.x = (i - (vis.length - 1) / 2) * 3.8);
    this.board.visible = false;
    this.board.position.y = -3;
    for (const h of this.holes) {
      h.filled = false;
      h.obj.parent?.children.filter((c) => c.userData.fill === h.shape).forEach((c) => this.board.remove(c));
    }
    for (const part of Object.keys(this.build.parts) as RobotPart[]) this.build.show(part, false);
    this.build.alive = false;
    this.build.position.y = 0.35;
    this.buildStep = 0;
    this.wantPart = null;
    this.design = {};
    this.held = null;
    this.busy = false;
    this.exitBtn.classList.remove('hidden');
    this.g.hud.show(true);
    this.g.hud.setBag([]);
    this.applySettings();
    setTimeout(() => this.introSort(), 700);
  }

  exit(): void {
    this.exitBtn.classList.add('hidden');
  }

  hint(): { text: string; portrait: string } {
    if (this.stage === 'sort') return { text: 'Tap a toy on the moving belt, then tap the box with the same color!', portrait: 'robot' };
    if (this.stage === 'shapes') return { text: 'Tap a shape on the belt, then tap the hole with the same shape!', portrait: 'star' };
    if (this.stage === 'build' && this.wantPart) return { text: `Tap the ${this.wantPart.color} ${this.partWord(this.wantPart.part)} on the belt to build the robot!`, portrait: `color:${this.wantPart.color}` };
    return { text: 'Great job, toy maker! Tap the door to go back to the village.', portrait: 'robot' };
  }

  private say(text: string): Promise<void> {
    return this.g.director.tell('Gizmo', 'robot', text, VOICES.robot);
  }

  private async introSort(): Promise<void> {
    this.busy = true;
    await this.say("Beep boop! Welcome to the Toy Factory! I'm Gizmo. The wind mixed up all the toys!");
    await this.say('Tap a toy on the belt, then tap the box with the same color.');
    this.busy = false;
  }

  private colorsInPlay(): string[] {
    return this.bins.filter((b) => b.obj.visible).map((b) => b.color);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, t: number): void {
    this.t = t;
    const g = this.g;
    const sp = this.speed;
    const moving = !g.director.busy && !this.busy && this.stage !== 'done';
    if (moving) {
      this.beltTex.offset.x -= dt * sp / 1.0 * (18 / (BELT_X1 - BELT_X0 + 1));
      for (const r of this.rollers) r.rotation.y += dt * sp * 3;
    }
    // spawning
    this.spawnT -= dt;
    if (moving && this.spawnT <= 0) {
      const onBelt = this.parts.filter((p) => p.state === 'belt').length;
      if (this.stage === 'sort' && onBelt < 5) {
        const cols = this.colorsInPlay();
        this.makePart('toy', cols[Math.floor(Math.random() * cols.length)]);
        this.spawnT = 2.6 / sp;
      } else if (this.stage === 'shapes' && onBelt < 4) {
        const open = this.holes.filter((h) => !h.filled).map((h) => h.shape);
        const all: ShapeName[] = ['circle', 'square', 'triangle', 'star'];
        const pick = Math.random() < 0.7 && open.length ? open[Math.floor(Math.random() * open.length)] : all[Math.floor(Math.random() * 4)];
        const cols = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];
        this.makePart('shape', cols[Math.floor(Math.random() * cols.length)], pick);
        this.spawnT = 2.8 / sp;
      } else if (this.stage === 'build' && this.wantPart && onBelt < 3) {
        // keep the wanted part coming, plus a friendly decoy
        const hasWanted = this.parts.some((p) => p.state === 'belt' && p.kind === this.wantPart!.part && p.color === this.wantPart!.color);
        if (!hasWanted) this.makePart(this.wantPart.part, this.wantPart.color);
        else {
          const cols = ['red', 'blue', 'yellow', 'green'].filter((c) => c !== this.wantPart!.color);
          this.makePart(Math.random() < 0.5 ? this.wantPart.part : 'toy', cols[Math.floor(Math.random() * cols.length)]);
        }
        this.spawnT = 3 / sp;
      } else this.spawnT = 0.5;
    }
    // parts
    for (const p of [...this.parts]) {
      if (p.state === 'belt') {
        if (moving) p.obj.position.x += dt * sp;
        p.obj.rotation.y += dt * 0.5;
        if (p.obj.position.x > BELT_X1 + 0.6) { p.state = 'falling'; p.vy = 0; }
      } else if (p.state === 'falling') {
        p.vy -= 20 * dt;
        p.obj.position.y += p.vy * dt;
        p.obj.position.x += dt * 2;
        if (p.obj.position.y < -1) this.removePart(p);
      } else if (p.state === 'held') {
        const pos = this.pointerOnPlane();
        if (pos) p.obj.position.lerp(pos, 1 - Math.exp(-14 * dt));
        p.obj.rotation.y += dt * 2;
      } else if (p.state === 'flying' && p.fly) {
        const f = p.fly;
        f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        p.obj.position.lerpVectors(f.from, f.to, e);
        p.obj.position.y += Math.sin(k * Math.PI) * 1.6;
        if (k >= 1) { p.state = 'done'; p.fly = undefined; f.done(); }
      }
    }
    // machine
    this.machinePump = Math.max(0, this.machinePump - dt);
    const ms = 1 + Math.sin(this.machinePump * 20) * this.machinePump * 0.3;
    this.machine.scale.set(1 / ms, ms, 1 / ms);
    this.machineLights.forEach((l, i) => (l.visible = Math.sin(t * 6 + i) > -0.2));
    for (const b of this.bins) (b.glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (b.glow.material as THREE.MeshBasicMaterial).opacity - dt * 0.8);
    // board rising
    if (this.board.visible) this.board.position.y += (0 - this.board.position.y) * Math.min(1, dt * 4);
    for (const b of this.bins) if (!b.obj.visible) continue; else if (this.stage !== 'sort') b.obj.position.y += (-3 - b.obj.position.y) * Math.min(1, dt * 3);
    this.gizmo.update(dt);
    this.gizmo.position.y = g.speaker.speaking ? Math.abs(Math.sin(t * 10)) * 0.12 : this.gizmo.position.y;
    this.build.update(dt);
    if (this.build.alive) this.buildPad.rotation.y += dt * 0.8;
    for (const l of this.lights) l.update(t);
    this.bursts.update(dt);
    this.camera.position.x = Math.sin(t * 0.2) * 0.4;
    this.camera.lookAt(0, 1.2, 0);
    if (!g.director.busy && !this.busy) this.handleClicks();
  }

  private pointerOnPlane(): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((this.g.input.pointerX / innerWidth) * 2 - 1, -(this.g.input.pointerY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.holdPlane, p) ? p : null;
  }

  private handleClicks(): void {
    const g = this.g;
    for (const c of g.input.clicks) {
      const ndc = new THREE.Vector2((c.x / innerWidth) * 2 - 1, -(c.y / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      if (!this.held) {
        const cand = this.parts.filter((p) => p.state === 'belt').map((p) => p.obj);
        const hit = this.raycaster.intersectObjects(cand, true)[0];
        let picked: Part | undefined;
        if (hit) {
          let o: THREE.Object3D | null = hit.object;
          while (o && !picked) { picked = this.parts.find((p) => p.obj === o); o = o.parent; }
        } else {
          // forgiving: nearest part to the click on screen
          let bd = 0.12;
          for (const p of this.parts.filter((p) => p.state === 'belt')) {
            const s = p.obj.position.clone().project(this.camera);
            const d = Math.hypot(s.x - ndc.x, s.y - ndc.y);
            if (d < bd) { bd = d; picked = p; }
          }
        }
        if (picked) this.pick(picked);
      } else {
        this.drop(ndc);
      }
    }
  }

  private pick(p: Part): void {
    this.held = p;
    p.state = 'held';
    this.g.audio.sfx('pop', 1);
    if (this.stage === 'build') {
      void this.tryBuild(p);
      return;
    }
    // highlight matching target gently
    if (this.stage === 'sort') this.voiceSortCheck(p);
  }

  private drop(ndc: THREE.Vector2): void {
    const p = this.held!;
    if (this.stage === 'sort') {
      const bins = this.bins.filter((b) => b.obj.visible);
      let bin = bins.find((b) => this.raycaster.intersectObject(b.obj, true).length);
      if (!bin) {
        let bd = 0.25;
        for (const b of bins) {
          const s = b.obj.position.clone().setY(0.6).project(this.camera);
          const d = Math.hypot(s.x - ndc.x, s.y - ndc.y);
          if (d < bd) { bd = d; bin = b; }
        }
      }
      if (!bin) return this.returnToBelt(p);
      this.held = null;
      if (bin.color === p.color) this.sortInto(p, bin);
      else {
        const right = this.bins.find((b) => b.color === p.color)!;
        (right.glow.material as THREE.MeshBasicMaterial).opacity = 1;
        this.g.audio.sfx('soft');
        this.returnToBelt(p);
        void this.say(`That one is ${p.color}! Find the ${p.color} box.`);
      }
    } else if (this.stage === 'shapes') {
      let hole = this.holes.find((h) => !h.filled && this.raycaster.intersectObject(h.obj, false).length);
      if (!hole) {
        let bd = 0.2;
        for (const h of this.holes.filter((h) => !h.filled)) {
          const s = h.pos.clone().project(this.camera);
          const d = Math.hypot(s.x - ndc.x, s.y - ndc.y);
          if (d < bd) { bd = d; hole = h; }
        }
      }
      if (!hole) return this.returnToBelt(p);
      this.held = null;
      if (hole.shape === p.shape) this.fillHole(p, hole);
      else {
        this.g.audio.sfx('soft');
        this.returnToBelt(p);
        void this.say(`That's a ${p.shape}! It goes in the ${p.shape} hole.`);
      }
    }
  }

  private returnToBelt(p: Part): void {
    this.held = null;
    const to = v3(Math.min(BELT_X1 - 1, Math.max(BELT_X0 + 1, p.obj.position.x)), BELT_Y, BELT_Z);
    this.fly(p, to, 0.4, () => (p.state = 'belt'));
  }

  // ------------------------------------------------------------------ stage 1: sort
  private sortInto(p: Part, bin: (typeof this.bins)[number]): void {
    const to = bin.obj.position.clone().add(v3((Math.random() - 0.5) * 1.0, 0.4 + bin.count * 0.1, (Math.random() - 0.5) * 0.6));
    this.fly(p, to, 0.45, () => {
      this.scene.remove(p.obj);
      this.parts = this.parts.filter((x) => x !== p);
      p.obj.position.sub(bin.obj.position);
      p.obj.userData.sorted = true;
      bin.obj.add(p.obj);
      bin.count++;
      this.sorted++;
      this.g.audio.sfx('pop', this.sorted);
      this.bursts.burst(to.clone().add(v3(0, 0.6, 0)), { count: 25, colors: [COLORS[p.color].hex, 0xffffff], speed: 4 });
      this.g.addCoins(1);
      if (this.sorted >= this.sortGoal) void this.finishSort();
    });
  }

  /** At a couple of moments, Gizmo asks the child to name the colour — speaking makes it sort itself by magic. */
  private voiceSortCheck(p: Part): void {
    const moment = this.sorted === 1 || this.sorted === 4;
    if (!moment || this.asked.has(this.sorted)) return;
    this.asked.add(this.sorted);
    void (async () => {
      this.busy = true;
      const level = this.g.settings.practiceLevel;
      await this.g.director.ask({
        activity: 'factory',
        speaker: { name: 'Gizmo', voice: VOICES.robot, portrait: 'robot' },
        question: level === 'E' ? 'Ooh, what color did you pick?' : 'Magic sorting time! What color is it?',
        options: [{ key: p.color, target: colorTarget(p.color, level, this.g.settings, 'toy') }],
        distractors: this.colorsInPlay().filter((c) => c !== p.color).map((c) => `color:${c}`),
        success: () => `Yes! ${p.color}! Zoom, into the box!`,
      });
      this.busy = false;
      if (this.held === p) {
        this.held = null;
        this.sortInto(p, this.bins.find((b) => b.color === p.color)!);
      }
    })();
  }

  private async finishSort(): Promise<void> {
    this.busy = true;
    for (const p of this.parts.filter((x) => x.state === 'belt')) p.state = 'falling';
    this.g.audio.sfx('cheer');
    this.bursts.burst(v3(0, 3, 3), { count: 80, speed: 8 });
    this.g.addStars(1);
    await this.say('Super sorting! Now let\'s match shapes!');
    this.stage = 'shapes';
    this.board.visible = true;
    await this.say('Tap a shape on the belt, then tap the hole with the same shape.');
    this.busy = false;
  }

  // ------------------------------------------------------------------ stage 2: shapes
  private fillHole(p: Part, hole: (typeof this.holes)[number]): void {
    hole.filled = true;
    const holeWorld = hole.obj.getWorldPosition(new THREE.Vector3()).add(v3(0, 0.05, 0));
    this.fly(p, holeWorld, 0.45, () => {
      this.parts = this.parts.filter((x) => x !== p);
      this.scene.remove(p.obj);
      p.obj.position.copy(hole.obj.position).add(v3(0, -0.1, 0));
      p.obj.rotation.set(0, 0, 0);
      p.obj.userData.fill = hole.shape;
      this.board.add(p.obj);
      this.g.audio.sfx('build');
      this.bursts.burst(holeWorld.clone().add(v3(0, 0.5, 0)), { count: 30, speed: 4 });
      this.g.addCoins(1);
      const left = this.holes.filter((h) => !h.filled);
      if (left.length === 1) void this.voiceShape(left[0].shape);
      if (!left.length) void this.finishShapes();
    });
  }

  private async voiceShape(shape: ShapeName): Promise<void> {
    this.busy = true;
    const level = this.g.settings.practiceLevel;
    const target = simpleTarget(`shape-${shape}`, shape, SHAPE_ACCEPT[shape], `shape:${shape}`, level, level === 'A' ? 'activity' : 'keywords');
    await this.g.director.ask({
      activity: 'factory',
      speaker: { name: 'Gizmo', voice: VOICES.robot, portrait: 'robot' },
      question: 'One hole left! Which shape do we need?',
      options: [{ key: shape, target }],
      distractors: (['circle', 'square', 'triangle', 'star'] as ShapeName[]).filter((s) => s !== shape).map((s) => `shape:${s}`),
      success: () => `Yes, a ${shape}! I'll send one right now!`,
    });
    // reward the answer by sending exactly that shape
    this.makePart('shape', 'orange', shape).obj.position.x = BELT_X0 + 2;
    this.busy = false;
  }

  private async finishShapes(): Promise<void> {
    this.busy = true;
    for (const p of this.parts.filter((x) => x.state === 'belt')) p.state = 'falling';
    this.g.audio.sfx('cheer');
    this.bursts.burst(v3(0, 3, 3), { count: 80, speed: 8 });
    this.g.addStars(1);
    await this.say('Shape champion! Now the best part. Let\'s build a robot friend!');
    this.board.visible = false;
    this.stage = 'build';
    this.buildPlan = [
      { part: 'wheels', color: 'blue' },
      { part: 'body', color: 'red', choose: true },
      { part: 'head', color: 'yellow', choose: true },
      { part: 'arms', color: 'green' },
      { part: 'antenna', color: 'purple' },
    ];
    this.buildStep = 0;
    this.busy = false;
    await this.nextBuild();
  }

  // ------------------------------------------------------------------ stage 3: build
  private partWord(p: RobotPart): string {
    return { wheels: 'wheels', body: 'body', head: 'head', arms: 'arms', antenna: 'antenna' }[p];
  }

  private async nextBuild(): Promise<void> {
    if (this.buildStep >= this.buildPlan.length) return this.finishBuild();
    const step = this.buildPlan[this.buildStep];
    this.busy = true;
    const level = this.g.settings.practiceLevel;
    const word = step.part === 'wheels' ? 'wheel' : this.partWord(step.part);
    const d = this.g.director;
    if (step.choose) {
      // open choice: the child decides the colour
      const cols = ['red', 'blue', 'yellow', 'green'];
      const res = await d.ask({
        activity: 'factory',
        speaker: { name: 'Gizmo', voice: VOICES.robot, portrait: 'robot' },
        question: `You choose! What color should the ${word} be?`,
        options: cols.map((c) => ({ key: c, target: colorTarget(c, level === 'A' ? 'A' : 'B', this.g.settings) })),
        modelLine: `You can say red, blue, yellow, or green.`,
        success: (k) => `A ${k} ${word}! Great choice! Machine, make a ${k} ${word}!`,
      });
      step.color = res.key;
    } else {
      await d.ask({
        activity: 'factory',
        speaker: { name: 'Gizmo', voice: VOICES.robot, portrait: 'robot' },
        question: `Our robot needs a ${step.color} ${word}! Ask the machine for it.`,
        options: [{ key: step.color, target: colorTarget(step.color, level, this.g.settings, word) }],
        distractors: ['red', 'blue', 'yellow', 'green'].filter((c) => c !== step.color).map((c) => `color:${c}`),
        success: () => `Beep boop! One ${step.color} ${word} coming up!`,
      });
    }
    this.wantPart = { part: step.part, color: step.color };
    for (const p of this.parts.filter((x) => x.state === 'belt')) p.state = 'falling';
    this.makePart(step.part, step.color).obj.position.x = BELT_X0 + 1;
    this.spawnT = 1.5;
    this.busy = false;
  }

  private async tryBuild(p: Part): Promise<void> {
    const want = this.wantPart;
    if (!want) return this.returnToBelt(p);
    if (p.kind === want.part && p.color === want.color) {
      this.held = null;
      this.wantPart = null;
      const target = this.buildPad.position.clone().add(v3(0, 1.2, 0));
      this.fly(p, target, 0.6, () => {
        this.removePart(p);
        this.design[want.part] = COLORS[want.color].hex;
        this.build.setColors({ wheels: 0x1e88e5, body: 0xe53935, head: 0xfdd835, arms: 0x43a047, antenna: 0x8e24aa, ...this.design });
        const done = this.buildPlan.slice(0, this.buildStep + 1).map((s) => s.part);
        for (const k of Object.keys(this.build.parts) as RobotPart[]) this.build.show(k, done.includes(k));
        this.g.audio.sfx('build');
        this.bursts.burst(target, { count: 40, speed: 5, colors: [COLORS[want.color].hex, 0xffffff] });
        this.buildStep++;
        void this.nextBuild();
      });
    } else {
      this.g.audio.sfx('soft');
      this.returnToBelt(p);
      const w = want.part === 'wheels' ? 'wheels' : want.part;
      await this.say(p.kind === want.part ? `That one is ${p.color}. We need ${want.color} ${w}!` : `Hmm, we need the ${want.color} ${w}. Keep looking!`);
    }
  }

  private async finishBuild(): Promise<void> {
    this.busy = true;
    this.stage = 'done';
    this.build.alive = true;
    this.g.audio.sfx('cheer');
    this.bursts.burst(this.buildPad.position.clone().add(v3(0, 2, 0)), { count: 120, speed: 9, up: 5 });
    this.g.addStars(3);
    this.g.progress.robotDesign = { ...this.design };
    this.g.unlock('toy-robot');
    const first = !this.g.progress.completions.factory;
    this.g.complete('factory');
    if (first) {
      this.g.unlock('toy-train');
      this.g.unlock('outfit-elf');
    }
    await this.g.director.tell('Bolt', 'robot', 'Beep! Hello! I am Bolt! Thank you for building me! I will live in your cabin!', { pitch: 1.5, rate: 0.95 });
    await this.say('You are a super toy maker! Tap the door to go back to the village, or play again from the village.');
    this.busy = false;
  }
}
