import * as THREE from 'three';
import type { Game, GameScene } from '../game';
import { VOICES } from '../core/tts';
import { colorTarget, COLORS, targetFor, VOCAB } from '../data/content';
import { Bursts, makeSky, Snowfall, StringLights } from '../three/effects';
import { cobbleTex, ICE, mat, snowGroundTex, SNOW } from '../three/materials';
import { Hero } from '../three/models/hero';
import { makeBell, makeCandyCane, makeCoin, makePresent, Reindeer, Snowman, Twinkle } from '../three/models/characters';
import { cyl, mesh, sphere } from '../three/models/kit';
import { instancedPines, makeArch, makeHouse, makeLamp, makeMountains } from '../three/models/props';
import { CollisionWorld, type Body, type BoxCollider } from '../world/physics';
import { el } from '../ui/dom';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Rect { z0: number; z1: number; x0: number; x1: number } // z0 > z1 (track runs toward -z)

const GROUND: Rect[] = [
  { z0: 12, z1: -100, x0: -5, x1: 5 },
  { z0: -110, z1: -125, x0: -5, x1: 5 },
  { z0: -129, z1: -140, x0: -5, x1: 5 },
  { z0: -150, z1: -178, x0: -5, x1: 5 },
  { z0: -178, z1: -250, x0: -9, x1: 9 },
  { z0: -250, z1: -255, x0: -5, x1: 5 },
  { z0: -277, z1: -372, x0: -5, x1: 5 },
];

interface Checkpoint {
  id: 'bridge' | 'fork' | 'color' | 'help';
  z: number;
  cleared: boolean;
}

interface Pick { obj: THREE.Object3D; kind: 'coin' | 'bell' | 'present'; taken: boolean; secret?: boolean }

