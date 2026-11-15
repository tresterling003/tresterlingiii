// The 3D village: scenery, characters, lighting moods and the cutscenes.
// It only draws — the rules live in game.js and the HUD in app.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_FILES = ['knight', 'barbarian', 'mage', 'rogue', 'hooded'];
const RING = 4.7;
const GRAVE = new THREE.Vector3(-10.5, 0, -7.5);
const CANCEL = Symbol('cancel');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);

const MOODS = {
  dusk: { sky: 0x1d2347, fogD: 0.016, hemiSky: 0x7a86c4, hemiGnd: 0x3a2a1c, hemi: 1.0, sun: 0xffb27a, sunI: 1.0, sunPos: [-12, 12, 10], fire: 2.6, win: 1, stars: 0.8, moon: 1, moonCol: 0xfff3c9 },
  night: { sky: 0x080b1c, fogD: 0.026, hemiSky: 0x3d4c94, hemiGnd: 0x10131c, hemi: 0.75, sun: 0x8fa8ff, sunI: 0.7, sunPos: [-14, 22, -16], fire: 1.6, win: 0.2, stars: 1, moon: 1, moonCol: 0xdfe8ff },
  day: { sky: 0x8ec5e8, fogD: 0.009, hemiSky: 0xe6f2ff, hemiGnd: 0x6a5a3c, hemi: 1.35, sun: 0xfff0d0, sunI: 2.4, sunPos: [14, 24, 12], fire: 0.5, win: 0, stars: 0, moon: 0, moonCol: 0xffffff },
  dark: { sky: 0x151a2a, fogD: 0.02, hemiSky: 0x55608a, hemiGnd: 0x15130f, hemi: 0.3, sun: 0xaab4d8, sunI: 0.2, sunPos: [14, 24, 12], fire: 0.9, win: 0.2, stars: 0.3, moon: 0, moonCol: 0xffffff },
  blood: { sky: 0x2a0509, fogD: 0.024, hemiSky: 0xa02a3a, hemiGnd: 0x1a0508, hemi: 0.9, sun: 0xff4040, sunI: 1.1, sunPos: [-14, 22, -16], fire: 2.2, win: 0.1, stars: 0.5, moon: 1, moonCol: 0xff3b3b },
};

// ------------------------------------------------------------------ actors
class Actor {
  constructor(stage, p) {
    this.stage = stage;
    this.id = p.id;
    this.root = new THREE.Group();
    this.home = V(0, 0, 0);
    this.state = '';
    this.ghost = false;
    this.wolf = false;
    this.token = 0;
    this.actions = {};
    this.mats = [];
    const src = stage.models[p.model % MODEL_FILES.length];
    if (src) {
      this.model = SkeletonUtils.clone(src);
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        this.mats.push(o.material);
        if (/head|helmet|hat|hood/i.test(o.name) || (o.parent && /^head$/i.test(o.parent.name))) (this.headParts = this.headParts || []).push(o);
      });
      this.head = this.model.getObjectByName('head');
      this.mixer = new THREE.AnimationMixer(this.model);
      stage.clips.forEach(c => { this.actions[c.name] = this.mixer.clipAction(c); });
      this.mixer.addEventListener('finished', e => { if (e.action.__done) e.action.__done(); });
    } else {
      // No model file? A simple peg person still plays the game.
      this.model = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: p.color });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1, 4, 12), mat);
      body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 }));
      head.position.y = 2;
      body.castShadow = head.castShadow = true;
      this.model.add(body, head);
      this.mats.push(mat, head.material);
      this.head = head;
    }
    this.root.add(this.model);

    // coloured ring at the feet tells duplicate models apart and shows targets
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.55, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.root.add(this.ring);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 1.3;
    this.hit.userData.pid = p.id;
    this.root.add(this.hit);

    this.label = document.createElement('button');
    this.label.type = 'button';
    this.label.className = 'label';
    this.label.dataset.pid = p.id;
    this.label.onclick = () => stage.onPick(p.id);
    this.bubble = document.createElement('div');
    this.bubble.className = 'bubble';
    this.bubble.hidden = true;
    stage.labels.append(this.label, this.bubble);
    stage.scene.add(this.root);
    this.play('Idle', { fade: 0 });
  }

  play(name, { fade = 0.3, once = false, then = null, speed = 1 } = {}) {
    const a = this.actions[name];
    const token = ++this.token;
    if (!a) { if (then) setTimeout(() => token === this.token && then(), 600); return; }
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
  // play clips one after another; the last one loops
  seq(...names) {
    const [first, ...rest] = names;
    if (!rest.length) return this.play(first);
    this.play(first, { once: true, then: () => this.seq(...rest) });
  }
  emote(name) { if (this.state === 'stand' && !this.ghost) this.play(name, { once: true, then: () => this.play('Idle') }); }
  face(x, z) { this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z); }

  setGhost(on) {
    if (this.ghost === on) return;
    this.ghost = on;
    this.mats.forEach(m => {
      m.transparent = on;
      m.opacity = on ? 0.42 : 1;
      m.depthWrite = !on;
      if (m.emissive) { m.emissive.set(on ? 0x5f8cff : 0x000000); m.emissiveIntensity = on ? 0.9 : 1; }
      m.needsUpdate = true;
    });
    this.model.traverse(o => { if (o.isMesh) o.castShadow = !on; });
    this.ring.visible = !on;
  }
  setWolf(on) {
    if (this.wolf === on) return;
    this.wolf = on;
    if (on && !this.wolfHead) {
      this.wolfHead = makeWolfHead();
      (this.head || this.model).add(this.wolfHead);
      if (!this.mixer) this.wolfHead.position.y = 0.1;
    }
    if (this.wolfHead) this.wolfHead.visible = on;
    (this.headParts || []).forEach(o => { o.visible = !on; });
    this.mats.forEach(m => { if (m.color) m.color.set(on ? 0x6f6a78 : 0xffffff); });
    this.model.scale.setScalar(on ? 1.18 : 1);
  }
  // Where and how this actor should be when nothing dramatic is happening.
  settle(state, snap) {
    if (state === this.state) return;
    const was = this.state;
    this.state = state;
    if (state === 'ghost') {
      this.setGhost(true);
      this.root.position.copy(this.spot);
      this.face(0, 0);
      this.play('Idle', { fade: 0 });
      return;
    }
    this.setGhost(false);
    this.root.position.copy(this.home);
    this.face(0, 0);
    if (state === 'sleep') snap ? this.play('Lie_Idle', { fade: 0 }) : this.seq('Lie_Down', 'Lie_Idle');
    else if (state === 'cheer') this.play('Cheer');
    else if (state === 'cower') this.play('Blocking');
    else if (was === 'sleep' && !snap) this.seq('Lie_StandUp', 'Idle');
    else this.play('Idle', { fade: snap ? 0 : 0.3 });
  }
  headPos(out) {
    out.copy(this.root.position);
    out.y += this.ghost ? 2.75 + this.bob : this.state === 'sleep' ? 1.15 : 2.6 * this.model.scale.y;
    return out;
  }
  update(dt, time) {
    if (this.mixer) this.mixer.update(dt);
    this.bob = this.ghost ? Math.sin(time * 1.6 + this.root.position.x) * 0.12 + 0.35 : 0;
    this.model.position.y = this.bob;
  }
  dispose() {
    this.stage.scene.remove(this.root);
    this.label.remove();
    this.bubble.remove();
    clearTimeout(this.bubbleTimer);
  }
}

