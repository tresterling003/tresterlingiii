import * as THREE from 'three';
import type { Game, GameScene } from '../game';
import { VOICES } from '../core/tts';
import { pickPreferred, simpleTarget, targetFor, VOCAB } from '../data/content';
import { Bursts, makeSky, Snowfall, StringLights } from '../three/effects';
import { cobbleTex, emojiSprite, ICE, mat, snowGroundTex, SNOW, woodTex } from '../three/materials';
import { Hero } from '../three/models/hero';
import { Animal, LetterFriend, makeBell, makeCandyCane, makeCoin, makeItem, makePresent, makeStar, Reindeer, Snowman, Twinkle, type AnimalKind, type ItemKind, type SnowmanSlot } from '../three/models/characters';
import { cyl, mesh, sphere, damp } from '../three/models/kit';
import { instancedPines, makeArch, makeBridge, makeFence, makeGrandTree, makeHouse, makeLamp, makeMountains, makePine, makeRock, makeSignpost } from '../three/models/props';
import { CollisionWorld, type BoxCollider } from '../world/physics';
import { FollowCamera, HeroController } from '../world/controller';

interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  icon: () => string;
  enabled: () => boolean;
  run: () => Promise<void> | void;
  obj?: THREE.Object3D;
}

interface Pickup {
  id: string;
  kind: 'coin' | 'star' | 'item';
  item?: ItemKind;
  obj: THREE.Object3D;
  baseY: number;
  taken: boolean;
  persistent: boolean;
  forLetter?: string;
  beam?: THREE.Mesh;
}

interface SnowmanQuest {
  slot: SnowmanSlot;
  name: string;
  sm: Snowman;
  pitch: number;
  met: boolean;
  done: boolean;
}

interface LetterQuest {
  letter: string;
  name: string;
  sound: string;
  item: ItemKind;
  vocab: string;
  color: number;
  lf: LetterFriend;
  need: number;
  got: number;
  met: boolean;
  done: boolean;
  spots: THREE.Vector3[];
}

