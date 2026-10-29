import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Build } from '../anim/skeleton';
import type { Pose, RootTransform } from '../anim/pose';
import type { PlayerVisual, UniformMaterials } from './playerModel';

// ---------------------------------------------------------------------------
// Replaceable GLB/glTF athletes. A rigged humanoid (Mixamo-style, VRM-style,
// Rigify/Quaternius-style bone names) is driven by the same pose solver as the
// procedural player via direction-based retargeting: every limb bone is
// rotated so it points from its joint to the next joint of the solved pose,
// and the hips / spine / head copy the solved orientations relative to rest.
//
// Asset contract (see ASSETS.md): Y-up, faces +Z, any scale (auto-normalized),
// skinned humanoid. Materials whose names contain jersey/shirt, pants,
// helmet, sock(s), shoe/cleat are tinted with the team uniform colors.
// ---------------------------------------------------------------------------

type Key =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'upperArmL'
  | 'foreArmL'
  | 'handL'
  | 'upperArmR'
  | 'foreArmR'
  | 'handR'
  | 'thighL'
  | 'shinL'
  | 'footL'
  | 'thighR'
  | 'shinR'
  | 'footR';

const PATTERNS: Record<string, string[]> = {
  hips: ['hips', 'pelvis', 'hip'],
  spine: ['spine', 'spine0', 'abdomen', 'torso'],
  chest: ['spine2', 'chest', 'upperchest', 'spine1', 'spine02'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  upperArm: ['arm', 'upperarm', 'shoulder2', 'uparm'],
  foreArm: ['forearm', 'lowerarm', 'elbow'],
  hand: ['hand', 'wrist'],
  thigh: ['upleg', 'thigh', 'upperleg', 'leg1'],
  shin: ['leg', 'calf', 'shin', 'lowerleg', 'knee', 'leg2'],
  foot: ['foot', 'ankle'],
};

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/mixamorig\d*[:_]?/g, '')
    .replace(/^(def|bip\d*|b|j|jnt|bone|c|ctrl)[-_.: ]/g, '')
    .replace(/[\s:_.\-]/g, '');
}

function sideOf(raw: string): 'L' | 'R' | null {
  const n = raw.toLowerCase();
  if (/left|(^|[_.\-:\s])l($|[_.\-:\s])|\.l$|_l$|^l_/.test(n)) return 'L';
  if (/right|(^|[_.\-:\s])r($|[_.\-:\s])|\.r$|_r$|^r_/.test(n)) return 'R';
  return null;
}

function stripSide(n: string) {
  return n.replace(/left|right/g, '').replace(/^(l|r)(?=[a-z])/, '').replace(/(l|r)$/, '');
}

export function mapBones(root: THREE.Object3D): Partial<Record<Key, THREE.Bone>> {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const out: Partial<Record<Key, THREE.Bone>> = {};
  const take = (key: Key, cands: string[], side: 'L' | 'R' | null) => {
    if (out[key]) return;
    for (const c of cands) {
      const b = bones.find((bn) => {
        const s = sideOf(bn.name);
        if (side !== s) return false;
        return stripSide(normalize(bn.name)) === c;
      });
      if (b) {
        out[key] = b;
        return;
      }
    }
  };
  take('hips', PATTERNS.hips, null);
  take('chest', PATTERNS.chest, null);
  take('spine', PATTERNS.spine, null);
  take('neck', PATTERNS.neck, null);
  take('head', PATTERNS.head, null);
  for (const s of ['L', 'R'] as const) {
    take(`upperArm${s}` as Key, PATTERNS.upperArm, s);
    take(`foreArm${s}` as Key, PATTERNS.foreArm, s);
    take(`hand${s}` as Key, PATTERNS.hand, s);
    take(`thigh${s}` as Key, PATTERNS.thigh, s);
    take(`shin${s}` as Key, PATTERNS.shin, s);
    take(`foot${s}` as Key, PATTERNS.foot, s);
  }
  if (out.spine === out.chest) delete out.spine;
  return out;
}