function makeWolfHead() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x3a3640, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a20, roughness: 0.9, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xf4efe2, flatShading: true });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  const skull = add(new THREE.IcosahedronGeometry(0.52, 1), fur, 0, 0.5, 0);
  skull.scale.set(1, 0.95, 1.05);
  add(new THREE.BoxGeometry(0.42, 0.3, 0.62), fur, 0, 0.42, 0.58);
  add(new THREE.BoxGeometry(0.36, 0.1, 0.5), dark, 0, 0.24, 0.55, 0.25);
  add(new THREE.SphereGeometry(0.09, 8, 6), dark, 0, 0.56, 0.9);
  [-1, 1].forEach(s => {
    add(new THREE.ConeGeometry(0.17, 0.48, 4), fur, s * 0.3, 1.06, -0.05, -0.15, -s * 0.25);
    add(new THREE.ConeGeometry(0.09, 0.3, 4), dark, s * 0.3, 1.03, 0.0, -0.15, -s * 0.25);
    add(new THREE.SphereGeometry(0.075, 8, 6), eye, s * 0.21, 0.62, 0.45);
    add(new THREE.ConeGeometry(0.04, 0.16, 4), tooth, s * 0.14, 0.26, 0.8, Math.PI);
    add(new THREE.ConeGeometry(0.035, 0.12, 4), tooth, s * 0.15, 0.27, 0.62, Math.PI);
    const cheek = add(new THREE.ConeGeometry(0.2, 0.5, 4), fur, s * 0.5, 0.36, 0.05, 0, s * 1.9);
    cheek.scale.z = 0.6;
  });
  const glow = new THREE.PointLight(0xff2020, 1.2, 4);
  glow.position.set(0, 0.6, 0.6);
  g.add(glow);
  return g;
}

