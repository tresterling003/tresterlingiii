// The 3D stage: seven locations, the actors, battle animations and cutscenes.
// It only draws — the rules live in engine.js and the HUD in app.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODEL_FILES = ['knight', 'barbarian', 'mage', 'rogue', 'warden', 'bones', 'stalker', 'guard', 'chanter'];
const ATTACK = { knight: '1H_Melee_Attack_Slice_Diagonal', barbarian: '2H_Melee_Attack_Chop', mage: 'Spellcast_Shoot', rogue: 'Dualwield_Melee_Attack_Slice', warden: '2H_Ranged_Shoot',
  bones: 'Unarmed_Melee_Attack_Punch_A', stalker: 'Unarmed_Melee_Attack_Punch_B', guard: '1H_Melee_Attack_Chop', chanter: '2H_Melee_Attack_Chop' };
const HERO_SLOTS = [[-1.9, 1.7], [-3.3, -0.3], [-4.7, 1.5], [-6.0, -0.4]];
const FOE_SLOTS = [[1.9, 1.7], [3.3, -0.3], [4.7, 1.5], [6.0, -0.4], [7.2, 1.4], [4.6, -2.0]];
const BOSS_SLOT = [4.0, 0.4];
const BOSS_SIDE = [[1.8, 2.2], [1.9, -1.5], [6.2, 2.4], [6.3, -1.6], [7.4, 0.4]];
const NPC_SLOT = [2.6, 0.6];
const THRONE = [6.3, 0.3];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);

const MOODS = {
  village: { sky: 0x1d2347, fogD: 0.016, hemiSky: 0x7a86c4, hemiGnd: 0x3a2a1c, hemi: 1.1, sun: 0xffb27a, sunI: 1.1, sunPos: [-10, 12, 12], stars: 0.8, moon: 1 },
  road: { sky: 0x9fcdea, fogD: 0.012, hemiSky: 0xe6f2ff, hemiGnd: 0x5a5a3c, hemi: 1.3, sun: 0xfff0d0, sunI: 2.3, sunPos: [10, 22, 14], stars: 0, moon: 0 },
  bridge: { sky: 0xf2a56b, fogD: 0.011, hemiSky: 0xffd0a0, hemiGnd: 0x4a3a3c, hemi: 1.1, sun: 0xff9a55, sunI: 2.2, sunPos: [-16, 9, 10], stars: 0, moon: 0 },
  marsh: { sky: 0x1c2f33, fogD: 0.04, hemiSky: 0x6fa3a0, hemiGnd: 0x1a2a22, hemi: 0.95, sun: 0x9fd8c8, sunI: 0.6, sunPos: [6, 18, 10], stars: 0, moon: 0 },
  meadow: { sky: 0x8fc6ee, fogD: 0.008, hemiSky: 0xeaf4ff, hemiGnd: 0x5a6a3c, hemi: 1.35, sun: 0xfff2d2, sunI: 2.4, sunPos: [-12, 22, 14], stars: 0, moon: 0 },
  gate: { sky: 0x0a0d20, fogD: 0.02, hemiSky: 0x4a5aa8, hemiGnd: 0x15151c, hemi: 0.85, sun: 0x9fb4ff, sunI: 0.8, sunPos: [-10, 20, 10], stars: 1, moon: 1 },
  crypt: { sky: 0x06070c, fogD: 0.03, hemiSky: 0x5a6488, hemiGnd: 0x1a1612, hemi: 0.75, sun: 0xb8c4ff, sunI: 0.45, sunPos: [-4, 18, 12], stars: 0, moon: 0 },
  throne: { sky: 0x030806, fogD: 0.03, hemiSky: 0x4a8870, hemiGnd: 0x0e1612, hemi: 0.75, sun: 0x9fffd0, sunI: 0.45, sunPos: [-4, 18, 12], stars: 0, moon: 0 },
};

// ------------------------------------------------------------------ actors
class Actor {
  constructor(stage, spec) {
    this.stage = stage;
    this.id = spec.id;
    this.kind = spec.kind; // hero | foe | npc
    this.modelName = spec.model;
    this.root = new THREE.Group();
    this.home = V(0, 0, 0);
    this.actions = {};
    this.mats = [];
    this.token = 0;
    this.downed = false;
    this.scale = spec.scale || 1;
    const src = stage.models[spec.model];
    if (src) {
      this.model = SkeletonUtils.clone(src);
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        if (spec.tint) o.material.color.set(spec.tint);
        this.mats.push(o.material);
        if (spec.crown && /hat/i.test(o.name)) o.visible = false;
      });
      this.head = this.model.getObjectByName('head');
      this.mixer = new THREE.AnimationMixer(this.model);
      stage.clips.forEach(c => { this.actions[c.name] = this.mixer.clipAction(c); });
      this.mixer.addEventListener('finished', e => { if (e.action.__done) e.action.__done(); });
    } else {
      this.model = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: spec.tint || (spec.kind === 'foe' ? 0xc8c8c0 : 0x6a8fd8) });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1, 4, 12), mat);
      body.position.y = 0.95;
      body.castShadow = true;
      this.model.add(body);
      this.mats.push(mat);
    }
    this.model.scale.setScalar(this.scale);
    this.root.add(this.model);
    if (spec.ghost) this.setGhost(true);
    if (spec.crown) { this.crown = makeCrown(); this.crown.position.y = 0.92; (this.head || this.model).add(this.crown); }
    if (spec.boss) { const l = new THREE.PointLight(0x40ff90, 14, 9); l.position.y = 3.2; this.root.add(l); }

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), new THREE.MeshBasicMaterial({ color: spec.ring || 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.scale.setScalar(this.scale);
    this.ring.visible = spec.kind !== 'npc';
    this.root.add(this.ring);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * this.scale, 0.8 * this.scale, 2.6 * this.scale, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 1.3 * this.scale;
    this.hit.userData.id = spec.id;
    this.root.add(this.hit);

    this.label = document.createElement('button');
    this.label.type = 'button';
    this.label.className = 'tag ' + spec.kind;
    this.nameEl = document.createElement('span');
    this.nameEl.textContent = spec.name || '';
    this.bar = document.createElement('i');
    const track = document.createElement('div');
    track.className = 'hp';
    track.append(this.bar);
    this.label.append(this.nameEl);
    if (spec.kind !== 'npc') this.label.append(track);
    this.label.onclick = () => stage.onPick(spec.id);
    this.label.disabled = true;
    stage.labels.append(this.label);
    stage.scene.add(this.root);
    this.idle = spec.pose || 'Idle';
    this.play(this.idle, { fade: 0 });
  }
  play(name, { fade = 0.2, once = false, then = null, speed = 1 } = {}) {
    const a = this.actions[name];
    const token = ++this.token;
    if (!a) { if (then) setTimeout(() => token === this.token && then(), 500); return; }
    if (this.current === a && !once) return;
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.__done = once && then ? () => { if (token === this.token) then(); } : null;
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    a.play();
    this.current = a;
  }
  // play one clip, then go back to standing
  once(name, speed) { this.play(name, { once: true, speed, then: () => { if (!this.downed) this.play(this.idle); } }); }
  face(x, z) { this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z); }
  place(x, z, faceX) {
    this.home.set(x, 0, z);
    this.root.position.copy(this.home);
    this.root.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  setGhost(on) {
    this.mats.forEach(m => {
      m.transparent = on; m.opacity = on ? 0.45 : 1; m.depthWrite = !on;
      if (m.emissive) { m.emissive.set(on ? 0x6f9cff : 0x000000); m.emissiveIntensity = on ? 0.9 : 1; }
      m.needsUpdate = true;
    });
  }
  setHp(hp, max) {
    this.hp = Math.max(0, hp);
    if (max) this.max = max;
    const f = this.max ? this.hp / this.max : 1;
    this.bar.style.width = `${Math.round(f * 100)}%`;
    this.bar.className = f <= 0.3 ? 'low' : f <= 0.6 ? 'mid' : '';
  }
  setDown(on, snap) {
    if (this.downed === on) return;
    this.downed = on;
    this.label.classList.toggle('down', on);
    if (on) this.play('Death_A', { once: true, fade: snap ? 0 : 0.15 });
    else if (snap) this.play(this.idle, { fade: 0 });
    else this.play('Lie_StandUp', { once: true, then: () => this.play(this.idle) });
  }
  headPos(out) { out.copy(this.root.position); out.y += (this.downed ? 1.0 : 2.55) * this.scale; return out; }
  dispose() { this.stage.scene.remove(this.root); this.label.remove(); }
}

function makeCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xff7a1a, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20), gold);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), gold);
    spike.position.set(Math.cos(a) * 0.4, 0.17, Math.sin(a) * 0.4);
    g.add(spike);
  }
  const l = new THREE.PointLight(0xff8a2a, 5, 5);
  l.position.y = 0.3;
  g.add(l);
  return g;
}

// ------------------------------------------------------------------- stage
export class Stage {
  constructor(canvas, labels, ui, sfx) {
    Object.assign(this, { canvas, labels, ui, sfx });
    this.onPick = () => {};
    this.actors = new Map();
    this.models = {};
    this.clips = [];
    this.tweens = [];
    this.waits = [];
    this.time = 0;
    this.gen = 0;
    this.camPos = V(0, 4.2, 11);
    this.look = V(0, 1.2, 0);
    this.tmp = V(0, 0, 0);
    this.targets = new Set();
    this.setName = null;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.buildWorld();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    canvas.addEventListener('pointerup', e => {
      if (!this.targets.size) return;
      const rect = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects([...this.actors.values()].filter(a => this.targets.has(a.id)).map(a => a.hit))[0];
      if (hit) this.onPick(hit.object.userData.id);
    });
    const clock = new THREE.Clock();
    r.setAnimationLoop(() => { const dt = clock.getDelta(); this.adapt(dt); this.frame(Math.min(dt, 0.25)); });
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const packed = window.EMBERFALL_PACKED ? (await import('./assets/models.js')).default : null;
    const unpack = async b64 => {
      const bin = atob(b64), buf = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
      const cib = self.createImageBitmap;
      self.createImageBitmap = undefined; // decode textures through <img>, which every host allows
      try { return await loader.parseAsync(buf.buffer, ''); } finally { self.createImageBitmap = cib; }
    };
    let done = 0;
    await Promise.all(MODEL_FILES.map(async name => {
      try {
        const g = packed ? await unpack(packed[name]) : await loader.loadAsync(`assets/${name}.glb`);
        this.models[name] = g.scene;
        if (g.animations.length) this.clips = g.animations;
      } catch (e) { console.warn('model failed to load:', name, e); }
      onProgress(++done / MODEL_FILES.length);
    }));
    this.setScene('village', null, true);
  }

