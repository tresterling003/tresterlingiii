// Loads every model once and hands out copies.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const FILES = ['knight', 'barbarian', 'mage', 'rogue', 'warden', 'bones', 'stalker', 'guard', 'chanter', 'horse', 'wolf', 'town', 'nature', 'dungeon', 'gear'];
export const A = { models: {}, clips: {}, kits: {} };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const packed = window.REALM_PACKED ? (await import('./assets/models.js')).default : null;
  const parse = async name => {
    if (!packed) return loader.loadAsync(`assets/${name}.glb`);
    const bin = atob(packed[name]), buf = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
    const cib = self.createImageBitmap;
    self.createImageBitmap = undefined; // decode textures through <img>, which every host allows
    try { return await loader.parseAsync(buf.buffer, ''); } finally { self.createImageBitmap = cib; }
  };
  let done = 0;
  await Promise.all(FILES.map(async name => {
    try {
      const g = await parse(name);
      if (['town', 'nature', 'dungeon', 'gear'].includes(name)) {
        A.kits[name] = {};
        g.scene.children.forEach(c => { A.kits[name][c.name] = c; });
      } else {
        A.models[name] = g.scene;
        if (g.animations.length) A.clips[name] = g.animations;
      }
    } catch (e) { console.warn('could not load', name, e); }
    onProgress(++done / FILES.length);
  }));
  // Characters share one rig: every model can use the knight's clips; skeletons add their own.
  A.heroClips = A.clips.knight || [];
  A.boneClips = [...(A.clips.bones || []), ...A.heroClips.filter(c => !(A.clips.bones || []).some(b => b.name === c.name))];
  // Matte shading: KayKit's flat colour atlases look the same with the much cheaper Lambert model.
  const lambert = m => {
    const l = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity ?? 1,
      transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: m.vertexColors, alphaTest: m.alphaTest, morphTargets: m.morphTargets });
    l.name = m.name;
    return l;
  };
  const convert = root => root.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(lambert) : lambert(o.material); o.castShadow = o.receiveShadow = true; } });
  for (const kit of Object.values(A.kits)) for (const n of Object.values(kit)) convert(n);
  for (const [name, m] of Object.entries(A.models)) convert(m);
}

// A fresh copy of one kit model, scaled.
export function part(kit, name, scale = 1) {
  const src = A.kits[kit] && A.kits[kit][name];
  if (!src) return new THREE.Group();
  const o = src.clone();
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.scale.setScalar(scale);
  return o;
}

// The meshes of a kit model, flattened, for instancing: [{ geometry, material }]
const bakedCache = {};
export function baked(kit, name) {
  const key = kit + '/' + name;
  if (bakedCache[key]) return bakedCache[key];
  const src = A.kits[kit] && A.kits[kit][name];
  const out = [];
  if (src) {
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    src.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out.push({ geometry: g, material: o.material });
    });
  }
  return (bakedCache[key] = out);
}

// Size of a kit model at scale 1: { x, y, z, minY }
export function kitSize(kit, name) {
  const src = A.kits[kit] && A.kits[kit][name];
  if (!src) return { x: 1, y: 1, z: 1, minY: 0, cx: 0, cz: 0 };
  const b = new THREE.Box3().setFromObject(src.clone());
  const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  return { x: s.x, y: s.y, z: s.z, minY: b.min.y, cx: c.x, cz: c.z };
}

// A character model: cloned with its own skeleton, weapons chosen, optionally tinted.
// opts: { gear: [names shown in the hands], hat: bool, tint, ghost }
export function character(model, opts = {}) {
  const src = A.models[model];
  if (!src) return null;
  const o = SkeletonUtils.clone(src);
  const mats = [];
  o.traverse(m => {
    if (m.parent && /^handslot/.test(m.parent.name) && m.isObject3D && m.parent.name !== m.name) m.visible = (opts.gear || []).includes(m.name);
    if (/_(Helmet|Hat)$/.test(m.name) && opts.hat === false) m.visible = false;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.material = m.material.clone();
    if (opts.tint) m.material.color.set(opts.tint);
    mats.push(m.material);
  });
  // skeletons carry weapons from the gear kit
  for (const g of opts.gear || []) {
    if (!/^Skeleton_/.test(g)) continue;
    const slot = o.getObjectByName(/Shield/.test(g) ? 'handslotl' : 'handslotr') || o.getObjectByName(/Shield/.test(g) ? 'handslot.l' : 'handslot.r');
    if (slot && A.kits.gear && A.kits.gear[g]) { const w = A.kits.gear[g].clone(); w.position.set(0, 0, 0); w.rotation.set(0, 0, 0); slot.add(w); }
  }
  if (opts.ghost) mats.forEach(m => { m.transparent = true; m.opacity = 0.45; m.depthWrite = false; m.emissive && m.emissive.set(0x6f9cff); m.emissiveIntensity = 0.9; });
  return { object: o, mats, clips: /^(bones|stalker|guard|chanter)$/.test(model) ? A.boneClips : A.heroClips };
}