export class DashScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 700);
  music = 'dash' as const;
  private world = new CollisionWorld();
  private deer = new Reindeer();
  private rider = new Hero();
  private body: Body = { pos: v3(0, 0, 6), vel: v3(0, 0, 0), radius: 0.6, height: 2, grounded: true };
  private bursts = new Bursts();
  private snow = new Snowfall(1800, 40, 26);
  private twinkle = new Twinkle();
  private sun!: THREE.DirectionalLight;
  private picks: Pick[] = [];
  private snowballs: { m: THREE.Mesh; vz: number }[] = [];
  private movers: { c: BoxCollider; obj: THREE.Object3D; base: THREE.Vector3; amp: number; speed: number; prev: THREE.Vector3 }[] = [];
  private checkpoints: Checkpoint[] = [];
  private bridge!: THREE.Group;
  private bridgeCol!: BoxCollider;
  private bridgeAngle = 1.3;
  private colorPlats: { obj: THREE.Mesh; col: BoxCollider; color: string; row: number; lane: number }[] = [];
  private snowPile!: THREE.Group;
  private snowPileCol!: BoxCollider;
  private helperSnowman!: Snowman;
  private lights: StringLights[] = [];
  private respawnZ = 6;
  private running = false;
  private busy = false;
  private stun = 0;
  private time = 0;
  private coins = 0;
  private bells = 0;
  private presents = 0;
  private jumps = 0;
  private secretFound = false;
  private autoSteerX: number | null = null;
  private finished = false;
  private camPos = v3(0, 6, 16);
  private dashHud: HTMLElement;
  private results: HTMLElement;
  private t = 0;
  private spawnT = 0;

  constructor(private g: Game) {
    this.buildWorld();
    this.dashHud = el('div', { class: 'dash-hud hidden' });
    this.results = el('div', { class: 'results hidden' });
    g.ui.append(this.dashHud, this.results);
  }

  get baseSpeed(): number {
    return { gentle: 7, normal: 9, zippy: 11.5 }[this.g.settings.gameplay];
  }

  private buildWorld(): void {
    const sc = this.scene;
    sc.background = new THREE.Color(0xbfdcff);
    sc.fog = new THREE.Fog(0xd6e8ff, 40, 170);
    sc.add(makeSky(0x6aa8ff, 0xf0f6ff, v3(-0.3, 0.4, -0.8)));
    sc.add(new THREE.HemisphereLight(0xe6f2ff, 0x9fb4d6, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 120 });
    sc.add(this.sun, this.sun.target);
    sc.add(this.bursts.points, this.snow.points, this.twinkle);
    const far = makeMountains(220, 30);
    far.position.z = -180;
    sc.add(far);

    // ground & world
    this.world.ground = (x, z) => (GROUND.some((r) => z <= r.z0 && z >= r.z1 && x >= r.x0 - 0.3 && x <= r.x1 + 0.3) ? 0 : -Infinity);
    const gm = new THREE.MeshStandardMaterial({ map: cobbleTex([2, 20]), roughness: 0.85 });
    for (const r of GROUND) {
      const w = r.x1 - r.x0, l = r.z0 - r.z1;
      const t = gm.map!.clone();
      t.needsUpdate = true;
      t.repeat.set(w / 4, l / 4);
      const m = gm.clone();
      m.map = t;
      const top = mesh(new THREE.BoxGeometry(w, 1, l), m);
      top.position.set((r.x0 + r.x1) / 2, -0.5, (r.z0 + r.z1) / 2);
      sc.add(top);
      const cliff = mesh(new THREE.BoxGeometry(w, 8, l), mat(0xdbe8fb, { rough: 1 }));
      cliff.position.set(top.position.x, -5, top.position.z);
      sc.add(cliff);
      // snowbanks along edges
      for (const x of [r.x0 - 0.6, r.x1 + 0.6]) {
        const bank = mesh(new THREE.CapsuleGeometry(0.8, l - 1.6, 4, 10), SNOW());
        bank.rotation.x = Math.PI / 2;
        bank.position.set(x, 0.1, (r.z0 + r.z1) / 2);
        bank.scale.y = 1;
        bank.scale.x = 1;
        sc.add(bank);
      }
    }
    // outside snowfield & abyss
    const field = mesh(new THREE.PlaneGeometry(600, 700), new THREE.MeshStandardMaterial({ map: snowGroundTex(), roughness: 0.95 }));
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, -0.3, -180);
    // cut: we render field only at sides via two planes
    for (const s of [-1, 1]) {
      const side = field.clone();
      side.geometry = new THREE.PlaneGeometry(280, 700);
      side.position.set(s * 150, -0.3, -180);
      sc.add(side);
    }
    const abyss = mesh(new THREE.PlaneGeometry(40, 700), mat(0x6f9bd6, { rough: 1 }));
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.set(0, -9, -180);
    sc.add(abyss);

    // decorations along the track
    const pines: { x: number; y: number; z: number; s: number }[] = [];
    for (let z = 0; z > -370; z -= 9) {
      for (const s of [-1, 1]) {
        const xr = this.xRange(z);
        const edge = s < 0 ? xr[0] - 3.5 : xr[1] + 3.5;
        pines.push({ x: edge + s * Math.random() * 6, y: -0.3, z: z + Math.random() * 4, s: 4 + Math.random() * 3 });
        pines.push({ x: edge + s * (10 + Math.random() * 25), y: -0.3, z: z + Math.random() * 6, s: 6 + Math.random() * 4 });
      }
      if ((-z) % 27 === 0) {
        for (const s of [-1, 1]) {
          const cc = makeCandyCane(2.2);
          const xr = this.xRange(z);
          cc.position.set(s < 0 ? xr[0] - 1.6 : xr[1] + 1.6, 0, z);
          cc.rotation.y = s < 0 ? 0 : Math.PI;
          sc.add(cc);
        }
      }
      if ((-z) % 36 === 0) {
        const xr = this.xRange(z);
        const pts = [v3(xr[0] - 1, 5, z), v3((xr[0] + xr[1]) / 2, 6, z), v3(xr[1] + 1, 5, z)];
        const sl = new StringLights(pts, 0.5);
        this.lights.push(sl);
        sc.add(sl.mesh);
        for (const x of [xr[0] - 1, xr[1] + 1]) {
          const l = makeLamp();
          l.position.set(x, 0, z);
          l.scale.setScalar(1.5);
          sc.add(l);
        }
      }
    }
    sc.add(instancedPines(pines));
    const start = makeArch(0x43a047, 11, 7);
    start.position.set(0, 0, 4);
    sc.add(start);

    // river + drawbridge (checkpoint 1)
    const river = mesh(new THREE.PlaneGeometry(40, 10), ICE());
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -3, -105);
    sc.add(river);
    this.bridge = new THREE.Group();
    const deck = mesh(new THREE.BoxGeometry(8, 0.4, 11), new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.8 }));
    deck.position.z = -5.5;
    this.bridge.add(deck);
    for (let i = 0; i < 10; i++) {
      const plank = mesh(new THREE.BoxGeometry(8.1, 0.45, 0.08), mat(0x6d4c2b));
      plank.position.z = -0.5 - i * 1.1;
      this.bridge.add(plank);
    }
    for (const x of [-4.4, 4.4]) {
      const post = mesh(cyl(0.4, 0.5, 5, 10), mat(0x8d6e63));
      post.position.set(x, 2.5, -100);
      sc.add(post);
      const cap = mesh(sphere(0.55, 12, 8), SNOW());
      cap.position.set(x, 5.1, -100);
      sc.add(cap);
    }
    this.bridge.position.set(0, 0, -99.5);
    this.bridge.rotation.x = this.bridgeAngle;
    sc.add(this.bridge);
    this.bridgeCol = this.world.addBoxAt(0, -105, 4, 5.6, -1, 0);
    this.bridgeCol.enabled = false;
    this.checkpoints.push({ id: 'bridge', z: -97, cleared: false });

    // jump gaps with a moving platform
    const plat = makePresent(0x1e88e5, 0xfdd835, 4, 0.12);
    plat.position.set(0, -0.5, -145);
    sc.add(plat);
    const pc = this.world.addBoxAt(0, -145, 2, 2.5, -0.5, 0);
    pc.delta = v3(0, 0, 0);
    this.movers.push({ c: pc, obj: plat, base: v3(0, -0.5, -145), amp: 2.6, speed: 0.9, prev: v3(0, -0.5, -145) });
    const sign = makeArch(0xfdd835, 11, 6);
    sign.position.set(0, 0, -122);
    sc.add(sign);

    // fork (checkpoint 2)
    const wall = mesh(new THREE.BoxGeometry(6, 3.5, 60), mat(0xe3f2ff, { rough: 0.5 }));
    wall.position.set(0, 1.75, -216);
    sc.add(wall);
    const wallTop = mesh(new THREE.CapsuleGeometry(3, 56, 4, 12), SNOW());
    wallTop.rotation.x = Math.PI / 2;
    wallTop.scale.set(1, 1, 0.35);
    wallTop.position.set(0, 3.5, -216);
    sc.add(wallTop);
    this.world.addBoxAt(0, -216, 3, 30, 0, 3.6);
    for (const [x, col] of [[-6, 0xe53935], [6, 0x43a047]] as const) {
      for (const z of [-184, -200, -220]) {
        const flag = new THREE.Group();
        const pole = mesh(cyl(0.06, 0.06, 3, 6), mat(0xeeeeee));
        pole.position.y = 1.5;
        flag.add(pole);
        const cloth = mesh(new THREE.PlaneGeometry(1.2, 0.8), mat(col, { rough: 0.6 }));
        (cloth.material as THREE.Material).side = THREE.DoubleSide;
        cloth.position.set(0.6, 2.6, 0);
        flag.add(cloth);
        flag.position.set(x + (x < 0 ? -2.6 : 2.6), 0, z);
        sc.add(flag);
      }
    }
    this.checkpoints.push({ id: 'fork', z: -172, cleared: false });
    // secret path: present stairs up to a high road on the green side
    const steps: [number, number, number][] = [[6.5, -196, 1.0], [6.5, -199, 2.0], [6.5, -202, 3.0]];
    for (const [x, z, h] of steps) {
      const p = makePresent([0xe53935, 0x8e24aa, 0xfb8c00][Math.round(h) % 3], 0xffffff, 2.2, h / 2.2);
      p.position.set(x, 0, z);
      sc.add(p);
      this.world.addBoxAt(x, z, 1.1, 1.1, 0, h);
    }
    const high = mesh(new THREE.BoxGeometry(2.4, 0.4, 30), mat(0xb3e5fc, { rough: 0.2 }));
    high.position.set(6.5, 3.6, -219);
    sc.add(high);
    this.world.addBoxAt(6.5, -219, 1.2, 15, 3.4, 3.8, 'secret');
    for (let i = 0; i < 6; i++) this.addPick('bell', v3(6.5, 5, -208 - i * 4.5), true);

    // colour platforms over a chasm (checkpoint 3)
    const colors = ['red', 'blue', 'yellow'];
    for (let row = 0; row < 5; row++) {
      for (let lane = 0; lane < 3; lane++) {
        const color = colors[(lane + row) % 3];
        const z = -257.5 - row * 4.2;
        const x = (lane - 1) * 3.2;
        const m = mesh(new THREE.BoxGeometry(3, 0.5, 3.6), new THREE.MeshStandardMaterial({ color: COLORS[color].hex, transparent: true, opacity: 0.35, roughness: 0.3, emissive: COLORS[color].hex, emissiveIntensity: 0.1 }));
        m.position.set(x, -0.25, z);
        sc.add(m);
        const c = this.world.addBoxAt(x, z, 1.5, 1.8, -0.5, 0);
        c.enabled = false;
        this.colorPlats.push({ obj: m, col: c, color, row, lane });
      }
    }
    this.checkpoints.push({ id: 'color', z: -251, cleared: false });

    // snow pile + helper (checkpoint 4)
    this.snowPile = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = mesh(sphere(1.4 + Math.random(), 14, 10), SNOW());
      b.position.set(-4 + i, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5);
      this.snowPile.add(b);
    }
    this.snowPile.position.set(0, 0, -303);
    sc.add(this.snowPile);
    this.snowPileCol = this.world.addBoxAt(0, -303, 5, 1.5, 0, 6);
    this.helperSnowman = new Snowman(0xe53935, 0x6a1b9a);
    this.helperSnowman.position.set(-6.8, 0, -298);
    this.helperSnowman.rotation.y = Math.PI / 2;
    sc.add(this.helperSnowman);
    this.checkpoints.push({ id: 'help', z: -297, cleared: false });

    // delivery houses + finish
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const h = makeHouse({ w: 5, d: 4.5, h: 3.2, wall: ['#c9884e', '#7fa7d9', '#e0a96d', '#a5d6a7'][i], roof: [0xc62828, 0x2e5c9a, 0x6a1b9a, 0x1b5e20][i] });
        h.position.set(s * 11, 0, -315 - i * 12);
        h.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        sc.add(h);
      }
    }
    const fin = makeArch(0xe53935, 11, 7);
    fin.position.set(0, 0, -355);
    sc.add(fin);
    const banner = mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: this.checkerTex(), side: THREE.DoubleSide }));
    banner.position.set(0, 5.6, -355);
    sc.add(banner);

    // coins, presents, bells along the course
    for (let z = -6; z > -350; z -= 3.2) {
      if (z < -96 && z > -112) continue;
      if (z < -254 && z > -278) continue;
      const xr = this.xRange(z);
      const lane = Math.sin(z * 0.08) * (Math.min(4, (xr[1] - xr[0]) / 2 - 1));
      if (z < -180 && z > -250) {
        for (const x of [-6, 6]) this.addPick('coin', v3(x + Math.sin(z * 0.2) * 1.5, 1.1, z));
      } else this.addPick('coin', v3(lane, z < -125 && z > -131 ? 3 : 1.1, z));
    }
    for (const z of [-30, -70, -118, -160, -190, -230, -285, -320, -340]) this.addPick('present', v3((Math.random() - 0.5) * 6, 1.2, z));
    for (const z of [-50, -135, -200, -240, -290, -330]) this.addPick('bell', v3((Math.random() - 0.5) * 7, 2.6, z));

    // player
    this.deer.add(this.rider);
    this.rider.scale.setScalar(0.72);
    this.rider.position.set(0, 1.45, -0.1);
    sc.add(this.deer);
  }

  private checkerTex(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private addPick(kind: Pick['kind'], p: THREE.Vector3, secret = false): void {
    const obj = new THREE.Group();
    if (kind === 'coin') obj.add(makeCoin());
    else if (kind === 'bell') obj.add(makeBell(0.45));
    else obj.add(makePresent([0xe53935, 0x1e88e5, 0x8e24aa, 0x43a047][Math.floor(Math.random() * 4)], 0xfdd835, 0.8));
    obj.traverse((o) => (o.castShadow = false)); // many small pickups: skip the shadow pass
    obj.position.copy(p);
    obj.userData.baseY = p.y;
    this.scene.add(obj);
    this.picks.push({ obj, kind, taken: false, secret });
  }

  private xRange(z: number): [number, number] {
    for (const r of GROUND) if (z <= r.z0 && z >= r.z1) return [r.x0, r.x1];
    if (z < -255 && z > -277) return [-4.8, 4.8];
    return [-5, 5];
  }

  applySettings(): void {
    const s = this.g.settings;
    this.deer.setLook(s.reindeer);
    this.rider.setLook(s.hero);
    this.snow.setDensity(s.reducedEffects ? 0.3 : 1);
    this.bursts.reduced = s.reducedEffects;
    this.sun.castShadow = !s.reducedEffects;
    for (const l of this.lights) l.reduced = s.reducedMotion;
  }

  // ------------------------------------------------------------------ lifecycle
  enter(): void {
    this.applySettings();
    this.g.hud.show(true);
    this.g.hud.setBag([]);
    this.results.classList.add('hidden');
    this.dashHud.classList.remove('hidden');
    for (const p of this.picks) {
      p.taken = false;
      p.obj.visible = true;
    }
    for (const c of this.checkpoints) c.cleared = false;
    this.bridgeAngle = 1.3;
    this.bridgeCol.enabled = false;
    // colour lanes: straight on gentle, a gentle one-lane wiggle otherwise
    const shifts = this.g.settings.gameplay === 'gentle' ? [0, 0, 0, 0, 0] : [0, 0, 1, 1, 0];
    const cols = ['red', 'blue', 'yellow'];
    for (const p of this.colorPlats) {
      p.color = cols[(p.lane + shifts[p.row]) % 3];
      p.col.enabled = false;
      const m = p.obj.material as THREE.MeshStandardMaterial;
      m.color.setHex(COLORS[p.color].hex);
      m.emissive.setHex(COLORS[p.color].hex);
      m.opacity = 0.35;
      m.emissiveIntensity = 0.1;
    }
    this.snowPile.visible = true;
    this.snowPile.scale.setScalar(1);
    this.snowPileCol.enabled = true;
    for (const s of this.snowballs) this.scene.remove(s.m);
    this.snowballs = [];
    this.body.pos.set(0, 0, 6);
    this.body.vel.set(0, 0, 0);
    this.respawnZ = 6;
    this.time = this.coins = this.bells = this.presents = 0;
    this.secretFound = false;
    this.finished = false;
    this.running = false;
    this.busy = true;
    this.autoSteerX = null;
    this.camPos.set(0, 6, 16);
    this.deer.position.copy(this.body.pos);
    this.deer.rotation.y = Math.PI;
    this.updateHud();
    setTimeout(() => void this.intro(), 600);
  }

  exit(): void {
    this.dashHud.classList.add('hidden');
    this.results.classList.add('hidden');
  }

  hint(): { text: string; portrait: string } {
    return { text: 'Steer with the arrow keys or A and D. Press space to jump! Collect coins, bells, and presents.', portrait: 'go' };
  }

  private async intro(): Promise<void> {
    const d = this.g.director;
    await d.tell('Juniper', 'present', "Let's deliver presents! I'll run. You steer me left and right. Press space to jump!", VOICES.reindeer);
    const level = this.g.settings.practiceLevel;
    await d.ask({
      activity: 'dash',
      speaker: { name: 'Juniper', voice: VOICES.reindeer, portrait: 'go' },
      question: 'Are you ready? Tell me to go!',
      options: [{ key: 'go', target: targetFor(VOCAB.go, level, this.g.settings, 'What should I do?') }],
      success: () => 'Here we go!',
    });
    this.busy = false;
    this.running = true;
  }

  private updateHud(): void {
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    this.dashHud.innerHTML = `<div class="chip">⏱️ <span>${m}:${String(s).padStart(2, '0')}</span></div><div class="chip">🎁 <span>${this.presents}</span></div><div class="chip">🔔 <span>${this.bells}</span></div><div class="chip">🪙 <span>${this.coins}</span></div>`;
  }

  // ------------------------------------------------------------------ checkpoints
  private async runCheckpoint(c: Checkpoint): Promise<void> {
    this.busy = true;
    this.body.vel.set(0, 0, 0);
    const d = this.g.director;
    const level = this.g.settings.practiceLevel;
    const S = this.g.settings;
    if (c.id === 'bridge') {
      await d.ask({
        activity: 'dash',
        speaker: { name: 'Juniper', voice: VOICES.reindeer, portrait: 'bridge' },
        question: 'Oh! The bridge is up. Ask the bridge to open!',
        options: [{ key: 'open', target: targetFor(VOCAB.open, level, S, 'How can we cross?') }],
        success: () => 'Creeeak! The bridge is coming down!',
      });
      this.g.audio.sfx('magic');
      this.bridgeCol.enabled = true;
    } else if (c.id === 'fork') {
      const res = await d.ask({
        activity: 'dash',
        speaker: { name: 'Juniper', voice: VOICES.reindeer, portrait: 'go' },
        question: 'Two paths! Which way should we go? Red or green?',
        options: ['red', 'green'].map((col) => ({ key: col, target: colorTarget(col, level === 'A' ? 'A' : 'B', S) })),
        modelLine: 'You can say red, or green.',
        success: (k) => `The ${k} path! Let's go!`,
      });
      this.autoSteerX = res.key === 'red' ? -6 : 6;
      setTimeout(() => (this.autoSteerX = null), 1800);
    } else if (c.id === 'color') {
      const color = ['red', 'blue', 'yellow'][Math.floor(Math.random() * 3)];
      await d.ask({
        activity: 'dash',
        speaker: { name: 'Twinkle', voice: VOICES.twinkle, portrait: `color:${color}` },
        question: `The magic platforms are sleeping! Say ${color} to wake up the ${color} ones!`,
        options: [{ key: color, target: colorTarget(color, level, S, 'platform') }],
        distractors: ['red', 'blue', 'yellow'].filter((x) => x !== color).map((x) => `color:${x}`),
        success: () => `Yes! ${color}! The ${color} platforms woke up! Jump across!`,
      });
      for (const p of this.colorPlats) {
        if (p.color !== color) continue;
        p.col.enabled = true;
        const m = p.obj.material as THREE.MeshStandardMaterial;
        m.opacity = 1;
        m.emissiveIntensity = 0.5;
        this.bursts.burst(p.obj.position.clone().add(v3(0, 0.5, 0)), { count: 20, colors: [COLORS[color].hex, 0xffffff] });
      }
      // on gentle, also make the path forgiving: wide platform glow + slower
      this.g.audio.sfx('magic');
    } else if (c.id === 'help') {
      this.helperSnowman.setHappy(false);
      await d.ask({
        activity: 'dash',
        speaker: { name: 'Juniper', voice: VOICES.reindeer, portrait: 'help' },
        question: 'A big snow pile is blocking the road! Ask Twinkle for help!',
        options: [{ key: 'help', target: targetFor(VOCAB.help, level, S, 'What can we say to Twinkle?') }],
        success: () => 'Twinkle to the rescue! Sparkle, sparkle, melt!',
      });
      this.g.audio.sfx('magic');
      this.bursts.burst(this.snowPile.position.clone().add(v3(0, 2, 0)), { count: 120, speed: 9, colors: [0xffffff, 0xbfe9ff, 0xfff59d] });
      this.snowPileCol.enabled = false;
      this.helperSnowman.setHappy(true);
      this.helperSnowman.dance(4);
    }
    c.cleared = true;
    this.respawnZ = c.z;
    this.busy = false;
  }

  private respawn(): void {
    this.g.audio.sfx('magic');
    this.body.pos.set(0, 2, this.respawnZ);
    this.body.vel.set(0, 0, 0);
    this.stun = 0.6;
    void this.g.director.tell('Twinkle', 'star', 'Whoops! Up you go!');
  }

  private async finish(): Promise<void> {
    this.finished = true;
    this.running = false;
    this.busy = true;
    const g = this.g;
    const par = { gentle: [70, 95], normal: [55, 75], zippy: [45, 60] }[g.settings.gameplay];
    const medal: 'gold' | 'silver' | 'bronze' = this.time <= par[0] ? 'gold' : this.time <= par[1] ? 'silver' : 'bronze';
    g.audio.sfx('cheer');
    this.bursts.burst(this.body.pos.clone().add(v3(0, 3, -2)), { count: 150, speed: 10, up: 6 });
    g.progress.medals.dash.push(medal);
    if (!g.progress.bestDashTime || this.time < g.progress.bestDashTime) g.progress.bestDashTime = Math.round(this.time);
    g.addCoins(this.coins);
    if (this.bells) g.addBells(this.bells);
    g.addStars(this.presents >= 5 ? 3 : 2);
    const first = !g.progress.completions.dash;
    g.complete('dash');
    g.unlock('rd-nose');
    g.unlock('outfit-antlers');
    g.unlock('deco-stocking');
    if (this.bells >= 10 || g.progress.bells >= 10) g.unlock('rd-bells');
    if (this.secretFound) g.unlock('rd-lights');
    if (first) {
      g.settings.reindeer.redNose = true;
      this.deer.setLook(g.settings.reindeer);
    }
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    const medalEmoji = { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal];
    this.results.innerHTML = `<div class="res-card"><div class="medal">${medalEmoji}</div><div class="row"><span>⏱️ ${m}:${String(s).padStart(2, '0')}</span><span>🎁 ${this.presents}</span><span>🔔 ${this.bells}</span><span>🪙 ${this.coins}</span></div><div class="btns"><button class="big-btn again" aria-label="Play again">🔁</button><button class="big-btn home" aria-label="Back to the village">🏠</button></div></div>`;
    this.results.classList.remove('hidden');
    this.results.querySelector('.again')!.addEventListener('click', () => { g.audio.sfx('click'); this.enter(); });
    this.results.querySelector('.home')!.addEventListener('click', () => { g.audio.sfx('click'); void g.goto('village', { from: 'dash' }); });
    await g.director.tell('Juniper', 'present', `We did it! All the presents are delivered! You got a ${medal} medal!${this.secretFound ? ' And you found the secret path!' : ''}`, VOICES.reindeer);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, t: number): void {
    this.t = t;
    const g = this.g;
    const input = g.input;
    // movers
    for (const p of this.movers) {
      const np = p.base.clone().add(v3(Math.sin(t * p.speed) * p.amp, 0, 0));
      p.c.delta!.copy(np).sub(p.prev);
      p.prev.copy(np);
      p.obj.position.copy(np);
      p.c.min.set(np.x - 2, -0.5, np.z - 2.5);
      p.c.max.set(np.x + 2, 0, np.z + 2.5);
    }
    // bridge animation
    const targetAngle = this.bridgeCol.enabled ? 0 : 1.3;
    this.bridgeAngle += (targetAngle - this.bridgeAngle) * Math.min(1, dt * 2);
    this.bridge.rotation.x = this.bridgeAngle;
    if (!this.snowPileCol.enabled && this.snowPile.visible) {
      this.snowPile.scale.multiplyScalar(1 - dt * 2);
      if (this.snowPile.scale.x < 0.05) this.snowPile.visible = false;
    }

    const b = this.body;
    const active = this.running && !this.busy && !g.director.busy;
    let forward = 0;
    if (active) {
      this.time += dt;
      const ax = input.axis();
      let speed = this.baseSpeed * (1 + ax.y * 0.25);
      if (this.stun > 0) { this.stun -= dt; speed *= 0.35; }
      forward = speed;
      let steer = ax.x * 7;
      // mouse steering: hold pointer left/right of centre while clicking isn't needed; clicks steer to a lane
      if (input.clicks.length) {
        const c = input.clicks[input.clicks.length - 1];
        if (c.y > innerHeight * 0.25) this.autoSteerX = THREE.MathUtils.clamp(b.pos.x + (c.x / innerWidth - 0.5) * 10, -8, 8);
        setTimeout(() => (this.autoSteerX = null), 700);
      }
      // over the colour chasm, gently guide toward the awake platform ahead (manual steering still wins)
      if (b.pos.z < -254 && b.pos.z > -277 && !ax.x && this.autoSteerX === null) {
        const ahead = this.colorPlats.filter((p) => p.col.enabled && p.obj.position.z < b.pos.z + 1).sort((a, c) => c.obj.position.z - a.obj.position.z)[0];
        if (ahead) steer = THREE.MathUtils.clamp((ahead.obj.position.x - b.pos.x) * 3, -7, 7);
      }
      if (this.autoSteerX !== null && !ax.x) steer = THREE.MathUtils.clamp((this.autoSteerX - b.pos.x) * 3, -7, 7);
      b.vel.x += (steer - b.vel.x) * Math.min(1, dt * 10);
      b.vel.z = -forward;
      if (input.jumpPressed() && this.jumps < 2) {
        b.vel.y = this.jumps ? 8.6 : 10.2;
        this.jumps++;
        b.grounded = false;
        g.audio.sfx('jump');
      }
      // checkpoints
      for (const c of this.checkpoints) {
        if (!c.cleared && b.pos.z < c.z + 0.5 && b.pos.z > c.z - 6) {
          b.pos.z = c.z + 0.5;
          void this.runCheckpoint(c);
          break;
        }
      }
      if (b.pos.z < -350 && !this.finished) void this.finish();
    } else {
      b.vel.x *= 0.85;
      b.vel.z *= 0.85;
    }
    const res = this.world.step(b, dt);
    if (b.grounded) this.jumps = 0;
    if (res.landed) g.audio.sfx('land');
    if (b.groundTag === 'secret' && !this.secretFound) {
      this.secretFound = true;
      g.hud.toast('✨', 'Secret path!');
      g.audio.sfx('magic');
    }
    // keep within the track sides (unless in the air over chasms)
    const xr = this.xRange(b.pos.z);
    if (b.pos.y > -0.5) b.pos.x = THREE.MathUtils.clamp(b.pos.x, xr[0] + 0.3, xr[1] - 0.3);
    if (b.pos.y < -5 && !this.busy) this.respawn();

    // snowballs in two zones
    this.spawnT -= dt;
    const inZone = (b.pos.z < -20 && b.pos.z > -90) || (b.pos.z < -150 && b.pos.z > -170) || (b.pos.z < -280 && b.pos.z > -296);
    if (active && inZone && this.spawnT <= 0) {
      this.spawnT = { gentle: 2.2, normal: 1.5, zippy: 1.0 }[g.settings.gameplay];
      const m = mesh(sphere(0.7, 16, 12), SNOW());
      m.position.set((Math.random() - 0.5) * 8, 0.7, b.pos.z - 45);
      this.scene.add(m);
      this.snowballs.push({ m, vz: 5 + Math.random() * 2 });
    }
    for (const s of [...this.snowballs]) {
      if (active) {
        s.m.position.z += s.vz * dt;
        s.m.rotation.x += s.vz * dt / 0.7;
      }
      const dx = s.m.position.x - b.pos.x, dz = s.m.position.z - b.pos.z, dy = s.m.position.y - (b.pos.y + 0.8);
      if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.2) {
        this.stun = 0.8;
        g.audio.sfx('thump');
        this.bursts.burst(s.m.position, { count: 30, colors: [0xffffff, 0xe3f2fd], speed: 5 });
        this.scene.remove(s.m);
        this.snowballs = this.snowballs.filter((x) => x !== s);
      } else if (s.m.position.z > b.pos.z + 20) {
        this.scene.remove(s.m);
        this.snowballs = this.snowballs.filter((x) => x !== s);
      }
    }

    // pickups
    for (const p of this.picks) {
      if (p.taken) continue;
      p.obj.rotation.y += dt * 3;
      p.obj.position.y = p.obj.userData.baseY + Math.sin(t * 3 + p.obj.position.z) * 0.15;
      const dx = p.obj.position.x - b.pos.x, dz = p.obj.position.z - b.pos.z, dy = p.obj.position.y - (b.pos.y + 1.2);
      if (dx * dx + dz * dz < 2.4 && Math.abs(dy) < 1.8) {
        p.taken = true;
        p.obj.visible = false;
        if (p.kind === 'coin') { this.coins++; g.audio.sfx('coin'); }
        else if (p.kind === 'bell') { this.bells++; g.audio.sfx('bell', 1175); }
        else { this.presents++; g.audio.sfx('star'); }
        this.bursts.burst(p.obj.position, { count: p.kind === 'coin' ? 8 : 30, colors: p.kind === 'coin' ? [0xffd54f] : undefined, speed: 4 });
        this.updateHud();
      }
    }
    if (active) this.updateHud();

    // visuals
    const hs = Math.hypot(b.vel.x, b.vel.z);
    this.deer.position.copy(b.pos);
    this.deer.rotation.y = Math.PI + THREE.MathUtils.clamp(-b.vel.x * 0.05, -0.4, 0.4);
    this.deer.update(dt, hs, b.grounded);
    this.rider.animate(dt, 0, b.vel.y, true, g.settings.reducedMotion);
    this.helperSnowman.update(dt, g.settings.reducedMotion);
    const camT = v3(b.pos.x * 0.6, Math.max(b.pos.y, -1) + 5.2, b.pos.z + 10);
    this.camPos.lerp(camT, 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(b.pos.x * 0.8, Math.max(b.pos.y, -1) + 1.6, b.pos.z - 6);
    this.sun.position.set(b.pos.x - 15, 40, b.pos.z + 10);
    this.sun.target.position.copy(b.pos);
    const tw = b.pos.clone().add(v3(1.8, 3.4 + Math.sin(t * 3) * 0.2, 0.5));
    this.twinkle.position.lerp(tw, 1 - Math.exp(-4 * dt));
    this.twinkle.lookAt(this.camera.position);
    this.twinkle.talking = g.speaker.speaking;
    this.twinkle.update(dt);
    for (const l of this.lights) l.update(t);
    this.bursts.update(dt);
    this.snow.update(dt, b.pos, t);
  }
}