  // ---------------------------------------------------------------- world
  buildWorld() {
    const s = this.scene;
    const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...extra });
    let seed = 11;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.flashLight = new THREE.PointLight(0xffffff, 0, 16);
    s.add(this.hemi, this.sun, this.sun.target, this.flashLight);

    const wood = std(0x5a3d26), stone = std(0x7d828c), darkStone = std(0x4a4d57), iron = std(0x2b2d33);
    this.flames = [];
    this.sets = {};
    const mk = name => { const g = new THREE.Group(); g.visible = false; s.add(g); this.sets[name] = g; return g; };
    const mesh = (g, geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
    const ground = (g, color, radius = 80) => { const m = mesh(g, new THREE.CircleGeometry(radius, 48), std(color), 0, 0, 0, false); m.rotation.x = -Math.PI / 2; return m; };
    const patch = (g, color, x, z, w, d, y = 0.012) => { const m = mesh(g, new THREE.PlaneGeometry(w, d), std(color), x, y, z, false); m.rotation.x = -Math.PI / 2; return m; };
    const trees = (g, n, where, leafA = 0x24452c, leafB = 0x2e5636) => {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), wood, n);
      const a = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 2.6, 7), std(leafA), n);
      const b = new THREE.InstancedMesh(new THREE.ConeGeometry(1.05, 2.2, 7), std(leafB), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const [x, z] = where(i), sc = 0.9 + rand() * 1.3;
        m4.compose(V(x, 0.8 * sc, z), q, V(sc, sc, sc)); trunk.setMatrixAt(i, m4);
        m4.compose(V(x, 2.7 * sc, z), q, V(sc, sc, sc)); a.setMatrixAt(i, m4);
        m4.compose(V(x, 4.2 * sc, z), q, V(sc, sc, sc)); b.setMatrixAt(i, m4);
      }
      [trunk, a, b].forEach(m => { m.castShadow = true; g.add(m); });
    };
    // trees fill the background but never stand between the camera and the party
    const behind = (minZ, spread) => () => [(rand() - 0.5) * spread, -minZ - Math.pow(rand(), 1.3) * 34];
    const fire = (g, x, z, color = 0xff8a3c, size = 1) => {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(g, new THREE.DodecahedronGeometry(0.24 * size), stone, x + Math.sin(a) * 0.85 * size, 0.13, z + Math.cos(a) * 0.85 * size).rotation.set(rand() * 3, rand() * 3, 0); }
      const cols = color === 0xff8a3c ? [0xff5a1f, 0xff9a2a, 0xffe07a] : [0x1fbf6a, 0x4dff9a, 0xc8ffe0];
      cols.forEach((c, i) => {
        const f = new THREE.Mesh(new THREE.ConeGeometry((0.46 - i * 0.12) * size, (1.4 - i * 0.3) * size, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
        f.position.set(x, (0.85 - i * 0.1) * size, z);
        f.userData.i = i;
        g.add(f);
        this.flames.push(f);
      });
      const l = new THREE.PointLight(color, 40 * size, 20, 1.6);
      l.position.set(x, 1.4, z);
      g.add(l);
    };
    const cottage = (g, x, z, rot, i) => {
      const h = new THREE.Group();
      h.position.set(x, 0, z);
      h.rotation.y = rot;
      const w = 3.4 + rand(), d = 3.2 + rand() * 0.6, ht = 2.4 + rand() * 0.5;
      mesh(h, new THREE.BoxGeometry(w, ht, d), std([0xd8c7a3, 0xcbb894, 0xe2d6bb][i % 3]), 0, ht / 2, 0);
      const roof = mesh(h, new THREE.ConeGeometry(Math.max(w, d) * 0.82, 1.9, 4), std([0x8c3b2e, 0x4a5a7a, 0x6a4a32, 0x7a3550][i % 4]), 0, ht + 0.95, 0);
      roof.rotation.y = Math.PI / 4;
      mesh(h, new THREE.BoxGeometry(0.9, 1.6, 0.12), wood, 0, 0.8, d / 2 + 0.02);
      [-1, 1].forEach(sx => mesh(h, new THREE.BoxGeometry(0.7, 0.7, 0.1), this.winMat, sx * w * 0.3, 1.5, d / 2 + 0.02, false));
      g.add(h);
    };
    this.winMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc35a, emissiveIntensity: 1.5 });

    // --- village
    let g = mk('village');
    ground(g, 0x3c5a33);
    patch(g, 0x7a6750, 0, 0, 22, 9);
    fire(g, 0, -2.6);
    [[-9, -9, 0.4], [-3, -11.5, 0.1], [3.5, -11, -0.15], [9.5, -9, -0.5], [15, -5, -1.0], [-15, -5, 1.0]].forEach(([x, z, r], i) => cottage(g, x, z, r, i));
    trees(g, 70, behind(15, 70));
    for (let i = 0; i < 3; i++) { const b = mesh(g, new THREE.CylinderGeometry(0.26, 0.26, 2, 8), wood, -2.4 + i * 2.4, 0.26, -4.4 + Math.abs(i - 1) * 0.5); b.rotation.z = Math.PI / 2; b.rotation.y = (i - 1) * -0.5; }

    // --- road
    g = mk('road');
    ground(g, 0x466b38);
    patch(g, 0x8a7550, 0, 0.4, 80, 6.5);
    trees(g, 110, behind(5.5, 80));
    const cart = new THREE.Group();
    cart.position.set(5.2, 0, -2.4);
    cart.rotation.set(0, 0.4, 0.95);
    mesh(cart, new THREE.BoxGeometry(3, 0.9, 1.8), wood, 0, 0.9, 0);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => { const w = mesh(cart, new THREE.CylinderGeometry(0.6, 0.6, 0.14, 12), std(0x3d2a1a), a, 0.5, b); w.rotation.x = Math.PI / 2; });
    g.add(cart);
    [[3.2, -3.4], [6.6, -1.2], [4.4, -4.2]].forEach(([x, z], i) => mesh(g, new THREE.BoxGeometry(0.8, 0.8, 0.8), std(0x9a7a4a), x, 0.4, z).rotation.y = i);
    for (let i = 0; i < 9; i++) mesh(g, new THREE.DodecahedronGeometry(0.3 + rand() * 0.5), stone, (rand() - 0.5) * 30, 0.2, -3.6 - rand() * 2);

    // --- meadow (open hills)
    g = mk('meadow');
    ground(g, 0x5d8a3e);
    patch(g, 0x9a8456, 0, 0.6, 80, 3.2);
    for (let i = 0; i < 9; i++) { const h = mesh(g, new THREE.SphereGeometry(10 + rand() * 9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(i % 2 ? 0x55803a : 0x4d7636), -60 + i * 15, -2, -22 - rand() * 24, false); h.scale.y = 0.5; }
    for (let i = 0; i < 6; i++) mesh(g, new THREE.ConeGeometry(16 + rand() * 10, 26 + rand() * 14, 5), std(0x7c88a6), -70 + i * 28, 2, -85 - rand() * 12, false);
    trees(g, 16, () => [(rand() - 0.5) * 70, -9 - rand() * 14], 0x3a6a34, 0x47803c);
    for (let i = 0; i < 60; i++) mesh(g, new THREE.SphereGeometry(0.09, 5, 4), new THREE.MeshBasicMaterial({ color: [0xffffff, 0xffe27a, 0xff9ad0][i % 3] }), (rand() - 0.5) * 30, 0.1, -2.6 - rand() * 5, false);
    for (let i = 0; i < 5; i++) mesh(g, new THREE.BoxGeometry(0.8, 2.2 + rand() * 1.5, 0.5), stone, 5 + Math.cos(i * 1.25) * 2.6, 1.1, -5.5 + Math.sin(i * 1.25) * 2.2).rotation.y = i;
    const pool = mesh(g, new THREE.CircleGeometry(1.8, 20), new THREE.MeshStandardMaterial({ color: 0x3f8fd0, metalness: 0.6, roughness: 0.15 }), 5, 0.03, -3.2, false);
    pool.rotation.x = -Math.PI / 2;
    // a wyvern for the sky, built from a few flat shapes
    this.wyvern = new THREE.Group();
    const hide = new THREE.MeshBasicMaterial({ color: 0x241a26, side: THREE.DoubleSide, fog: false });
    const part = (geo, x, y, z) => { const m = new THREE.Mesh(geo, hide); m.position.set(x, y, z); this.wyvern.add(m); return m; };
    part(new THREE.ConeGeometry(0.5, 4.5, 5), 0, 0, 0).rotation.z = -Math.PI / 2;
    part(new THREE.ConeGeometry(0.35, 1.2, 4), 2.6, 0.2, 0).rotation.z = -Math.PI / 2;
    this.wings = [-1, 1].map(sz => { const w = part(new THREE.BufferGeometry().setFromPoints([V(0.8, 0, 0), V(-1.2, 0, 0), V(-0.4, 0, sz * 4.2), V(0.9, 0, sz * 2.4)]), 0, 0.1, 0); w.geometry.setIndex([0, 1, 2, 0, 2, 3]); return w; });
    this.wyvern.visible = false;
    g.add(this.wyvern);

    // --- bridge
    g = mk('bridge');
    const cliff = std(0x6a5a4c);
    mesh(g, new THREE.BoxGeometry(60, 40, 80), cliff, -28.6, -20, -10);
    mesh(g, new THREE.BoxGeometry(60, 40, 80), cliff, 40.6, -20, -10);
    patch(g, 0x57713f, -28.6, -10, 59.6, 79.6, 0.02);
    patch(g, 0x57713f, 40.6, -10, 59.6, 79.6, 0.02);
    for (let i = 0; i < 12; i++) mesh(g, new THREE.BoxGeometry(0.6, 0.1, 2.2), wood, 1.9 + i * 0.75, -0.05 - Math.sin((i / 11) * Math.PI) * 0.5, 0.4).rotation.z = (rand() - 0.5) * 0.12;
    [-0.75, 1.55].forEach(z => {
      [1.3, 10.5].forEach(x => mesh(g, new THREE.CylinderGeometry(0.12, 0.14, 1.7, 6), wood, x, 0.85, z));
      const rope = mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 9.3, 5), std(0xb89a6a), 5.9, 1.05, z, false);
      rope.rotation.z = Math.PI / 2;
    });
    for (let i = 0; i < 7; i++) { const m = mesh(g, new THREE.ConeGeometry(14 + rand() * 10, 22 + rand() * 16, 5), std(0x5a4a5a), -60 + i * 22, 2, -70 - rand() * 20, false); m.material.fog = true; }
    trees(g, 26, () => [-6 - rand() * 30, -6 - rand() * 26], 0x3a4a2a, 0x4a5a30);

    // --- marsh
    g = mk('marsh');
    ground(g, 0x26352a);
    const water = new THREE.MeshStandardMaterial({ color: 0x0c2226, metalness: 0.7, roughness: 0.15 });
    [[6, -5, 9], [-8, -7, 7], [0, 6, 6], [13, 2, 5], [-13, 3, 6], [2, -13, 8]].forEach(([x, z, r]) => { const m = mesh(g, new THREE.CircleGeometry(r, 24), water, x, 0.02, z, false); m.rotation.x = -Math.PI / 2; });
    const deadWood = std(0x2b2520);
    for (let i = 0; i < 26; i++) {
      const x = (rand() - 0.5) * 60, z = -4.5 - rand() * 26, h = 3 + rand() * 3;
      mesh(g, new THREE.CylinderGeometry(0.08, 0.22, h, 5), deadWood, x, h / 2, z).rotation.z = (rand() - 0.5) * 0.3;
      mesh(g, new THREE.CylinderGeometry(0.04, 0.08, 1.6, 4), deadWood, x + 0.5, h * 0.75, z).rotation.z = -1.0;
    }
    for (let i = 0; i < 40; i++) mesh(g, new THREE.ConeGeometry(0.05, 0.9 + rand() * 0.6, 4), std(0x56683a), (rand() - 0.5) * 26, 0.5, -3.4 - rand() * 4, false);
    this.wisps = [];
    for (let i = 0; i < 7; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcffff0 }));
      w.userData = { x: 2 + i * 2.2 - (i % 2) * 9, z: -4 - (i % 3) * 3, p: i * 1.7 };
      if (i < 2) w.add(new THREE.PointLight(0x9fffe0, 9, 10));
      g.add(w);
      this.wisps.push(w);
    }

    // --- barrow gate
    g = mk('gate');
    ground(g, 0x2c3b2c);
    const hill = mesh(g, new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x24331f), 1, -1.5, -15, false);
    hill.scale.y = 0.75;
    [-1.5, 1.5].forEach(dx => mesh(g, new THREE.BoxGeometry(0.9, 4.2, 0.9), stone, 1 + dx, 2.1, -3.6));
    mesh(g, new THREE.BoxGeometry(4.6, 0.9, 1.1), stone, 1, 4.6, -3.6);
    mesh(g, new THREE.BoxGeometry(2.2, 3.8, 0.3), darkStone, 1, 1.9, -3.9);
    const mouth = mesh(g, new THREE.TorusGeometry(0.42, 0.09, 6, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x3fd2a0, emissiveIntensity: 0.8 }), 1, 1.9, -3.72, false);
    mouth.scale.y = 1.3;
    fire(g, -0.6, -1.4, 0xff8a3c, 0.8);
    mesh(g, new THREE.BoxGeometry(2.2, 0.8, 1.3), wood, 5.6, 0.9, -1.9);
    mesh(g, new THREE.BoxGeometry(2.6, 0.1, 1.7), std(0x9a3a3a), 5.6, 2.3, -1.9);
    [[4.6, -1.3], [6.6, -1.3], [4.6, -2.5], [6.6, -2.5]].forEach(([x, z]) => mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), wood, x, 1.15, z));
    const lantern = mesh(g, new THREE.BoxGeometry(0.25, 0.35, 0.25), new THREE.MeshBasicMaterial({ color: 0xffd27a }), 4.6, 2.0, -1.2, false);
    lantern.add(new THREE.PointLight(0xffc060, 12, 9));
    for (let i = 0; i < 7; i++) mesh(g, new THREE.BoxGeometry(0.7, 1.6 + rand() * 1.4, 0.4), stone, -9 + i * 1.6 + (i > 3 ? 7 : 0), 0.9, -4.6 - rand() * 2).rotation.set(0, rand(), (rand() - 0.5) * 0.3);
    trees(g, 40, () => [(rand() - 0.5) * 80, -20 - rand() * 26], 0x1c3524, 0x244028);
    const yew = mesh(g, new THREE.CylinderGeometry(0.3, 0.5, 3, 6), deadWood, -5.5, 1.5, -4.2);
    yew.rotation.z = 0.1;
    mesh(g, new THREE.IcosahedronGeometry(2.1, 0), std(0x1c3a24), -5.4, 4, -4.2);

    // --- crypt and throne room share an interior
    const interior = (name, green) => {
      const gg = mk(name);
      const floor = mesh(gg, new THREE.PlaneGeometry(34, 22), std(0x4b4e58), 0, 0, 0, false);
      floor.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 46; i++) patch(gg, i % 2 ? 0x565a66 : 0x40434c, -12.5 + (i % 12) * 2.3 + rand() * 0.5, -4.5 + Math.floor(i / 12) * 2.2, 1.7, 1.7, 0.01);
      mesh(gg, new THREE.BoxGeometry(34, 9, 1), darkStone, 0, 4.5, -6.4);
      [-13.5, 13.5].forEach(x => mesh(gg, new THREE.BoxGeometry(1, 9, 22), darkStone, x, 4.5, 0));
      for (let i = 0; i < 6; i++) {
        const x = -11 + i * 4.4;
        mesh(gg, new THREE.CylinderGeometry(0.5, 0.6, 7, 8), stone, x, 3.5, -4.6);
        mesh(gg, new THREE.BoxGeometry(1.5, 0.4, 1.5), stone, x, 0.2, -4.6);
        mesh(gg, new THREE.BoxGeometry(1.5, 0.4, 1.5), stone, x, 6.9, -4.6);
      }
      const col = green ? 0x30ff90 : 0xff8a3c;
      [-6.6, 2.2, 11].forEach((x, i) => {
        mesh(gg, new THREE.BoxGeometry(0.16, 0.7, 0.16), wood, x, 3.0, -5.8, false);
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), new THREE.MeshBasicMaterial({ color: col }));
        fl.position.set(x, 3.6, -5.8);
        fl.userData.i = i;
        gg.add(fl);
        this.flames.push(fl);
        if (i < 2) { const l = new THREE.PointLight(col, 30, 16, 1.5); l.position.set(x, 3.4, -4.6); gg.add(l); }
      });
      if (!green) {
        [-9, -4.6, -0.2, 4.2, 8.6].forEach((x, i) => {
          mesh(gg, new THREE.BoxGeometry(1.3, 0.9, 2.6), stone, x, 0.45, -3.0);
          const lid = mesh(gg, new THREE.BoxGeometry(1.4, 0.2, 2.7), darkStone, x + (i % 2 ? 0.5 : 0), 1.0, -3.0);
          if (i % 2) lid.rotation.z = 0.35;
        });
      } else {
        mesh(gg, new THREE.BoxGeometry(5.5, 0.35, 6), stone, 6.6, 0.17, 0.3);
        mesh(gg, new THREE.BoxGeometry(1.5, 0.8, 1.7), darkStone, THRONE[0] + 0.5, 0.75, THRONE[1]);
        mesh(gg, new THREE.BoxGeometry(0.4, 3.6, 1.9), darkStone, THRONE[0] + 1.3, 2.1, THRONE[1]);
        [-1, 1].forEach(sz => mesh(gg, new THREE.BoxGeometry(1.5, 0.5, 0.3), darkStone, THRONE[0] + 0.5, 1.4, THRONE[1] + sz * 0.95));
        fire(gg, 4.6, -3.2, 0x30ff90, 0.8);
        fire(gg, -5.5, -3.4, 0x30ff90, 0.8);
        for (let i = 0; i < 14; i++) mesh(gg, new THREE.SphereGeometry(0.16, 6, 5), std(0xd8d4c4), 3 + rand() * 7, 0.16, -2.6 + rand() * 0.8 - (i % 2) * 1.2);
      }
      return gg;
    };
    interior('crypt', false);
    interior('throne', true);

    // sky
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c9, fog: false, transparent: true }));
    this.moon.position.set(-30, 40, -90);
    s.add(this.moon);
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) { const a = rand() * Math.PI, e = 0.1 + rand() * 1.2; sp.set([Math.cos(a) * Math.cos(e) * 220, Math.sin(e) * 220, -Math.sin(a) * Math.cos(e) * 220], i * 3); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, fog: false, transparent: true, depthWrite: false }));
    s.add(this.stars);

    // effects
    this.bolt = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    this.bolt.add(new THREE.PointLight(0xff9030, 10, 8));
    this.bolt.visible = false;
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0x8dffc0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.wave.rotation.x = -Math.PI / 2;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.crownProp = makeCrown();
    this.crownProp.visible = false;
    const cg = new THREE.BufferGeometry();
    this.confPos = new Float32Array(240 * 3);
    this.confVel = new Float32Array(240 * 3);
    const cc = new Float32Array(240 * 3), col = new THREE.Color();
    for (let i = 0; i < 240; i++) { col.setHSL(rand(), 0.9, 0.6); cc.set([col.r, col.g, col.b], i * 3); }
    cg.setAttribute('position', new THREE.BufferAttribute(this.confPos, 3));
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    s.add(this.bolt, this.wave, this.dome, this.crownProp, this.confetti);
  }

  applyMood(name) {
    const m = MOODS[name];
    this.scene.background.set(m.sky);
    this.scene.fog.color.set(m.sky);
    this.scene.fog.density = m.fogD;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGnd);
    this.hemi.intensity = m.hemi;
    this.sun.color.set(m.sun);
    this.sun.intensity = m.sunI;
    this.sun.position.set(...m.sunPos);
    this.stars.visible = m.stars > 0;
    this.moon.visible = m.moon > 0;
  }

  // ------------------------------------------------------ timing helpers
  tween(dur, fn, easing = t => t) { this.tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, easing, gen: this.gen }); }
  wait(sec) { const gen = this.gen; return new Promise(res => this.waits.push({ t: sec, res, gen })); }
  shotPos(name) {
    const tall = this.camera.aspect < 0.9, k = tall ? 1.75 : 1, ky = tall ? 1.35 : 1;
    const S = {
      wide: [V(-0.6, 4.2 * ky, 12 * k), V(-0.6, 1.2, 0)], battle: [V(0, 5.2 * ky, 13.4 * k), V(0, 1.0, 0.3)],
      party: [V(-1.6, 2.7 * ky, 8.2 * k), V(-3.9, 1.2, 0.5)], creator: [V(-3.9, 2.4, 9.5 * k), V(-3.9, tall ? 0.2 : -1.5, 0)], npc: [V(0.4, 2.3 * ky, 6.2 * k), V(2.7, 1.4, 0.4)],
      high: [V(-7, 13, 20 * k), V(0, 0.5, 0)], boss: [V(1.6, 1.3, 3.4 * k), V(THRONE[0], 2.6, THRONE[1])],
    };
    return S[name];
  }
  shot(name, dur = 1.2, easing = ease) {
    const [pos, look] = this.shotPos(name);
    this.camTo(pos, look, dur, easing);
  }
  camTo(pos, look, dur, easing = ease) {
    const p0 = this.camPos.clone(), l0 = this.look.clone();
    this.camGen = (this.camGen || 0) + 1;
    const mine = this.camGen;
    this.tween(dur, t => { if (mine !== this.camGen) return; this.camPos.lerpVectors(p0, pos, t); this.look.lerpVectors(l0, look, t); }, easing);
  }
  camCut(pos, look) { this.camGen = (this.camGen || 0) + 1; this.camPos.copy(pos); this.look.copy(look); }
  focus(id, dur = 0.9) {
    const a = this.actors.get(id);
    if (!a) return;
    const tall = this.camera.aspect < 0.9;
    const p = a.root.position;
    this.camTo(V(p.x * 0.55, 2.3, p.z + (tall ? 8.5 : 5.2)), V(p.x, 1.3 * a.scale, p.z), dur);
  }
  shake(power = 0.25) { this.shakeT = 0.45; this.shakeP = power; }
  flash(color, intensity, at) {
    this.flashLight.color.set(color);
    this.flashLight.position.copy(at).setY(2.5);
    this.tween(0.7, t => { this.flashLight.intensity = intensity * (1 - t); });
  }
  burst(at) {
    for (let i = 0; i < 240; i++) {
      this.confPos.set([at.x, at.y + 2.5, at.z], i * 3);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      this.confVel.set([Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp], i * 3);
    }
    this.confetti.visible = true;
    this.confLife = 5;
  }
  float(id, text, cls) {
    const a = this.actors.get(id);
    if (!a) return;
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    const p = a.headPos(this.tmp).project(this.camera);
    el.style.left = `${(p.x * 0.5 + 0.5) * this.canvas.clientWidth}px`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * this.canvas.clientHeight - 20}px`;
    this.labels.append(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ------------------------------------------------------------- staging
  // Fade out, swap the location, fade in with an establishing shot.
  async setScene(name, title, instant, opts = {}) {
    if (this.setName === name && !title && !opts.walk) { if (opts.onSwap) opts.onSwap(); return; }
    this.skyShow = opts.sky || null;
    this.wyvern.visible = opts.sky === 'wyvern';
    const changed = this.setName !== name;
    if (changed && !instant) { this.ui.fade(true); await this.wait(0.4); }
    if (changed) {
      Object.entries(this.sets).forEach(([k, g]) => { g.visible = k === name; });
      this.applyMood(name);
      this.setName = name;
      this.crownProp.visible = false;
    }
    if (opts.onSwap) opts.onSwap();
    this.actors.forEach(a => { if (a.kind === 'hero') a.place(a.home.x, a.home.z, 1); });
    if (opts.walk) { // a day on the trail: the party walks into view
      this.sfx.steps();
      this.actors.forEach(a => {
        if (a.kind !== 'hero' || a.downed) return;
        const from = a.home.clone().setX(a.home.x - 11);
        a.root.position.copy(from);
        a.play('Walking_A', { fade: 0 });
        this.tween(2.6, t => a.root.position.lerpVectors(from, a.home, t));
        setTimeout(() => { if (!a.downed) a.play(a.idle); }, 2600);
      });
    }
    if (changed || title || opts.walk) {
      const [pos, look] = this.shotPos('wide');
      this.camCut(this.shotPos('high')[0], look);
      this.camTo(pos, look, title ? 3.2 : 1.2, easeOut);
    }
    if (changed && !instant) this.ui.fade(false);
    if (title) { this.ui.title(title); this.sfx.bell(); await this.wait(2.3); this.ui.title(''); }
  }
  syncHeroes(heroes, youId, snap) {
    const ids = new Set(heroes.map(h => h.id + h.cls + (h.tintHex || '')));
    for (const [id, a] of this.actors) if (a.kind === 'hero' && !ids.has(a.id + a.modelName + (a.tintHex || ''))) { a.dispose(); this.actors.delete(id); }
    heroes.forEach((h, i) => {
      let a = this.actors.get(h.id);
      const fresh = !a;
      if (fresh) {
        a = new Actor(this, { id: h.id, kind: 'hero', model: h.cls, name: h.name, tint: h.tintHex || null, ring: h.id === youId ? 0xffd34d : 0x6aa8ff });
        a.tintHex = h.tintHex || '';
        this.actors.set(h.id, a);
        a.place(HERO_SLOTS[i][0], HERO_SLOTS[i][1], 1);
      }
      a.nameEl.textContent = h.name + (h.id === youId ? ' (you)' : '');
      a.label.classList.toggle('me', h.id === youId);
      if (h.max) a.setHp(h.hp, h.max); else a.label.classList.add('nobar');
      a.setDown(!!h.down, fresh || snap);
    });
  }
  setNpc(spec) {
    const key = spec ? spec.model + spec.name : '';
    const cur = this.actors.get('npc');
    if (cur && cur.key === key) return cur;
    if (cur) { cur.dispose(); this.actors.delete('npc'); }
    if (!spec) return null;
    const a = new Actor(this, { ...spec, id: 'npc', kind: 'npc' });
    a.key = key;
    this.actors.set('npc', a);
    const [x, z] = spec.throne ? THRONE : NPC_SLOT;
    a.place(x, z, -1);
    if (spec.throne) a.root.position.y = a.home.y = 0.62;
    return a;
  }
  setProp(name) {
    this.crownProp.visible = name === 'crown';
    this.crownProp.position.set(NPC_SLOT[0], 0.35, NPC_SLOT[1]);
    this.crownProp.scale.setScalar(1.4);
  }
  // Create, update and retire enemy actors to match the battle.
  syncFoes(battle, DATA, enter) {
    const live = battle ? battle.enemies : [];
    const ids = new Set(live.map(e => e.id));
    for (const [id, a] of this.actors) if (a.kind === 'foe' && !ids.has(id)) { a.dispose(); this.actors.delete(id); }
    const boss = live.some(e => DATA.ENEMIES[e.key].boss);
    let side = 0, n = 0;
    live.forEach(e => {
      const def = DATA.ENEMIES[e.key];
      const slot = boss ? (def.boss ? BOSS_SLOT : BOSS_SIDE[side++ % BOSS_SIDE.length]) : FOE_SLOTS[n++ % FOE_SLOTS.length];
      let a = this.actors.get(e.id);
      if (!a) {
        if (e.hp <= 0) return;
        a = new Actor(this, { id: e.id, kind: 'foe', model: def.model, name: def.name, tint: def.tint, scale: def.scale, crown: def.boss, boss: def.boss, ring: 0xff5a5a });
        this.actors.set(e.id, a);
        a.place(slot[0], slot[1], -1);
        if (enter === 'run') {
          const from = def.boss && this.setName === 'throne' ? V(THRONE[0], 0, THRONE[1]) : V(slot[0] + 10, 0, slot[1]);
          a.root.position.copy(from);
          a.play('Running_A', { fade: 0 });
          this.tween(def.boss ? 1.8 : 1.1 + n * 0.12, t => a.root.position.lerpVectors(from, a.home, t), easeOut);
          setTimeout(() => a.play(a.idle), def.boss ? 1800 : 1200 + n * 120);
        } else if (enter === 'rise') {
          a.root.position.y = -2.4;
          this.tween(1.3, t => { a.root.position.y = -2.4 * (1 - t); }, easeOut);
        }
      }
      a.setHp(e.hp, e.max);
      if (e.hp <= 0 && !a.dead) this.kill(a, true);
    });
  }
  kill(a, quiet) {
    a.dead = true;
    a.label.hidden = true;
    a.ring.visible = false;
    if (!quiet) a.play('Death_A', { once: true, fade: 0.1 });
    setTimeout(() => { a.root.visible = false; }, quiet ? 0 : 1500);
  }
  setTargets(ids, sel) {
    this.targets = new Set(ids);
    this.actors.forEach(a => {
      const can = this.targets.has(a.id);
      a.label.disabled = !can;
      a.label.classList.toggle('can', can);
      a.label.classList.toggle('sel', sel === a.id);
      a.ring.material.opacity = can ? 0.95 : 0.5;
    });
  }
  setTurn(id) { this.actors.forEach(a => a.label.classList.toggle('turn', a.id === id)); this.turnId = id; }
  clearActors() { this.actors.forEach(a => a.dispose()); this.actors.clear(); }

  // --------------------------------------------------------- event scenes
  hitActor(h, good) {
    const t = this.actors.get(h.to);
    if (!t || t.dead) return;
    t.setHp((t.hp ?? 0) - h.dmg);
    this.float(h.to, `−${h.dmg}`, t.kind === 'hero' ? 'bad' : 'dmg');
    if (h.save) setTimeout(() => this.float(h.to, 'Saved! Half damage', 'heal small'), 250);
    if (h.ko) { if (t.kind === 'foe') this.kill(t); else t.setDown(true); } else if (!t.downed) t.once(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B');
  }
  async playFx(e, DATA) {
    const fn = this['fx_' + e.k];
    if (fn) await fn.call(this, e, DATA);
  }
  async fx_begin(e) {
    this.setNpc(null);
    this.ui.cinema(true);
    this.shot('battle', 1.4);
    this.sfx.boom();
    if (e.boss) this.sfx.sting('evil');
    this.ui.title(e.title, 'battle');
    await this.wait(2.5);
    this.ui.title('');
    this.ui.cinema(false);
  }
  async fx_mod(e) {
    this.ui.caption(e.text, e.good ? 'good' : 'bad');
    await this.wait(0.7);
    if (e.hits.length) { this.sfx.hit(); this.shake(0.15); }
    e.hits.forEach(h => this.hitActor(h));
    await this.wait(1.5);
    this.ui.caption('');
  }
  async fx_atk(e, DATA) {
    const a = this.actors.get(e.from), t = this.actors.get(e.to);
    if (!a || !t) return;
    const melee = (e.style || 'melee') === 'melee';
    const big = e.crit || e.abil || e.bossKo;
    this.ui.rollChip(e);
    a.face(t.home.x, t.home.z);
    if (big) this.focus(e.to, 0.7);
    if (e.abil) this.ui.caption(e.name || '', 'good');
    const from = a.home.clone();
    if (melee) {
      const dir = t.home.clone().sub(a.home).setY(0).normalize();
      const to = t.home.clone().sub(dir.multiplyScalar(1.25 * Math.max(a.scale, t.scale)));
      a.play('Running_A', { fade: 0.1 });
      this.tween(0.38, k => a.root.position.lerpVectors(from, to, k), easeOut);
      await this.wait(0.36);
    }
    a.play(ATTACK[a.modelName] || 'Unarmed_Melee_Attack_Punch_A', { once: true, fade: 0.08, speed: 1.25 });
    if (!melee) {
      await this.wait(0.38);
      const p0 = a.home.clone().setY(1.5), p1 = t.home.clone().setY(1.4 * t.scale);
      this.bolt.material.color.set(e.style === 'magic' ? 0xff8a30 : 0xe8e0c8);
      this.bolt.scale.setScalar(e.style === 'magic' ? 1 : 0.4);
      this.bolt.visible = true;
      this.tween(0.24, k => this.bolt.position.lerpVectors(p0, p1, k));
      await this.wait(0.24);
      this.bolt.visible = false;
    } else await this.wait(0.42);
    if (e.hit) {
      this.sfx.hit();
      if (e.blocked) this.sfx.clang();
      this.hitActor({ to: e.to, dmg: e.dmg, ko: e.ko });
      if (e.crit) { this.float(e.to, 'CRITICAL!', 'crit'); this.ui.flash('#fff', 250); this.sfx.clang(); }
      this.shake(big ? 0.4 : 0.14);
      this.flash(e.style === 'magic' ? 0xff8a30 : 0xffffff, big ? 60 : 22, t.home);
    } else {
      this.sfx.swish();
      this.float(e.to, 'Miss', 'miss');
      if (!t.downed) t.once('Dodge_Backward', 1.3);
    }
    if (e.bossKo) {
      this.ui.cinema(true);
      this.ui.flash('#b8ffd8', 900);
      this.sfx.sting('good');
      this.sfx.boom();
      this.burst(t.home);
      await this.wait(2.4);
      this.ui.cinema(false);
    }
    await this.wait(0.45);
    if (melee) {
      const back = a.root.position.clone();
      this.tween(0.3, k => a.root.position.lerpVectors(back, from, k), easeOut);
      await this.wait(0.3);
    }
    a.root.rotation.y = a.kind === 'hero' ? Math.PI / 2 : -Math.PI / 2;
    if (!a.downed) a.play(a.idle);
    this.ui.caption('');
    if (big) this.shot('battle', 0.6);
  }
  async fx_aoe(e) {
    const a = this.actors.get(e.from);
    const fire = e.name === 'Fireball';
    const heroic = e.from[0] === 'h';
    this.ui.caption(e.name + (heroic ? '' : ' — saving throws!'), heroic ? 'good' : 'bad');
    if (a) a.play(fire ? 'Spellcast_Long' : e.name === 'Whirlwind' ? '2H_Melee_Attack_Spin' : e.name === 'Volley' ? '2H_Ranged_Shoot' : 'Spellcast_Raise', { once: true, fade: 0.1, then: () => a.play(a.idle) });
    const centre = V(0, 0, 0);
    const hit = e.hits.map(h => this.actors.get(h.to)).filter(Boolean);
    hit.forEach(t => centre.add(t.home));
    if (hit.length) centre.multiplyScalar(1 / hit.length);
    await this.wait(0.7);
    if (fire && a) {
      const p0 = a.home.clone().setY(2.2), p1 = centre.clone().setY(1.2);
      this.bolt.material.color.set(0xff7a20);
      this.bolt.scale.setScalar(2.2);
      this.bolt.visible = true;
      this.tween(0.4, k => this.bolt.position.lerpVectors(p0, p1, k));
      await this.wait(0.4);
      this.bolt.visible = false;
    } else await this.wait(0.3);
    this.sfx.fire();
    this.sfx.boom();
    this.ui.flash(fire ? '#ff8a30' : heroic ? '#ffffff' : '#7fffd0', heroic && !fire ? 200 : 450);
    this.flash(fire ? 0xff7a20 : heroic ? 0xffffff : 0x60ffc0, 90, centre);
    this.shake(0.4);
    this.wave.material.color.set(fire ? 0xff9a40 : heroic ? 0xffffff : 0x8dffc0);
    this.wave.position.copy(centre).setY(0.08);
    this.tween(0.8, k => { this.wave.scale.setScalar(1 + k * 5); this.wave.material.opacity = 0.8 * (1 - k); }, easeOut);
    e.hits.forEach(h => this.hitActor(h));
    await this.wait(1.0);
    this.ui.caption('');
  }
  async fx_heal(e) {
    const a = this.actors.get(e.from), t = this.actors.get(e.to);
    if (!t) return;
    if (a) a.once(e.kind === 'potion' ? 'Use_Item' : 'Spellcast_Raise');
    await this.wait(0.55);
    this.sfx.chime();
    this.wave.material.color.set(0x7dff9a);
    this.wave.position.copy(t.home).setY(0.08);
    this.tween(0.9, k => { this.wave.scale.setScalar(0.6 + k * 1.6); this.wave.material.opacity = 0.9 * (1 - k); }, easeOut);
    this.flash(0x60ff90, 26, t.home);
    t.setHp((t.hp ?? 0) + e.amt);
    t.setDown(false);
    this.float(e.to, `+${e.amt}`, 'heal');
    await this.wait(1.0);
  }
  async fx_skip(e) {
    this.float(e.who, 'Stunned!', 'miss');
    const a = this.actors.get(e.who);
    if (a) a.once('Hit_B');
    await this.wait(1.1);
  }
  async fx_guard(e) {
    const a = this.actors.get(e.from);
    if (!a) return;
    a.play('Blocking', { fade: 0.1 });
    this.sfx.clang();
    this.ui.caption('Shield Wall', 'good');
    this.dome.position.copy(a.home);
    this.tween(1.1, k => { this.dome.scale.setScalar(0.6 + easeOut(k) * 0.7); this.dome.material.opacity = Math.sin(k * Math.PI) * 0.45; });
    await this.wait(1.1);
    this.ui.caption('');
  }
  async fx_defend(e) {
    const a = this.actors.get(e.from);
    if (a) a.play('Blocking', { fade: 0.1 });
    this.sfx.tick();
    this.float(e.from, 'Braced', 'miss');
    await this.wait(0.9);
  }
  async fx_summon(e, DATA) {
    const a = this.actors.get(e.from);
    if (a) { this.focus(e.from, 0.6); a.play('Spellcast_Raise', { once: true, then: () => a.play(a.idle) }); }
    this.ui.caption('“Rise. Serve.”', 'bad');
    this.sfx.sting('evil');
    await this.wait(0.8);
    this.ui.flash('#30ff90', 500);
    this.shake(0.3);
    this.shot('battle', 0.8);
    if (this.pendingBattle) this.syncFoes(this.pendingBattle, DATA, 'rise');
    await this.wait(1.5);
    this.ui.caption('');
  }
  // the roller steps up while the dice fly
  rollPose(id) { const a = this.actors.get(id); if (a) { this.focus(id, 0.7); a.once('Interact'); } }
  cheer() { this.actors.forEach(a => { if (a.kind === 'hero' && !a.downed) a.play('Cheer'); }); }
  rest() { this.actors.forEach(a => { if (a.kind === 'hero' && !a.downed) a.play(a.idle); }); }
  // The Bone King stands up from his throne.
  async bossRise() {
    const a = this.actors.get('npc');
    if (!a) return;
    this.sfx.sting('evil');
    this.ui.flash('#30ff90', 500);
    this.shake(0.3);
    a.play('Sit_Chair_StandUp', { once: true, then: () => a.play('Idle') });
    this.tween(1.2, t => { a.root.position.y = 0.62 * (1 - t); a.root.position.x = THRONE[0] - t * 1.2; }, ease);
    const [, look] = this.shotPos('boss');
    this.camTo(V(0.5, 1.0, 2.6), look.clone().setY(3.2), 2.2, easeOut);
  }
  // Ending tableau: someone wears the crown.
  crownHero(id, dark) {
    const a = this.actors.get(id);
    if (!a) return;
    const c = makeCrown();
    c.position.y = 0.95;
    (a.head || a.model).add(c);
    a.place(THRONE[0] - 1.6, THRONE[1], -1);
    a.play(dark ? 'Spellcast_Raise' : 'Cheer');
    if (dark) this.actors.forEach(o => { if (o.kind === 'hero' && o !== a) { o.play('Blocking'); o.root.position.x -= 1.2; } });
  }

  // ---------------------------------------------------------------- frame
  adapt(dt) {
    if (dt > 1) return;
    this.fAcc = (this.fAcc || 0) + dt;
    this.fN = (this.fN || 0) + 1;
    if (this.fAcc < 2) return;
    const avg = this.fAcc / this.fN;
    this.fAcc = this.fN = 0;
    this.quality = this.quality || 0;
    if (avg < 0.042 || this.quality >= 3) return;
    this.quality++;
    if (this.quality === 1) this.renderer.setPixelRatio(1);
    if (this.quality === 2) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    if (this.quality === 3) this.renderer.setPixelRatio(0.6);
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const tall = w / h < 0.9;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = tall ? 56 : 48;
    this.camera.updateProjectionMatrix();
    if (this.wasTall !== undefined && this.wasTall !== tall) this.shot('wide', 0.01);
    this.wasTall = tall;
  }
  frame(dt) {
    this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) { const x = this.waits[i]; if ((x.t -= dt) <= 0) { this.waits.splice(i, 1); x.res(); } }
    this.tweens = this.tweens.filter(tw => { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.easing(k)); return k < 1; });
    const sw = this.time * 0.35;
    this.camera.position.set(this.camPos.x + Math.sin(sw) * 0.25, this.camPos.y + Math.sin(sw * 1.3) * 0.08, this.camPos.z);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const p = this.shakeP * (this.shakeT / 0.45);
      this.camera.position.x += (Math.random() - 0.5) * p;
      this.camera.position.y += (Math.random() - 0.5) * p;
    }
    this.camera.lookAt(this.look);

    const fl = 0.85 + Math.sin(this.time * 11) * 0.08 + Math.sin(this.time * 23.7) * 0.07;
    this.flames.forEach(f => { if (f.parent.visible) { const i = f.userData.i; f.scale.set(1 + Math.sin(this.time * (9 + i * 3)) * 0.12, fl + Math.sin(this.time * (13 + i * 5)) * 0.15, 1); f.rotation.y += dt * (1 + i); } });
    if (this.sets.marsh.visible) this.wisps.forEach(w => { const u = w.userData; w.position.set(u.x + Math.sin(this.time * 0.5 + u.p) * 2, 1.3 + Math.sin(this.time * 1.1 + u.p) * 0.5, u.z + Math.cos(this.time * 0.4 + u.p) * 1.5); });
    if (this.crownProp.visible) this.crownProp.rotation.y += dt;
    if (this.wyvern.visible) {
      const a = this.time * 0.45;
      this.wyvern.position.set(Math.cos(a) * 22, 15 + Math.sin(a * 2) * 2, -24 + Math.sin(a) * 10);
      this.wyvern.rotation.y = -a - Math.PI / 2;
      this.wings.forEach((w, i) => { w.rotation.x = Math.sin(this.time * 5) * 0.5 * (i ? 1 : -1); });
    }
    if (this.confetti.visible) {
      for (let i = 0; i < 240; i++) {
        this.confVel[i * 3 + 1] -= 7 * dt;
        for (let k = 0; k < 3; k++) this.confPos[i * 3 + k] += this.confVel[i * 3 + k] * dt;
        if (this.confPos[i * 3 + 1] < 0.05) { this.confPos[i * 3 + 1] = 0.05; this.confVel.fill(0, i * 3, i * 3 + 3); }
      }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      if ((this.confLife -= dt) < 0) this.confetti.visible = false;
    }
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.actors.forEach(a => {
      if (a.mixer) a.mixer.update(dt);
      if (this.targets.has(a.id)) a.ring.scale.setScalar(a.scale * (1 + Math.sin(this.time * 6) * 0.1));
      else if (a.id === this.turnId) a.ring.scale.setScalar(a.scale * 1.2);
      else a.ring.scale.setScalar(a.scale);
      if (a.label.hidden) return;
      const p = a.headPos(this.tmp).project(this.camera);
      a.label.style.transform = `translate(-50%, -100%) translate(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px)`;
      a.label.style.visibility = p.z > 1 || p.z < -1 ? 'hidden' : '';
    });
    this.renderer.render(this.scene, this.camera);
  }
}