const REQUIRED: Key[] = ['hips', 'head', 'upperArmL', 'foreArmL', 'upperArmR', 'foreArmR', 'thighL', 'shinL', 'thighR', 'shinR'];

interface Template {
  scene: THREE.Object3D;
  height: number;
  missing: Key[];
  name: string;
}

let template: Template | null = null;
let factory: ((m: UniformMaterials, n: number, b: Build, seed: number) => PlayerVisual) | null = null;
const listeners = new Set<() => void>();

export function getGlbFactory() {
  return factory;
}
export function getGlbInfo() {
  return template ? { name: template.name, missing: template.missing, height: template.height } : null;
}
export function onGlbChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadGlb(data: ArrayBuffer, name: string): Promise<{ ok: boolean; message: string }> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, '');
  return useTemplate(gltf.scene, name);
}

export function useTemplate(scene: THREE.Object3D, name: string): { ok: boolean; message: string } {
  scene.updateMatrixWorld(true);
  const map = mapBones(scene);
  const missing = REQUIRED.filter((k) => !map[k]);
  if (missing.length) {
    return { ok: false, message: `Could not find humanoid bones: ${missing.join(', ')}. Rename bones (Mixamo naming works) and try again.` };
  }
  const box = new THREE.Box3().setFromObject(scene);
  const height = box.max.y - box.min.y;
  template = { scene, height, missing, name };
  factory = (m, _n, b, seed) => new GlbPlayer(template!, m, b, seed);
  listeners.forEach((f) => f());
  return { ok: true, message: `Loaded ${name}: ${Object.keys(map).length} bones mapped, height ${height.toFixed(2)} units.` };
}