interface Wanderer {
  a: Animal;
  home: THREE.Vector3;
  r: number;
  target: THREE.Vector3;
  wait: number;
  speed: number;
  sound: { q: string; model: string; accept: string[]; done: string };
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const ITEM_SPOTS: Record<SnowmanSlot, THREE.Vector3[]> = {
  hat: [v3(-6, 0, -28), v3(-22, 0, -42), v3(12, 0, -34)],
  scarf: [v3(26, 0, 19), v3(12, 0, 14), v3(28, 0, -20)],
  carrot: [v3(-36, 0, 9), v3(-46, 0, 12), v3(-26, 0, -6)],
  buttons: [v3(10, 0, 30), v3(-9, 0, 42), v3(14, 0, 44)],
};

export class VillageScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 900);
  music = 'village' as const;
  private world = new CollisionWorld();
  hero: Hero;
  private ctrl: HeroController;
  private cam: FollowCamera;
  private sun!: THREE.DirectionalLight;
  private bursts = new Bursts();
  private snow = new Snowfall(2600, 50, 28);
  private lights: StringLights[] = [];
  private twinkle = new Twinkle();
  private interactables: Interactable[] = [];
  private pickups: Pickup[] = [];
  private snowmen: SnowmanQuest[] = [];
  private letters: LetterQuest[] = [];
  private animals: Wanderer[] = [];
  private platforms: { c: BoxCollider; obj: THREE.Object3D; base: THREE.Vector3; axis: THREE.Vector3; amp: number; speed: number; prev: THREE.Vector3 }[] = [];
  private bag: ItemKind[] = [];
  private arrow!: THREE.Group;
  private busy = false;
  private nearest: Interactable | null = null;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private clickMarker!: THREE.Mesh;
  private treeStar: THREE.Object3D | null = null;
  private bellTowerBells: THREE.Group[] = [];
  private juniper!: Reindeer;
  private spin: THREE.Object3D[] = [];
  private t = 0;
  private introDone = false;

  constructor(private g: Game) {
    this.hero = new Hero(g.settings.hero);
    this.scene.add(this.hero);
    this.ctrl = new HeroController(this.hero, this.world, g.audio);
    this.cam = new FollowCamera(this.camera);
    this.build();
    this.applySettings();
  }

  applySettings(): void {
    const s = this.g.settings;
    this.hero.setLook(s.hero);
    this.juniper?.setLook(s.reindeer);
    this.snow.setDensity(s.reducedEffects ? 0.3 : 1);
    this.bursts.reduced = s.reducedEffects;
    for (const l of this.lights) l.reduced = s.reducedMotion;
    this.sun.castShadow = !s.reducedEffects;
  }

  // ======================================================================= build
  private build(): void {
    const sc = this.scene;
    sc.background = new THREE.Color(0xcfe6ff);
    sc.fog = new THREE.Fog(0xdcecff, 60, 210);
    sc.add(makeSky(0x4a9cff, 0xe8f4ff, v3(0.5, 0.45, 0.2)));
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x9fb4d6, 1.1);
    sc.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.position.set(30, 45, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sh = this.sun.shadow.camera;
    sh.left = -38; sh.right = 38; sh.top = 38; sh.bottom = -38; sh.near = 1; sh.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    sc.add(this.sun, this.sun.target);
    sc.add(this.bursts.points, this.snow.points, this.twinkle);

    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500, 1, 1), new THREE.MeshStandardMaterial({ map: snowGroundTex(), roughness: 0.92, color: 0xffffff }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sc.add(ground);
    this.world.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    sc.add(makeMountains(185, 30));
    this.buildHills();
    this.buildForest();

    // plaza
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 48), new THREE.MeshStandardMaterial({ map: cobbleTex([6, 6]), roughness: 0.8 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    sc.add(plaza);
    const tree = makeGrandTree();
    sc.add(tree);
    this.treeStar = tree.getObjectByName('treeStar') ?? null;
    this.world.addCyl(0, 0, 1.6, 0, 20);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this.world.addCyl(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 0.55, 0, 0.9);
    }
    // spiral lights on tree
    const spiral: THREE.Vector3[] = [];
    for (let i = 0; i <= 140; i++) {
      const t = i / 140;
      const y = 2.8 + t * 8.8;
      const r = 3.7 * (1 - t) + 0.4;
      spiral.push(v3(Math.cos(t * Math.PI * 10) * r, y, Math.sin(t * Math.PI * 10) * r));
    }
    this.addLights(spiral, 0.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const l = makeLamp();
      l.position.set(Math.cos(a) * 13.6, 0, Math.sin(a) * 13.6);
      sc.add(l);
      this.world.addCyl(l.position.x, l.position.z, 0.2, 0, 3.5);
    }
    // garland lights between lamps
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ring.push(v3(Math.cos(a) * 13.6, 2.6, Math.sin(a) * 13.6));
    }
    this.addLights(ring, 0.55);

    this.buildWishTree();
    this.buildPaths();
    this.buildHouses();
    this.buildStream();
    this.buildPond();
    this.buildWorkshop();
    this.buildStable();
    this.buildCabin();
    this.buildBellTower();
    this.buildSnowmen();
    this.buildLetters();
    this.buildAnimals();
    this.buildPlatforms();
    this.buildCollectibles();
    this.buildDecor();

    // guide arrow
    this.arrow = new THREE.Group();
    const shp = new THREE.Shape();
    shp.moveTo(0, 0.55); shp.lineTo(0.45, 0); shp.lineTo(0.2, 0); shp.lineTo(0.2, -0.45); shp.lineTo(-0.2, -0.45); shp.lineTo(-0.2, 0); shp.lineTo(-0.45, 0); shp.closePath();
    const am = new THREE.Mesh(new THREE.ShapeGeometry(shp), new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.9, depthWrite: false }));
    am.rotation.x = -Math.PI / 2;
    am.position.z = -2.0;
    am.rotation.z = Math.PI;
    am.scale.setScalar(1.3);
    this.arrow.add(am);
    sc.add(this.arrow);
    this.clickMarker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.clickMarker.rotation.x = -Math.PI / 2;
    sc.add(this.clickMarker);
  }

  private addLights(pts: THREE.Vector3[], spacing: number): void {
    const l = new StringLights(pts, spacing);
    this.lights.push(l);
    this.scene.add(l.mesh);
  }

  private buildHills(): void {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 78 + Math.random() * 30;
      const s = 10 + Math.random() * 14;
      const h = new THREE.Mesh(sphere(1, 20, 12), mat(0xf1f6ff, { rough: 0.95 }));
      h.scale.set(s, s * 0.35, s);
      h.position.set(Math.cos(a) * r, -s * 0.05, Math.sin(a) * r);
      h.receiveShadow = true;
      this.scene.add(h);
    }
  }

  private buildForest(): void {
    const spots = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 56 + Math.random() * 40;
      spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 4 + Math.random() * 5 });
    }
    this.scene.add(instancedPines(spots));
  }

  private pine(x: number, z: number, h = 4.5, orn = false): void {
    const p = makePine(h, true, orn);
    p.position.set(x, 0, z);
    p.rotation.y = Math.random() * 6;
    p.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.scene.add(p);
    this.world.addCyl(x, z, 0.5, 0, h);
  }

  /** Wish Tree: parent-chosen custom words and target-sound words live here. */
  private buildWishTree(): void {
    const sign = makeSignpost(emojiSprite('🌟', 1.4, '#ffd54fcc'));
    sign.position.set(0, 0, 6.2);
    this.scene.add(sign);
    this.interactables.push({ id: 'wish', pos: v3(0, 0, 6.6), radius: 2.0, icon: () => 'tree', enabled: () => true, run: () => this.wishTree(), obj: sign });
  }

  private wishIndex = 0;
  private wishTree(): Promise<void> {
    return this.run(async () => {
      const s = this.g.settings;
      const level = s.practiceLevel;
      let option;
      let word: string;
      if (s.customWords.length) {
        const w = s.customWords[this.wishIndex++ % s.customWords.length];
        word = w.word;
        option = { key: w.id, target: simpleTarget(`custom-${w.id}`, w.word, [w.word, ...w.accept, ...(s.acceptedExtra[w.word.toLowerCase()] ?? [])], w.picture, level, level === 'A' ? 'activity' : 'keywords') };
      } else {
        const item = pickPreferred(['ball', 'star', 'snow', 'tree', 'bell', 'moon', 'present', 'dog', 'cat', 'sock', 'mitten', 'jump'], s);
        word = item.word;
        option = { key: item.id, target: targetFor(item, level, s, 'What do you wish for?') };
      }
      await this.g.director.ask({
        activity: 'wish-tree',
        speaker: { name: 'Twinkle', voice: VOICES.twinkle, portrait: 'tree' },
        question: `Make a wish on the magic tree! Say the magic word.`,
        options: [option],
        success: () => `${word}! Your wish made the tree sparkle!`,
      });
      for (let i = 0; i < 6; i++) setTimeout(() => this.bursts.burst(v3(Math.cos(i) * 3, 3 + i * 1.4, Math.sin(i) * 3), { count: 30, speed: 5 }), i * 150);
      this.g.addCoins(2);
      this.g.complete('wish-tree');
    });
  }

  private buildPaths(): void {
    const tex = cobbleTex([1, 8]);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const path = (x1: number, z1: number, x2: number, z2: number, w = 3.4) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(1, len / 3.4);
      const pm = m.clone();
      pm.map = t;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), pm);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = Math.atan2(x2 - x1, z2 - z1);
      p.position.set((x1 + x2) / 2, 0.015, (z1 + z2) / 2);
      p.receiveShadow = true;
      this.scene.add(p);
    };
    path(0, -12, 0, -34); // workshop
    path(-12, 0, -30, 0); // stable
    path(12, 0, 28, 0); // snowmen (bridge)
    path(0, 12, 0, 25); // pond
    path(-9, 9, -24, 32); // cabin
    path(-9, -9, -22, -22); // letter lane
    path(9, -9, 14, -20); // bell tower
  }

  private house(x: number, z: number, face: 'n' | 's' | 'e' | 'w', o: Parameters<typeof makeHouse>[0]): THREE.Group {
    const h = makeHouse(o);
    h.position.set(x, 0, z);
    h.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
    this.scene.add(h);
    const swap = face === 'e' || face === 'w';
    const hx = (swap ? o.d : o.w) / 2 + 0.1, hz = (swap ? o.w : o.d) / 2 + 0.1;
    this.world.addBoxAt(x, z, hx, hz, 0, o.h + o.w * 0.45);
    return h;
  }

  private buildHouses(): void {
    this.house(-20, -8, 'e', { w: 6, d: 5, h: 3.6, wall: '#c9884e', roof: 0xc62828 });
    this.house(21, -12, 'w', { w: 5.5, d: 5, h: 3.4, wall: '#7fa7d9', roof: 0x2e5c9a, brick: false });
    this.house(-16, -38, 's', { w: 6, d: 5, h: 3.8, wall: '#e0a96d', roof: 0x6a1b9a });
    this.house(20, -40, 's', { w: 6.5, d: 5, h: 3.6, wall: '#d98e8e', roof: 0x1b5e20, brick: true });
    this.house(-46, -22, 'e', { w: 5, d: 5, h: 3.4, wall: '#b0c4a0', roof: 0xb71c1c });
    this.house(44, 28, 'w', { w: 6, d: 5, h: 3.6, wall: '#f0c987', roof: 0x283593 });
    this.house(18, 24, 'w', { w: 5, d: 4.5, h: 3.2, wall: '#a5d6a7', roof: 0xd84315 });
    this.house(46, -16, 'w', { w: 5, d: 4.5, h: 3.2, wall: '#ffcc80', roof: 0x00838f });
    this.house(48, 12, 'w', { w: 5, d: 4.5, h: 3.2, wall: '#ce93d8', roof: 0xc62828 });
    // decorative trees inside the village
    const trees: [number, number, number?][] = [[-10, -22], [10, -24, 5], [-30, -14], [-36, -30], [30, -30], [38, -42], [-8, 22], [8, 20], [-40, 20], [-20, 46], [26, 40], [36, 44], [-52, 30], [-50, -6], [52, -30], [-28, 14], [28, 30], [-4, -48], [30, -48], [-42, -44], [52, 40], [-12, 52], [12, 52], [24, -22]];
    for (const [x, z, h] of trees) this.pine(x, z, h ?? 4 + Math.random() * 2.5);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 25;
      const rk = makeRock(0.5 + Math.random() * 0.8);
      rk.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      this.scene.add(rk);
    }
  }

  private buildStream(): void {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(5, 130), ICE());
    st.rotation.x = -Math.PI / 2;
    st.position.set(19, 0.03, 0);
    st.receiveShadow = true;
    this.scene.add(st);
    for (const s of [-1, 1]) {
      for (let z = -60; z < 60; z += 3) {
        const bank = new THREE.Mesh(sphere(1, 10, 6), SNOW());
        bank.scale.set(0.9, 0.35, 1.8);
        bank.position.set(19 + s * 2.8, 0, z + Math.random());
        if (Math.abs(z) < 4) continue;
        this.scene.add(bank);
      }
    }
    this.ctrl.iceZones.push(...Array.from({ length: 26 }, (_, i) => ({ x: 19, z: -60 + i * 5, r: 2.4 })));
    const br = makeBridge(7.5, 3.2);
    br.rotation.y = Math.PI / 2;
    br.position.set(19, 0, 0);
    br.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.scene.add(br);
    // walkable bridge steps
    this.world.addBoxAt(16.4, 0, 0.9, 1.5, 0, 0.35);
    this.world.addBoxAt(18.2, 0, 0.9, 1.5, 0, 0.7);
    this.world.addBoxAt(19.8, 0, 0.9, 1.5, 0, 0.7);
    this.world.addBoxAt(21.6, 0, 0.9, 1.5, 0, 0.35);
  }

  private buildPond(): void {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(10, 48), ICE());
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(2, 0.035, 36);
    pond.receiveShadow = true;
    this.scene.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.45, 8, 48), SNOW());
    rim.rotation.x = Math.PI / 2;
    rim.position.set(2, 0, 36);
    rim.scale.z = 0.5;
    this.scene.add(rim);
    this.ctrl.iceZones.push({ x: 2, z: 36, r: 10 });
    // skating trails
    for (let i = 0; i < 3; i++) {
      const tr = new THREE.Mesh(new THREE.RingGeometry(3 + i * 2, 3.05 + i * 2, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
      tr.rotation.x = -Math.PI / 2;
      tr.position.set(2 + i * 0.5, 0.04, 36 - i * 0.4);
      this.scene.add(tr);
    }
  }

  private portal(id: string, pos: THREE.Vector3, emoji: string, icon: string, run: () => void, color = 0xffd54f): void {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 10, 40), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(pos).setY(0.1);
    this.scene.add(ring);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(pos).setY(0.06);
    this.scene.add(glow);
    const sp = emojiSprite(emoji, 2.2, '#ffffffcc');
    sp.position.copy(pos).setY(3.6);
    this.scene.add(sp);
    this.spin.push(sp);
    this.interactables.push({ id, pos: pos.clone(), radius: 2.4, icon: () => icon, enabled: () => true, run, obj: glow });
    glow.userData.interact = id;
  }

  private buildWorkshop(): void {
    const sign = new THREE.Group();
    const gear = mesh(new THREE.TorusGeometry(0.9, 0.3, 8, 12), mat(0xffc93c, { metal: 0.6, rough: 0.3 }));
    sign.add(gear);
    this.spin.push(gear);
    const ws = this.house(0, -42, 's', { w: 12, d: 8, h: 5.5, wall: '#b5523b', roof: 0x2e7d32, door: 0x5d4037, brick: true, sign });
    void ws;
    // big doors glow
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), mat(0xffe0a3, { emissive: 0xffb74d, emissiveIntensity: 1.2 }));
    door.position.set(0, 2.0, -37.9);
    this.scene.add(door);
    for (const x of [-7.5, 7.5]) {
      const cc = makeCandyCane(2.6);
      cc.position.set(x, 0, -36);
      cc.rotation.y = x > 0 ? Math.PI : 0;
      this.scene.add(cc);
      this.world.addCyl(x, -36, 0.25, 0, 3);
    }
    const lightsPts = [v3(-6, 5.6, -37.5), v3(6, 5.6, -37.5)];
    this.addLights(lightsPts, 0.4);
    this.portal('factory', v3(0, 0, -34), '🏭', 'robot', () => this.g.goto('factory'), 0x69f0ae);
  }

  private buildStable(): void {
    this.house(-44, 0, 'e', { w: 7, d: 6, h: 4.2, wall: '#8d3b2a', roof: 0x5d4037, door: 0x3e2723, chimney: false });
    const f1 = makeFence(10);
    f1.position.set(-36, 0, -6);
    this.scene.add(f1);
    const f2 = makeFence(10);
    f2.position.set(-36, 0, 6);
    this.scene.add(f2);
    this.world.addBoxAt(-36, -6, 5, 0.15, 0, 1.1);
    this.world.addBoxAt(-36, 6, 5, 0.15, 0, 1.1);
    // hay bales
    for (const [x, z] of [[-39, -3.5], [-39, 3.5]]) {
      const hay = mesh(cyl(0.7, 0.7, 1.2, 16), mat(0xe8c15a, { rough: 1 }));
      hay.rotation.x = Math.PI / 2;
      hay.position.set(x, 0.7, z);
      this.scene.add(hay);
      this.world.addBoxAt(x, z, 0.7, 0.6, 0, 1.4);
    }
    this.juniper = new Reindeer();
    this.juniper.position.set(-34, 0, -3.5);
    this.juniper.rotation.y = Math.PI / 2;
    this.scene.add(this.juniper);
    this.world.addCyl(-34, -3.5, 0.9, 0, 2.4);
    const arch = makeArch(0xd32f2f, 5, 4.5);
    arch.position.set(-30, 0, 0);
    arch.rotation.y = Math.PI / 2;
    this.scene.add(arch);
    this.world.addCyl(-30, -2.5, 0.3, 0, 4.5);
    this.world.addCyl(-30, 2.5, 0.3, 0, 4.5);
    this.addLights([v3(-30, 4.4, -2.5), v3(-30, 4.9, 0), v3(-30, 4.4, 2.5)], 0.35);
    this.portal('dash', v3(-30, 0, 0), '🦌', 'present', () => this.g.goto('dash'), 0xff8a65);
    this.interactables.push({ id: 'juniper', pos: v3(-33, 0, -2), radius: 2.6, icon: () => 'go', enabled: () => true, run: () => this.talkJuniper(), obj: this.juniper });
  }

  private buildCabin(): void {
    const c = this.house(-32, 34, 'e', { w: 6, d: 5.5, h: 3.4, wall: '#9c6b3f', roof: 0xb71c1c, door: 0x2e7d32 });
    void c;
    const mat2 = new THREE.MeshStandardMaterial({ map: woodTex('#7b5230'), roughness: 0.8 });
    const porch = mesh(new THREE.BoxGeometry(2.5, 0.2, 4), mat2);
    porch.position.set(-28, 0.1, 34);
    this.scene.add(porch);
    this.portal('cabin', v3(-26.5, 0, 34), '🏡', 'present', () => this.g.goto('cabin'), 0xff80ab);
  }

  private buildBellTower(): void {
    const tower = new THREE.Group();
    const stone = mat(0xb0bec5, { rough: 0.9 });
    const base = mesh(cyl(2.2, 2.6, 5, 10), stone);
    base.position.y = 2.5;
    tower.add(base);
    const top = mesh(cyl(2.4, 2.4, 0.5, 10), mat(0xeceff1));
    top.position.y = 5.25;
    tower.add(top);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = mesh(cyl(0.18, 0.18, 2.4, 8), stone);
      p.position.set(Math.cos(a) * 2.1, 6.7, Math.sin(a) * 2.1);
      tower.add(p);
    }
    const roof = mesh(new THREE.ConeGeometry(3, 2.6, 10), mat(0x1565c0, { rough: 0.6 }));
    roof.position.y = 9.2;
    tower.add(roof);
    const cap = mesh(new THREE.ConeGeometry(2.2, 1, 10), SNOW());
    cap.position.y = 9.9;
    tower.add(cap);
    const notes = [0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5];
    for (let i = 0; i < 5; i++) {
      const b = makeBell(0.45 - i * 0.04);
      const a = (i / 5) * Math.PI * 2;
      b.position.set(Math.cos(a) * 1.1, 6.6, Math.sin(a) * 1.1);
      (b.children[0] as THREE.Mesh).material = mat(notes[i], { metal: 0.5, rough: 0.25 });
      tower.add(b);
      this.bellTowerBells.push(b);
    }
    const door = mesh(new THREE.BoxGeometry(1.4, 2.2, 0.2), mat(0x5d4037));
    door.position.set(-1.6, 1.1, 1.7);
    door.rotation.y = -Math.PI / 4;
    tower.add(door);
    tower.position.set(17, 0, -24);
    this.scene.add(tower);
    this.world.addCyl(17, -24, 2.6, 0, 10);
    const sign = makeSignpost(emojiSprite('🎵', 1.4, '#8e24aacc'));
    sign.position.set(13.5, 0, -20.5);
    this.scene.add(sign);
    this.interactables.push({ id: 'bells', pos: v3(14, 0, -21), radius: 2.8, icon: () => 'music', enabled: () => true, run: () => this.bellTower(), obj: tower });
  }

  private buildSnowmen(): void {
    const defs: [SnowmanSlot, string, number, number, number, number, number][] = [
      ['hat', 'Mister Flurry', 30, -8, 0x263238, 0x43a047, 0.8],
      ['scarf', 'Granny Glitter', 34, -3, 0x6a1b9a, 0xe53935, 1.05],
      ['carrot', 'Little Pebble', 34, 4, 0x1565c0, 0x1e88e5, 1.3],
      ['buttons', 'Captain Chill', 30, 9, 0x3e2723, 0xfdd835, 0.7],
    ];
    for (const [slot, name, x, z, hatC, scarfC, pitch] of defs) {
      const sm = new Snowman(scarfC, hatC);
      sm.position.set(x, 0, z);
      sm.rotation.y = -Math.PI / 2 + (z / 20);
      if (slot === 'carrot') sm.scale.setScalar(0.8);
      this.scene.add(sm);
      this.world.addCyl(x, z, 1.0, 0, 3.5);
      const q: SnowmanQuest = { slot, name, sm, pitch, met: false, done: this.g.isFound(`sm:${slot}`) };
      sm.setHas(slot, q.done);
      sm.setHappy(q.done);
      this.snowmen.push(q);
      this.interactables.push({
        id: `sm-${slot}`,
        pos: v3(x - 1.8, 0, z),
        radius: 2.8,
        icon: () => (q.done ? 'wave' : VOCAB[slot].picture),
        enabled: () => true,
        run: () => this.talkSnowman(q),
        obj: sm,
      });
    }
    const horn = makeSignpost(emojiSprite('🌬️', 1.4, '#4fc3f7cc'));
    horn.position.set(26, 0, -1);
    this.scene.add(horn);
    this.interactables.push({ id: 'wind', pos: v3(26, 0, -1), radius: 2, icon: () => 'snow', enabled: () => this.snowmen.every((s) => s.done), run: () => this.windAgain() });
    // little snow forts
    for (let i = 0; i < 6; i++) {
      const b = mesh(sphere(0.5, 12, 10), SNOW());
      b.position.set(40 + (i % 3) * 1.1, 0.35, -2 + Math.floor(i / 3) * 4);
      this.scene.add(b);
    }
  }

  private buildLetters(): void {
    const defs: [string, string, string, ItemKind, string, number, number, number][] = [
      ['B', 'Bibo', 'buh', 'ball', 'ball', 0x1e88e5, -18, -20],
      ['M', 'Mimi', 'mmm', 'mitten', 'mitten', 0xec407a, -23, -25],
      ['P', 'Pip', 'puh', 'present', 'present', 0x8e24aa, -28, -21],
      ['S', 'Sunny', 'sss', 'sock', 'sock', 0xfb8c00, -26, -14],
    ];
    for (const [letter, name, sound, item, vocab, color, x, z] of defs) {
      const lf = new LetterFriend(letter, color);
      lf.position.set(x, 0, z);
      lf.rotation.y = Math.atan2(-x, -z) * 0.6 + 0.6;
      this.scene.add(lf);
      this.world.addCyl(x, z, 0.8, 0, 2);
      const spots = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + letter.charCodeAt(0);
        return v3(x + Math.cos(a) * 7, 0, z + Math.sin(a) * 7);
      });
      const q: LetterQuest = { letter, name, sound, item, vocab, color, lf, need: 3, got: 0, met: false, done: this.g.isFound(`lf:${letter}`), spots };
      this.letters.push(q);
      this.interactables.push({ id: `lf-${letter}`, pos: v3(x, 0, z), radius: 2.4, icon: () => `letter:${letter}:#${new THREE.Color(color).getHexString()}`, enabled: () => true, run: () => this.talkLetter(q), obj: lf });
    }
    const banner = makeSignpost(emojiSprite('🔤', 1.4, '#ffffffcc'));
    banner.position.set(-14, 0, -15);
    this.scene.add(banner);
  }

  private buildAnimals(): void {
    const defs: [AnimalKind, number, number, number, Wanderer['sound']][] = [
      ['puppy', 6, 8, 6, { q: 'Woof! I am Biscuit the puppy. What does a puppy say?', model: 'woof', accept: ['woof', 'woof woof', 'ruff', 'arf', 'bark', 'bow wow', 'wolf', 'roof', 'ruff ruff'], done: 'Woof woof! You sound just like me!' }],
      ['kitty', -27, 30, 3, { q: 'Meow! I am Mittens the kitty. What does a kitty say?', model: 'meow', accept: ['meow', 'mew', 'miaow', 'meow meow', 'me', 'now', 'mao', 'purr'], done: 'Meow! Purr purr. That was perfect!' }],
      ['penguin', 2, 36, 6, { q: 'Hi! I am Waddles. Shout whee and I will slide!', model: 'whee', accept: ['whee', 'wee', 'we', 'yay', 'yeah', 'wii', 'weee'], done: 'Wheeeee! That was so much fun!' }],
      ['owl', -14, -26, 2, { q: 'Hoo! I am Hazel the owl. What does an owl say?', model: 'hoo hoo', accept: ['hoo', 'who', 'hoot', 'hoo hoo', 'who who', 'ooh', 'hu'], done: 'Hoo hoo! You are a wise friend!' }],
      ['bunny', 38, -10, 4, { q: 'Hi! I am Clover the bunny. Say hop and I will jump!', model: 'hop', accept: ['hop', 'hops', 'hop hop', 'up', 'jump', 'pop', 'top'], done: 'Boing! Hop hop hop!' }],
    ];
    for (const [kind, x, z, r, sound] of defs) {
      const a = new Animal(kind);
      a.position.set(x, 0, z);
      this.scene.add(a);
      const w: Wanderer = { a, home: v3(x, 0, z), r, target: v3(x, 0, z), wait: 1, speed: kind === 'penguin' ? 2.5 : 1.6, sound };
      this.animals.push(w);
      const pic = { puppy: 'dog', kitty: 'cat', penguin: 'penguin', owl: 'owl', bunny: 'bunny' }[kind];
      this.interactables.push({ id: `an-${kind}`, pos: a.position, radius: 2.2, icon: () => pic, enabled: () => true, run: () => this.talkAnimal(w, pic), obj: a });
    }
  }

  private buildPlatforms(): void {
    // a little climbing challenge by the workshop leading to a hidden star
    const crate = makePresent(0xe53935, 0xffffff, 1.4, 0.8);
    crate.position.set(-9, 0, -28);
    this.scene.add(crate);
    this.world.addBoxAt(-9, -28, 0.75, 0.75, 0, 1.2);
    const defs: [number, number, number, number, number, number, number, number][] = [
      // x, y, z, axisX, axisY, amp, speed, color
      [-12.5, 2.2, -28, 0, 1, 0.9, 1.1, 0x1e88e5],
      [-16.5, 3.4, -28, 1, 0, 1.6, 0.8, 0x43a047],
      [-21, 4.4, -28, 0, 1, 0.7, 1.3, 0xfdd835],
    ];
    for (const [x, y, z, ax, ay, amp, speed, color] of defs) {
      const obj = makePresent(color, 0xd32f2f, 1.6, 0.35);
      obj.position.set(x, y, z);
      this.scene.add(obj);
      const c = this.world.addBoxAt(x, z, 0.85, 0.85, y, y + 0.6);
      c.delta = new THREE.Vector3();
      this.platforms.push({ c, obj, base: v3(x, y, z), axis: v3(ax, ay, 0), amp, speed, prev: v3(x, y, z) });
    }
    const ledge = new THREE.Group();
    const col = mesh(cyl(1.4, 1.6, 5.2, 16), mat(0xb0bec5, { rough: 0.9 }));
    col.position.y = 2.6;
    ledge.add(col);
    const top = mesh(cyl(1.7, 1.7, 0.4, 16), SNOW());
    top.position.y = 5.3;
    ledge.add(top);
    ledge.position.set(-25.5, 0, -28);
    this.scene.add(ledge);
    this.world.addCyl(-25.5, -28, 1.6, 0, 5.5);
  }

  private addPickup(p: Omit<Pickup, 'baseY' | 'taken'>): Pickup {
    const pk: Pickup = { ...p, baseY: p.obj.position.y, taken: false };
    this.scene.add(p.obj);
    this.pickups.push(pk);
    return pk;
  }

  private beam(color: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.y = 7;
    return m;
  }

  private buildCollectibles(): void {
    // hidden magic stars (persistent)
    const stars: [string, number, number, number][] = [
      ['hs1', -25.5, 6.4, -28], ['hs2', 2, 1.0, 36], ['hs3', 0, 1.0, -50], ['hs4', 19, 2.0, 0],
      ['hs5', -38, 1.0, 42], ['hs6', 50, 1.0, 0], ['hs7', -50, 1.0, -40], ['hs8', 44, 1.0, -44], ['hs9', 4.6 * Math.cos(0), 2.2, 0],
    ];
    for (const [id, x, y, z] of stars) {
      if (this.g.isFound(id)) continue;
      const s = makeStar(0.9);
      s.position.set(x, y, z);
      this.addPickup({ id, kind: 'star', obj: s, persistent: true });
    }
    // coin trails along paths
    const trail = (x1: number, z1: number, x2: number, z2: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const c = makeCoin();
        const holder = new THREE.Group();
        holder.add(c);
        holder.position.set(x1 + (x2 - x1) * t, 0.9, z1 + (z2 - z1) * t);
        this.addPickup({ id: `c${x1},${z1},${i}`, kind: 'coin', obj: holder, persistent: false });
      }
    };
    trail(0, -15, 0, -31, 6);
    trail(-15, 0, -27, 0, 5);
    trail(0, 15, 0, 25, 4);
    trail(-11, 11, -22, 30, 6);
    trail(-11, -11, -20, -20, 4);
    trail(11, -11, 13, -18, 3);
    trail(23, 0, 27, 0, 2);
    trail(-9, -26, -25, -26, 5);
    trail(-6, 30, 10, 42, 6);
    this.spawnSnowmanItems();
  }

  private spawnSnowmanItems(): void {
    for (const q of this.snowmen) {
      if (q.done) continue;
      if (this.pickups.some((p) => p.item === q.slot && !p.taken)) continue;
      const spots = ITEM_SPOTS[q.slot];
      const s = spots[Math.floor(Math.random() * spots.length)];
      const obj = new THREE.Group();
      const item = makeItem(q.slot as ItemKind, q.slot === 'hat' ? 0x263238 : q.slot === 'scarf' ? [0x43a047, 0xe53935][0] : undefined);
      item.scale.setScalar(1.3);
      obj.add(item);
      const beam = this.beam(0xfff59d);
      obj.add(beam);
      obj.position.set(s.x, 1.0, s.z);
      this.addPickup({ id: `item-${q.slot}`, kind: 'item', item: q.slot as ItemKind, obj, persistent: false, beam });
    }
  }

  private spawnLetterItems(q: LetterQuest): void {
    q.spots.forEach((s, i) => {
      const obj = new THREE.Group();
      const it = makeItem(q.item, q.item === 'ball' ? [0xe53935, 0x1e88e5, 0xfdd835][i] : undefined);
      it.scale.setScalar(1.2);
      obj.add(it);
      obj.add(this.beam(q.color));
      obj.position.set(s.x, 0.9, s.z);
      this.addPickup({ id: `lfi-${q.letter}-${i}`, kind: 'item', item: q.item, obj, persistent: false, forLetter: q.letter });
    });
  }

  private buildDecor(): void {
    // candy canes along paths and presents piles
    for (const [x, z] of [[2.5, -16], [-2.5, -22], [2.5, -28], [-16, 2.5], [-24, -2.5], [16, 2.5], [2.5, 18], [-2.5, 22], [-14, 18], [-18, 26]]) {
      const cc = makeCandyCane(1.8);
      cc.position.set(x, 0, z);
      cc.rotation.y = Math.random() * 6;
      this.scene.add(cc);
      this.world.addCyl(x, z, 0.2, 0, 2);
    }
    const piles: [number, number][] = [[-22, -2], [24, 6], [-6, 26], [8, -36], [-34, 26]];
    for (const [x, z] of piles) {
      for (let i = 0; i < 3; i++) {
        const p = makePresent([0xe53935, 0x1e88e5, 0x43a047, 0x8e24aa][(i + x) & 3], 0xfdd835, 0.6 + Math.random() * 0.4);
        p.position.set(x + (i - 1) * 0.8, 0, z + (i % 2) * 0.6);
        p.rotation.y = Math.random();
        p.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
        this.scene.add(p);
      }
      this.world.addBoxAt(x, z + 0.3, 1.5, 0.7, 0, 0.8);
    }
  }

  // ======================================================================= lifecycle

  enter(arg?: unknown): void {
    const from = (arg as { from?: string } | undefined)?.from;
    const spawn: Record<string, [THREE.Vector3, number]> = {
      factory: [v3(0, 0, -30), 0],
      dash: [v3(-27, 0, 0), Math.PI / 2],
      cabin: [v3(-24, 0, 34), Math.PI / 2],
    };
    const [p, yaw] = spawn[from ?? ''] ?? [v3(0, 0, 9), 0];
    this.ctrl.teleport(p, yaw);
    this.cam.yaw = yaw + Math.PI;
    this.cam.snap(p);
    this.twinkle.position.copy(p).add(v3(1, 2.4, 0));
    this.applySettings();
    this.updateBag();
    this.g.hud.show(true);
    this.juniper.setLook(this.g.settings.reindeer);
    if (from === 'factory' && this.g.progress.completions.factory === 1 && !this.g.isFound('post-factory')) {
      this.g.markFound('post-factory');
      setTimeout(() => this.g.director.tell('Twinkle', 'star', 'Wow, great building! Juniper the reindeer needs help delivering presents. Follow the arrow!'), 800);
    }
  }

  exit(): void {
    this.g.hud.setAction(null);
  }

  private async intro(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const d = this.g.director;
    this.hero.play('wave');
    await d.tell('Twinkle', 'star', "Hi! I'm Twinkle, your star friend! A big wind blew the Christmas magic all over the village.");
    if (this.g.currentName !== 'village') { this.busy = false; this.introDone = false; return; }
    await d.tell('Twinkle', 'snow', 'The snowmen lost their things! Follow the yellow arrow, and press E or tap the big button to talk.');
    this.g.markFound('intro');
    this.busy = false;
  }

  hint(): { text: string; portrait: string } {
    const goal = this.goal();
    if (goal?.say) return { text: goal.say, portrait: goal.pic };
    return { text: 'Explore the village! Find hidden stars, talk to friends, and visit the Toy Factory and Reindeer Dash.', portrait: 'star' };
  }

  // ======================================================================= goals

  private goal(): { pos: THREE.Vector3; say: string; pic: string } | null {
    // carrying a snowman item
    for (const q of this.snowmen) if (!q.done && this.bag.includes(q.slot as ItemKind)) return { pos: q.sm.position, say: `Bring the ${VOCAB[q.slot].word} to ${q.name}!`, pic: VOCAB[q.slot].picture };
    for (const q of this.letters) if (q.met && !q.done && q.got >= q.need) return { pos: q.lf.position, say: `Go back to ${q.name}!`, pic: `letter:${q.letter}` };
    for (const q of this.letters) {
      if (q.met && !q.done) {
        const pk = this.nearestPickup((p) => p.forLetter === q.letter);
        if (pk) return { pos: pk.obj.position, say: `Find the ${q.item}s for ${q.name}!`, pic: VOCAB[q.vocab].picture };
      }
    }
    const pending = this.snowmen.filter((q) => !q.done);
    if (pending.length) {
      const met = pending.find((q) => q.met);
      if (met) {
        const pk = this.pickups.find((p) => !p.taken && p.item === met.slot && !p.forLetter);
        if (pk) return { pos: pk.obj.position, say: `Find ${met.name}'s ${VOCAB[met.slot].word}! Follow the arrow.`, pic: VOCAB[met.slot].picture };
      }
      return { pos: v3(31, 0, 0), say: 'The snowmen need help! Cross the bridge and talk to them.', pic: 'snow' };
    }
    if (!this.g.progress.completions.factory) return { pos: v3(0, 0, -34), say: 'Visit the Toy Factory! Walk into the green circle.', pic: 'robot' };
    if (!this.g.progress.completions.dash) return { pos: v3(-30, 0, 0), say: 'Help Juniper the reindeer deliver presents! Walk into the orange circle.', pic: 'present' };
    return null;
  }

  private nearestPickup(f: (p: Pickup) => boolean): Pickup | null {
    let best: Pickup | null = null, bd = Infinity;
    for (const p of this.pickups) {
      if (p.taken || !f(p)) continue;
      const d = p.obj.position.distanceTo(this.hero.position);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private updateBag(): void {
    this.g.hud.setBag(this.bag.map((k) => VOCAB[k === 'carrot' ? 'carrot' : k]?.picture ?? k));
  }

  // ======================================================================= interactions

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.g.hud.setAction(null);
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  private face(target: THREE.Vector3): void {
    this.hero.rotation.y = Math.atan2(target.x - this.hero.position.x, target.z - this.hero.position.z);
  }

  private celebrateAt(p: THREE.Vector3): void {
    this.bursts.burst(p.clone().add(v3(0, 2, 0)), { count: 70, speed: 7, up: 4 });
    this.hero.play('celebrate');
  }

  private talkSnowman(q: SnowmanQuest): Promise<void> {
    return this.run(async () => {
      const d = this.g.director;
      const voice = { ...VOICES.snowman, pitch: q.pitch };
      const portrait = 'snow';
      this.face(q.sm.position);
      const item = VOCAB[q.slot];
      if (q.done) {
        q.sm.dance(2);
        await d.tell(q.name, portrait, this.snowmen.every((s) => s.done) ? 'Thank you for helping all of us! Blow the wind horn to play again!' : 'I feel so snazzy! Can you help my friends too?', voice);
        return;
      }
      if (!this.bag.includes(q.slot as ItemKind)) {
        q.met = true;
        this.spawnSnowmanItems();
        await d.tell(q.name, item.picture, `Oh no! The wind took my ${item.word}! Can you help me find it? Follow the arrow!`, voice);
        return;
      }
      const level = this.g.settings.practiceLevel;
      const target = targetFor(item, level, this.g.settings, 'What did you bring me?');
      const res = await d.ask({
        activity: 'snowmen',
        speaker: { name: q.name, voice, portrait: item.picture },
        question: level === 'E' ? 'Ooh! What did you bring me?' : level === 'A' ? `You found something! Let's make its first sound.` : 'Ooh! What did you find?',
        options: [{ key: q.slot, target }],
        distractors: (['hat', 'scarf', 'carrot', 'buttons'] as const).filter((s) => s !== q.slot).map((s) => VOCAB[s].picture),
        success: () => `Awesome! You found my ${item.word}!`,
      });
      void res;
      // hand over item
      this.bag.splice(this.bag.indexOf(q.slot as ItemKind), 1);
      this.updateBag();
      q.done = true;
      this.g.markFound(`sm:${q.slot}`);
      q.sm.setHas(q.slot, true);
      q.sm.setHappy(true);
      q.sm.dance(4);
      this.celebrateAt(q.sm.position);
      this.g.addStars(1);
      this.g.unlock('deco-wreath');
      if (this.snowmen.every((s) => s.done)) {
        await new Promise((r) => setTimeout(r, 900));
        for (const s of this.snowmen) s.sm.dance(6);
        for (const s of this.snowmen) this.bursts.burst(s.sm.position.clone().add(v3(0, 3, 0)), { count: 50, speed: 6, up: 5 });
        this.g.addStars(2);
        this.g.complete('snowmen');
        this.g.unlock('deco-snowglobe');
        this.g.unlock('toy-snowman');
        await d.tell('Twinkle', 'star', 'You saved all the snowmen! Snowman dance party! Next, the Toy Factory needs a helper.');
      }
    });
  }

  private windAgain(): Promise<void> {
    return this.run(async () => {
      await this.g.director.tell('Twinkle', 'snow', 'Whoosh! The wind blew their things away again! Let\'s help them one more time.');
      this.g.audio.sfx('whoosh');
      for (const q of this.snowmen) {
        q.done = false;
        q.met = true;
        q.sm.setHas(q.slot, false);
        q.sm.setHappy(false);
        this.g.progress.found = this.g.progress.found.filter((f) => f !== `sm:${q.slot}`);
      }
      this.g.store.save();
      this.spawnSnowmanItems();
    });
  }

  private talkLetter(q: LetterQuest): Promise<void> {
    return this.run(async () => {
      const d = this.g.director;
      const portrait = `letter:${q.letter}:#${new THREE.Color(q.color).getHexString()}`;
      const item = VOCAB[q.vocab];
      this.face(q.lf.position);
      q.lf.excited = 1.5;
      if (q.done) {
        await d.tell(q.name, portrait, `Thanks, friend! ${q.sound}, ${q.sound}, ${item.word}!`, VOICES.letter);
        return;
      }
      if (!q.met) {
        q.met = true;
        this.spawnLetterItems(q);
        this.g.audio.phrase(['C5', 'E5', 'G5'], 0.15);
        await d.tell(q.name, portrait, `Hi! I'm ${q.name}. My letter is ${q.letter}. I make the sound ${q.sound}, like ${q.sound}, ${q.sound}, ${item.word}! Can you find three ${item.word}s for me?`, VOICES.letter);
        return;
      }
      if (q.got < q.need) {
        await d.tell(q.name, portrait, `You found ${q.got}! Find ${q.need - q.got} more ${item.word}s. Follow the arrow!`, VOICES.letter);
        return;
      }
      const level = this.g.settings.practiceLevel;
      await d.ask({
        activity: 'letters',
        speaker: { name: q.name, voice: VOICES.letter, portrait },
        question: level === 'A' ? `You found them all! Let's make my sound together.` : level === 'E' ? 'You found them all! What did you find?' : `You found them all! What are they?`,
        options: [{ key: q.vocab, target: targetFor(item, level, this.g.settings, 'What did you find?') }],
        distractors: ['ball', 'mitten', 'present', 'sock'].filter((v) => v !== q.vocab).map((v) => VOCAB[v].picture),
        success: () => `Hooray! ${q.sound}, ${q.sound}, ${item.word}!`,
      });
      q.done = true;
      q.lf.excited = 4;
      this.g.markFound(`lf:${q.letter}`);
      this.celebrateAt(q.lf.position);
      this.g.addStars(1);
      this.g.unlock('outfit-earmuffs');
      if (this.letters.filter((l) => l.done).length >= 3) this.g.unlock('deco-alphabet');
      this.g.complete('letters');
    });
  }

  private talkAnimal(w: Wanderer, pic: string): Promise<void> {
    return this.run(async () => {
      this.face(w.a.position);
      w.wait = 6;
      w.target.copy(w.a.position);
      w.a.rotation.y = Math.atan2(this.hero.position.x - w.a.position.x, this.hero.position.z - w.a.position.z);
      const level = this.g.settings.practiceLevel;
      await this.g.director.ask({
        activity: 'animals',
        speaker: { name: w.a.kind[0].toUpperCase() + w.a.kind.slice(1), voice: VOICES.reindeer, portrait: pic },
        question: w.sound.q,
        options: [{ key: w.a.kind, target: simpleTarget(`animal-${w.a.kind}`, w.sound.model, w.sound.accept, pic, level, level === 'A' ? 'activity' : 'keywords') }],
        distractors: ['dog', 'cat', 'penguin', 'owl', 'bunny'].filter((x) => x !== pic),
        success: () => w.sound.done,
      });
      w.a.hop = 0.6;
      if (w.a.kind === 'penguin') { w.target.set(w.home.x + (Math.random() - 0.5) * 10, 0, w.home.z + (Math.random() - 0.5) * 10); w.wait = 0; w.speed = 7; setTimeout(() => (w.speed = 2.5), 2500); }
      this.bursts.burst(w.a.position.clone().add(v3(0, 1, 0)), { count: 30 });
      this.g.addCoins(3);
      this.g.complete('animals');
    });
  }

  private talkJuniper(): Promise<void> {
    return this.run(async () => {
      this.face(this.juniper.position);
      await this.g.director.tell('Juniper', 'present', "Hi! I'm Juniper. Help me deliver the presents! Step into the orange circle to start the Reindeer Dash.", VOICES.reindeer);
    });
  }

  private bellTower(): Promise<void> {
    return this.run(async () => {
      const d = this.g.director;
      const ring = (i: number) => {
        const b = this.bellTowerBells[i % 5];
        b.userData.swing = 1;
        this.g.audio.sfx('bell', [523, 587, 659, 784, 880][i % 5]);
        this.bursts.burst(b.getWorldPosition(new THREE.Vector3()), { count: 12, speed: 3, colors: [0xfff3a0, 0xffffff] });
      };
      // 1. listen & sing along: bells ring with the child's voice (local loudness only)
      await d.tell('Twinkle', 'music', "The Bell Tower plays when you sing! Listen first.");
      for (const [i, n] of [0, 2, 4, 2].entries()) setTimeout(() => ring(n), i * 380);
      await d.tell('Twinkle', 'sing', 'Ding, dong, ding, dong! Now you sing with the bells!');
      let bell = 0, wasVoiced = false;
      const sang = await d.voicePlay(5, (lv, voiced) => {
        if (voiced && !wasVoiced) ring(bell++);
        wasVoiced = voiced;
        for (const b of this.bellTowerBells) b.rotation.z = lv * 0.5 * Math.sin(this.t * 12);
      });
      if (!sang) {
        // pictures mode or silence: tap to ring
        await d.tell('Twinkle', 'bell', sang === false && d.mode === 'pictures' ? 'Let\'s ring them together!' : 'Ready when you are! Let\'s ring them together!');
        for (let i = 0; i < 5; i++) setTimeout(() => ring(i), i * 300);
      } else {
        await d.tell('Twinkle', 'music', 'What lovely singing! The bells loved it!');
      }
      // 2. finish the rhyme (original)
      const level = this.g.settings.practiceLevel;
      await d.ask({
        activity: 'music',
        speaker: { name: 'Twinkle', voice: VOICES.twinkle, portrait: 'music' },
        question: 'Snowflakes falling on my nose, they tickle all my tiny...',
        options: [{ key: 'toes', target: simpleTarget('rhyme-toes', 'toes', ['toes', 'toe', 'toesies', 'nose', 'tows', 'those', 'doze', 'goes'], '🦶', level, level === 'A' ? 'activity' : 'keywords') }],
        distractors: ['hat', 'mitten'],
        modelLine: 'Toes!',
        success: () => 'Toes! Wiggle wiggle! You finished the song!',
      });
      for (let i = 0; i < 5; i++) setTimeout(() => ring(4 - i), i * 200);
      this.celebrateAt(this.hero.position);
      if (!this.g.has('deco-bells')) this.g.addStars(1); else this.g.addCoins(5);
      this.g.unlock('deco-bells');
      this.g.complete('music');
    });
  }

  // ======================================================================= update

  update(dt: number, t: number): void {
    this.t = t;
    const g = this.g;
    const reduced = g.settings.reducedMotion;
    // moving platforms
    for (const p of this.platforms) {
      const off = Math.sin(t * p.speed) * p.amp;
      const np = p.base.clone().addScaledVector(p.axis, off);
      p.c.delta!.copy(np).sub(p.prev);
      p.prev.copy(np);
      p.obj.position.copy(np);
      p.c.min.set(np.x - 0.85, np.y, np.z - 0.85);
      p.c.max.set(np.x + 0.85, np.y + 0.6, np.z + 0.85);
    }
    // hero
    const blocked = this.busy || g.director.busy;
    this.ctrl.enabled = !blocked;
    this.handleClicks();
    this.ctrl.update(dt, g.input, this.cam, reduced);
    if (!g.paused && !this.introDone && !g.isFound('intro')) {
      this.introDone = true;
      setTimeout(() => void this.intro(), 700);
    }
    if (g.paused) {
      // title / menu backdrop: slow orbit around the plaza
      const a = t * 0.06;
      this.camera.position.set(Math.sin(a) * 30, 11 + Math.sin(t * 0.1) * 2, Math.cos(a) * 30);
      this.camera.lookAt(0, 4, 0);
    } else this.cam.update(dt, g.input, this.hero.position, this.ctrl.heading, t);
    // shadows follow player
    this.sun.position.set(this.hero.position.x + 30, 45, this.hero.position.z + 18);
    this.sun.target.position.copy(this.hero.position);

    // pickups
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.obj.rotation.y += dt * (p.kind === 'coin' ? 3 : 1.4);
      p.obj.position.y = p.baseY + Math.sin(t * 2 + p.obj.position.x) * 0.15;
      const dx = p.obj.position.x - this.hero.position.x, dz = p.obj.position.z - this.hero.position.z;
      const dy = p.obj.position.y - (this.hero.position.y + 1);
      if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.8 && !blocked) this.collect(p);
    }
    // npcs
    for (const s of this.snowmen) s.sm.update(dt, reduced);
    for (const l of this.letters) l.lf.update(dt, reduced);
    this.juniper.update(dt, 0, true);
    for (const w of this.animals) this.updateAnimal(w, dt);
    for (const b of this.bellTowerBells) {
      const sw = (b.userData.swing as number) ?? 0;
      if (sw > 0) {
        b.userData.swing = Math.max(0, sw - dt);
        b.rotation.x = Math.sin(sw * 14) * sw * 0.6;
      }
    }
    this.spin.forEach((o) => { if (!(o as THREE.Sprite).isSprite) o.rotation.z += dt; else o.position.y = 3.6 + Math.sin(t * 2) * 0.15; });
    if (this.treeStar) {
      this.treeStar.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(t * 3) * 0.05;
      this.treeStar.scale.setScalar(s);
    }
    for (const l of this.lights) l.update(t);
    // twinkle follows
    const tp = this.hero.position.clone().add(this.cam.right().multiplyScalar(1.2)).add(v3(0, 2.6 + Math.sin(t * 2.5) * 0.2, 0));
    this.twinkle.position.lerp(tp, 1 - Math.exp(-3 * dt));
    this.twinkle.lookAt(this.camera.position);
    this.twinkle.talking = g.speaker.speaking;
    this.twinkle.update(dt);
    if (!g.settings.reducedEffects && Math.random() < 0.5) this.bursts.trail(this.twinkle.position);
    this.bursts.update(dt);
    this.snow.update(dt, this.hero.position, t);

    // guide arrow
    const goal = this.goal();
    const dist = goal ? Math.hypot(goal.pos.x - this.hero.position.x, goal.pos.z - this.hero.position.z) : 0;
    this.arrow.visible = !!goal && dist > 6 && !blocked;
    if (goal) {
      this.arrow.position.set(this.hero.position.x, this.hero.position.y + 0.08, this.hero.position.z);
      const yaw = Math.atan2(goal.pos.x - this.hero.position.x, goal.pos.z - this.hero.position.z);
      this.arrow.rotation.y = yaw + Math.PI;
      const pulse = reduced ? 1 : 1 + Math.sin(t * 5) * 0.08;
      this.arrow.scale.setScalar(pulse);
    }
    (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = damp((this.clickMarker.material as THREE.MeshBasicMaterial).opacity, 0, 3, dt);

    // nearest interactable
    let best: Interactable | null = null, bd = Infinity;
    if (!blocked) {
      for (const it of this.interactables) {
        if (!it.enabled()) continue;
        const d = Math.hypot(it.pos.x - this.hero.position.x, it.pos.z - this.hero.position.z);
        if (d < it.radius && d < bd) { bd = d; best = it; }
      }
    }
    this.nearest = best;
    // portals trigger by walking in
    if (best && (best.id === 'factory' || best.id === 'dash' || best.id === 'cabin') && bd < 1.3) {
      this.busy = true;
      void best.run();
      setTimeout(() => (this.busy = false), 1200);
      return;
    }
    g.hud.setAction(best ? best.icon() : null, 'E');
    g.hud.onAction = () => this.nearest && void this.nearest.run();
    if (best && g.input.actPressed()) void best.run();
  }

  private handleClicks(): void {
    const g = this.g;
    if (!g.input.clicks.length || this.busy || g.director.busy) return;
    const c = g.input.clicks[g.input.clicks.length - 1];
    const ndc = new THREE.Vector2((c.x / innerWidth) * 2 - 1, -(c.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // characters / portals first
    const objs = this.interactables.filter((i) => i.obj && i.enabled()).map((i) => i.obj!);
    const hits = this.raycaster.intersectObjects(objs, true);
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      let it: Interactable | undefined;
      while (o && !it) {
        it = this.interactables.find((i) => i.obj === o);
        o = o.parent;
      }
      if (it) {
        const target = it;
        this.ctrl.walkTo(target.pos, Math.min(1.6, target.radius - 0.3), () => {
          if (target.id === 'factory' || target.id === 'dash' || target.id === 'cabin') return; // walking in triggers
          void target.run();
        });
        return;
      }
    }
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) {
      this.ctrl.walkTo(p, 0.5);
      this.clickMarker.position.set(p.x, 0.06, p.z);
      (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
    }
  }

  private collect(p: Pickup): void {
    const g = this.g;
    if (p.kind === 'item') {
      // letter items count for their friend; snowman items go in the bag
      if (p.forLetter) {
        const q = this.letters.find((l) => l.letter === p.forLetter)!;
        q.got++;
        g.audio.sfx('pop', q.got);
        if (q.got >= q.need) void g.director.tell('Twinkle', VOCAB[q.vocab].picture, `You found all the ${q.item}s! Bring them to ${q.name}!`);
      } else {
        this.bag.push(p.item!);
        this.updateBag();
        const sm = this.snowmen.find((s) => s.slot === p.item);
        g.audio.sfx('magic');
        if (sm) void g.director.tell('Twinkle', VOCAB[sm.slot].picture, `You found the ${VOCAB[sm.slot].word}! Bring it to ${sm.name}.`);
      }
      this.hero.play('collect');
    } else if (p.kind === 'star') {
      g.addStars(1);
      g.markFound(p.id);
      const hidden = g.progress.found.filter((f) => f.startsWith('hs')).length;
      if (hidden >= 5) g.unlock('deco-lights');
      this.hero.play('celebrate');
      g.hud.toast('star', `Magic star! (${hidden}/9 hidden)`);
    } else {
      g.addCoins(1);
    }
    p.taken = true;
    this.scene.remove(p.obj);
    this.bursts.burst(p.obj.position, { count: p.kind === 'coin' ? 10 : 50, colors: p.kind === 'coin' ? [0xffd54f, 0xfff59d] : undefined, speed: p.kind === 'coin' ? 3 : 6 });
  }

  private updateAnimal(w: Wanderer, dt: number): void {
    const a = w.a;
    const d = new THREE.Vector3(w.target.x - a.position.x, 0, w.target.z - a.position.z);
    const dist = d.length();
    let moving = false;
    if (dist > 0.3) {
      d.normalize();
      a.position.addScaledVector(d, Math.min(dist, w.speed * dt));
      const yaw = Math.atan2(d.x, d.z);
      let dy = yaw - a.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.rotation.y += dy * Math.min(1, dt * 6);
      moving = true;
    } else {
      w.wait -= dt;
      if (w.wait <= 0) {
        w.wait = 2 + Math.random() * 4;
        const ang = Math.random() * Math.PI * 2;
        w.target.set(w.home.x + Math.cos(ang) * w.r * Math.random(), 0, w.home.z + Math.sin(ang) * w.r * Math.random());
      }
    }
    a.update(dt, moving);
  }
}
