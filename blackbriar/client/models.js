// Rigged characters: the Monitor (prototype art) and remote coworkers. Body: Mixamo "Michelle"; animation: Mixamo "Soldier"
// idle/walk/run (both from the three.js example models). Face: Lee Perry-Smith head scan (CC BY 3.0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { rng } from '../shared/level.js';
import { textCanvas } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t, sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
async function loadGLB(url) {
  const j = await (await fetch(url)).json();
  const str = atob(j.glb), buf = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  const cib = window.createImageBitmap; try { window.createImageBitmap = undefined; } catch (e) { }
  const p = new GLTFLoader().parseAsync(buf.buffer, '');
  try { window.createImageBitmap = cib; } catch (e) { }
  return await p;
}
let BODY = null, HEAD = null, FACE = null, HEAD_NORMAL = null;
export async function loadModels(onProgress) {
  HEAD_NORMAL = new THREE.TextureLoader().load('assets/head_normal.jpg');
  const [g, anims, h] = await Promise.all([loadGLB('assets/body.json'), fetch('assets/anims.json').then(r => r.json()), loadGLB('assets/head.json')]);
  const clips = {}; for (const j of anims) { const c = THREE.AnimationClip.parse(j); clips[c.name.toLowerCase()] = c; }
  const arm = g.scene.getObjectByName('Character'); if (arm) arm.rotation.x = -Math.PI / 2;
  let tex = null; g.scene.traverse(o => { if (o.isSkinnedMesh && o.material.map) tex = o.material.map; });
  BODY = { scene: g.scene, clips, tex };
  let mesh = null; h.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const m = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial()); m.updateMatrixWorld();
  const rc = new THREE.Raycaster(), eyes = [];
  for (const x of [-0.62, 0.62]) { rc.set(new THREE.Vector3(x, 1.68, 20), new THREE.Vector3(0, 0, -1)); const hit = rc.intersectObject(m)[0]; eyes.push(hit ? hit.point : new THREE.Vector3(x, 1.68, 2)); }
  HEAD = { geo: mesh.geometry, eyes };
}
function faceGeometry() { // gaunt: sunken eyes and cheeks, slack jaw as a morph target
  if (FACE) return FACE;
  const src = HEAD.geo, pos = src.attributes.position, idx = src.index, keep = [];
  if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); if (pos.getY(a) > -1.5 && pos.getY(b) > -1.5 && pos.getY(c) > -1.5) keep.push(a, b, c); }
  const g = src.clone(); if (idx) g.setIndex(keep);
  const base = new Float32Array(pos.count * 3), m = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const front = sstep(0.2, 1.3, z), mid = sstep(1.8, 0.9, Math.abs(x));
    const eye = Math.exp(-((Math.abs(x) - 0.62) ** 2) / (2 * 0.26 * 0.26) - ((y - 1.66) ** 2) / (2 * 0.2 * 0.2)) * front;
    const cheek = Math.exp(-((Math.abs(x) - 0.95) ** 2) / (2 * 0.3 * 0.3) - ((y - 0.7) ** 2) / (2 * 0.35 * 0.35)) * front;
    const temple = Math.exp(-((Math.abs(x) - 1.3) ** 2) / (2 * 0.25 * 0.25) - ((y - 1.9) ** 2) / (2 * 0.4 * 0.4));
    // the resting face is already wrong: deep sockets, hollow cheeks and temples, a longer skull
    const bx = x * (1 - cheek * 0.15 - temple * 0.08), by = y * 1.12 - cheek * 0.12, bz = z - eye * 0.5 - cheek * 0.3;
    base[i * 3] = bx; base[i * 3 + 1] = by; base[i * 3 + 2] = bz;
    const jaw = sstep(0.36, 0.06, y) * front * mid;
    m[i * 3] = bx; m[i * 3 + 1] = by - jaw * 1.4; m[i * 3 + 2] = bz - jaw * 0.1;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(base, 3)); g.computeVertexNormals();
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(m, 3)]; g.morphTargetsRelative = false;
  FACE = g; return g;
}
function rigged(stretch, scale) {
  const model = SkeletonUtils.clone(BODY.scene); model.rotation.y = Math.PI;
  const bones = {}; const meshes = [];
  model.traverse(o => { if (o.isBone) bones[o.name.replace('mixamorig', '')] = o; if (o.isSkinnedMesh) { o.frustumCulled = false; meshes.push(o); } });
  const fixed = [];
  for (const [n, k] of Object.entries(stretch)) if (bones[n]) fixed.push([bones[n], bones[n].position.clone().multiplyScalar(k)]);
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const n of ['idle', 'walk', 'run']) { const a = mixer.clipAction(BODY.clips[n]); a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); acts[n] = a; }
  const root = new THREE.Group(); root.add(model); root.scale.setScalar(scale);
  return { root, model, bones, meshes, fixed, mixer, acts, w: { idle: 1, walk: 0, run: 0 }, hipRest: bones.Hips.position.clone() };
}
function animate(r, dt, mode, speed) {
  for (const k of ['idle', 'walk', 'run']) { r.w[k] = lerp(r.w[k], k === mode ? 1 : 0, 1 - Math.pow(0.002, dt)); r.acts[k].setEffectiveWeight(r.w[k]); }
  r.acts.walk.timeScale = 0.9 * speed; r.acts.run.timeScale = 1.1 * speed; r.acts.idle.timeScale = 0.6;
  r.mixer.update(dt);
  for (const [b, p] of r.fixed) b.position.copy(p);
  r.bones.Hips.position.set(r.hipRest.x, -r.hipRest.y, -r.hipRest.z);
}

