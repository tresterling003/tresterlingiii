// ================= ASSETS: packed avatars, mocap, textures =================
const ASSET = {};
function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function assetBytes(name) { const a = window.DN_ASSETS && window.DN_ASSETS[name]; if (!a) throw new Error('missing asset ' + name); return b64ToU8(a); }
function assetImage(name) {
  return new Promise((res, rej) => {
    const u8 = assetBytes(name);
    const url = URL.createObjectURL(new Blob([u8], { type: name.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
    const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = url;
  });
}
function parsePack(u8) {
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x31414e44) throw new Error('bad pack');
  const jl = dv.getUint32(4, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
  return { json, buf, base: 8 + jl };
}

const BODY_BONES = new Set(['Bip01', 'Bip01_Pelvis', 'Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Neck', 'Bip01_Head',
  'Bip01_L_Clavicle', 'Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand', 'Bip01_R_Clavicle', 'Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand',
  'Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_Foot', 'Bip01_L_Toe0', 'Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_Foot', 'Bip01_R_Toe0']);
const REC_BONES = [...BODY_BONES];

function buildAvatarTemplate(av) {
  const { json, buf, base } = parsePack(assetBytes(av.file + '.bin'));
  const vc = json.vc;
  const pq = new Uint16Array(buf, base + json.pos, vc * 3), nq = new Int8Array(buf, base + json.nrm, vc * 4);
  const uq = new Uint16Array(buf, base + json.uv, vc * 2), sq = new Uint8Array(buf, base + json.si, vc * 4), wq = new Uint8Array(buf, base + json.sw, vc * 4);
  const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
  for (let i = 0; i < vc; i++) {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = json.pmin[k] + pq[i * 3 + k] / 65535 * (json.pmax[k] - json.pmin[k]);
    let x = nq[i * 4] / 127, y = nq[i * 4 + 1] / 127, z = nq[i * 4 + 2] / 127; const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    for (let k = 0; k < 2; k++) uv[i * 2 + k] = json.umin[k] + uq[i * 2 + k] / 65535 * (json.umax[k] - json.umin[k]);
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = sq[i * 4 + k]; sw[i * 4 + k] = wq[i * 4 + k] / 255; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const idx = json.i32 ? new Uint32Array(buf, base + json.idx, json.ic) : new Uint16Array(buf, base + json.idx, json.ic);
  g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  for (const [s, c, m] of json.groups) g.addGroup(s, c, m);
  g.computeBoundingSphere(); g.boundingSphere.radius *= 1.6;
  const invF = new Float32Array(buf, base + json.inv, json.sk.length * 16);
  const inverses = json.sk.map((_, i) => new THREE.Matrix4().fromArray(invF, i * 16));
  const tpl = { av, json, geometry: g, inverses, bindMatrix: new THREE.Matrix4().fromArray(json.bindMatrix), meshMatrix: new THREE.Matrix4().fromArray(json.meshMatrix) };
  const hip = json.bones.find(b => b.n === 'Bip01');
  tpl.restHipY = hip.t[1];
  // modelled height (cm) from head bone chain
  const tmp = instantiateSkeleton(tpl);
  tmp.root.updateMatrixWorld(true);
  const headTop = tmp.bones.Bip01_Head.getWorldPosition(new THREE.Vector3()).y;
  tpl.modelHeight = headTop / 0.93; // head bone ~ 93% of stature (in cm, inner scale applied later)
  // rest char-space orientations and limb directions for the pose layer
  tpl.rest = {};
  const q = new THREE.Quaternion();
  const child = { Bip01_R_UpperArm: 'Bip01_R_Forearm', Bip01_R_Forearm: 'Bip01_R_Hand', Bip01_L_UpperArm: 'Bip01_L_Forearm', Bip01_L_Forearm: 'Bip01_L_Hand', Bip01_R_Thigh: 'Bip01_R_Calf', Bip01_R_Calf: 'Bip01_R_Foot', Bip01_L_Thigh: 'Bip01_L_Calf', Bip01_L_Calf: 'Bip01_L_Foot' };
  for (const n of BODY_BONES) {
    const b = tmp.bones[n]; if (!b) continue;
    b.getWorldQuaternion(q);
    const r = { q: q.clone() };
    if (child[n]) { const a = b.getWorldPosition(new THREE.Vector3()), c = tmp.bones[child[n]].getWorldPosition(new THREE.Vector3()); r.dir = c.sub(a).normalize(); }
    tpl.rest[n] = r;
  }
  return tpl;
}
function instantiateSkeleton(tpl) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); inner.scale.setScalar(0.01); root.add(inner);
  const bl = tpl.json.bones.map(b => { const o = new THREE.Bone(); o.name = b.n; o.position.fromArray(b.t); o.quaternion.fromArray(b.q); o.scale.fromArray(b.s); return o; });
  tpl.json.bones.forEach((b, i) => { if (b.p >= 0) bl[b.p].add(bl[i]); else inner.add(bl[i]); });
  const bones = {}; bl.forEach(b => bones[b.name] = b);
  return { root, inner, list: bl, bones };
}

// ---- mocap clips ----
const CLIP_INFO = {};  // name -> {speed (m/s root motion), dur}
let ANIM_PACK = null;
function loadAnimPack() {
  ANIM_PACK = parsePack(assetBytes('anims.bin'));
  for (const c of ANIM_PACK.json.clips) {
    const pt = c.tracks.find(t => t.t === 'p');
    let speed = 0;
    if (pt && pt.n > 1) { const a = new Int16Array(ANIM_PACK.buf, ANIM_PACK.base + pt.off, pt.n * 3); speed = (a[(pt.n - 1) * 3 + 2] - a[2]) / 100 / c.dur; }
    CLIP_INFO[c.name] = { speed: Math.abs(speed), dur: c.dur };
  }
}
function buildClipsFor(tpl) {
  const { json, buf, base } = ANIM_PACK; const clips = {};
  const restBip = tpl.json.bones.find(b => b.n === 'Bip01').t;
  for (const c of json.clips) {
    const tracks = [];
    for (const t of c.tracks) {
      if (t.n === 1 && !BODY_BONES.has(t.b)) continue;
      const times = new Float32Array(t.n); for (let i = 0; i < t.n; i++) times[i] = i / 30;
      if (t.t === 'q') {
        const a = new Int16Array(buf, base + t.off, t.n * 4); const v = new Float32Array(t.n * 4);
        for (let i = 0; i < t.n; i++) { let x = a[i * 4] / 32767, y = a[i * 4 + 1] / 32767, z = a[i * 4 + 2] / 32767, w = a[i * 4 + 3] / 32767; const l = Math.hypot(x, y, z, w) || 1; v[i * 4] = x / l; v[i * 4 + 1] = y / l; v[i * 4 + 2] = z / l; v[i * 4 + 3] = w / l; }
        tracks.push(new THREE.QuaternionKeyframeTrack(t.b + '.quaternion', times, v));
      } else {
        const a = new Int16Array(buf, base + t.off, t.n * 3); const v = new Float32Array(t.n * 3);
        const y0 = 89.5; // reference pelvis height of the mocap actor
        for (let i = 0; i < t.n; i++) { v[i * 3] = restBip[0]; v[i * 3 + 1] = a[i * 3 + 1] / 100 - y0 + restBip[1]; v[i * 3 + 2] = restBip[2]; }
        tracks.push(new THREE.VectorKeyframeTrack(t.b + '.position', times, v));
      }
    }
    clips[c.name] = new THREE.AnimationClip(c.name, c.dur, tracks);
  }
  return clips;
}

// ---- textures ----
const TEX = { img: {}, shared: {} };
async function loadTextures(progress) {
  const names = [];
  for (const av of AVATARS) { names.push(av.id + '_body.jpg', av.id + '_head.jpg', av.id + '_bn.jpg', av.id + '_hn.jpg', av.id + '_uni.png'); if (av.female || av.id === 'm300') names.push(av.id + '_op.png'); }
  let done = 0;
  await Promise.all(names.map(async n => { TEX.img[n] = await assetImage(n); progress && progress(++done / names.length); }));
  const mk = (img, srgb) => { const t = new THREE.Texture(img); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
  for (const av of AVATARS) {
    TEX.shared[av.id] = {
      head: mk(TEX.img[av.id + '_head.jpg'], true), bn: mk(TEX.img[av.id + '_bn.jpg'], false), hn: mk(TEX.img[av.id + '_hn.jpg'], false),
      op: TEX.img[av.id + '_op.png'] ? mk(TEX.img[av.id + '_op.png'], true) : null,
    };
    const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(TEX.img[av.id + '_uni.png'], 0, 0, 1024, 1024);
    const d = x.getImageData(0, 0, 1024, 1024).data; const u = new Uint8Array(1024 * 1024);
    for (let i = 0; i < u.length; i++) u[i] = d[i * 4];
    TEX.shared[av.id].uni = u;
  }
}
const kitCache = new Map();
function kitCanvas(av, uni) { // recolored base kit for avatar+uniform
  const key = av.id + uni.p + uni.s + uni.a;
  if (kitCache.has(key)) return kitCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(TEX.img[av.id + '_body.jpg'], 0, 0, 1024, 1024);
  const id = x.getImageData(0, 0, 1024, 1024), d = id.data, u = TEX.shared[av.id].uni;
  const P = hexToRgb(uni.p), S = hexToRgb(uni.s), A = hexToRgb(uni.a);
  let C2 = S;
  if (av.kit === 'female') C2 = S.map(v => v * 0.55);
  const cols = [null, P, C2, A];
  for (let i = 0, j = 0; i < u.length; i++, j += 4) {
    const v = u[i]; const cl = v >> 6; if (!cl) continue;
    const sh = (v & 63) / 32; const col = cols[cl];
    // keep a little of the source luminance texture (fabric detail) on light colours
    d[j] = Math.min(255, col[0] * sh + 6 * sh); d[j + 1] = Math.min(255, col[1] * sh + 6 * sh); d[j + 2] = Math.min(255, col[2] * sh + 6 * sh);
  }
  x.putImageData(id, 0, 0);
  kitCache.set(key, c);
  return c;
}
function fitText(x, text, maxW, size, font) {
  let s = size; x.font = `${s}px ${font}`;
  while (x.measureText(text).width > maxW && s > 8) { s -= 2; x.font = `${s}px ${font}`; }
  return s;
}
function playerBodyTexture(pl, uni, team) {
  const av = pl.avatar; const base = kitCanvas(av, uni);
  const S = (typeof QUALITY !== 'undefined' && QUALITY.name === 'high') ? 1024 : 512;
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.scale(S / 1024, S / 1024); x.drawImage(base, 0, 0);
  const font = "'Anton', Impact, 'Arial Narrow Bold', sans-serif";
  if (av.kit === 'soccer') {
    // back number (texture is upside-down there)
    x.save(); x.translate(507, 278); x.rotate(Math.PI); x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, String(pl.num), 120, 118, font);
    x.fillStyle = uni.s; x.strokeStyle = uni.a; x.lineWidth = 3; x.fillText(String(pl.num), 0, 4); x.strokeText(String(pl.num), 0, 4);
    // nameplate above the number
    fitText(x, pl.last.toUpperCase(), 120, 26, font); x.fillStyle = uni.s; x.fillText(pl.last.toUpperCase(), 0, -78);
    x.restore();
    // chest wordmark on the front panel
    x.save(); x.translate(512, 652); x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, team.name, 128, 40, font); x.fillStyle = uni.p; x.fillText(team.name, 0, 0); x.restore();
    // shorts number
    x.save(); x.translate(176, 170); x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, String(pl.num), 54, 50, font); x.fillStyle = uni.s; x.fillText(String(pl.num), 0, 0); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ================= CHARACTER (skinned avatar + animation + pose layer) =================
const LOCO = ['idle', 'walk', 'jog', 'run', 'sprint'];
const _poseQ = new THREE.Quaternion(), _poseE = new THREE.Euler();
class Character {
  constructor(tpl, clips, pl, uni, team) {
    this.tpl = tpl;
    const sk = instantiateSkeleton(tpl);
    this.root = sk.root; this.inner = sk.inner; this.bones = sk.bones; this.boneList = sk.list;
    const sh = TEX.shared[tpl.av.id];
    const matByName = (name) => {
      if (name.endsWith('_body')) return new THREE.MeshStandardMaterial({ map: playerBodyTexture(pl, uni, team), normalMap: sh.bn, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.8, metalness: 0 });
      if (name.endsWith('_head')) return new THREE.MeshStandardMaterial({ map: sh.head, normalMap: sh.hn, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.6, metalness: 0 });
      return new THREE.MeshStandardMaterial({ map: sh.op, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
    };
    this.mats = tpl.json.mats.map(matByName);
    const mesh = new THREE.SkinnedMesh(tpl.geometry, this.mats);
    tpl.meshMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.inner.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(tpl.json.sk.map(i => sk.list[i]), tpl.inverses), tpl.bindMatrix);
    mesh.castShadow = true; mesh.frustumCulled = false;
    this.mesh = mesh;
    const s = pl.height / tpl.modelHeight;
    this.scale = s;
    this.inner.scale.set(0.01 * s * pl.build, 0.01 * s, 0.01 * s * pl.build);
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.actions = {};
    for (const [n, c] of Object.entries(clips)) { const a = this.mixer.clipAction(c); a.enabled = true; a.setEffectiveWeight(0); a.play(); this.actions[n] = a; }
    this.female = tpl.av.female;
    this.locoMap = { idle: 'idle', walk: 'walk', jog: 'jog', run: this.female ? 'frun' : 'run', sprint: this.female ? 'fsprint' : 'sprint' };
    this.w = {}; for (const n in this.actions) this.w[n] = 0; this.w.idle = 1;
    this.full = null;      // full-body override clip name (crouch, sit, cheer...)
    this.fullW = 0;
    this.loco = 'idle';
    this.actions.idle.time = Math.random() * 8; this.actions.idle2.time = Math.random() * 6;
    this.idleAlt = Math.random() < 0.5 ? 'idle' : 'idle2';
    this.flash = 0;
    this._q = new THREE.Quaternion(); this._rootQi = new THREE.Quaternion();
  }
  // speed in m/s on the ground plane
  animate(dt, speed, full) {
    let want = speed < 0.25 ? 'idle' : speed < 1.7 ? 'walk' : speed < 2.8 ? 'jog' : speed < 4.5 ? 'run' : 'sprint';
    // hysteresis
    this._hold = (this._hold || 0) - dt;
    if (want !== this.loco && this._hold <= 0) { this.loco = want; this._hold = 0.12; }
    const target = {};
    for (const n in this.actions) target[n] = 0;
    if (full) target[full] = 1;
    else { const c = this.loco === 'idle' ? this.idleAlt : this.locoMap[this.loco]; target[c] = 1; }
    const k = full === 'crouch' ? 16 : 9;
    let sum = 0;
    for (const n in this.actions) { this.w[n] = damp(this.w[n], target[n], k, dt); if (this.w[n] < 0.002) this.w[n] = 0; sum += this.w[n]; }
    for (const n in this.actions) { const a = this.actions[n]; a.setEffectiveWeight(sum > 0 ? this.w[n] / sum : 0); }
    // match playback rate to ground speed so feet don't slide
    for (const L of ['walk', 'jog', 'run', 'sprint']) {
      const n = this.locoMap[L]; const info = CLIP_INFO[n]; const a = this.actions[n];
      a.setEffectiveTimeScale(info.speed > 0 ? clamp(speed / (info.speed * this.scale), 0.55, 1.7) : 1);
    }
    this.mixer.update(dt);
  }
  setFlash(v) {
    if (Math.abs(v - this.flash) < 0.01) return; this.flash = v;
    for (const m of this.mats) m.emissive.setRGB(v, v * 0.82, v * 0.62);
  }
  // ---- pose layer ----
  charQ(obj, out) { obj.getWorldQuaternion(out); return out.premultiply(this._rootQi); }
  setCharQ(bone, q) { this.charQ(bone.parent, _q3); _q3.invert(); bone.quaternion.copy(_q3.multiply(q)); }
  addSpine(pitch, yaw, roll) {
    if (!pitch && !yaw && !roll) return;
    const d = _poseQ.setFromEuler(_poseE.set(pitch / 3, yaw / 3, roll / 3, 'YXZ'));
    for (const n of ['Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2']) { const b = this.bones[n]; this.charQ(b, _q1); _q1.premultiply(d); this.setCharQ(b, _q1); }
  }
  aimLimb(name, dir, w, chestRel) {
    if (w <= 0.001) return;
    const b = this.bones[name], r = this.tpl.rest[name];
    _v1.set(dir[0], dir[1], dir[2]).normalize();
    if (chestRel) { this.charQ(this.bones.Bip01_Spine2, _q2); _q2.multiply(_q1.copy(this.tpl.rest.Bip01_Spine2.q).invert()); _v1.applyQuaternion(_q2); }
    _q2.setFromUnitVectors(r.dir, _v1).multiply(r.q);
    this.charQ(b, _q1); _q1.slerp(_q2, clamp(w, 0, 1));
    this.setCharQ(b, _q1);
  }
  addHead(pitch, yaw) {
    if (!pitch && !yaw) return;
    const d = _poseQ.setFromEuler(_poseE.set(pitch * 0.5, yaw * 0.5, 0, 'YXZ'));
    for (const n of ['Bip01_Neck', 'Bip01_Head']) { const b = this.bones[n]; this.charQ(b, _q1); _q1.premultiply(d); this.setCharQ(b, _q1); }
  }
  applyPose(P) {
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(this._rootQi); this._rootQi.invert();
    if (P.spine) this.addSpine(P.spine[0], P.spine[1], P.spine[2]);
    if (P.head) this.addHead(P.head[0], P.head[1]);
    if (P.armW > 0) {
      if (P.r) { this.aimLimb('Bip01_R_UpperArm', P.r[0], P.armW * (P.rw ?? 1), true); this.aimLimb('Bip01_R_Forearm', P.r[1], P.armW * (P.rw ?? 1), true); }
      if (P.l) { this.aimLimb('Bip01_L_UpperArm', P.l[0], P.armW * (P.lw ?? 1), true); this.aimLimb('Bip01_L_Forearm', P.l[1], P.armW * (P.lw ?? 1), true); }
    }
    if (P.legW > 0 && P.legs) {
      this.aimLimb('Bip01_R_Thigh', P.legs[0], P.legW); this.aimLimb('Bip01_R_Calf', P.legs[1], P.legW);
      this.aimLimb('Bip01_L_Thigh', P.legs[2], P.legW); this.aimLimb('Bip01_L_Calf', P.legs[3], P.legW);
    }
  }
  handPos(side, out) { // palm centre in world space
    const h = this.bones[side === 'R' ? 'Bip01_R_Hand' : 'Bip01_L_Hand'], f = this.bones[side === 'R' ? 'Bip01_R_Finger21' : 'Bip01_L_Finger21'];
    h.getWorldPosition(out); f.getWorldPosition(_v3); return out.lerp(_v3, 0.55);
  }
  // replay capture
  capture(arr, o) {
    for (const n of REC_BONES) { const b = this.bones[n]; arr[o++] = b.quaternion.x; arr[o++] = b.quaternion.y; arr[o++] = b.quaternion.z; arr[o++] = b.quaternion.w; }
    const p = this.bones.Bip01.position; arr[o++] = p.x; arr[o++] = p.y; arr[o++] = p.z; return o;
  }
  restore(a, b, t, o) {
    for (const n of REC_BONES) { const q = this.bones[n].quaternion; _q1.set(a[o], a[o + 1], a[o + 2], a[o + 3]); _q2.set(b[o], b[o + 1], b[o + 2], b[o + 3]); q.copy(_q1).slerp(_q2, t); o += 4; }
    this.bones.Bip01.position.set(lerp(a[o], b[o], t), lerp(a[o + 1], b[o + 1], t), lerp(a[o + 2], b[o + 2], t)); return o + 3;
  }
}
const REC_STRIDE_CHAR = REC_BONES.length * 4 + 3;

// ----- keyposes (character space: +Z forward, +Y up, -X = right side) -----
const POSE = {
  hold: { r: [[-0.42, -0.72, 0.5], [0.15, 0.25, 1]], l: [[0.38, -0.8, 0.42], [-0.3, 0.3, 1]] },
  windup: { r: [[-0.95, 0.42, -0.3], [-0.15, 0.95, -0.55]], l: [[0.35, 0.18, 1], [0.05, 0.25, 1]], spine: [-0.12, -0.62, 0.12] },
  release: { r: [[-0.45, 0.55, 0.75], [-0.05, 0.25, 1]], l: [[0.5, -0.4, 0.5], [0.2, -0.2, 1]], spine: [0.18, 0.4, -0.05] },
  follow: { r: [[0.25, -0.5, 0.85], [0.5, -0.5, 0.6]], l: [[0.55, -0.7, -0.2], [0.2, -0.6, 0.4]], spine: [0.38, 0.55, -0.08] },
  catchReady: { r: [[-0.32, -0.25, 0.92], [0.4, 0.38, 0.9]], l: [[0.32, -0.25, 0.92], [-0.4, 0.38, 0.9]], spine: [0.12, 0, 0] },
  secure: { r: [[-0.32, -0.7, 0.62], [0.75, 0.15, 0.6]], l: [[0.32, -0.7, 0.62], [-0.75, 0.15, 0.6]], spine: [0.38, 0, 0] },
  block: { r: [[-0.28, -0.3, 0.92], [0.35, 0.55, 0.8]], l: [[0.28, -0.3, 0.92], [-0.35, 0.55, 0.8]], spine: [0.08, 0, 0] },
  hit: { r: [[-0.85, 0.35, -0.3], [-0.3, 0.5, -0.4]], l: [[0.85, 0.35, -0.3], [0.3, 0.5, -0.4]], spine: [-0.42, 0, 0] },
  jump: { r: [[-0.6, 0.45, 0.35], [-0.2, 0.8, 0.3]], l: [[0.6, 0.45, 0.35], [0.2, 0.8, 0.3]] },
  dive: { r: [[-0.3, 1, 0.35], [-0.15, 1, 0.15]], l: [[0.3, 1, 0.35], [0.15, 1, 0.15]], spine: [-0.22, 0, 0] },
  celebrate: { r: [[-0.35, 1, 0.1], [-0.1, 1, 0.1]], l: [[0.35, 1, 0.1], [0.1, 1, 0.1]], spine: [-0.15, 0, 0] },
};
const LEGS_DIVE = [[-0.1, -1, -0.28], [-0.05, -0.75, -0.75], [0.12, -1, -0.12], [0.05, -0.85, -0.55]];
const LEGS_TUCK = [[-0.15, -0.35, 0.95], [-0.05, -0.95, -0.35], [0.15, -0.35, 0.95], [0.05, -0.95, -0.35]];
function mixDir(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mixPose(A, B, t) {
  const o = { r: [mixDir(A.r[0], B.r[0], t), mixDir(A.r[1], B.r[1], t)], l: [mixDir(A.l[0], B.l[0], t), mixDir(A.l[1], B.l[1], t)] };
  const sa = A.spine || [0, 0, 0], sb = B.spine || [0, 0, 0];
  o.spine = [lerp(sa[0], sb[0], t), lerp(sa[1], sb[1], t), lerp(sa[2], sb[2], t)];
  return o;
}