// ------------------------------------------------------------------- stage
export class Stage {
  constructor(canvas, labels, ui, sfx) {
    this.canvas = canvas;
    this.labels = labels;
    this.ui = ui;
    this.sfx = sfx;
    this.onPick = () => {};
    this.actors = new Map();
    this.models = [];
    this.clips = [];
    this.tweens = [];
    this.waits = [];
    this.cutId = 0;
    this.cine = false;
    this.state = null;
    this.targets = new Set();
    this.sel = null;
    this.mood = { ...MOODS.dusk };
    this.time = 0;
    this.look = V(0, 1.3, 0);
    this.tmp = V(0, 0, 0);

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(MOODS.dusk.sky);
    this.scene.fog = new THREE.FogExp2(MOODS.dusk.sky, MOODS.dusk.fogD);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.camera.position.set(0, 7, 14);
    const c = this.controls = new OrbitControls(this.camera, canvas);
    c.target.copy(this.look);
    c.enableDamping = true;
    c.enablePan = false;
    c.minDistance = 6;
    c.maxDistance = 30;
    c.minPolarAngle = 0.45;
    c.maxPolarAngle = 1.5;
    c.autoRotate = true;
    c.autoRotateSpeed = 0.5;
    c.addEventListener('start', () => { c.autoRotate = false; clearTimeout(this.idle); });
    c.addEventListener('end', () => { this.idle = setTimeout(() => { c.autoRotate = this.spin; }, 7000); });
    this.spin = true;

    this.buildWorld();
    this.applyMood();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // tap a character to target them
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || this.cine) return;
      const rect = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects([...this.actors.values()].map(a => a.hit))[0];
      if (hit) this.onPick(hit.object.userData.pid);
    });

    const clock = new THREE.Clock();
    r.setAnimationLoop(() => {
      const dt = clock.getDelta();
      this.adapt(dt);
      this.frame(Math.min(dt, 0.25));
    });
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    // Hosts that can't serve .glb files get the models packed into a script instead.
    const packed = window.HOLLOWMOON_PACKED ? (await import('./assets/models.js')).default : null;
    const unpack = async b64 => {
      const bin = atob(b64), buf = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
      // decode textures through <img> rather than fetch(), which such hosts may block
      const cib = self.createImageBitmap;
      self.createImageBitmap = undefined;
      try { return await loader.parseAsync(buf.buffer, ''); } finally { self.createImageBitmap = cib; }
    };
    await Promise.all(MODEL_FILES.map(async (name, i) => {
      try {
        const g = packed ? await unpack(packed[name]) : await loader.loadAsync(`assets/${name}.glb`);
        this.models[i] = g.scene;
        if (g.animations.length) this.clips = g.animations;
      } catch (e) { console.warn('model failed to load:', name, e); }
      onProgress(++done / MODEL_FILES.length);
    }));
    // a few villagers loiter by the fire behind the title screen
    this.setPlayers([0, 1, 2, 3, 4, 5].map(i => ({ id: 'extra' + i, name: '', color: '#888888', model: i })), null, true);
  }

  // ---------------------------------------------------------------- world
  buildWorld() {
    const s = this.scene;
    const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...extra });
    const mesh = (geo, mat, x, y, z, parent = s) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.fire = new THREE.PointLight(0xff8a3c, 2, 22, 1.6);
    this.fire.position.set(0, 1.4, 0);
    this.spot = new THREE.SpotLight(0xfff2cc, 0, 30, 0.2, 0.45, 0.6);
    this.spot.position.set(0, 14, 0);
    this.spot.castShadow = false;
    this.red = new THREE.PointLight(0xff1a1a, 0, 9);
    s.add(this.hemi, this.sun, this.sun.target, this.fire, this.spot, this.spot.target, this.red);

    const ground = mesh(new THREE.CircleGeometry(90, 64), std(0x3c5a33), 0, 0, 0);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const plaza = mesh(new THREE.CircleGeometry(8.2, 48), std(0x7a6750), 0, 0.012, 0);
    plaza.rotation.x = -Math.PI / 2;
    plaza.castShadow = false;
    for (let i = 0; i < 6; i++) {
      const path = mesh(new THREE.PlaneGeometry(2.2, 9), std(0x7a6750), 0, 0.011, 0);
      const a = (i / 6) * Math.PI * 2 + 0.3;
      path.position.set(Math.sin(a) * 11.5, 0.011, Math.cos(a) * 11.5);
      path.rotation.set(-Math.PI / 2, 0, -a);
      path.castShadow = false;
    }

    // campfire
    const stone = std(0x8a8f99);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      mesh(new THREE.DodecahedronGeometry(0.26 + rand() * 0.08), stone, Math.sin(a) * 0.95, 0.15, Math.cos(a) * 0.95).rotation.set(rand() * 3, rand() * 3, 0);
    }
    const wood = std(0x5a3d26);
    for (let i = 0; i < 4; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 6), wood, 0, 0.42, 0);
      log.rotation.set(0.95, (i / 4) * Math.PI * 2, 0, 'YXZ');
    }
    this.flames = [0xff5a1f, 0xff9a2a, 0xffe07a].map((col, i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.13, 1.5 - i * 0.3, 7), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92 }));
      f.position.y = 0.95 - i * 0.12;
      s.add(f);
      return f;
    });
    const eg = new THREE.BufferGeometry();
    this.emberPos = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) this.emberPos.set([(rand() - 0.5) * 0.8, rand() * 5, (rand() - 0.5) * 0.8], i * 3);
    eg.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    s.add(this.embers);
    // log benches
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const b = mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 8), wood, Math.sin(a) * 2.6, 0.28, Math.cos(a) * 2.6);
      b.rotation.set(0, a, Math.PI / 2, 'YXZ');
    }

    // cottages
    this.winMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc35a, emissiveIntensity: 1 });
    const roofs = [0x8c3b2e, 0x4a5a7a, 0x6a4a32, 0x7a3550, 0x3f6a5a];
    const walls = [0xd8c7a3, 0xcbb894, 0xe2d6bb];
    const graveAngle = Math.atan2(GRAVE.x, GRAVE.z);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.2;
      let d = Math.abs(a - ((graveAngle + Math.PI * 2) % (Math.PI * 2)));
      d = Math.min(d, Math.PI * 2 - d);
      if (d < 0.42) continue;
      const rad = 14.5 + rand() * 2.5;
      const h = new THREE.Group();
      h.position.set(Math.sin(a) * rad, 0, Math.cos(a) * rad);
      h.rotation.y = a + Math.PI + (rand() - 0.5) * 0.3;
      const w = 3.4 + rand() * 0.8, dpt = 3.2 + rand() * 0.6, ht = 2.4 + rand() * 0.5;
      mesh(new THREE.BoxGeometry(w, ht, dpt), std(walls[i % 3]), 0, ht / 2, 0, h);
      const roof = mesh(new THREE.ConeGeometry(Math.max(w, dpt) * 0.82, 1.9, 4), std(roofs[i % roofs.length]), 0, ht + 0.95, 0, h);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1, 1, dpt / w);
      mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), std(0x6b6b70), w * 0.25, ht + 1.3, -dpt * 0.15, h);
      mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), wood, 0, 0.8, dpt / 2 + 0.02, h);
      [-1, 1].forEach(sx => { const win = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), this.winMat, sx * w * 0.3, 1.5, dpt / 2 + 0.02, h); win.castShadow = false; });
      const sw = mesh(new THREE.BoxGeometry(0.1, 0.7, 0.7), this.winMat, w / 2 + 0.02, 1.5, 0, h);
      sw.castShadow = false;
      s.add(h);
    }

    // forest
    const N = 190;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), wood, N);
    const leafA = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 2.6, 7), std(0x24452c), N);
    const leafB = new THREE.InstancedMesh(new THREE.ConeGeometry(1.05, 2.2, 7), std(0x2e5636), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.treeSpots = [];
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, rad = 21 + Math.pow(rand(), 1.4) * 42, sc = 0.9 + rand() * 1.3;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
      if (rad < 30) this.treeSpots.push([x, z]);
      m4.compose(V(x, 0.8 * sc, z), q, V(sc, sc, sc)); trunk.setMatrixAt(i, m4);
      m4.compose(V(x, 2.7 * sc, z), q, V(sc, sc, sc)); leafA.setMatrixAt(i, m4);
      m4.compose(V(x, 4.2 * sc, z), q, V(sc, sc, sc)); leafB.setMatrixAt(i, m4);
    }
    [trunk, leafA, leafB].forEach(m => { m.castShadow = true; s.add(m); });

    // graveyard
    const iron = std(0x2b2d33);
    for (let i = 0; i < 14; i++) {
      const along = i < 7;
      const k = (i % 7) - 3;
      const px = GRAVE.x + (along ? k * 1.25 : -4.4), pz = GRAVE.z + (along ? -3.0 : k * 0.9);
      mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), iron, px, 0.6, pz);
    }
    mesh(new THREE.BoxGeometry(8.9, 0.07, 0.07), iron, GRAVE.x - 0.05, 1.0, GRAVE.z - 3.0);
    mesh(new THREE.BoxGeometry(0.07, 0.07, 6.4), iron, GRAVE.x - 4.4, 1.0, GRAVE.z);
    const dead = mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.4, 5), std(0x2b2520), GRAVE.x - 3.4, 1.7, GRAVE.z - 2.2);
    dead.rotation.z = 0.12;
    const branch = mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.6, 4), std(0x2b2520), GRAVE.x - 2.9, 2.9, GRAVE.z - 2.2);
    branch.rotation.z = -1.0;
    this.tombGeo = new THREE.BoxGeometry(0.62, 0.95, 0.2);
    this.tombMat = std(0x9aa0aa);
    this.tombs = new Map();

    // sky
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c9, fog: false, transparent: true }));
    this.moon.position.set(-42, 46, -90);
    s.add(this.moon);
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = rand() * Math.PI * 2, e = 0.12 + rand() * 1.3;
      sp.set([Math.cos(a) * Math.cos(e) * 220, Math.sin(e) * 220, Math.sin(a) * Math.cos(e) * 220], i * 3);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: true, fog: false, transparent: true, depthWrite: false }));
    s.add(this.stars);

    // cutscene props
    this.eyes = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false, transparent: true, opacity: 0 });
    this.eyeMat = eyeMat;
    this.treeSpots.slice(0, 26).forEach(([x, z]) => {
      [-0.16, 0.16].forEach(dx => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), eyeMat); e.position.set(x * 0.86 + dx, 1.15 + (x % 0.4), z * 0.86); this.eyes.add(e); });
    });
    s.add(this.eyes);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8dffc0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    s.add(this.dome);
    this.wisp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.9 }));
    this.wisp.add(new THREE.PointLight(0x9fd0ff, 3, 7));
    this.wisp.visible = false;
    s.add(this.wisp);
    const cg = new THREE.BufferGeometry();
    this.confPos = new Float32Array(260 * 3);
    this.confVel = new Float32Array(260 * 3);
    const cc = new Float32Array(260 * 3);
    const col = new THREE.Color();
    for (let i = 0; i < 260; i++) { col.setHSL(rand(), 0.9, 0.6); cc.set([col.r, col.g, col.b], i * 3); }
    cg.setAttribute('position', new THREE.BufferAttribute(this.confPos, 3));
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    s.add(this.confetti);
    this.voteLines = new THREE.Group();
    s.add(this.voteLines);
  }

  // ---------------------------------------------------------------- moods
  setMood(name, dur = 2) {
    const from = { ...this.mood }, to = MOODS[name];
    if (this.moodName === name) return;
    this.moodName = name;
    const ca = new THREE.Color(), cb = new THREE.Color();
    const tw = this.tween(dur, t => {
      for (const k in to) {
        if (k === 'sunPos') this.mood.sunPos = to.sunPos.map((v, i) => from.sunPos[i] + (v - from.sunPos[i]) * t);
        else if (['sky', 'hemiSky', 'hemiGnd', 'sun', 'moonCol'].includes(k)) this.mood[k] = ca.set(from[k]).lerp(cb.set(to[k]), t).getHex();
        else this.mood[k] = from[k] + (to[k] - from[k]) * t;
      }
      this.applyMood();
    }, ease);
    tw.keep = true; // lighting keeps blending even if a cutscene is skipped
  }
  applyMood() {
    const m = this.mood;
    this.scene.background.set(m.sky);
    this.scene.fog.color.set(m.sky);
    this.scene.fog.density = m.fogD;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGnd);
    this.hemi.intensity = m.hemi;
    this.sun.color.set(m.sun);
    this.sun.intensity = m.sunI;
    this.sun.position.set(...m.sunPos);
    this.winMat.emissiveIntensity = m.win * 1.6;
    this.stars.material.opacity = m.stars;
    this.moon.material.opacity = m.moon;
    this.moon.material.color.set(m.moonCol);
    this.moon.visible = m.moon > 0.02;
  }

  // ------------------------------------------------------ timing helpers
  tween(dur, fn, easing = t => t) {
    const tw = { t: 0, dur: Math.max(dur, 0.0001), fn, easing, id: this.cutId };
    this.tweens.push(tw);
    return tw;
  }
  wait(sec, id) {
    return new Promise((res, rej) => this.waits.push({ t: sec, res, rej, id }));
  }
  camTo(pos, look, dur, easing = ease) {
    const p0 = this.camera.position.clone(), l0 = this.look.clone();
    this.tween(dur, t => { this.camera.position.lerpVectors(p0, pos, t); this.look.lerpVectors(l0, look, t); }, easing);
  }
  camCut(pos, look) { this.camera.position.copy(pos); this.look.copy(look); }
  homeCam() {
    const portrait = this.camera.aspect < 0.9;
    return portrait ? V(0, 12, 23) : V(0, 7, 14);
  }

  // ---------------------------------------------------------- characters
  setPlayers(players, youId, extras = false) {
    if (!extras && this.extras) { this.actors.forEach(a => a.dispose()); this.actors.clear(); this.extras = false; }
    this.extras = extras;
    const ids = new Set(players.map(p => p.id));
    for (const [id, a] of this.actors) if (!ids.has(id)) { a.dispose(); this.actors.delete(id); }
    const n = players.length;
    const you = Math.max(0, players.findIndex(p => p.id === youId));
    players.forEach((p, i) => {
      let a = this.actors.get(p.id);
      const fresh = !a;
      if (fresh) { a = new Actor(this, p); this.actors.set(p.id, a); }
      // you stand nearest the camera, everyone else around the fire
      const ang = ((i - you) / n) * Math.PI * 2;
      const moved = !a.home.equals(this.tmp.set(Math.sin(ang) * RING, 0, Math.cos(ang) * RING));
      a.home.copy(this.tmp);
      a.spot = V(GRAVE.x + ((i % 5) - 2) * 1.5, 0, GRAVE.z + (i < 5 ? 0.6 : -1.3));
      if (fresh || (moved && a.state !== 'ghost')) { a.root.position.copy(a.home); a.face(0, 0); }
      if (fresh && !extras && this.state) a.emote('Cheer');
      a.label.hidden = extras;
    });
  }

  // Apply the latest game state directly. Cutscenes own the stage while they
  // run, so during one this only remembers the state for afterwards.
  sync(state, targets, sel) {
    if (state) this.state = state;
    if (targets) { this.targets = targets; this.sel = sel; }
    const S = this.state;
    if (!S) return;
    this.setPlayers(S.players, S.you.id);
    this.updateLabels();
    if (this.cine) return;
    const playing = !['lobby', 'over'].includes(S.phase);
    const snap = this.lastPhase == null;
    S.players.forEach(p => {
      const a = this.actors.get(p.id);
      const dead = !p.alive && S.phase !== 'lobby';
      a.setWolf(p.role === 'werewolf' && (dead || S.phase === 'over'));
      let st = 'stand';
      if (dead) st = 'ghost';
      else if (S.phase === 'night') st = 'sleep';
      else if (S.phase === 'over') st = p.won ? 'cheer' : S.winner === 'werewolf' ? 'cower' : 'stand';
      a.settle(st, snap);
      this.tomb(p, dead);
    });
    const mood = S.phase === 'night' ? 'night' : ['dawn', 'day', 'vote', 'verdict'].includes(S.phase) ? 'day'
      : S.phase === 'over' ? (S.winner === 'werewolf' ? 'blood' : S.winner === 'jester' ? 'dusk' : 'day') : 'dusk';
    this.setMood(mood, snap ? 0.01 : 2.5);
    if (S.phase === 'night' && this.lastPhase && this.lastPhase !== 'night') {
      this.sfx.howl();
      this.ui.toast(`Night ${S.round} falls on Hollowmoon`);
    }
    this.lastPhase = S.phase;
    this.spin = S.phase !== 'vote';
    this.drawVotes(playing ? S : null);
  }
  reset() { this.state = null; this.lastPhase = null; this.skip(); this.drawVotes(null); this.tombs.forEach(t => this.scene.remove(t)); this.tombs.clear(); }

  tomb(p, on) {
    let t = this.tombs.get(p.id);
    if (on && !t) {
      const a = this.actors.get(p.id);
      t = new THREE.Mesh(this.tombGeo, this.tombMat);
      t.position.set(a.spot.x, 0.47, a.spot.z - 0.75);
      t.rotation.z = (a.spot.x % 0.2) - 0.1;
      t.castShadow = true;
      this.scene.add(t);
      this.tombs.set(p.id, t);
    } else if (!on && t) { this.scene.remove(t); this.tombs.delete(p.id); }
  }

  updateLabels() {
    const S = this.state;
    if (!S) return;
    const votes = {};
    const showVotes = S.phase === 'vote' || S.phase === 'verdict';
    if (showVotes) S.players.forEach(p => { if (p.alive && p.vote && p.vote !== 'skip') votes[p.vote] = (votes[p.vote] || 0) + (p.id === S.blessed ? 2 : 1); });
    S.players.forEach(p => {
      const a = this.actors.get(p.id);
      if (!a) return;
      const dead = !p.alive && S.phase !== 'lobby';
      const can = this.targets.has(p.id);
      const tags = (p.id === S.you.id ? ' (you)' : '') + (p.id === S.blessed && p.alive && S.phase !== 'over' ? ' ✨' : '') + (p.isBot || p.connected ? '' : ' ⚠');
      const key = [p.name, tags, votes[p.id] || 0, dead, can, this.sel === p.id, p.ready, p.won].join('|');
      if (a.labelKey === key) return;
      a.labelKey = key;
      a.label.replaceChildren();
      const dot = document.createElement('i');
      dot.style.background = p.color;
      a.label.append(dot, document.createTextNode(p.name + tags));
      if (votes[p.id]) { const b = document.createElement('b'); b.textContent = votes[p.id]; a.label.append(b); }
      if (p.won) a.label.append(document.createTextNode(' 🏆'));
      a.label.className = 'label' + (dead ? ' dead' : '') + (can ? ' can' : '') + (this.sel === p.id ? ' sel' : '') + (p.id === S.you.id ? ' me' : '');
      a.label.disabled = !can;
      a.ring.material.opacity = this.sel === p.id ? 1 : can ? 0.85 : 0.5;
      a.ring.material.color.set(this.sel === p.id ? 0xffd34d : p.color);
      a.ring.scale.setScalar(this.sel === p.id ? 1.3 : 1);
    });
  }

  drawVotes(S) {
    const key = S && S.phase === 'vote' ? S.players.map(p => (p.alive ? p.vote || '' : '')).join(',') : '';
    if (key === this.voteKey) return;
    const before = (this.voteKey || '').split(',');
    this.voteKey = key;
    this.voteLines.clear();
    if (!key) return;
    S.players.forEach((p, i) => {
      if (!p.alive || !p.vote || p.vote === 'skip') return;
      const a = this.actors.get(p.id), b = this.actors.get(p.vote);
      if (!a || !b) return;
      if (before[i] !== p.vote && !this.cine) { a.face(b.home.x, b.home.z); a.emote('Spellcast_Shoot'); this.sfx.tick(); }
      const mid = a.home.clone().add(b.home).multiplyScalar(0.5);
      mid.y = 3.4;
      const curve = new THREE.QuadraticBezierCurve3(a.home.clone().setY(1.7), mid, b.home.clone().setY(2.3));
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.035, 5), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85 }));
      this.voteLines.add(line);
    });
  }

  say(pid, text, targetPid) {
    const a = this.actors.get(pid);
    if (!a || a.ghost) return;
    a.bubble.textContent = text;
    a.bubble.hidden = false;
    clearTimeout(a.bubbleTimer);
    a.bubbleTimer = setTimeout(() => { a.bubble.hidden = true; if (!this.cine && a.state === 'stand') a.face(0, 0); }, 3200 + text.length * 45);
    this.sfx.pop();
    if (this.cine) return;
    const t = targetPid && this.actors.get(targetPid);
    if (t) { a.face(t.home.x, t.home.z); a.emote('Spellcast_Shoot'); } else a.emote('Interact');
  }

  // ------------------------------------------------------------ cutscenes
  async cut(name, d) {
    this.skip();
    const id = ++this.cutId;
    this.cine = true;
    this.controls.enabled = false;
    this.look.copy(this.controls.target);
    this.ui.cinema(true);
    this.drawVotes(null);
    const w = async sec => { await this.wait(sec, id); };
    try { await this[`scene_${name}`](d, w); } catch (e) { if (e !== CANCEL) console.error(e); }
    if (id !== this.cutId) return; // a newer cutscene or a skip took over
    this.endCine();
  }
  skip() {
    if (!this.cine) return;
    this.cutId++;
    this.waits.splice(0).forEach(x => x.rej(CANCEL));
    this.tweens = this.tweens.filter(t => t.keep);
    this.endCine(true);
  }
  endCine(fast) {
    this.cine = false;
    this.ui.cinema(false);
    this.ui.caption('');
    this.spot.intensity = 0;
    this.red.intensity = 0;
    this.eyeMat.opacity = 0;
    this.dome.material.opacity = 0;
    this.wisp.visible = false;
    this.actors.forEach(a => { a.state = ''; }); // force everyone back to where the game says they are
    const snap = this.lastPhase;
    this.lastPhase = null;
    this.sync();
    this.lastPhase = this.state ? this.state.phase : snap;
    this.look.set(0, 1.3, 0);
    this.controls.target.copy(this.look);
    if (fast) this.camera.position.copy(this.homeCam());
    else this.camTo(this.homeCam(), V(0, 1.3, 0), 1.2);
    this.controls.enabled = true;
    this.controls.autoRotate = this.spin;
  }
  ringCam(actor, dist, height, side = 0) {
    // a camera spot between the fire and an actor, looking at them
    const dir = actor.home.clone().setY(0).normalize();
    const tangent = V(-dir.z, 0, dir.x);
    return actor.home.clone().sub(dir.multiplyScalar(dist)).add(tangent.multiplyScalar(side)).setY(height);
  }
  burst(at) {
    for (let i = 0; i < 260; i++) {
      this.confPos.set([at.x, at.y + 2.5, at.z], i * 3);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      this.confVel.set([Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp], i * 3);
    }
    this.confetti.visible = true;
    this.confLife = 5;
  }

  async scene_intro(d, w) {
    this.setMood('dusk', 0.01);
    this.actors.forEach(a => { a.state = ''; a.settle('stand', true); });
    this.camCut(V(26, 34, 52), V(0, 4, 0));
    this.camTo(V(3, 5.5, 13.5), V(0, 1.5, 0), 6.2, easeOut);
    this.ui.caption('The village of Hollowmoon', 'title');
    await w(2.8);
    this.sfx.howl();
    this.ui.caption(`${d.n} villagers gather at the fire.\n${d.wolves === 1 ? 'One of them is a werewolf.' : d.wolves + ' of them are werewolves.'}`);
    this.tween(1.2, t => { this.eyeMat.opacity = Math.sin(t * Math.PI) * 0.9; });
    await w(3.6);
  }

  async scene_dawn(d, w) {
    const victim = d.killed && this.actors.get(d.killed);
    // 1. something in the trees
    this.camCut(V(8.6, 1.1, 7.8), V(0, 1.6, 0));
    this.camTo(V(6.6, 1.5, 5.4), V(0, 1.0, 0), 3.4, t => t);
    this.tween(3.2, t => { this.eyeMat.opacity = Math.sin(t * Math.PI) * 0.95; });
    this.ui.caption('Something stirred in the dark…');
    this.sfx.heartbeat(0.7);
    await w(1.2); this.sfx.heartbeat(0.8);
    await w(1.1); this.sfx.heartbeat(0.9);
    await w(1.0);
    // 2. creeping around the sleepers
    this.ui.caption('');
    const a0 = Math.atan2(this.camera.position.x, this.camera.position.z);
    this.tween(2.8, t => {
      const a = a0 + t * 1.7;
      this.camera.position.set(Math.sin(a) * 8.6, 2.9 - t * 0.6, Math.cos(a) * 8.6);
      this.look.set(0, 0.8, 0);
    }, ease);
    for (let i = 0; i < 5; i++) { this.sfx.heartbeat(1); await w(0.56 - i * 0.03); }
    // 3. the strike
    if (victim) {
      victim.state = '';
      victim.settle('stand', true);
      const chest = victim.home.clone().setY(1.5);
      this.camCut(this.ringCam(victim, 3.3, 1.6, 0.9), chest);
      this.camTo(this.ringCam(victim, 2.5, 1.5, 0.5), chest, 3.2, easeOut);
      this.red.position.copy(victim.home).setY(2);
      await w(0.35);
      this.sfx.slash();
      this.ui.slash();
      this.ui.flash('#b00010', 500);
      this.red.intensity = 26;
      this.tween(1.6, t => { this.red.intensity = 26 * (1 - t); });
      victim.play('Hit_A', { once: true, fade: 0.05, then: () => victim.play('Death_A', { once: true }) });
      await w(1.0);
      this.ui.caption(`${d.name} was killed in the night.`, 'bad');
      this.camTo(this.ringCam(victim, 3.4, 2.6, 0.3), victim.home.clone().setY(0.5), 2.2);
      await w(2.3);
      this.sfx.sting('sad');
      this.ui.caption(`${d.name} was ${d.roleText}`, 'role ' + d.role);
      await w(2.3);
    } else {
      this.camCut(V(7.5, 4.2, 7.5), V(0, 1.2, 0));
      this.camTo(V(6, 3.6, 6), V(0, 1.2, 0), 4, easeOut);
      await w(0.3);
      this.sfx.slash();
      this.ui.slash();
      this.ui.flash('#b00010', 350);
      await w(0.55);
      this.sfx.chime();
      this.tween(2.4, t => { this.dome.scale.setScalar(1 + easeOut(t) * 7); this.dome.material.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.4; });
      this.ui.caption('The wolves struck…', 'bad');
      await w(1.7);
      this.ui.caption('…but the Doctor was there.\nNo one died.', 'good');
      await w(3.4);
    }
    // 4. sunrise
    this.ui.caption('');
    this.setMood('day', 2.6);
    this.sfx.bell();
    this.camTo(V(2, 6.5, 13.5), V(0, 1.3, 0), 2.6);
    this.actors.forEach(a => { if (a.state === 'sleep') { a.state = 'stand'; a.seq('Lie_StandUp', 'Idle'); } });
    if (victim) this.rise(victim);
    await w(1.2);
    const blessed = d.blessed && this.actors.get(d.blessed);
    if (blessed) {
      this.ui.caption(`The spirits bless ${d.blessedName}.\nTheir vote counts double today.`, 'spirit');
      this.wisp.visible = true;
      const from = GRAVE.clone().setY(2.2), to = blessed.home.clone().setY(2.9);
      this.tween(1.5, t => { this.wisp.position.lerpVectors(from, to, t).y += Math.sin(t * Math.PI) * 2.5; }, ease);
      this.sfx.chime();
      await w(2.2);
    } else await w(1.2);
  }
  // a body becomes a ghost and drifts to the graveyard
  rise(actor) {
    actor.setGhost(true);
    actor.state = 'ghost';
    actor.play('Idle', { fade: 0.6 });
    const from = actor.root.position.clone();
    this.tween(2.4, t => { actor.root.position.lerpVectors(from, actor.spot, t).y = Math.sin(t * Math.PI) * 2.2; actor.face(0, 0); }, ease);
  }

  async scene_verdict(d, w) {
    const alive = d.alive.map(id => this.actors.get(id)).filter(Boolean);
    const cut = d.cut && this.actors.get(d.cut);
    this.setMood('dark', 1.2);
    this.ui.caption('The village has decided…');
    this.camTo(V(0, 11, 9), V(0, 0.8, 0), 4.6, ease);
    this.spot.intensity = 0;
    this.tween(0.8, t => { this.spot.intensity = 170 * t; });
    this.sfx.drumroll(4.4);
    // the spotlight hunts around the circle, slowing down
    const hops = 13;
    let idx = Math.floor(Math.random() * alive.length);
    const endIdx = cut ? alive.indexOf(cut) : idx;
    idx = ((endIdx - (hops - 1)) % alive.length + alive.length * hops) % alive.length;
    for (let i = 0; i < hops; i++) {
      const a = alive[(idx + i) % alive.length];
      this.spot.target.position.copy(a.home);
      this.sfx.tick();
      await w(0.14 + Math.pow(i / hops, 2.2) * 0.62);
    }
    if (!cut) {
      this.tween(0.8, t => { this.spot.intensity = 170 * (1 - t); });
      this.setMood('day', 2);
      this.sfx.sting('calm');
      this.ui.caption(d.voted ? 'The vote is split.\nNo one is banished today.' : 'Nobody raised a hand.\nNo one is banished today.');
      this.camTo(V(2, 6.5, 13.5), V(0, 1.3, 0), 2.5);
      await w(3.6);
      return;
    }
    this.sfx.boom();
    const chest = cut.home.clone().setY(1.6);
    this.camCut(this.ringCam(cut, 4.2, 2.0, -1.0), chest);
    this.camTo(this.ringCam(cut, 2.7, 1.6, -0.4), chest, 5, easeOut);
    this.ui.caption(`${d.name} is banished.`, 'bad');
    alive.forEach(a => { if (a !== cut) a.face(cut.home.x, cut.home.z); });
    await w(2.4);
    this.ui.caption(`${d.name} was ${d.roleText}`, 'role ' + d.role);
    if (d.role === 'werewolf') {
      this.sfx.howl();
      this.sfx.sting('evil');
      this.ui.flash('#b00010', 400);
      cut.setWolf(true);
      this.red.position.copy(cut.home).setY(2.4);
      this.red.intensity = 22;
      cut.play('Spellcast_Raise', { once: true });
      alive.forEach(a => { if (a !== cut) a.play('Cheer'); });
      await w(2.6);
      this.tween(1, t => { this.red.intensity = 22 * (1 - t); });
      cut.play('Death_A', { once: true });
      this.sfx.sting('good');
    } else if (d.role === 'jester') {
      this.sfx.sting('jester');
      cut.play('Cheer');
      this.burst(cut.home);
      alive.forEach(a => { if (a !== cut) a.play('Hit_B', { once: true, then: () => a.play('Idle') }); });
      await w(3.4);
      return; // the game ends here; the ending scene follows
    } else {
      this.sfx.sting('sad');
      cut.play('Hit_B', { once: true, then: () => cut.play('Death_B', { once: true }) });
      await w(2.8);
    }
    await w(0.8);
    this.ui.caption('');
    this.tween(0.8, t => { this.spot.intensity = 170 * (1 - t); });
    this.setMood('day', 2);
    this.rise(cut);
    alive.forEach(a => { if (a !== cut) { a.play('Idle'); a.face(0, 0); } });
    this.camTo(V(-3, 6.5, 13), V(-2, 1.3, -1), 2.4);
    await w(2.4);
  }

  async scene_over(d, w) {
    const S = this.state;
    this.cine = false; // let the final state place everyone, then hold the camera
    this.actors.forEach(a => { a.state = ''; });
    this.lastPhase = 'over';
    this.sync();
    this.cine = true;
    const win = S.players.filter(p => p.won).map(p => this.actors.get(p.id));
    const focus = win.find(a => a && !a.ghost) || win[0];
    if (d.winner === 'werewolf') {
      this.sfx.howl();
      this.sfx.sting('evil');
      this.ui.flash('#b00010', 600);
      this.ui.caption('The werewolves win', 'title bad');
    } else if (d.winner === 'jester') {
      this.sfx.sting('jester');
      this.ui.caption('The Jester wins', 'title jester');
    } else {
      this.sfx.sting('good');
      this.sfx.bell();
      this.ui.caption('The village wins', 'title good');
    }
    if (focus) this.burst(focus.root.position);
    this.camCut(V(-9, 3, 9), V(0, 1.6, 0));
    this.tween(5.2, t => { const a = -0.8 + t * 1.1; this.camera.position.set(Math.sin(a) * 11, 3 + t * 1.5, Math.cos(a) * 11); }, ease);
    await w(2.6);
    if (d.winner !== 'jester' && focus) this.burst(V(0, 1, 0));
    await w(2.6);
  }

  // ---------------------------------------------------------------- frame
  // Slow device? Trade looks for speed, one step at a time.
  adapt(dt) {
    if (dt > 1) return; // tab was in the background
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
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 58 : 50;
    this.camera.updateProjectionMatrix();
    if (!this.cine && !this.userMoved) this.camera.position.copy(this.homeCam());
  }
  frame(dt) {
    this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const x = this.waits[i];
      if (x.id !== this.cutId) { this.waits.splice(i, 1); x.rej(CANCEL); } else if ((x.t -= dt) <= 0) { this.waits.splice(i, 1); x.res(); }
    }
    this.tweens = this.tweens.filter(tw => {
      if (!tw.keep && tw.id !== this.cutId) return false;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.easing(k));
      return k < 1;
    });
    if (this.cine) this.camera.lookAt(this.look); else this.controls.update();

    // fire
    const fl = 0.85 + Math.sin(this.time * 11) * 0.08 + Math.sin(this.time * 23.7) * 0.07;
    this.fire.intensity = this.mood.fire * fl * 26;
    this.flames.forEach((f, i) => { f.scale.set(1 + Math.sin(this.time * (9 + i * 3)) * 0.12, fl + Math.sin(this.time * (13 + i * 5)) * 0.15, 1); f.rotation.y += dt * (1 + i); });
    for (let i = 0; i < 60; i++) {
      let y = this.emberPos[i * 3 + 1] + dt * (0.8 + (i % 5) * 0.25);
      if (y > 5) y = 0.6;
      this.emberPos[i * 3 + 1] = y;
      this.emberPos[i * 3] += Math.sin(this.time * 2 + i) * dt * 0.15;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
    if (this.confetti.visible) {
      for (let i = 0; i < 260; i++) {
        this.confVel[i * 3 + 1] -= 7 * dt;
        for (let k = 0; k < 3; k++) this.confPos[i * 3 + k] += this.confVel[i * 3 + k] * dt;
        if (this.confPos[i * 3 + 1] < 0.05) { this.confPos[i * 3 + 1] = 0.05; this.confVel.fill(0, i * 3, i * 3 + 3); }
      }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      if ((this.confLife -= dt) < 0) this.confetti.visible = false;
    }

    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.actors.forEach(a => {
      a.update(dt, this.time);
      if (this.targets.has(a.id) && this.sel !== a.id) a.ring.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
      if (a.label.hidden && a.bubble.hidden) return;
      const p = a.headPos(this.tmp).project(this.camera);
      const off = p.z > 1 || p.z < -1;
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      a.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      a.label.style.visibility = off ? 'hidden' : '';
      a.bubble.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${(y - 26).toFixed(1)}px)`;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