// ---------- THE MONITOR (prototype creature art) ----------
export function makeMonitor() {
  const r = rigged({ LeftForeArm: 1.42, RightForeArm: 1.42, LeftHand: 1.5, RightHand: 1.5, LeftLeg: 1.12, RightLeg: 1.12, Neck: 1.2, Head: 1.9, Spine2: 1.15, Spine1: 1.08, LeftShoulder: 1.12, RightShoulder: 1.12 }, 1.27);
  for (const b of Object.keys(r.bones)) if (/Hand(Index|Middle|Ring|Pinky)[123]$/.test(b)) r.fixed.push([r.bones[b], r.bones[b].position.clone().multiplyScalar(2.1)]);
  // institutional uniform: the body texture is desaturated and darkened into a stained grey-brown cloth
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.34, metalness: 0 }); // bare display-mannequin plastic, scuffed by the grade
  for (const m of r.meshes) m.material = mat;
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a7258, normalMap: HEAD_NORMAL, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.62, metalness: 0 });
  skin.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{ vec3 n = normalize(vNormal); diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(-0.2, 0.8, n.y + 0.4); }'); }; // grime settles into the hollows
  const face = new THREE.Group(); r.bones.Neck.add(face);
  const fm = new THREE.Mesh(faceGeometry(), skin); fm.morphTargetInfluences = [0.15]; fm.position.set(0, 0.2, -0.3); face.add(fm); face.scale.setScalar(4.1);
  const hole = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pupils = [];
  for (const p of HEAD.eyes) { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hole); e.scale.set(0.4, 0.32, 0.16); e.position.set(p.x * 0.95, p.y * 1.12 - 0.04, p.z - 0.5); fm.add(e);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6d675a })); pu.scale.setScalar(0.6); pu.position.set(p.x * 0.9, p.y * 1.12 - 0.02, p.z - 0.4); fm.add(pu); pupils.push(pu); }
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.95, depthWrite: false })); fm.add(mouth);
  // thin, plastered-down hair
  const hm = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.4 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.95, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), hm); cap.scale.set(0.98, 0.6, 1.05); cap.position.set(0, 3.25, -0.2); cap.visible = false; fm.add(cap); // bald, skull-like
  // lanyard and ID badge, keys on the belt, a clipboard in the right hand
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.11), new THREE.MeshStandardMaterial({ map: textCanvas(64, 88, (x, w, h) => { x.fillStyle = '#e8e2cc'; x.fillRect(0, 0, w, h); x.fillStyle = '#334'; x.fillRect(6, 8, 26, 30); x.font = 'bold 8px Arial'; x.fillText('STAFF', 36, 18); x.fillText('R. VOSS', 6, 54); x.font = '7px Arial'; x.fillText('ATTENDANCE', 6, 66); x.fillStyle = '#7a1a14'; x.fillRect(0, 78, w, 10); }), roughness: 0.6 }));
  const chest = r.bones.Spine2; const bg = new THREE.Group(); chest.add(bg); bg.position.set(0, 8, 14); bg.scale.setScalar(100); bg.add(badge); badge.visible = false;
  const clip = new THREE.Group(); const cb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.01), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 })); clip.add(cb);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ map: textCanvas(64, 84, (x, w, h) => { x.fillStyle = '#ddd6bf'; x.fillRect(0, 0, w, h); x.fillStyle = '#333'; for (let i = 0; i < 9; i++) { x.fillRect(4, 10 + i * 8, 34, 2); x.fillStyle = '#922'; x.fillRect(44, 9 + i * 8, 12, 3); x.fillStyle = '#333'; } }), roughness: 0.9 })); paper.position.z = 0.006; clip.add(paper);
  const hand = r.bones.RightHand; const hg = new THREE.Group(); hand.add(hg); hg.scale.setScalar(100); hg.add(clip); clip.visible = false; // mannequins carry nothing clip.position.set(0, 0.18, 0.04); clip.rotation.set(0.2, 0, 0);
  const st = { r, root: r.root, face, fm, mouth, tw: 0, twT: 1, twR: new THREE.Euler(), headYaw: 0, scr: 0.15 };
  st.update = (dt, mode, speed, t, look) => {
    animate(r, dt, mode, speed);
    const bones = r.bones;
    if (bones.Head) { bones.Head.scale.setScalar(0.001); face.position.copy(bones.Head.position); face.quaternion.copy(bones.Head.quaternion); }
    // stoop: a hunched supervisor leaning forward from the upper spine
    if (bones.Spine1) bones.Spine1.rotation.x += mode === 'run' ? 0.45 : 0.22;
    if (bones.Spine2) bones.Spine2.rotation.x += 0.12;
    // head tracking toward the look target (clamped), plus a crooked tilt and sudden twitches
    if (st.lock) st.headYaw = 0; else if (look) { st.headYaw = lerp(st.headYaw, Math.max(-1.2, Math.min(1.2, look)), 1 - Math.pow(0.02, dt)); }
    face.rotation.y += st.headYaw; face.rotation.z += 0.32 + Math.sin(t * 0.9) * 0.04; face.rotation.x += mode === 'run' ? -0.1 : -0.25;
    st.twT -= dt; if (st.twT < 0) { st.twT = (mode === 'run' ? 0.3 : 0.9) + Math.random() * (mode === 'run' ? 0.7 : 3); st.tw = 0.11; st.twR.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.1); }
    if (st.lock) st.tw = 0;
    if (st.tw > 0) { st.tw -= dt; face.rotation.x += st.twR.x; face.rotation.y += st.twR.y; face.rotation.z += st.twR.z; }
    fm.morphTargetInfluences[0] = lerp(fm.morphTargetInfluences[0], st.scr, 1 - Math.pow(0.002, dt));
    const j = fm.morphTargetInfluences[0]; mouth.position.set(0, 0.3 - j * 0.75, 2.3 - j * 0.12); mouth.scale.set(0.55 + j * 0.3, 0.08 + j * 1.5, 1);
  };
  st.faceWorld = (v) => face.getWorldPosition(v);
  return st;
}

// ---------- coworkers (remote players) ----------
export function makeWorker(name, color = 0x41597a) {
  const r = rigged({}, 1.0);
  const mat = new THREE.MeshStandardMaterial({ map: BODY.tex, color, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(.3,.59,.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l)*1.4, .55); }'); };
  for (const m of r.meshes) m.material = mat;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: textCanvas(256, 64, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 8, w, 48); x.fillStyle = '#fff'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText(name, w / 2, 44); }), depthTest: false, transparent: true }));
  tag.scale.set(0.8, 0.2, 1); tag.position.y = 2.05; r.root.add(tag);
  const st = { r, root: r.root, tag };
  st.update = (dt, mode, speed) => animate(r, dt, mode, speed);
  st.hand = r.bones.RightHand;
  return st;
}
