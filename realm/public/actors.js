// Things with bodies: heroes, people, monsters, horses — and the effects around them.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { A, character, part } from './assets.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// when a clip is missing, use the nearest thing that exists
const FALLBACK = { Walking_D_Skeletons: 'Walking_A', Running_C: 'Running_A', Idle_Combat: 'Idle', Taunt: 'Cheer', Death_C_Skeletons: 'Death_A', Spellcast_Summon: 'Spellcast_Raise',
  Skeletons_Awaken_Floor: 'Lie_Down', '1H_Melee_Attack_Jump_Chop': '1H_Melee_Attack_Chop', Unarmed_Idle: 'Idle', '2H_Melee_Idle': 'Idle' };

export class Actor {
  // spec: { model, gear, hat, tint, scale, ghost, name, crown }
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    this.root = new THREE.Group();
    this.scale = spec.scale || 1;
    this.actions = {};
    this.token = 0;
    this.kind = spec.model;
    this.mats = [];
    if (spec.model === 'horse' || spec.model === 'unicorn') this.buildHorse(spec);
    else if (spec.model === 'wolf') this.buildWolf();
    else if (spec.model === 'wyvern') this.buildWyvern();
    else if (spec.model === 'mimic') this.buildMimic();
    else {
      const c = character(spec.model, spec);
      if (c) {
        this.model = c.object;
        this.mats = c.mats;
        this.mixer = new THREE.AnimationMixer(this.model);
        c.clips.forEach(clip => { this.actions[clip.name] = this.mixer.clipAction(clip); });
        this.mixer.addEventListener('finished', e => { if (e.action.__done) e.action.__done(); });
        this.head = this.model.getObjectByName('head');
        if (spec.crown) { const cr = crown(); cr.position.y = 0.95; (this.head || this.model).add(cr); }
      } else {
        this.model = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1, 4, 10), new THREE.MeshStandardMaterial({ color: spec.tint || 0x888888 }));
        this.model.position.y = 0.95;
      }
      this.height = 2.5;
    }
    this.model.scale.multiplyScalar(this.scale);
    this.root.add(this.model);
    scene.add(this.root);
    this.play('Idle', { fade: 0 });
  }

  // ---- animation
  play(name, { fade = 0.18, once = false, then = null, speed = 1, force = false } = {}) {
    if (this.procedural) { this.pose = name; this.poseT = 0; if (once && then) setTimeout(then, 500); return; }
    let a = this.actions[name] || this.actions[FALLBACK[name]];
    if (!a) { if (once && then) setTimeout(then, 400); return; }
    const token = ++this.token;
    if (this.current === a && !once && !force) { a.timeScale = speed; return; }
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.__done = once && then ? () => { if (token === this.token) then(); } : null;
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    a.play();
    this.current = a;
    this.currentName = name;
  }
  once(name, speed = 1, back = 'Idle') { this.play(name, { once: true, speed, fade: 0.1, then: () => this.play(this.idle || back) }); }
  has(name) { return !!(this.actions[name] || this.actions[FALLBACK[name]]); }

  setTint(color, k = 1) { this.mats.forEach(m => { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).lerp(new THREE.Color(color), k); }); }
  clearTint() { this.mats.forEach(m => { if (m.userData.base) m.color.copy(m.userData.base); }); }
  flash(color = 0xffffff, ms = 120) {
    this.mats.forEach(m => { if (m.emissive) { m.emissive.set(color); m.emissiveIntensity = 0.9; } });
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => this.mats.forEach(m => { if (m.emissive) { m.emissive.set(this.spec.ghost ? 0x6f9cff : 0x000000); m.emissiveIntensity = this.spec.ghost ? 0.9 : 1; } }), ms);
  }
  setOpacity(o) { this.mats.forEach(m => { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; }); }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);
    if (this.procedural) this.animate(dt);
  }
  dispose() { this.scene.remove(this.root); }

  // ---- procedural bodies
  buildHorse(spec) {
    const src = A.models.horse;
    if (src) {
      this.model = src.clone();
      const unicorn = spec.model === 'unicorn';
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.material = o.material.clone();
        if (spec.tint || unicorn) o.material.color.set(unicorn ? 0xffffff : spec.tint);
        if (unicorn) { o.material.emissive = new THREE.Color(0x8fb8ff); o.material.emissiveIntensity = 0.25; }
        this.mats.push(o.material);
      });
      this.model.scale.setScalar(0.0155);
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip = A.clips.horse && A.clips.horse[0];
      if (clip) { this.gallop = this.mixer.clipAction(clip); this.gallop.play(); this.gallop.timeScale = 0; }
      if (unicorn) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd86a, emissiveIntensity: 0.8 }));
        horn.position.set(0, 3.15, 1.95);
        horn.rotation.x = 1.0;
        this.extra = horn;
      }
    } else {
      this.model = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x7a5534 }));
      this.model.position.y = 1.2;
    }
    this.height = 2.8;
    this.horse = true;
  }
  buildWolf() {
    const src = A.models.wolf;
    this.model = SkeletonUtils.clone(src);
    this.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      o.material.color.set(0x8a8f9a);
      this.mats.push(o.material);
    });
    this.model.scale.setScalar(0.03);
    this.mixer = new THREE.AnimationMixer(this.model);
    (A.clips.wolf || []).forEach(c => { this.actions[c.name] = this.mixer.clipAction(c); });
    const map = { Idle: 'Survey', Walking_A: 'Walk', Running_A: 'Run' };
    for (const [k, v] of Object.entries(map)) if (this.actions[v]) this.actions[k] = this.actions[v];
    this.height = 1.6;
  }
  buildWyvern() {
    const g = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x5a3a6a, roughness: 0.8, flatShading: true });
    const belly = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.9, flatShading: true });
    const wingM = new THREE.MeshStandardMaterial({ color: 0x7a3a4a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
    this.mats.push(hide, belly, wingM);
    const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    const body = add(new THREE.SphereGeometry(1.2, 10, 8), hide, 0, 2.4, 0); body.scale.set(1, 0.85, 1.9);
    add(new THREE.SphereGeometry(1.0, 8, 6), belly, 0, 2.1, 0.3).scale.set(0.8, 0.6, 1.6);
    const neck = new THREE.Group(); neck.position.set(0, 3.0, 2.0); g.add(neck);
    add(new THREE.CylinderGeometry(0.35, 0.55, 2.2, 7), hide, 0, 0.9, 0.5, neck).rotation.x = 0.9;
    const head = new THREE.Group(); head.position.set(0, 1.7, 1.4); neck.add(head);
    add(new THREE.BoxGeometry(0.8, 0.6, 1.5), hide, 0, 0, 0.4, head);
    add(new THREE.ConeGeometry(0.12, 0.7, 5), belly, -0.3, 0.45, -0.2, head).rotation.x = -0.9;
    add(new THREE.ConeGeometry(0.12, 0.7, 5), belly, 0.3, 0.45, -0.2, head).rotation.x = -0.9;
    const eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    add(new THREE.SphereGeometry(0.09, 6, 5), eye, -0.36, 0.15, 0.7, head); add(new THREE.SphereGeometry(0.09, 6, 5), eye, 0.36, 0.15, 0.7, head);
    const tail = new THREE.Group(); tail.position.set(0, 2.4, -2.0); g.add(tail);
    for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.5 - i * 0.08, 1.4, 6), hide, 0, -i * 0.05, -0.9 - i * 1.1, tail).rotation.x = -Math.PI / 2;
    add(new THREE.ConeGeometry(0.35, 0.9, 4), belly, 0, 0.1, -6.4, tail).rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.22, 0.16, 1.8, 6), hide, s * 0.8, 0.9, -0.4).rotation.z = s * 0.2; }
    this.wings = [-1, 1].map(s => {
      const w = new THREE.Group(); w.position.set(s * 0.9, 3.0, 0.4); g.add(w);
      const shape = new THREE.Shape([new THREE.Vector2(0, 0.8), new THREE.Vector2(s * 3.5, 1.4), new THREE.Vector2(s * 7, 0.2), new THREE.Vector2(s * 5, -0.8), new THREE.Vector2(s * 2.6, -1.6), new THREE.Vector2(0, -1.2)]);
      const m = add(new THREE.ShapeGeometry(shape), wingM, 0, 0, 0, w); m.rotation.x = -Math.PI / 2;
      add(new THREE.CylinderGeometry(0.12, 0.08, 7, 5), hide, s * 3.5, 0.05, 0.8, w).rotation.z = Math.PI / 2;
      return w;
    });
    this.parts = { neck, head, tail, body };
    this.model = g;
    this.procedural = true;
    this.height = 5;
    this.pose = 'Idle';
  }
  buildMimic() {
    const g = new THREE.Group();
    const chest = part('dungeon', 'chest', 0.8);
    g.add(chest);
    chest.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); this.mats.push(o.material); } });
    const teeth = new THREE.Group();
    const toothM = new THREE.MeshStandardMaterial({ color: 0xf4efe2, flatShading: true });
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), toothM); t.position.set(-0.55 + i * 0.14, 0.72 + s * 0.06, 0.58); t.rotation.x = s > 0 ? Math.PI : 0; teeth.add(t); }
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.9), new THREE.MeshStandardMaterial({ color: 0xd04060 }));
    tongue.position.set(0, 0.68, 0.8);
    teeth.add(tongue);
    teeth.visible = false;
    g.add(teeth);
    this.parts = { chest, teeth, tongue };
    this.model = g;
    this.procedural = true;
    this.height = 1.4;
    this.pose = 'Idle';
  }
  animate(dt) {
    this.poseT = (this.poseT || 0) + dt;
    const t = performance.now() / 1000;
    if (this.wings) {
      const flying = this.flying ?? 1, beat = this.pose === 'attack' ? 9 : flying ? 4.2 : 1.2;
      this.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (Math.sin(t * beat) * (flying ? 0.7 : 0.15) + (flying ? 0.1 : 0.9)); });
      this.parts.tail.rotation.y = Math.sin(t * 1.7) * 0.3;
      this.parts.neck.rotation.x = this.pose === 'attack' ? -0.5 + Math.sin(this.poseT * 12) * 0.3 : Math.sin(t * 1.3) * 0.08;
      this.parts.head.rotation.x = this.pose === 'roar' ? -0.6 : 0;
      if (this.pose === 'Death_A') { this.model.rotation.z = Math.min(1.5, this.poseT * 2); }
    }
    if (this.parts && this.parts.teeth) {
      const awake = this.pose !== 'Idle';
      this.parts.teeth.visible = awake;
      const hop = awake ? Math.abs(Math.sin(t * 9)) * 0.45 : 0;
      this.parts.chest.position.y = hop;
      this.parts.teeth.position.y = hop;
      this.parts.tongue.position.z = 0.8 + Math.sin(t * 14) * 0.15;
      if (this.pose === 'Death_A') { this.model.rotation.z = Math.min(1.6, this.poseT * 3); this.parts.teeth.visible = false; }
    }
  }
}

