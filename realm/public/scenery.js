// Builds the 3D realm from world.js: terrain, water, sky, forests, buildings, the Barrow.
import * as THREE from 'three';
import { HALF, height, groundColor, fbm, rng, roadDist, riverDist, SITES, BUILDINGS, PROPS, FENCES, PALISADE, DUNGEON, dTile, SHRINES } from './world.js';
import { A, part, baked, kitSize } from './assets.js';

const RES = 2; // terrain sample spacing
const N = (HALF * 2) / RES + 1;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Scenery {
  constructor(scene, physics) {
    this.scene = scene;
    this.phys = physics;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.anim = []; // things that move every frame: fn(dt, t)
    this.torches = []; // light sources: { pos, color, base, zone }
    this.spikes = [];
    // Only a few real lights exist; each frame they move to the light sources nearest you.
    this.lightPool = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffa050, 0, 20, 1.5); scene.add(l); return l; });
    this.time = 0.3;
  }

  build(onStep) {
    this.heightGrid();
    this.phys.heights = (x, z) => this.h(x, z);
    this.sky();
    this.terrain();
    this.water();
    this.nature();
    this.town();
    this.landmarks();
    this.dungeon();
    if (onStep) onStep();
  }

  // ---------------------------------------------------------------- terrain
  heightGrid() {
    this.H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.H[j * N + i] = height(-HALF + i * RES, -HALF + j * RES);
  }
  h(x, z) {
    const fx = (x + HALF) / RES, fz = (z + HALF) / RES;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const H = this.H;
    // match the mesh's triangles (PlaneGeometry splits each square along the same diagonal)
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  terrain() {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + HALF) / RES), j = Math.round((z + HALF) / RES);
      const y = this.H[j * N + i];
      pos.setY(k, y);
      const sx = this.H[j * N + Math.min(N - 1, i + 1)] - this.H[j * N + Math.max(0, i - 1)];
      const sz = this.H[Math.min(N - 1, j + 1) * N + i] - this.H[Math.max(0, j - 1) * N + i];
      const c = groundColor(x, z, y, Math.hypot(sx, sz) / (2 * RES));
      col.set(c, k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    this.group.add(m);
    this.terrainMesh = m;
    // beyond the ring of mountains: far peaks to fill the horizon
    const R = rng(77);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.2, d = 300 + R() * 40;
      const mtn = part('nature', ['mountain_A', 'mountain_B', 'mountain_C'][i % 3], 70 + R() * 40);
      mtn.position.set(Math.cos(a) * d, -6, Math.sin(a) * d);
      mtn.rotation.y = R() * 6;
      mtn.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0x9aa4b4 }); } });
      this.group.add(mtn);
    }
    const far = new THREE.Mesh(new THREE.RingGeometry(HALF * 0.98, 460, 48), new THREE.MeshLambertMaterial({ color: 0x4f5a4c }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = 30;
    this.group.add(far);
  }
  water() {
    const mat = new THREE.MeshPhongMaterial({ color: 0x2f7390, transparent: true, opacity: 0.8, shininess: 80, specular: 0x88aacc });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1), mat);
    w.rotation.x = -Math.PI / 2;
    w.position.y = -0.05;
    this.group.add(w);
    this.waterMat = mat;
    this.anim.push((dt, t) => { w.position.y = -0.05 + Math.sin(t * 0.8) * 0.04; });
  }

  // ---------------------------------------------------------------- sky and light
  sky() {
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: V3(0, 1, 0) }, sunCol: { value: new THREE.Color() } };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP;
        void main(){ float h = max(vP.y, 0.0); vec3 c = mix(bottom, top, pow(h, 0.6));
          float s = max(dot(vP, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), skyMat);
    this.scene.add(this.skyDome);
    const R = rng(5), sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) { const a = R() * Math.PI * 2, e = 0.08 + R() * 1.4; sp.set([Math.cos(a) * Math.cos(e) * 420, Math.sin(e) * 420, Math.sin(a) * Math.cos(e) * 420], i * 3); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf2f0ff, fog: false }));
    this.scene.add(this.moon);
    this.clouds = [];
    for (let i = 0; i < 22; i++) {
      const c = part('nature', i % 2 ? 'cloud_big' : 'cloud_small', 12 + R() * 10);
      c.position.set((R() - 0.5) * 700, 80 + R() * 40, (R() - 0.5) * 700);
      c.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0xf4f6ff, fog: false, transparent: true, opacity: 0.9 }); } });
      this.cloudMats = this.cloudMats || []; c.traverse(o => { if (o.isMesh) this.cloudMats.push(o.material); });
      this.scene.add(c);
      this.clouds.push(c);
    }
  }
  // t: 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk.  inside: the Barrow.
  setTime(t, focus, inside) {
    this.time = t;
    const ang = (t - 0.25) * Math.PI * 2;
    const sunDir = V3(Math.cos(ang) * 0.6, Math.sin(ang), Math.cos(ang) * 0.35 - 0.3).normalize();
    const day = THREE.MathUtils.smoothstep(sunDir.y, -0.12, 0.25);
    const dusk = Math.max(0, 1 - Math.abs(sunDir.y) / 0.3) * (sunDir.y > -0.2 ? 1 : 0);
    const c = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const top = c(0x070a1c, 0x3f86d6, day), bottom = c(0x141a33, 0xb9dcf2, day).lerp(new THREE.Color(0xf4a26a), dusk * 0.7);
    this.skyU.top.value.copy(top);
    this.skyU.bottom.value.copy(bottom);
    this.skyU.sunDir.value.copy(sunDir);
    this.skyU.sunCol.value.copy(c(0x000000, 0xfff0c8, day)).lerp(new THREE.Color(0xff8a40), dusk);
    this.dayK = day;
    const light = sunDir.y > 0 ? sunDir : V3(-sunDir.x, -sunDir.y, -sunDir.z); // the moon lights the night
    const f = focus || V3(0, 0, 0);
    this.sun.position.copy(f).addScaledVector(light, 90);
    this.sun.target.position.copy(f);
    this.sun.intensity = inside ? 0 : 0.35 + day * 2.0;
    this.sun.color.copy(c(0x8ea6ff, 0xfff1d8, day)).lerp(new THREE.Color(0xffa060), dusk * 0.6);
    this.hemi.intensity = inside ? 1.15 : 0.45 + day * 0.75;
    this.hemi.color.copy(inside ? new THREE.Color(0x9a90b0) : c(0x4a5c9a, 0xcfe3ff, day));
    this.hemi.groundColor.copy(inside ? new THREE.Color(0x40302a) : c(0x1a2018, 0x4a5a3a, day));
    const fogC = inside ? new THREE.Color(0x05060a) : bottom.clone().lerp(top, 0.15);
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = inside ? 0.028 : 0.0055 + (1 - day) * 0.004 + (this.swampFog || 0);
    this.skyDome.visible = this.stars.visible = this.moon.visible = !inside;
    this.clouds.forEach(cl => { cl.visible = !inside; });
    (this.cloudMats || []).forEach(m => m.color.copy(c(0x2a3048, 0xf4f6ff, day)).lerp(new THREE.Color(0xffc0a0), dusk * 0.5));
    this.stars.material.opacity = 1 - day;
    this.moon.position.copy(f).addScaledVector(V3(-sunDir.x, -sunDir.y, -sunDir.z), 400);
    this.moon.visible = !inside && sunDir.y < 0.1;
    this.skyDome.position.copy(f);
    this.stars.position.copy(f);
    const night = 1 - day;
    this.winMat && (this.winMat.emissiveIntensity = night * 1.6);
    this.lightK = inside ? 1 : Math.max(0.12, night);
    this.inside = inside;
  }

  // ---------------------------------------------------------------- nature
  nature() {
    const R = rng(1234);
    const groups = {}; // kit part → list of matrices
    const add = (name, x, z, s, rot, col) => {
      (groups[name] = groups[name] || []).push(new THREE.Matrix4().compose(V3(x, this.h(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rot), V3(s, s, s)));
      if (col) this.phys.circle(x, z, col);
    };
    const blocked = (x, z, pad) => {
      if (Math.max(Math.abs(x), Math.abs(z)) > HALF - 18) return true;
      if (roadDist(x, z) < 6 + pad || riverDist(x, z) < 10) return true;
      for (const k in SITES) { const s = SITES[k]; if (s.r && Math.hypot(x - s.x, z - s.z) < s.r + 6 + pad) return true; }
      if (Math.hypot(x - SITES.bridge.x, z - SITES.bridge.z) < 22) return true;
      const y = this.h(x, z);
      return y < 0.8 || Math.abs(this.h(x + 2, z) - y) > 1.6 || Math.abs(this.h(x, z + 2) - y) > 1.6;
    };
    for (let gx = -HALF + 20; gx < HALF - 20; gx += 7) for (let gz = -HALF + 20; gz < HALF - 20; gz += 7) {
      const x = gx + (R() - 0.5) * 6, z = gz + (R() - 0.5) * 6;
      const dens = fbm(x / 70 + 3, z / 70 - 5, 3);
      const forest = dens > 0.53, p = forest ? 0.8 : 0.05;
      if (R() > p || blocked(x, z, 0)) continue;
      const y = this.h(x, z), north = z < -120 || y > 14;
      const r = R();
      if (forest && r < 0.18 && !north) add(R() < 0.5 ? 'trees_A_large' : 'trees_B_large', x, z, 4.6 + R() * 1.4, R() * 6, 3.4);
      else if (forest && r < 0.3 && !north) add(R() < 0.5 ? 'trees_A_medium' : 'trees_B_medium', x, z, 4.4 + R() * 1.2, R() * 6, 2.6);
      else add(north || r < 0.62 ? 'tree_single_A' : 'tree_single_B', x, z, 5.4 + R() * 2.8, R() * 6, 0.55);
    }
    for (let i = 0; i < 520; i++) {
      const x = (R() - 0.5) * (HALF * 2 - 40), z = (R() - 0.5) * (HALF * 2 - 40);
      if (blocked(x, z, -3)) continue;
      const s = 5 + R() * R() * 16;
      add('rock_single_' + 'ABCDE'[Math.floor(R() * 5)], x, z, s, R() * 6, s > 9 ? s * 0.16 : 0);
    }
    for (const [name, mats] of Object.entries(groups)) this.instance('nature', name, mats);
    // grass tufts: one draw call
    const tuft = new THREE.ConeGeometry(0.18, 0.7, 3);
    tuft.translate(0, 0.35, 0);
    const gm = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ color: 0xffffff }), 9000);
    const m4 = new THREE.Matrix4(), cc = new THREE.Color();
    let n = 0;
    while (n < 9000) {
      const x = (R() - 0.5) * 420, z = (R() - 0.5) * 420, y = this.h(x, z);
      if (y < 0.6 || y > 18 || roadDist(x, z) < 3.5) continue;
      const s = 0.7 + R() * 0.9;
      m4.compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), R() * 3), V3(s, s * (0.8 + R()), s));
      gm.setMatrixAt(n, m4);
      gm.setColorAt(n, cc.setHSL(0.24 + R() * 0.07, 0.45, 0.28 + R() * 0.12));
      n++;
    }
    gm.receiveShadow = true;
    this.group.add(gm);
    // flowers around the glade and the village
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 5, 4), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), 900);
    for (let i = 0; i < 900; i++) {
      const s = i < 400 ? SITES.glade : SITES.village, a = R() * Math.PI * 2, d = (s === SITES.glade ? 18 : 60) * Math.sqrt(R());
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      m4.compose(V3(x, this.h(x, z) + 0.15, z), new THREE.Quaternion(), V3(1, 1, 1));
      fl.setMatrixAt(i, m4);
      fl.setColorAt(i, cc.set([0xffffff, 0xffe27a, 0xff9ad0, 0xa8c8ff][i % 4]));
    }
    this.group.add(fl);
  }
  // Instanced in chunks, so whole forests behind the camera are skipped.
  instance(kit, name, mats) {
    const chunks = new Map(), v = new THREE.Vector3();
    for (const m of mats) { v.setFromMatrixPosition(m); const k = Math.floor((v.x + HALF) / 90) * 16 + Math.floor((v.z + HALF) / 90); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(m); }
    for (const list of chunks.values()) for (const { geometry, material } of baked(kit, name)) {
      const im = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  // ---------------------------------------------------------------- buildings
  place(kit, name, x, z, rot, scale, opts = {}) {
    const o = part(kit, name, scale);
    const y = opts.y ?? this.groundUnder(kit, name, x, z, rot, scale);
    o.position.set(x, y, z);
    o.rotation.y = rot;
    this.group.add(o);
    if (opts.solid !== false) {
      const s = kitSize(kit, name);
      const k = opts.shrink ?? 0.86;
      const c = Math.cos(rot), sn = Math.sin(rot), ox = s.cx * scale, oz = s.cz * scale;
      const b = this.phys.box(x + ox * c + oz * sn, z - ox * sn + oz * c, (s.x * scale * k) / 2, (s.z * scale * k) / 2, rot);
      if (opts.low) b.low = true;
    }
    return o;
  }
  // sit a building on the lowest corner so it never floats
  groundUnder(kit, name, x, z, rot, scale) {
    const s = kitSize(kit, name), hx = (s.x * scale) / 2, hz = (s.z * scale) / 2;
    let m = Infinity;
    for (const [a, b] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]]) m = Math.min(m, this.h(x + a * Math.cos(rot) + b * Math.sin(rot), z - a * Math.sin(rot) + b * Math.cos(rot)));
    return m - 0.15;
  }
  town() {
    this.winMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc35a, emissiveIntensity: 0 });
    for (const [name, x, z, rot, s] of BUILDINGS) this.place('town', name, x, z, rot, s);
    for (const [name, x, z, rot, s] of PROPS) this.place('town', name, x, z, rot, s, { shrink: 0.8, low: true, solid: !/flag|sack|bucket/.test(name) });
    const fence = (x1, z1, x2, z2, kit = 'fence_wood_straight', sc = 3.2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), seg = 1.15 * sc, n = Math.max(1, Math.round(len / seg)), rot = Math.atan2(x2 - x1, z2 - z1);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
        const o = part('town', kit, sc);
        o.scale.z = (len / n) / 1.15;
        o.position.set(x, this.h(x, z) - 0.05, z);
        o.rotation.y = rot;
        this.group.add(o);
      }
      const b = this.phys.box((x1 + x2) / 2, (z1 + z2) / 2, 0.35, len / 2, rot);
      b.low = true;
    };
    for (const [a, b, c, d] of FENCES) fence(a, b, c, d);
    // the village wall: stone-and-timber segments with four open gates and torches at each
    const P = PALISADE, segs = 64;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      if (P.gates.some(g => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) < 0.1)) continue;
      fence(P.x + Math.cos(a0) * P.r, P.z + Math.sin(a0) * P.r, P.x + Math.cos(a1) * P.r, P.z + Math.sin(a1) * P.r, 'fence_wood_straight', 4.2);
    }
    for (const g of P.gates) for (const side of [-0.13, 0.13]) {
      const x = P.x + Math.cos(g + side) * P.r, z = P.z + Math.sin(g + side) * P.r;
      this.torch(x, this.h(x, z), z, 0xffa050, true);
    }
    // lamps around the square
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, x = Math.cos(a) * 14, z = 62 + Math.sin(a) * 14; this.torch(x, this.h(x, z), z, 0xffb060, i % 2 === 0); }
    // glowing windows: little emissive panes on the village houses
    const pane = new THREE.PlaneGeometry(1.1, 1.1);
    for (const [name, x, z, rot, s] of BUILDINGS) {
      if (!/home|tavern|church|blacksmith/.test(name)) continue;
      const sz = kitSize('town', name);
      for (const side of [-1, 1]) {
        const lx = side * sz.x * s * 0.2, lz = (sz.z * s) / 2 * 0.9 + 0.06;
        const w = new THREE.Mesh(pane, this.winMat);
        w.position.set(x + lx * Math.cos(rot) + lz * Math.sin(rot), this.groundUnder('town', name, x, z, rot, s) + sz.y * s * 0.28, z - lx * Math.sin(rot) + lz * Math.cos(rot));
        w.rotation.y = rot;
        this.group.add(w);
      }
    }
  }
  // a post with a fire on top; `light` adds a real light (used sparingly)
  torch(x, y, z, color = 0xffa050, light = false, mounted = false) {
    const t = part('dungeon', mounted ? 'torch_mounted' : 'torch_lit', mounted ? 1 : 1.6);
    t.position.set(x, y + (mounted ? 0 : 0.6), z);
    this.group.add(t);
    if (!mounted) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x4a3324 })); post.position.set(x, y + 0.3, z); this.group.add(post); }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), new THREE.MeshBasicMaterial({ color }));
    flame.position.set(x, y + (mounted ? 0.75 : 2.15), z);
    this.group.add(flame);
    this.anim.push((dt, tt) => { flame.scale.set(1, 0.8 + Math.sin(tt * 13 + x) * 0.25, 1); });
    if (light) this.torches.push({ pos: flame.position.clone(), color: new THREE.Color(color), base: 16, dist: 18, zone: x > 600 ? 'barrow' : 'world' });
    return flame;
  }

  // ---------------------------------------------------------------- landmarks
  landmarks() {
    // North Bridge: planks and rails over the river, walkable
    const B = SITES.bridge, len = 26, deck = Math.max(this.h(B.x, B.z - 15), this.h(B.x, B.z + 15)) + 0.4;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x4e3522, roughness: 0.9 });
    for (let i = 0; i < 20; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 1.15), i % 3 ? wood : dark); p.position.set(B.x, deck - 0.15, B.z - len / 2 + (i + 0.5) * (len / 20)); p.rotation.z = (Math.sin(i * 7) * 0.03); p.castShadow = p.receiveShadow = true; this.group.add(p); }
    for (const sx of [-2.9, 2.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, len), dark);
      rail.position.set(B.x + sx, deck + 1.0, B.z);
      this.group.add(rail);
      for (let i = 0; i <= 6; i++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), dark); post.position.set(B.x + sx, deck - 0.2, B.z - len / 2 + (i * len) / 6); post.castShadow = true; this.group.add(post); }
      this.phys.box(B.x + sx, B.z, 0.25, len / 2, 0).low = true;
    }
    this.phys.platform({ x: B.x, z: B.z, hw: 2.8, hd: len / 2, y: deck });
    this.bridgeDeck = deck;
    // the Moonlit Glade: a ring of standing stones
    const G = SITES.glade;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, x = G.x + Math.cos(a) * 11, z = G.z + Math.sin(a) * 11; this.place('dungeon', 'column', x, z, a, 1.6 + (i % 2) * 0.5); }
    // Wyvern Peak: a nest of rocks and bones on the summit
    const Pk = SITES.peak;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, x = Pk.x + Math.cos(a) * 15, z = Pk.z + Math.sin(a) * 15; if (i % 4 === 1) continue; this.place('nature', 'rock_single_' + 'ABCDE'[i % 5], x, z, a, 10 + (i % 3) * 3, { shrink: 0.7 }); }
    // the Barrow: a grassy mound with a stone door
    const Bw = SITES.barrow, by = this.h(Bw.x, Bw.z);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d5a32, flatShading: true }));
    mound.scale.y = 0.62;
    mound.position.set(Bw.x, by - 0.5, Bw.z - 12);
    mound.receiveShadow = true;
    this.group.add(mound);
    this.phys.circle(Bw.x, Bw.z - 12, 18.5);
    this.place('dungeon', 'wall_doorway', Bw.x, Bw.z + 4, 0, 1.2, { y: by - 0.1 });
    this.barrowGate = this.place('dungeon', 'wall_gated', Bw.x, Bw.z + 4.3, 0, 1.2, { y: by - 0.1, solid: false });
    for (const sx of [-6.5, 6.5]) { this.place('dungeon', 'pillar_decorated', Bw.x + sx, Bw.z + 4, 0, 1.15, { y: by - 0.1 }); this.torch(Bw.x + sx * 0.72, by, Bw.z + 6.5, 0x7dffb0, true); }
    for (const sx of [-12, 12]) this.place('dungeon', 'wall_broken', Bw.x + sx, Bw.z + 2.8, sx > 0 ? -0.35 : 0.35, 1.1, { y: by - 0.2 });
    this.barrowDoor = { x: Bw.x, z: Bw.z + 6.4 };
    // shrines
    this.shrineMeshes = {};
    for (const s of SHRINES) {
      const y = this.h(s.x, s.z);
      this.place('dungeon', 'column', s.x, s.z, 0, 1.3);
      const rune = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 24), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.35 }));
      rune.position.set(s.x, y + 2.6, s.z);
      this.group.add(rune);
      this.anim.push((dt, t) => { rune.rotation.y = t * 0.8; rune.position.y = y + 2.5 + Math.sin(t * 1.6 + s.x) * 0.15; });
      this.shrineMeshes[s.id] = rune;
    }
    // the swamp is foggier
    this.anim.push(() => {});
    // campfires: the keep, the warren, the village square
    for (const [x, z] of [[-140, 120], [152, 56], [-4, 60.5]]) this.campfire(x, z);
  }
  campfire(x, z) {
    const y = this.h(x, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x7d828c, flatShading: true });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), stone); r.position.set(x + Math.cos(a) * 0.9, y + 0.12, z + Math.sin(a) * 0.9); this.group.add(r); }
    const cols = [0xff5a1f, 0xff9a2a, 0xffe07a];
    cols.forEach((c, i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.12, 1.4 - i * 0.3, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
      f.position.set(x, y + 0.8 - i * 0.1, z);
      this.group.add(f);
      this.anim.push((dt, t) => { f.scale.set(1 + Math.sin(t * (9 + i * 3)) * 0.12, 0.85 + Math.sin(t * (13 + i * 5)) * 0.15, 1); f.rotation.y += dt * (1 + i); });
    });
    this.torches.push({ pos: V3(x, y + 1.4, z), color: new THREE.Color(0xff8a3c), base: 34, dist: 22, zone: 'world' });
    this.phys.circle(x, z, 1.1).low = true;
  }

  // ---------------------------------------------------------------- the Barrow
  dungeon() {
    const D = DUNGEON, map = D.map, T = D.tile;
    const at = (c, r) => (map[r] && map[r][c]) || '#';
    const floorish = ch => ch !== '#';
    this.rooms = [];
    for (let r = 0; r < map.length; r++) for (let c = 0; c < map[r].length; c++) {
      const ch = at(c, r);
      if (!floorish(ch)) continue;
      const [x, z] = dTile(c, r);
      this.place('dungeon', ch === 'C' || (c + r) % 5 ? 'floor_tile_large' : 'floor_tile_small_broken_A', x, z, 0, ch === 'C' || (c + r) % 5 ? 1 : 2, { y: 0, solid: false });
      if (ch === 'S') {
        const sp = part('dungeon', 'floor_tile_big_spikes', 1);
        sp.position.set(x, -2.2, z);
        this.group.add(sp);
        this.spikes.push({ mesh: sp, x, z, phase: (r % 2) * 0.5 });
      }
      if (ch === 'c') this.place('dungeon', 'trunk_large_A', x, z, Math.PI / 2, 1.6, { y: 0 });
      // walls on every edge that faces rock
      for (const [dc, dr, rot] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
        if (floorish(at(c + dc, r + dr))) continue;
        const wx = x + dc * T / 2, wz = z + dr * T / 2;
        const kind = (c * 7 + r * 3) % 9 === 0 ? 'wall_cracked' : (c + r) % 7 === 0 ? 'wall_window_closed' : 'wall';
        const w = part('dungeon', kind, 1);
        w.position.set(wx - dc * 0.08, 0, wz - dr * 0.08);
        w.rotation.y = rot;
        this.group.add(w);
        this.phys.box(wx - dc * 0.1, wz - dr * 0.1, dc ? 0.55 : 2.05, dr ? 0.55 : 2.05, 0);
        if ((c * 5 + r * 11) % 6 === 0) {
          const tx = wx - dc * 0.6, tz = wz - dr * 0.6;
          const fl = this.torch(tx, 2.2, tz, ch === 'T' ? 0x40ff90 : 0xffa050, false, true);
          fl.parent.children[fl.parent.children.length - 2].rotation.y = rot;
        }
      }
    }
    // a light in each room; more in the throne room
    const lights = [[11, 19, 0xffa050], [14, 13, 0xffa050], [18, 9, 0x9fc0ff], [12, 4, 0x40ff90], [16, 4, 0x40ff90], [14, 6, 0x40ff90], [10, 22, 0xffa050]];
    for (const [c, r, col] of lights) { const [x, z] = dTile(c, r); this.torches.push({ pos: V3(x, 3.4, z), color: new THREE.Color(col), base: 60, dist: 26, zone: 'barrow' }); }
    // throne room dressing
    for (const c of [11, 17]) for (const r of [2, 4, 6]) { const [x, z] = dTile(c, r); this.place('dungeon', 'pillar_decorated', x, z, 0, 1, { y: 0 }); }
    const [tx, tz] = dTile(14, 2);
    const stoneD = new THREE.MeshStandardMaterial({ color: 0x3c3f4a, roughness: 0.9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 2.6), stoneD); seat.position.set(tx, 0.6, tz); this.group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.2, 0.7), stoneD); back.position.set(tx, 2.6, tz - 1.3); this.group.add(back);
    this.phys.box(tx, tz - 0.4, 1.7, 1.5, 0);
    this.throne = { x: tx, z: tz + 1.6 };
    for (const c of [12, 16]) { const [x, z] = dTile(c, 2); this.place('dungeon', 'banner_shield_red', x, z - 1.4, 0, 1, { y: 0, solid: false }); }
    this.place('dungeon', 'chest_gold', tx + 5.5, tz - 0.8, 0, 0.8, { y: 0 });
    // the side chapel
    const [cx, cz] = dTile(18, 9);
    this.place('dungeon', 'bed_floor', cx + 2, cz - 1, 0, 1, { y: 0, solid: false });
    for (const [dx, dz] of [[-2, -2], [2, -2.5], [3, 1.5]]) this.place('dungeon', 'candle_triple', cx + dx, cz + dz, 0, 1.4, { y: 0, solid: false });
    this.place('dungeon', 'banner_thin_green', cx, cz - 4.6, 0, 1, { y: 0, solid: false });
    // the hall of the dead: rubble and banners
    const [hx, hz] = dTile(10, 20);
    this.place('dungeon', 'rubble_half', hx - 10, hz + 2, 0.4, 0.9, { y: 0 });
    this.place('dungeon', 'banner_patternA_red', hx, hz - 11.4, 0, 1, { y: 0, solid: false });
    this.place('dungeon', 'barrel_small', hx + 10, hz + 3, 0, 1, { y: 0 });
    this.place('dungeon', 'crates_stacked', hx + 9, hz - 5, 0.3, 0.8, { y: 0 });
  }

  update(dt, focus) {
    const t = performance.now() / 1000;
    if (focus) {
      const zone = this.inside ? 'barrow' : 'world';
      const near = this.torches.filter(s => s.zone === zone && s.pos.distanceTo(focus) < 60).sort((a, b) => a.pos.distanceTo(focus) - b.pos.distanceTo(focus));
      this.lightPool.forEach((l, i) => {
        const s = near[i];
        if (!s) { l.intensity = 0; return; }
        l.position.copy(s.pos);
        l.color.copy(s.color);
        l.distance = s.dist;
        l.intensity = s.base * (this.lightK ?? 1) * (0.9 + Math.sin(t * 11 + i) * 0.08);
      });
    }
    this.anim.forEach(f => f(dt, t));
    for (const c of this.clouds) { c.position.x += dt * 1.6; if (c.position.x > 380) c.position.x = -380; }
    for (const s of this.spikes) {
      // up for a moment every 2.4 seconds, with a little warning wobble first
      const p = ((t / 2.4 + s.phase) % 1);
      s.up = p > 0.62 && p < 0.86;
      s.mesh.position.y = s.up ? -0.1 : p > 0.52 && p <= 0.62 ? -1.9 + Math.sin(t * 60) * 0.05 : -2.2;
    }
    // swamp fog thickens as you wade in
    if (focus) {
      const d = Math.hypot(focus.x - SITES.swamp.x, focus.z - SITES.swamp.z);
      this.swampFog = THREE.MathUtils.smoothstep(SITES.swamp.r + 20, SITES.swamp.r - 10, d) * 0.014;
    }
  }

  // The map: a picture of the realm for the minimap and the big map.
  mapCanvas(size = 520) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'), img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = -HALF + (px / size) * HALF * 2, z = -HALF + (py / size) * HALF * 2, y = this.h(x, z);
      let c = y < 0 ? [0.22, 0.45, 0.6] : groundColor(x, z, y, 0);
      const shade = 0.85 + Math.max(-0.25, Math.min(0.25, (this.h(x + 2, z - 2) - y) * 0.08));
      const k = (py * size + px) * 4;
      img.data[k] = c[0] * 255 * shade; img.data[k + 1] = c[1] * 255 * shade; img.data[k + 2] = c[2] * 255 * shade; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(60,40,30,.85)';
    const sc = size / (HALF * 2);
    for (const [name, x, z, rot, s] of BUILDINGS) { const w = /castle|tavern|barracks|church|windmill/.test(name) ? 5 : 3.4; g.fillRect((x + HALF) * sc - w / 2, (z + HALF) * sc - w / 2, w, w); }
    g.strokeStyle = 'rgba(70,50,30,.9)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc((PALISADE.x + HALF) * sc, (PALISADE.z + HALF) * sc, PALISADE.r * sc, 0, Math.PI * 2); g.stroke();
    return cv;
  }
}