export function clearGlb() {
  template = null;
  factory = null;
  listeners.forEach((f) => f());
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

interface Chain {
  bone: THREE.Bone;
  key: Key;
  restWorldQ: THREE.Quaternion; // in model space
  restDir: THREE.Vector3 | null; // model space, toward the next joint
}

class GlbPlayer implements PlayerVisual {
  readonly object = new THREE.Group();
  private model: THREE.Object3D;
  private chains: Chain[] = [];
  private scale: number;
  private hipsRestLocal = new THREE.Vector3();
  private bones: Partial<Record<Key, THREE.Bone>>;
  private materials: THREE.Material[] = [];
  private foreDelta = [new THREE.Quaternion(), new THREE.Quaternion()];

  constructor(t: Template, mats: UniformMaterials, build: Build, seed: number) {
    this.model = SkeletonUtils.clone(t.scene);
    this.scale = (1.88 * build.height) / t.height;
    this.model.scale.setScalar(this.scale);
    this.object.add(this.model);
    this.model.updateMatrixWorld(true);
    this.bones = mapBones(this.model);
    void seed;
    // tint uniform materials
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((mat) => {
        const n = (mat.name || '').toLowerCase();
        const c = mat.clone() as THREE.MeshStandardMaterial;
        this.materials.push(c);
        const u = mats.uniform;
        if (/jersey|shirt|top|torso/.test(n)) c.color?.set(u.jersey);
        else if (/pant|short|leg/.test(n)) c.color?.set(u.pants);
        else if (/helmet|hat|cap/.test(n)) c.color?.set(u.helmet);
        else if (/sock/.test(n)) c.color?.set(u.socks);
        else if (/shoe|cleat|boot/.test(n)) c.color?.set(u.cleats);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    // rest data in model space (relative to this.model)
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    const worldQ = (b: THREE.Object3D) => {
      _m.multiplyMatrices(inv, b.matrixWorld);
      const q = new THREE.Quaternion();
      _m.decompose(_v, q, _v2);
      return q;
    };
    const posOf = (b: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
    const next: Partial<Record<Key, Key>> = {
      upperArmL: 'foreArmL',
      foreArmL: 'handL',
      upperArmR: 'foreArmR',
      foreArmR: 'handR',
      thighL: 'shinL',
      shinL: 'footL',
      thighR: 'shinR',
      shinR: 'footR',
    };
    const order: Key[] = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
    for (const k of order) {
      const b = this.bones[k];
      if (!b) continue;
      const nk = next[k];
      const nb = nk ? this.bones[nk] : undefined;
      this.chains.push({
        bone: b,
        key: k,
        restWorldQ: worldQ(b),
        restDir: nb ? posOf(nb).sub(posOf(b)).normalize() : null,
      });
    }
    if (this.bones.hips) this.hipsRestLocal.copy(this.bones.hips.position);
  }

  applyPose(p: Pose, root: RootTransform) {
    this.object.position.set(root.X, 0, root.Z);
    this.object.rotation.set(0, root.yaw, 0);
    this.object.updateMatrixWorld(true);
    const modelInvQ = new THREE.Quaternion();
    for (const c of this.chains) {
      const b = c.bone;
      const parent = b.parent!;
      // desired orientation in model space
      let desired: THREE.Quaternion;
      switch (c.key) {
        case 'hips':
          desired = _q.copy(p.pelvisQ).multiply(c.restWorldQ);
          break;
        case 'spine':
          desired = _q.copy(p.pelvisQ).slerp(p.torsoQ, 0.5).multiply(c.restWorldQ);
          break;
        case 'chest':
          desired = _q.copy(p.torsoQ).multiply(c.restWorldQ);
          break;
        case 'neck':
          desired = _q.copy(p.torsoQ).slerp(p.headQ, 0.5).multiply(c.restWorldQ);
          break;
        case 'head':
          desired = _q.copy(p.headQ).multiply(c.restWorldQ);
          break;
        case 'footL':
        case 'footR':
          desired = _q.copy(p.footQ[c.key === 'footL' ? 0 : 1]).multiply(c.restWorldQ);
          break;
        case 'handL':
        case 'handR': {
          // follow the forearm's rotation from rest
          desired = _q.copy(this.foreDelta[c.key === 'handL' ? 0 : 1]).multiply(c.restWorldQ);
          break;
        }
        default: {
          const s = c.key.endsWith('L') ? 0 : 1;
          const [a, bb] = this.jointsFor(c.key, p, s);
          _v.subVectors(bb, a).normalize();
          desired = _q.copy(this.dirQuat(c, _v));
          if (c.key.startsWith('foreArm') && c.restDir) this.foreDelta[s].setFromUnitVectors(c.restDir, _v);
        }
      }
      // model space → parent local
      parent.updateMatrixWorld(true);
      _m.multiplyMatrices(new THREE.Matrix4().copy(this.model.matrixWorld).invert(), parent.matrixWorld);
      _m.decompose(_v2, modelInvQ, _v);
      b.quaternion.copy(modelInvQ.invert().multiply(desired));
      if (c.key === 'hips') {
        // place hips at the solved pelvis height (model units)
        const target = _v.copy(p.pelvis).divideScalar(this.scale);
        _m.copy(parent.matrixWorld).invert().multiply(this.model.matrixWorld);
        target.applyMatrix4(_m);
        b.position.copy(target);
      }
      b.updateMatrixWorld(true);
    }
  }

  private jointsFor(k: Key, p: Pose, s: number): [THREE.Vector3, THREE.Vector3] {
    if (k.startsWith('upperArm')) return [p.shoulder[s], p.elbow[s]];
    if (k.startsWith('foreArm')) return [p.elbow[s], p.wrist[s]];
    if (k.startsWith('thigh')) return [p.hip[s], p.knee[s]];
    return [p.knee[s], p.ankle[s]];
  }

  private dirQuat(c: Chain, dir: THREE.Vector3): THREE.Quaternion {
    if (!c.restDir) return _q2.copy(c.restWorldQ);
    _q2.setFromUnitVectors(c.restDir, dir);
    return _q2.multiply(c.restWorldQ);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}