function crown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xff7a1a, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.3 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20), gold);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), gold); s.position.set(Math.cos(a) * 0.4, 0.17, Math.sin(a) * 0.4); g.add(s); }
  return g;
}
export { crown };

// ------------------------------------------------------------------- effects
export class FX {
  constructor(scene, layer, camera) {
    this.scene = scene;
    this.layer = layer; // HTML layer for floating text
    this.camera = camera;
    this.items = [];
    this.texts = [];
    this.tmp = V3(0, 0, 0);
    // a pool of particle bursts
    const n = 600;
    this.pPos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pCol = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.pNext = 0;
    this.pN = n;
  }
  burst(at, color = 0xffaa44, count = 24, speed = 5, up = 3) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const k = this.pNext++ % this.pN, a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2, s = speed * (0.4 + Math.random() * 0.8);
      this.pPos.set([at.x, at.y, at.z], k * 3);
      this.pVel.set([Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s], k * 3);
      this.pCol.set([c.r, c.g, c.b], k * 3);
      this.pLife[k] = 0.6 + Math.random() * 0.5;
    }
  }
  // floating words over a point in the world
  text(at, str, cls = '') {
    // stack words that start at the same spot instead of piling them up
    const near = this.texts.filter(t => t.t < 0.5 && t.at.distanceTo(at) < 1.5).length;
    if (this.texts.length > 24) { const old = this.texts.shift(); old.el.remove(); }
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = str;
    this.layer.append(el);
    this.texts.push({ el, at: at.clone(), t: 0, life: cls.includes('big') ? 1.6 : 1.15, dx: (Math.random() - 0.5) * 40, dy: near * 22 });
  }
  // a red circle on the ground that fills up before a big hit lands
  telegraph(at, radius, secs, color = 0xff3030) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    g.add(ring, fill);
    g.position.copy(at).add(V3(0, 0.12, 0));
    this.scene.add(g);
    this.items.push({ obj: g, t: 0, life: secs, tick: (k) => { fill.scale.setScalar(Math.max(0.01, k)); ring.material.opacity = 0.5 + Math.sin(k * 30) * 0.3; } });
    return g;
  }
  // a flying thing: { from, to | dir, speed, kind, onHit(pos), homing: target vector getter }
  projectile(p) {
    let mesh;
    if (p.kind === 'arrow' || p.kind === 'bolt') {
      mesh = A.kits.gear && A.kits.gear[p.kind === 'bolt' ? 'arrow' : 'Skeleton_Arrow'] ? A.kits.gear[p.kind === 'bolt' ? 'arrow' : 'Skeleton_Arrow'].clone() : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
      mesh.scale.setScalar(1.4);
      const holder = new THREE.Group(); holder.add(mesh); mesh.rotation.x = Math.PI / 2; mesh = holder;
    } else {
      const col = { fire: 0xff7a20, magic: 0xa070ff, green: 0x50ff9a, frost: 0x9fe8ff, ice: 0x9fe8ff }[p.kind] || 0xffaa44;
      mesh = new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'fire' ? 0.45 : 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: col }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(p.kind === 'fire' ? 0.9 : 0.45, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
      mesh.add(glow);
      p.trail = col;
    }
    mesh.position.copy(p.from);
    this.scene.add(mesh);
    const dir = p.dir ? p.dir.clone().normalize() : p.to.clone().sub(p.from).normalize();
    this.items.push({ obj: mesh, t: 0, life: p.life || 2.2, proj: p, dir, speed: p.speed || 30 });
  }
  update(dt, hitTest) {
    for (let k = 0; k < this.pN; k++) {
      if (this.pLife[k] <= 0) continue;
      this.pLife[k] -= dt;
      this.pVel[k * 3 + 1] -= 9 * dt;
      for (let i = 0; i < 3; i++) this.pPos[k * 3 + i] += this.pVel[k * 3 + i] * dt;
      if (this.pLife[k] <= 0) this.pPos[k * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.items = this.items.filter(it => {
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      if (it.tick) it.tick(k);
      if (it.proj) {
        const p = it.proj;
        if (p.homing) { const h = p.homing(); if (h) { const want = h.clone().sub(it.obj.position).normalize(); it.dir.lerp(want, Math.min(1, dt * 6)).normalize(); } }
        const step = it.dir.clone().multiplyScalar(it.speed * dt);
        it.obj.position.add(step);
        it.obj.lookAt(it.obj.position.clone().add(it.dir));
        if (p.trail && Math.random() < 0.7) this.burst(it.obj.position, p.trail, 2, 1, 0.5);
        const hit = hitTest(it.obj.position, p);
        if (hit || k >= 1) {
          if (p.onHit) p.onHit(it.obj.position.clone(), hit);
          this.scene.remove(it.obj);
          return false;
        }
        return true;
      }
      if (k >= 1) { this.scene.remove(it.obj); if (it.done) it.done(); return false; }
      return true;
    });
    const w = innerWidth, h = innerHeight;
    this.texts = this.texts.filter(tx => {
      tx.t += dt;
      const p = this.tmp.copy(tx.at).project(this.camera);
      const behind = p.z > 1;
      tx.el.style.transform = `translate(${((p.x * 0.5 + 0.5) * w + tx.dx * tx.t).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h - 60 * tx.t - (tx.dy || 0)).toFixed(1)}px) translate(-50%, -100%)`;
      tx.el.style.opacity = behind ? 0 : Math.min(1, 3 * (1 - tx.t / tx.life));
      if (tx.t >= tx.life) { tx.el.remove(); return false; }
      return true;
    });
  }
}
