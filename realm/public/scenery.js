// Builds the 3D realm from world.js: terrain, water, sky, nature, kingdoms, villages, the Barrow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, height, groundColor, fbm, rng, roadDist, riverDist, biome, SITES, BUILDINGS, PROPS, DUNGEON, dTile, SHRINES, SETTLEMENTS, PLANS, ROADS, RIVER, RIVER_W, INSIDE_X, WOOD } from './world.js';
import { A, part, baked, kitSize } from './assets.js';
import { roomKind } from './interiors.js';
import { buildTownhouses } from './townhouses.js';

const RES = 4; // terrain sample spacing
const N = (HALF * 2) / RES + 1;
const CHUNK = 55; // terrain cells per chunk side
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Scenery {
  constructor(scene, physics) {
    this.scene = scene;
    this.phys = physics;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.anim = []; // things that move every frame: fn(dt, t)
    this.torches = []; // light sources: { pos, color, base, zone }
    this.doors = []; // front doors of buildings you can walk into
    this.spikes = [];
    this.far = []; // instanced chunks hidden when far away: { obj, x, z }
    // Only a few real lights exist; each frame they move to the light sources nearest you.
    this.lightPool = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffa050, 0, 20, 1.5); scene.add(l); return l; });
    this.time = 0.3;
  }

  build() {
    this.heightGrid();
    this.phys.heights = (x, z) => this.h(x, z);
    this.sky();
    this.terrain();
    this.water();
    this.nature();
    this.settlements();
    this.bridges();
    this.landmarks();
    this.dungeon();
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
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  terrain() {
    // colour every sample once; the map reuses these colours
    this.C = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -HALF + i * RES, z = -HALF + j * RES, y = this.H[k];
      const sx = this.H[j * N + Math.min(N - 1, i + 1)] - this.H[j * N + Math.max(0, i - 1)];
      const sz = this.H[Math.min(N - 1, j + 1) * N + i] - this.H[Math.max(0, j - 1) * N + i];
      this.C.set(groundColor(x, z, y, Math.hypot(sx, sz) / (2 * RES)), k * 3);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let cj = 0; cj < N - 1; cj += CHUNK) for (let ci = 0; ci < N - 1; ci += CHUNK) {
      const w = Math.min(CHUNK, N - 1 - ci), d = Math.min(CHUNK, N - 1 - cj);
      const geo = new THREE.PlaneGeometry(w * RES, d * RES, w, d);
      geo.rotateX(-Math.PI / 2);
      const cx = -HALF + (ci + w / 2) * RES, cz = -HALF + (cj + d / 2) * RES;
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        const i = Math.round((cx + pos.getX(k) + HALF) / RES), j = Math.round((cz + pos.getZ(k) + HALF) / RES), q = j * N + i;
        pos.setY(k, this.H[q]);
        col[k * 3] = this.C[q * 3]; col[k * 3 + 1] = this.C[q * 3 + 1]; col[k * 3 + 2] = this.C[q * 3 + 2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      this.group.add(m);
    }
    // far peaks beyond the edge fill the horizon
    const R = rng(77);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + R() * 0.1, d = 1180 + R() * 60;
      const mtn = part('nature', ['mountain_A', 'mountain_B', 'mountain_C'][i % 3], 110 + R() * 60);
      mtn.position.set(Math.cos(a) * d, 20, Math.sin(a) * d);
      mtn.rotation.y = R() * 6;
      mtn.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0x9aa4b4 }); } });
      this.group.add(mtn);
    }
  }
  water() {
    const mat = new THREE.MeshPhongMaterial({ color: 0x2f7390, transparent: true, opacity: 0.82, shininess: 80, specular: 0x88aacc });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1), mat);
    w.rotation.x = -Math.PI / 2;
    w.position.y = -0.05;
    this.group.add(w);
    this.waterMat = mat;
    this.anim.push((dt, t) => { w.position.y = -0.05 + Math.sin(t * 0.8) * 0.05; });
  }

  // ---------------------------------------------------------------- nature
  nature() {
    const R = rng(1234);
    const groups = {}; // name → list of matrices
    const add = (name, x, z, s, rot, col, sy = 1) => {
      (groups[name] = groups[name] || []).push(new THREE.Matrix4().compose(V3(x, this.h(x, z) - 0.15, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rot), V3(s, s * sy, s)));
      if (col) this.phys.circle(x, z, col);
    };
    const blocked = (x, z, pad) => {
      if (Math.max(Math.abs(x), Math.abs(z)) > HALF - 40) return true;
      if (roadDist(x, z) < 8 + pad || riverDist(x, z) < RIVER_W * 1.8) return true;
      for (const s of SETTLEMENTS) if (Math.hypot(x - s.x, z - s.z) < s.r + 14 + pad) return true;
      for (const k in SITES) { const s = SITES[k]; if (s.r && k !== 'swamp' && Math.hypot(x - s.x, z - s.z) < s.r + 6 + pad) return true; }
      const y = this.h(x, z);
      return y < 0.8 || Math.abs(this.h(x + 3, z) - y) > 3 || Math.abs(this.h(x, z + 3) - y) > 3;
    };
    for (let gx = -HALF + 40; gx < HALF - 40; gx += 9) for (let gz = -HALF + 40; gz < HALF - 40; gz += 9) {
      const x = gx + (R() - 0.5) * 8, z = gz + (R() - 0.5) * 8;
      const b = biome(x, z), r = R();
      const inWood = Math.hypot(x - WOOD.x, z - WOOD.z) < WOOD.r;
      const p = inWood ? 0.82 : { forest: 0.62, plains: 0.035, desert: 0.025, snow: 0.3, swamp: 0.1 }[b];
      if (r > p || blocked(x, z, 0)) continue;
      const y = this.h(x, z), r2 = R();
      if (b === 'desert') { add(r2 < 0.7 ? 'cactus' : 'deadbush', x, z, 0.9 + R() * 0.8, R() * 6, r2 < 0.7 ? 0.5 : 0); continue; }
      if (b === 'swamp') { add('deadtree', x, z, 1.4 + R() * 0.8, R() * 6, 0.6, 1.3); continue; }
      if (b === 'snow' || y > 40) { if (y < 80) add(r2 < 0.5 ? 'snowpine' : 'tree_single_A', x, z, 9 + R() * 5, R() * 6, 0.9, 1.35); continue; }
      if (b === 'forest' && r2 < 0.16) add(R() < 0.5 ? 'trees_A_large' : 'trees_B_large', x, z, 8 + R() * 2.5, R() * 6, 5.4, 1.3);
      else if (b === 'forest' && r2 < 0.28) add(R() < 0.5 ? 'trees_A_medium' : 'trees_B_medium', x, z, 7.5 + R() * 2, R() * 6, 4.2, 1.3);
      else add(r2 < 0.6 ? 'tree_single_A' : 'tree_single_B', x, z, 9 + R() * 5, R() * 6, 0.85, 1.25 + R() * 0.35);
    }
    for (let i = 0; i < 2600; i++) {
      const x = (R() - 0.5) * (HALF * 2 - 100), z = (R() - 0.5) * (HALF * 2 - 100);
      if (blocked(x, z, -5)) continue;
      const s = 5 + R() * R() * 18, sn = biome(x, z) === 'snow';
      add((sn ? 'snowrock_' : 'rock_single_') + 'ABCDE'[Math.floor(R() * 5)], x, z, s, R() * 6, s > 10 ? s * 0.16 : 0);
    }
    // procedural plants the kit does not have
    const green = new THREE.MeshLambertMaterial({ color: 0x5c8a3c, flatShading: true }), deadwood = new THREE.MeshLambertMaterial({ color: 0x5a4a3a, flatShading: true });
    const cyl = (r1, r2, h, x, y, z, rz = 0) => { const g = new THREE.CylinderGeometry(r1, r2, h, 7); g.rotateZ(rz); g.translate(x, y, z); return g; };
    const shapes = {
      cactus: [{ geometry: mergeGeometries([cyl(0.45, 0.5, 4.2, 0, 2.1, 0), cyl(0.3, 0.3, 1.6, 0.9, 2.2, 0, Math.PI / 2), cyl(0.28, 0.3, 1.6, 1.6, 3.0, 0), cyl(0.3, 0.3, 1.2, -0.8, 1.6, 0, Math.PI / 2), cyl(0.26, 0.28, 1.3, -1.3, 2.3, 0)]), material: green }],
      deadbush: [{ geometry: mergeGeometries([cyl(0.08, 0.12, 1.4, 0, 0.7, 0, 0.4), cyl(0.06, 0.1, 1.2, 0.2, 0.6, 0, -0.5), cyl(0.06, 0.09, 1.1, -0.1, 0.6, 0.2, 0.3)]), material: deadwood }],
      deadtree: [{ geometry: mergeGeometries([cyl(0.25, 0.45, 6, 0, 3, 0), cyl(0.1, 0.18, 2.6, 0.8, 4.6, 0, -0.9), cyl(0.08, 0.15, 2.2, -0.7, 3.8, 0, 0.8)]), material: deadwood }],
    };
    const frost = m => { const c = m.clone(); c.color = new THREE.Color(0xe8f0f8); return c; };
    for (const [name, mats] of Object.entries(groups)) {
      let meshes = shapes[name];
      if (!meshes && name === 'snowpine') meshes = baked('nature', 'tree_single_A').map(b => ({ geometry: b.geometry, material: frost(b.material) }));
      if (!meshes && name.startsWith('snowrock_')) meshes = baked('nature', name.replace('snowrock_', 'rock_single_')).map(b => ({ geometry: b.geometry, material: frost(b.material) }));
      this.instance(meshes || baked('nature', name), mats, true);
    }
    // grass follows you around instead of covering the whole realm
    const tuft = new THREE.ConeGeometry(0.2, 0.8, 3);
    tuft.translate(0, 0.4, 0);
    this.grass = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ color: 0xffffff }), 7000);
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.group.add(this.grass);
    this.grassAt = V3(1e9, 0, 0);
  }
  updateGrass(f) {
    if (Math.hypot(f.x - this.grassAt.x, f.z - this.grassAt.z) < 40) return;
    this.grassAt.copy(f);
    const R = rng(Math.floor(f.x / 40) * 7919 + Math.floor(f.z / 40) * 104729 + 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < 20000 && n < this.grass.count; tries++) {
      const x = f.x + (R() - 0.5) * 180, z = f.z + (R() - 0.5) * 180, y = this.h(x, z), b = biome(x, z);
      if (y < 0.6 || b === 'desert' || b === 'snow' || roadDist(x, z) < 5 || SETTLEMENTS.some(s => s.kingdom && Math.hypot(x - s.x, z - s.z) < s.r)) continue;
      const s = 0.7 + R() * 0.9;
      m4.compose(V3(x, y, z), q.setFromAxisAngle(V3(0, 1, 0), R() * 3), V3(s, s * (0.8 + R()), s));
      this.grass.setMatrixAt(n, m4);
      this.grass.setColorAt(n, c.setHSL(b === 'swamp' ? 0.2 : 0.24 + R() * 0.07, 0.45, 0.26 + R() * 0.12));
      n++;
    }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
  }
  // Instanced in chunks, so forests behind you or far away are skipped.
  instance(meshes, mats, far) {
    const chunks = new Map(), v = new THREE.Vector3();
    for (const m of mats) { v.setFromMatrixPosition(m); const k = Math.floor((v.x + HALF) / 160) * 64 + Math.floor((v.z + HALF) / 160); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(m); }
    for (const list of chunks.values()) {
      v.set(0, 0, 0); list.forEach(m => { const p = new THREE.Vector3().setFromMatrixPosition(m); v.add(p); }); v.multiplyScalar(1 / list.length);
      for (const { geometry, material } of meshes) {
        const im = new THREE.InstancedMesh(geometry, material, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
        if (far) this.far.push({ obj: im, x: v.x, z: v.z });
      }
    }
  }

  // ---------------------------------------------------------------- kingdoms and villages
  settlements() {
    const R = rng(99);
    const groups = {};
    const put = (name, x, z, rot, sc, opts = {}) => {
      const y = opts.y ?? this.groundUnder('town', name, x, z, rot, sc);
      (groups[name] = groups[name] || []).push(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rot), V3(sc, sc, opts.sz ? sc * opts.sz : sc)));
      if (opts.solid === false) return;
      const s = kitSize('town', name), k = opts.shrink ?? 0.86, c = Math.cos(rot), sn = Math.sin(rot), ox = s.cx * sc, oz = s.cz * sc;
      const b = this.phys.box(x + ox * c + oz * sn, z - ox * sn + oz * c, (s.x * sc * k) / 2, (s.z * sc * k * (opts.sz || 1)) / 2, rot);
      if (opts.low) b.low = true;
    };
    const fenceRun = (x1, z1, x2, z2, sc = 3.2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), seg = 1.15 * sc, n = Math.max(1, Math.round(len / seg)), rot = Math.atan2(x2 - x1, z2 - z1);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; put('fence_wood_straight', x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, rot, sc, { y: this.h(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t) - 0.05, sz: (len / n) / 1.15 / sc, solid: false }); }
      this.phys.box((x1 + x2) / 2, (z1 + z2) / 2, 0.35, len / 2, rot).low = true;
    };
    for (const s of SETTLEMENTS) {
      const plan = PLANS[s.id];
      plan.buildings.forEach((bld, i) => {
        const [name, x, z, rot, sc] = bld;
        put(name, x, z, rot, sc);
        const fx0 = Math.sin(rot), fz0 = Math.cos(rot), sx0 = Math.cos(rot), sz0 = -Math.sin(rot);
        const ks = kitSize('town', name), front = (ks.z * sc) / 2 + 0.6, half = (ks.x * sc) / 2;
        // every house dressed a little differently: barrels, crates, carts, flowers, lanterns
        if (!bld.sign && /home|tower/.test(name)) {
          const pick = R();
          for (const side of [-1, 1]) {
            if (R() < 0.45) continue;
            const px = x + fx0 * front + sx0 * side * (half * 0.75), pz = z + fz0 * front + sz0 * side * (half * 0.75);
            const what = ['barrel', 'crate_A_big', 'sack', 'wheelbarrow', 'bucket_water', 'crate_B_small'][Math.floor((pick * 7 + side + 1) * 13) % 6];
            put(what, px, pz, R() * 6, 6, { shrink: 0.7, low: true });
          }
          if (R() < 0.5) this.flowerBox(x + fx0 * (front - 0.3) + sx0 * (half * 0.4) * (R() < 0.5 ? -1 : 1), z + fz0 * (front - 0.3) + sz0 * (half * 0.4), rot);
          if (R() < 0.25) put('fence_wood_straight', x + fx0 * (front + 2.5) + sx0 * half * 0.6, z + fz0 * (front + 2.5) + sz0 * half * 0.6, rot + Math.PI / 2, 3.2, { solid: false });
        }
        if (bld.sign) this.sign(x + fx0 * front + sx0 * (half * 0.55), z + fz0 * front + sz0 * (half * 0.55), rot, bld.sign);
        // a front door you can walk through
        const kind = bld.role ? ({ forge: 'smith' }[bld.role] || bld.role) : roomKind(name);
        if (!kind) return;
        const k = kitSize('town', name), c = Math.cos(rot), sn = Math.sin(rot), ox = k.cx * sc, oz = k.cz * sc;
        const cx = x + ox * c + oz * sn, cz = z - ox * sn + oz * c, hd = (k.z * sc * 0.86) / 2, fx = Math.sin(rot), fz = Math.cos(rot);
        this.doors.push({ id: `${s.id}:${i}`, kind, name, sign: bld.sign, role: bld.role, x: cx + fx * (hd + 0.5), z: cz + fz * (hd + 0.5), ox: cx + fx * (hd + 2.4), oz: cz + fz * (hd + 2.4), rot, town: s.name, sid: s.id, color: s.color });
      });
      for (const [name, x, z, rot, sc] of plan.towers) put(name, x, z, rot, sc);
      // the city wall
      for (const w of plan.walls) {
        if (w.gate) continue;
        put('wall_straight', w.x, w.z, w.rot, 6.3, { y: this.h(w.x, w.z) - 0.3, shrink: 1 });
      }
      if (plan.gates) for (const [gx, gz] of plan.gates) {
        const a = Math.atan2(gz - s.z, gx - s.x);
        for (const side of [-1, 1]) { const b = a + side * 0.058; put(`building_tower_A_${s.color}`, s.x + Math.cos(b) * s.r, s.z + Math.sin(b) * s.r, -b, 6.4); }
        const ty = this.h(gx, gz);
        for (const side of [-1, 1]) { const b = a + side * 0.04; this.torch(s.x + Math.cos(b) * (s.r - 4), ty, s.z + Math.sin(b) * (s.r - 4), 0xffa050, true); }
      }
      // lamps on the streets
      for (const [x, z] of plan.lamps) { const y = this.h(x, z); this.lamp(x, y, z); }
      // market stalls
      for (const [x, z] of plan.stalls) put('tent', x, z, 0, 5.2, { shrink: 0.7, low: true });
      // the stable paddock
      if (plan.stable) { const st = plan.stable; fenceRun(st.x - st.w / 2, st.z - st.d / 2, st.x + st.w / 2, st.z - st.d / 2); fenceRun(st.x - st.w / 2, st.z - st.d / 2, st.x - st.w / 2, st.z + st.d / 2); fenceRun(st.x - st.w / 2, st.z + st.d / 2, st.x + st.w / 2, st.z + st.d / 2); fenceRun(st.x + st.w / 2, st.z - st.d / 2, st.x + st.w / 2, st.z + st.d / 2 - 6); }
      // village fields
      for (const [fx, fz, fw, fd] of plan.fields || []) {
        const field = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd, 1, 1), new THREE.MeshLambertMaterial({ color: R() < 0.5 ? 0xc8b04a : 0x6a8a3a }));
        field.rotation.x = -Math.PI / 2;
        field.position.set(fx, this.h(fx, fz) + 0.08, fz);
        this.group.add(field);
        fenceRun(fx - fw / 2, fz - fd / 2, fx + fw / 2, fz - fd / 2); fenceRun(fx - fw / 2, fz + fd / 2, fx + fw / 2, fz + fd / 2);
      }
      // a few barrels and crates about town
      for (let i = 0; i < (s.kingdom ? 14 : 4); i++) {
        const a = R() * Math.PI * 2, d = s.kingdom ? 36 + R() * 20 : 8 + R() * 10;
        put(['barrel', 'crate_A_big', 'sack', 'wheelbarrow'][i % 4], s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, R() * 6, 6, { shrink: 0.7, low: true });
      }
    }
    for (const [name, mats] of Object.entries(groups)) this.instance(baked('town', name), mats, true);
    this.flowersDone();
    for (const s of SETTLEMENTS) if (PLANS[s.id].rows) buildTownhouses(this, PLANS[s.id], s);
    if (PLANS.emberfall.arena) this.arena(PLANS.emberfall.arena, SETTLEMENTS[0]);
    this.camp(SITES.camp);
    // the wild places
    for (const [name, x, z, rot, s] of BUILDINGS) this.place('town', name, x, z, rot, s);
    for (const [name, x, z, rot, s] of PROPS) this.place('town', name, x, z, rot, s, { shrink: 0.8, low: true, solid: !/flag|sack|bucket/.test(name) });
  }
  // a hanging shop sign: post, arm, and a painted board, readable from down the street
  sign(x, z, rot, text) {
    const y = this.h(x, z), g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rot;
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.6, 0.22), wood); post.position.y = 2.3; g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.9), wood); arm.position.set(0, 4.4, 0.85); g.add(arm);
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const k = c.getContext('2d');
    k.fillStyle = '#2a1a10'; k.fillRect(0, 0, 512, 160);
    k.fillStyle = '#6a4428'; k.fillRect(8, 8, 496, 144);
    k.strokeStyle = '#d8b060'; k.lineWidth = 6; k.strokeRect(18, 18, 476, 124);
    k.fillStyle = '#f4dc9a'; k.textAlign = 'center'; k.textBaseline = 'middle';
    let fs = 64; k.font = `700 ${fs}px Cinzel, Georgia, serif`; while (k.measureText(text).width > 440 && fs > 24) { fs -= 4; k.font = `700 ${fs}px Cinzel, Georgia, serif`; }
    k.fillText(text, 256, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const t2 = t.clone(); t2.wrapS = THREE.RepeatWrapping; t2.repeat.x = -1; t2.offset.x = 1; t2.needsUpdate = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 3.2), [new THREE.MeshLambertMaterial({ map: t2 }), new THREE.MeshLambertMaterial({ map: t }), wood, wood, wood, wood]);
    board.rotation.y = Math.PI / 2; board.position.set(0, 3.65, 1.55);
    g.add(board);
    for (const dx of [-1.2, 1.2]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.03), wood); ch.position.set(0, 4.2, 1.55 + dx); g.add(ch); }
    this.group.add(g);
    this.phys.circle(x, z, 0.3);
    (this.signs = this.signs || []).push({ x, z, text });
  }
  flowerBox(x, z, rot) {
    if (!this.flowerParts) { this.flowerParts = { box: [], bloom: [] }; }
    const y = this.h(x, z);
    const m = new THREE.Matrix4().compose(V3(x, y + 0.35, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rot), V3(1, 1, 1));
    this.flowerParts.box.push(m);
    this.flowerParts.bloom.push(new THREE.Matrix4().compose(V3(x, y + 0.75, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rot), V3(1, 1, 1)));
  }
  flowersDone() {
    if (!this.flowerParts) return;
    const box = new THREE.BoxGeometry(1.6, 0.6, 0.6), bloom = new THREE.IcosahedronGeometry(0.42, 0);
    bloom.scale(1.8, 0.6, 0.7);
    this.instance([{ geometry: box, material: new THREE.MeshLambertMaterial({ color: 0x6a4428 }) }], this.flowerParts.box, true);
    const cols = [0xe85a7a, 0xf2c94c, 0xc86ae8, 0xf28a3c];
    const ms = this.flowerParts.bloom;
    cols.forEach((col, i) => { const part = ms.filter((_, k) => k % cols.length === i); if (part.length) this.instance([{ geometry: bloom, material: new THREE.MeshLambertMaterial({ color: col, flatShading: true }) }], part, true); });
  }
  // the fighting pit: sand, a timber wall, tiered stands and a gate facing the plaza
  arena(A, s) {
    const y = this.h(A.x, A.z), gateA = Math.atan2(s.z - A.z, s.x - A.x);
    A.gateA = gateA;
    const sand = new THREE.Mesh(new THREE.CircleGeometry(A.r, 40), new THREE.MeshLambertMaterial({ color: 0xd8c08a }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(A.x, y + 0.06, A.z); sand.receiveShadow = true; this.group.add(sand);
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4630 }), dark = new THREE.MeshLambertMaterial({ color: 0x4a3020 }), cloth = [0xb83a30, 0xe8c050];
    const n = 36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < 0.16) continue;
      const len = (2 * Math.PI * A.r) / n + 0.1;
      for (let tier = 0; tier < 3; tier++) {
        const rr = A.r + 0.6 + tier * 2.2, h = 1.6 + tier * 1.2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(((2 * Math.PI * rr) / n) + 0.1, h, tier ? 2.2 : 0.6), tier ? dark : wood);
        seg.position.set(A.x + Math.cos(a) * rr, y + h / 2, A.z + Math.sin(a) * rr); seg.rotation.y = -a + Math.PI / 2; seg.castShadow = seg.receiveShadow = true; this.group.add(seg);
      }
      const b = this.phys.box(A.x + Math.cos(a) * (A.r + 0.6), A.z + Math.sin(a) * (A.r + 0.6), len / 2, 0.5, -a + Math.PI / 2);
      if (i % 3 === 0) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshLambertMaterial({ color: cloth[i % 2], side: THREE.DoubleSide })); f.position.set(A.x + Math.cos(a) * (A.r + 0.25), y + 1.0, A.z + Math.sin(a) * (A.r + 0.25)); f.rotation.y = -a + Math.PI / 2; this.group.add(f); }
    }
    for (const side of [-1, 1]) { const b = gateA + side * 0.2; this.torch(A.x + Math.cos(b) * (A.r + 1.5), y, A.z + Math.sin(b) * (A.r + 1.5), 0xffa050, true); }
    this.arenaInfo = A;
  }
  // the Red Hand bandits' camp in the woods
  camp(C) {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; this.place('town', 'tent', C.x + Math.cos(a) * 11, C.z + Math.sin(a) * 11, -a + Math.PI / 2, 6, { shrink: 0.7 }); }
    this.campfire(C.x, C.z);
    for (const [dx, dz, nm] of [[4, -5, 'barrel'], [-5, 4, 'crate_A_big'], [6, 4, 'crate_B_small'], [-3, -6, 'sack'], [2, 7, 'weaponrack']]) this.place('town', nm, C.x + dx, C.z + dz, dx, 6, { shrink: 0.7, low: true });
    for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; if (Math.abs(a - 0.4) < 0.25) continue; this.place('town', 'fence_wood_straight', C.x + Math.cos(a) * 19, C.z + Math.sin(a) * 19, -a, 3.4, { solid: false }); }
    this.place('town', 'flag_red', C.x - 2, C.z - 2, 0, 8, { solid: false });
  }

  // a street lamp: a post with a flame; the nearest few cast real light at night
  lamp(x, y, z) {
    if (!this.lampParts) {
      this.lampParts = { post: [], flame: [] };
      this.lampMats = { post: new THREE.MeshLambertMaterial({ color: 0x3a2c22 }), flame: new THREE.MeshBasicMaterial({ color: 0xffc070 }) };
    }
    this.lampParts.post.push(new THREE.Matrix4().makeTranslation(x, y + 1.6, z));
    this.lampParts.flame.push(new THREE.Matrix4().makeTranslation(x, y + 3.4, z));
    this.torches.push({ pos: V3(x, y + 3.4, z), color: new THREE.Color(0xffb060), base: 18, dist: 20, zone: 'world' });
  }
  finishLamps() {
    if (!this.lampParts) return;
    const post = new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6), flame = new THREE.SphereGeometry(0.32, 8, 6);
    this.instance([{ geometry: post, material: this.lampMats.post }], this.lampParts.post, true);
    this.instance([{ geometry: flame, material: this.lampMats.flame }], this.lampParts.flame, true);
    this.lampMats.flame.userData.lamp = true;
  }

  // ---------------------------------------------------------------- bridges where roads cross the river
  bridges() {
    this.finishLamps();
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5434 }), dark = new THREE.MeshLambertMaterial({ color: 0x4e3522 });
    this.bridgeSpots = [];
    const cross = (a, b, c, d) => {
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-9) return null;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : null;
    };
    for (const road of ROADS) for (let i = 1; i < road.length; i++) for (let j = 1; j < RIVER.length; j++) {
      const p = cross(road[i - 1], road[i], RIVER[j - 1], RIVER[j]);
      if (!p || Math.hypot(p[0] - SITES.ford.x, p[1] - SITES.ford.z) < 30 || this.bridgeSpots.some(b => Math.hypot(b.x - p[0], b.z - p[1]) < 30)) continue;
      const rot = Math.atan2(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]);
      const len = 44, dx = Math.sin(rot), dz = Math.cos(rot);
      const deck = Math.max(this.h(p[0] - dx * 24, p[1] - dz * 24), this.h(p[0] + dx * 24, p[1] + dz * 24), 1.8) + 0.4;
      const parts = [], dparts = [];
      for (let k = 0; k < 32; k++) { const g = new THREE.BoxGeometry(6.4, 0.32, len / 32 - 0.08); g.translate(0, deck - 0.16, -len / 2 + (k + 0.5) * (len / 32)); (k % 3 ? parts : dparts).push(g); }
      for (const sx of [-3.3, 3.3]) {
        const rail = new THREE.BoxGeometry(0.24, 0.24, len); rail.translate(sx, deck + 1.05, 0); dparts.push(rail);
        for (let k = 0; k <= 8; k++) { const post = new THREE.BoxGeometry(0.32, 3.4, 0.32); post.translate(sx, deck - 0.6, -len / 2 + (k * len) / 8); dparts.push(post); }
        const b = this.phys.box(p[0] + Math.cos(rot) * sx, p[1] - Math.sin(rot) * sx, 0.25, len / 2, rot); b.low = true;
      }
      const g1 = new THREE.Mesh(mergeGeometries(parts), wood), g2 = new THREE.Mesh(mergeGeometries(dparts), dark);
      for (const g of [g1, g2]) { g.position.set(p[0], 0, p[1]); g.rotation.y = rot; g.castShadow = g.receiveShadow = true; this.group.add(g); }
      this.phys.platform({ x: p[0], z: p[1], hw: 3.1, hd: len / 2, rot, y: deck });
      this.bridgeSpots.push({ x: p[0], z: p[1], rot, deck });
    }
  }

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
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), skyMat);
    this.scene.add(this.skyDome);
    const R = rng(5), sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) { const a = R() * Math.PI * 2, e = 0.08 + R() * 1.4; sp.set([Math.cos(a) * Math.cos(e) * 500, Math.sin(e) * 500, Math.sin(a) * Math.cos(e) * 500], i * 3); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf2f0ff, fog: false }));
    this.scene.add(this.moon);
    this.clouds = [];
    for (let i = 0; i < 60; i++) {
      const c = part('nature', i % 2 ? 'cloud_big' : 'cloud_small', 14 + R() * 12);
      c.position.set((R() - 0.5) * (HALF * 2 + 400), 110 + R() * 50, (R() - 0.5) * (HALF * 2 + 400));
      c.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0xf4f6ff, fog: false, transparent: true, opacity: 0.9 }); } });
      this.cloudMats = this.cloudMats || []; c.traverse(o => { if (o.isMesh) this.cloudMats.push(o.material); });
      this.scene.add(c);
      this.clouds.push(c);
    }
  }
  // t: 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk.  inside: the Barrow.
  setTime(t, focus, zone = 'world') {
    if (zone === true) zone = 'barrow';
    if (zone === false) zone = 'world';
    const inside = zone !== 'world', room = zone === 'inside';
    this.zoneName = zone;
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
    this.hemi.intensity = room ? 0.95 : inside ? 1.15 : 0.45 + day * 0.75;
    this.hemi.color.copy(room ? new THREE.Color(0xffe2c0) : inside ? new THREE.Color(0x9a90b0) : c(0x4a5c9a, 0xcfe3ff, day));
    this.hemi.groundColor.copy(room ? new THREE.Color(0x6a4a34) : inside ? new THREE.Color(0x40302a) : c(0x1a2018, 0x4a5a3a, day));
    const fogC = room ? new THREE.Color(0x1a120c) : inside ? new THREE.Color(0x05060a) : bottom.clone().lerp(top, 0.15);
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = room ? 0.006 : inside ? 0.028 : 0.0042 + (1 - day) * 0.0035 + (this.swampFog || 0);
    this.skyDome.visible = this.stars.visible = this.moon.visible = !inside;
    this.clouds.forEach(cl => { cl.visible = !inside; });
    (this.cloudMats || []).forEach(m => m.color.copy(c(0x7a8098, 0xf4f6ff, day)).lerp(new THREE.Color(0xffc8b0), dusk * 0.5));
    this.stars.material.opacity = 1 - day;
    this.moon.position.copy(f).addScaledVector(V3(-sunDir.x, -sunDir.y, -sunDir.z), 480);
    this.moon.visible = !inside && sunDir.y < 0.1;
    this.skyDome.position.copy(f);
    this.stars.position.copy(f);
    const night = 1 - day;
    this.winMat && (this.winMat.emissiveIntensity = night * 1.6);
    if (this.townMat) this.townMat.emissiveIntensity = inside ? 0 : Math.max(0, night - 0.25) * 1.5;
    this.lightK = inside ? 1 : Math.max(0.12, night);
    this.inside = inside;
  }

  // ---------------------------------------------------------------- nature

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

  // ---------------------------------------------------------------- landmarks
  landmarks() {
    // the Moonlit Glade: a ring of standing stones
    const G = SITES.glade;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, x = G.x + Math.cos(a) * 12, z = G.z + Math.sin(a) * 12; this.place('dungeon', 'column', x, z, a, 1.7 + (i % 2) * 0.5); }
    // Wyvern Peak: a nest of rocks and bones on the summit
    const Pk = SITES.peak;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, x = Pk.x + Math.cos(a) * 18, z = Pk.z + Math.sin(a) * 18; if (i % 4 === 1) continue; this.place('nature', 'rock_single_' + 'ABCDE'[i % 5], x, z, a, 11 + (i % 3) * 3, { shrink: 0.7 }); }
    // the Barrow: a grassy mound with a stone door
    const Bw = SITES.barrow, by = this.h(Bw.x, Bw.z);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8f9a92, flatShading: true }));
    mound.scale.y = 0.62;
    mound.position.set(Bw.x, by - 0.5, Bw.z - 16);
    mound.receiveShadow = true;
    this.group.add(mound);
    this.phys.circle(Bw.x, Bw.z - 16, 23.5);
    this.place('dungeon', 'wall_doorway', Bw.x, Bw.z + 4.5, 0, 1.3, { y: by - 0.1 });
    this.barrowGate = this.place('dungeon', 'wall_gated', Bw.x, Bw.z + 4.8, 0, 1.3, { y: by - 0.1, solid: false });
    for (const sx of [-7, 7]) { this.place('dungeon', 'pillar_decorated', Bw.x + sx, Bw.z + 4.5, 0, 1.2, { y: by - 0.1 }); this.torch(Bw.x + sx * 0.72, by, Bw.z + 7, 0x7dffb0, true); }
    for (const sx of [-13, 13]) this.place('dungeon', 'wall_broken', Bw.x + sx, Bw.z + 3.2, sx > 0 ? -0.35 : 0.35, 1.15, { y: by - 0.2 });
    this.barrowDoor = { x: Bw.x, z: Bw.z + 7 };
    // shrines
    this.shrineMeshes = {};
    for (const s of SHRINES) {
      const y = this.h(s.x, s.z);
      this.place('dungeon', 'column', s.x, s.z, 0, 1.4);
      const rune = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 24), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.35 }));
      rune.position.set(s.x, y + 2.8, s.z);
      this.group.add(rune);
      this.anim.push((dt, t) => { rune.rotation.y = t * 0.8; rune.position.y = y + 2.7 + Math.sin(t * 1.6 + s.x) * 0.15; });
      this.shrineMeshes[s.id] = rune;
    }
    // campfires: the keep, the warren, the villages
    for (const [x, z] of [[SITES.keep.x, SITES.keep.z], [SITES.warren.x - 4, SITES.warren.z + 2], ...SETTLEMENTS.filter(s => !s.kingdom).map(s => [s.x + 8, s.z + 4])]) this.campfire(x, z);
    // docks on the western lake by Tidewatch
    const Ld = SITES.lake, tw = SETTLEMENTS.find(s => s.id === 'tidewatch');
    const dx = Ld.x - tw.x, dz = Ld.z - tw.z, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
    let sx = tw.x + ux * tw.r, sz = tw.z + uz * tw.r;
    for (let i = 0; i < 40 && this.h(sx, sz) > -0.5; i++) { sx += ux * 3; sz += uz * 3; }
    const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 34), new THREE.MeshLambertMaterial({ color: 0x7a5434 }));
    dock.position.set(sx + ux * 14, 0.9, sz + uz * 14);
    dock.rotation.y = Math.atan2(ux, uz);
    this.group.add(dock);
    this.phys.platform({ x: dock.position.x, z: dock.position.z, hw: 3, hd: 17, rot: dock.rotation.y, y: 1.1 });
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
      const zone = this.zoneName || 'world';
      const near = this.torches.filter(s => s.zone === zone && Math.abs(s.pos.x - focus.x) < 60 && Math.abs(s.pos.z - focus.z) < 60).sort((a, b) => a.pos.distanceTo(focus) - b.pos.distanceTo(focus));
      this.lightPool.forEach((l, i) => {
        const s = near[i];
        if (!s) { l.intensity = 0; return; }
        l.position.copy(s.pos);
        l.color.copy(s.color);
        l.distance = s.dist;
        l.intensity = s.base * (this.lightK ?? 1) * (0.9 + Math.sin(t * 11 + i) * 0.08);
      });
      if (!this.inside) this.updateGrass(focus);
      // hide far-away forests and towns (the fog hides them anyway)
      if ((this.cullT = (this.cullT || 0) - dt) <= 0) {
        this.cullT = 0.5;
        for (const f of this.far) f.obj.visible = !this.inside && Math.hypot(f.x - focus.x, f.z - focus.z) < 470;
      }
      const d = Math.hypot(focus.x - SITES.swamp.x, focus.z - SITES.swamp.z);
      this.swampFog = THREE.MathUtils.smoothstep(SITES.swamp.r + 40, SITES.swamp.r - 20, d) * 0.012;
    }
    this.anim.forEach(f => f(dt, t));
    for (const c of this.clouds) { c.position.x += dt * 2; if (c.position.x > HALF + 300) c.position.x = -HALF - 300; }
    for (const s of this.spikes) {
      const p = ((t / 2.4 + s.phase) % 1);
      s.up = p > 0.62 && p < 0.86;
      s.mesh.position.y = s.up ? -0.1 : p > 0.52 && p <= 0.62 ? -1.9 + Math.sin(t * 60) * 0.05 : -2.2;
    }
    if (this.lampMats) this.lampMats.flame.color.setScalar(1).lerp(new THREE.Color(0x553a20), this.dayK ?? 0);
  }

  // The map: a picture of the realm for the minimap and the big map, painted from the terrain colours.
  mapCanvas(size = 1100) {
    const src = document.createElement('canvas');
    src.width = src.height = N;
    const sg = src.getContext('2d'), img = sg.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, y = this.H[k];
      let c = y < 0 ? [0.22, 0.45, 0.6] : [this.C[k * 3], this.C[k * 3 + 1], this.C[k * 3 + 2]];
      const shade = 0.85 + Math.max(-0.25, Math.min(0.25, ((this.H[Math.max(0, j - 1) * N + Math.min(N - 1, i + 1)] ?? y) - y) * 0.05));
      const p = k * 4;
      img.data[p] = c[0] * 255 * shade; img.data[p + 1] = c[1] * 255 * shade; img.data[p + 2] = c[2] * 255 * shade; img.data[p + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, size, size);
    const sc = size / (HALF * 2), P = (x, z) => [(x + HALF) * sc, (z + HALF) * sc];
    const line = (pts, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.lineJoin = g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); };
    line(RIVER, 'rgba(52,110,150,.95)', RIVER_W * sc * 1.6);
    for (const r of ROADS) line(r, 'rgba(120,92,60,.9)', 2.2);
    for (const s of SETTLEMENTS) {
      const plan = PLANS[s.id];
      g.fillStyle = 'rgba(70,52,40,.9)';
      for (const h of plan.rows || []) { const [px, py] = P(h.x, h.z); g.save(); g.translate(px, py); g.rotate(-h.rot); g.fillRect(-h.w * sc / 2, -h.d * sc / 2, h.w * sc, h.d * sc); g.restore(); }
      for (const [name, x, z, rot, k] of plan.buildings) { const w = Math.max(2, (/castle|church|tavern|barracks/.test(name) ? 16 : 8) * sc); const [px, py] = P(x, z); g.fillRect(px - w / 2, py - w / 2, w, w); }
      if (s.kingdom) { g.strokeStyle = 'rgba(60,50,45,.95)'; g.lineWidth = 2.5; g.beginPath(); const [cx, cy] = P(s.x, s.z); g.arc(cx, cy, s.r * sc, 0, Math.PI * 2); g.stroke(); }
    }
    for (const b of this.bridgeSpots || []) { const [px, py] = P(b.x, b.z); g.fillStyle = '#7a5434'; g.fillRect(px - 3, py - 3, 6, 6); }
    return cv;
  }
}
