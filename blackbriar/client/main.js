// AFTER HOURS: BLACKBRIAR HIGH — client
import * as THREE from 'three';
import { CONFIG } from '../shared/config.js';
import { ROOMS, DOORS, LOCKERS, SEARCHABLE, DEBRIS, PATCHES, LIGHTS, CLUES, BINS, TOOL_RACK, COMPUTER, COT, VENT, SPAWN, CLUE_SPOT, BUCKET, roomAt, progressRoom, solidRects, moveCircle, segBlocked, doorCenter, groundY, rng, initialMask, MANNEQUIN_SPOTS } from '../shared/level.js';
import { Sim, clockText, gameClock, vacStats, mopStats, inOffice } from '../shared/sim.js';
import { buildWorld, makeVacuumModel, makeMopModel, makeCartModel, makeRoombaModel } from './world.js';
import { loadModels, makeMonitor, makeWorker, buildMannequinCrowd, updateCrowd } from './models.js';
import { loadProps } from './props.js';
import { makePost } from './post.js';
import { Audio3D } from './audio.js';
import { LocalTransport, WSTransport, serverAvailable, loadSolo, clearSolo, getRoomApi, RoomHost, RoomGuest, newRoomCode } from './net.js';
import { textCanvas, dirtTextures } from './textures.js';
import { initScares, updateScares, spawnWatcher, startLightsOut, scareLight, clearScares, scareDebug } from './scares.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const NORENDER = new URLSearchParams(location.search).has('norender'); // test-only: logic and networking without drawing
const isTouch = matchMedia('(pointer:coarse)').matches && 'ontouchstart' in window;
const store = { get(k, d) { try { const v = localStorage.getItem('blackbriar.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('blackbriar.' + k, JSON.stringify(v)); } catch { } } };
document.body.classList.toggle('touchui', isTouch);
const settings = Object.assign({ calm: false, sens: 1, fov: 74, bob: true, inv: false, quality: isTouch ? 1 : 2, vol: 0.9 }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);
if (!store.get('scaresBack', false)) { settings.calm = false; store.set('scaresBack', true); saveSettings(); } // calm mode was the default while testing; scares are on again
let pid = store.get('pid', null); if (!pid) { pid = 'p' + Math.random().toString(36).slice(2, 10); store.set('pid', pid); }

// ======================= renderer / scene =======================
const renderer = new THREE.WebGLRenderer({ antialias: settings.quality > 0, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = settings.quality >= 2; renderer.shadowMap.type = THREE.PCFShadowMap;
$('view').appendChild(renderer.domElement); renderer.domElement.tabIndex = 0;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020202); scene.fog = new THREE.FogExp2(0x0c0c0e, 0.018); // dark air: the far end of every hall dissolves
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 120); camera.rotation.order = 'YXZ'; scene.add(camera);
scene.add(new THREE.HemisphereLight(0xdfe4ee, 0x2a2a26, 0.16));
const flash = new THREE.SpotLight(0xfff2dc, 0, 16, 0.42, 0.45, 1.6); flash.position.set(-0.2, -0.2, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, -0.05, -1);
flash.castShadow = settings.quality >= 2; flash.shadow.mapSize.set(512, 512); flash.shadow.bias = -0.0005; flash.shadow.camera.near = 0.2;
const POOL = []; for (let i = 0; i < (settings.quality === 0 ? 2 : settings.quality === 1 ? 3 : 4); i++) { const l = new THREE.PointLight(0xffffff, 0, 8, 2); scene.add(l); POOL.push(l); }
let renderScale = 1; // adaptive: lowered when frames run slow, raised again when there is headroom
function resize() { const pr = Math.min(devicePixelRatio, settings.quality === 0 ? 1 : settings.quality === 1 ? 1.25 : 1.5) * (settings.quality === 0 ? 0.75 : 1) * renderScale; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); if (post) post.setSize(innerWidth, innerHeight, pr); camera.aspect = innerWidth / innerHeight; camera.fov = settings.fov; camera.updateProjectionMatrix(); }
let post = null;
addEventListener('resize', resize); resize();
try { post = makePost(renderer, scene, camera, settings.quality); resize(); } catch (e) { console.warn('post-processing unavailable', e); post = null; }

// ======================= state =======================
let W = null;             // world handles
let mirror = null;        // local copy of authoritative state (a Sim used for its data + helpers only)
let net = null, mode = null, room = null, upgrades = { suction: 0, bag: 0, quiet: 0, light: 0 };
let phase = 'shift', shiftT = 0, money = 0, day = 1, inv = { vacuum: false, mop: false }, myBag = 0, discoveries = [], summary = null, crewSnap = [], monSnap = [];
let playing = false, ui = null; // ui: null | 'pause' | 'bag' | 'os' | 'summary' | 'reader'
const P = { x: SPAWN.x, z: SPAWN.z, y: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, crouch: 0, bob: 0, stepD: 0, tool: 'none', light: false, downed: false, out: false };
const keys = {}; let mouseL = false, mouseR = false;
const audio = new Audio3D(); audio.vol = settings.vol;

// ======================= loading =======================
const loadingEl = $('loading');
let monitor = null; const BOOT = {};
async function boot() {
  const tl0 = performance.now(); let props = {};
  try { [, props] = await Promise.all([loadModels(), loadProps()]); BOOT.load = Math.round(performance.now() - tl0); } catch (e) { console.error(e); loadingEl.textContent = 'Could not load models: ' + e.message; }
  const tw0 = performance.now(); W = buildWorld(scene, renderer, { props }); BOOT.world = Math.round(performance.now() - tw0);
  mirror = new Sim(null);
  buildDebris(); buildMasks(); buildFX(); buildPrints(); buildViewmodels(); buildCCTV();
  if (monitorAvailable()) { monitor = makeMonitor(); monitor.root.position.set(47.5, 0, 11); scene.add(monitor.root); }
  const tc0 = performance.now(); try { W.crowd = buildMannequinCrowd(scene, MANNEQUIN_SPOTS.filter(s => s.y < -1), -4); W.crowd2 = buildMannequinCrowd(scene, MANNEQUIN_SPOTS.filter(s => s.y > -1), 0); } catch (e) { console.warn('mannequin crowd', e); } BOOT.crowd = Math.round(performance.now() - tc0);
  initScares({ scene, camera, P, audio, bake: W.bake, doors: () => mirror.doors, makeGhost: () => monitorAvailable() ? makeMonitor() : null, onSeen: () => { dread = Math.min(1, dread + 0.35); }, lightAt: (x, z) => { let k = 0; const t = performance.now() / 1000; for (const L of LIGHTS) { const d = Math.hypot(L.x - x, L.z - z); if (d < 5) k += fixtureLevel(L, t) * (1 - d / 5); } return Math.min(1, k); } });
  // reflection environment captured from the hallway itself
  placePool(14, 1.8, true);
  const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); const cc = new THREE.CubeCamera(0.1, 60, cube); cc.position.set(12, 1.4, 1.8); scene.add(cc); cc.update(renderer, scene);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromCubemap(cube.texture).texture; scene.environmentIntensity = 0.55; cube.dispose(); scene.remove(cc);
  loadingEl.hidden = true;
  showEntry();
  requestAnimationFrame(frame);
}
function monitorAvailable() { try { return !!makeMonitor; } catch { return false; } }

// ======================= debris =======================
const KIND = [
  { geo: new THREE.IcosahedronGeometry(0.022, 0).scale(1.4, 0.45, 1.2), mat: new THREE.MeshStandardMaterial({ color: 0x8a8174, roughness: 1 }), h: 0.008 },          // dust clump
  { geo: new THREE.DodecahedronGeometry(0.009, 0), mat: new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 }), h: 0.008 },                           // crumb
  { geo: new THREE.PlaneGeometry(0.06, 0.04).rotateX(-Math.PI / 2), mat: new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.9, side: THREE.DoubleSide }), h: 0.004 }, // paper scrap
  { geo: new THREE.PlaneGeometry(0.014, 0.014).rotateX(-Math.PI / 2), mat: new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), h: 0.003 }, // confetti
  { geo: new THREE.TorusGeometry(0.012, 0.004, 4, 8).rotateX(Math.PI / 2).scale(1.3, 1, 0.8), mat: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 1 }), h: 0.004 }, // lint
  { geo: new THREE.CylinderGeometry(0.012, 0.012, 0.002, 16), mat: new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: 0.22, emissive: 0x332200, emissiveIntensity: 0.4 }), h: 0.0015 }, // dropped coin
];
const CONF = [0xd94a3a, 0x3a8ad9, 0xe8c341, 0x4bb36a, 0xb855c9];
let DB = null; // { meshes, slot:[kind,index], pos: Float32Array x,y,z, hidden: Uint8Array, grid: Map }
const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), eul = new THREE.Euler(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
function buildDebris() {
  // one InstancedMesh per (room, kind) so rooms out of view are culled
  const groups = new Map(); for (const d of DEBRIS) { const k = d.room + ':' + d.kind; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  const meshes = [], slot = new Int32Array(DEBRIS.length * 2), pos = new Float32Array(DEBRIS.length * 3), rot = new Float32Array(DEBRIS.length);
  const grid = new Map(), col = new THREE.Color();
  for (const [key, list] of groups) {
    const kind = list[0].kind, im = new THREE.InstancedMesh(KIND[kind].geo, KIND[kind].mat, list.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.receiveShadow = true;
    const mi = meshes.length; meshes.push(im); scene.add(im);
    list.forEach((d, i) => {
      slot[d.id * 2] = mi; slot[d.id * 2 + 1] = i;
      pos[d.id * 3] = d.x; pos[d.id * 3 + 1] = groundY(d.x, d.z) + KIND[d.kind].h * d.s; pos[d.id * 3 + 2] = d.z; rot[d.id] = d.rot;
      if (kind === 3) im.setColorAt(i, col.setHex(CONF[(d.c * 5) | 0]));
      if (kind === 2) im.setColorAt(i, col.setHSL(0.1, 0.25, 0.82 + d.c * 0.12));
      if (kind === 0) im.setColorAt(i, col.setHSL(0.09, 0.08, 0.38 + d.c * 0.18));
      const g = Math.floor(d.x) + ',' + Math.floor(d.z); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(d.id);
    });
  }
  DB = { meshes, slot, pos, rot, hidden: new Uint8Array(DEBRIS.length), grid, active: new Map() };
  for (const d of DEBRIS) writeDebris(d.id);
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); if (m.boundingSphere) m.boundingSphere.radius += 2; }
}
function writeDebris(id, spin = 0) {
  const k = DB.slot[id * 2], i = DB.slot[id * 2 + 1], d = DEBRIS[id];
  if (DB.hidden[id]) { m4.makeScale(0, 0, 0); }
  else { eul.set(spin * 0.7, DB.rot[id] + spin, spin * 0.4); qq.setFromEuler(eul); m4.compose(v3.set(DB.pos[id * 3], DB.pos[id * 3 + 1], DB.pos[id * 3 + 2]), qq, sc3.setScalar(d.s)); }
  DB.meshes[k].setMatrixAt(i, m4); DB.meshes[k].instanceMatrix.needsUpdate = true;
}
function hideDebris(id) { if (DB.hidden[id]) return; DB.hidden[id] = 1; DB.active.delete(id); writeDebris(id); }
function applyCollected(arr) { for (let i = 0; i < arr.length; i++) if (arr[i]) hideDebris(i); }

// ======================= dirt masks =======================
const MASKS = {};
function buildMasks() {
  const dt = dirtTextures();
  for (const p of PATCHES) {
    const data = mirror.masks[p.id];
    const tex = new THREE.DataTexture(new Uint8Array(p.w * p.h), p.w, p.h, THREE.RedFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.flipY = false;
    const wet = new THREE.DataTexture(new Uint8Array(p.w * p.h), p.w, p.h, THREE.RedFormat); wet.magFilter = THREE.LinearFilter; wet.minFilter = THREE.LinearFilter;
    const isMud = p.type === 'mud', col = (isMud ? dt.mud : dt.dust).clone(); col.needsUpdate = true; col.repeat.set((p.x1 - p.x0) / 1.2, (p.z1 - p.z0) / 1.2);
    const mat = new THREE.MeshStandardMaterial({ map: col, transparent: true, depthWrite: false, roughness: isMud ? 0.75 : 1, polygonOffset: true, polygonOffsetFactor: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMask = { value: tex }; sh.uniforms.uWet = { value: wet };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMU = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMU; uniform sampler2D uMask; uniform sampler2D uWet;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float mk = texture2D(uMask, vMU).r; float wt = texture2D(uWet, vMU).r;
          ${isMud ? 'diffuseColor.a = clamp(mk * 1.15, 0.0, 0.97); diffuseColor.rgb *= 0.75 + 0.25 * (1.0 - mk);' : 'diffuseColor.rgb *= vec3(0.62, 0.56, 0.47); diffuseColor.a = clamp(mk * 1.05, 0.0, 0.82);'}
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.55, wt);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, texture2D(uWet, vMU).r);');
    };
    const geo = new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0).rotateX(-Math.PI / 2);
    // texture row j is z-major from z0: flip the plane's v so row 0 sits at z0
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set((p.x0 + p.x1) / 2, groundY((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2) + 0.0025, (p.z0 + p.z1) / 2); mesh.receiveShadow = true; mesh.renderOrder = 1; scene.add(mesh);
    // polish: every cell a clean mop has passed over. Drawn as pure reflection (additive), so mopped floor gleams
    const pol = new THREE.DataTexture(new Uint8Array(p.w * p.h), p.w, p.h, THREE.RedFormat); pol.magFilter = THREE.LinearFilter; pol.minFilter = THREE.LinearFilter;
    { const init = initialMask(p), pd = pol.image.data; for (let i = 0; i < pd.length; i++) if (init[i] > 20 && data[i] < init[i] * 0.3) pd[i] = 255; pol.needsUpdate = true; }
    const vsh = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMU = uv;'); };
    // wet floor darkens a touch
    const wmat = new THREE.MeshBasicMaterial({ color: 0x0b0f12, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    wmat.onBeforeCompile = (sh) => { sh.uniforms.uWet = { value: wet }; vsh(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMU; uniform sampler2D uWet;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a = texture2D(uWet, vMU).r * 0.22;'); };
    const wmesh = new THREE.Mesh(geo, wmat); wmesh.position.copy(mesh.position); wmesh.position.y += 0.0005; wmesh.renderOrder = 2; scene.add(wmesh);
    // gloss: black glossy surface, added on top -> only the reflections of lamps, flashlight and room show
    const smat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, envMapIntensity: 1.0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    smat.onBeforeCompile = (sh) => { sh.uniforms.uWet = { value: wet }; sh.uniforms.uPol = { value: pol }; sh.uniforms.uMask = { value: tex }; vsh(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMU; uniform sampler2D uWet; uniform sampler2D uPol; uniform sampler2D uMask;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat wtS = texture2D(uWet, vMU).r; roughnessFactor = mix(0.16, 0.03, wtS);')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nfloat poS = texture2D(uPol, vMU).r, mkS = texture2D(uMask, vMU).r; gl_FragColor.rgb *= (poS * 0.65 + wtS * 1.3) * (1.0 - mkS); gl_FragColor.rgb += vec3(0.010, 0.011, 0.012) * poS * (1.0 - mkS);'); };
    smat.customProgramCacheKey = () => 'gloss';
    const smesh = new THREE.Mesh(geo, smat); smesh.position.copy(mesh.position); smesh.position.y += 0.001; smesh.renderOrder = 3; scene.add(smesh);
    MASKS[p.id] = { p, tex, wet, pol, data, wetT: 0 };
    syncMaskTex(p.id);
  }
  // the scratched name under the classroom mud (revealed by real cleaning)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.45).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: textCanvas(512, 210, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(245,240,225,.85)'; x.lineWidth = 3; x.font = 'bold 64px Courier'; x.textAlign = 'center'; x.strokeText('M. ARDEN 3B', w / 2, 80); x.font = 'bold 40px Courier'; x.strokeText('PRESENT  6/11/98', w / 2, 150); }), transparent: true, depthWrite: false, roughness: 0.6 }));
  scr.position.set(CLUE_SPOT.x, 0.0015, CLUE_SPOT.z); scr.rotation.y = 0.1; scene.add(scr);
}
function syncMaskTex(id) { const M = MASKS[id]; M.tex.image.data.set(M.data); M.tex.needsUpdate = true; }
function applyMop(patchId, pts, r, smear = 0, kind = 'mop') {
  const M = MASKS[patchId]; if (!M) return;
  const res = mirror.erase(M.p, pts, r, smear); M.data = mirror.masks[patchId];
  if (kind !== 'mop') { M.dirty = true; return res; }
  const P = M.p, wd = M.wet.image.data, pd = M.pol.image.data, polish = !smear;
  for (const [x, z] of pts) { const ci = (x - P.x0) * P.res, cj = (z - P.z0) * P.res, rr = r * P.res * 1.15; for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(P.h - 1, Math.ceil(cj + rr)); j++) for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(P.w - 1, Math.ceil(ci + rr)); i++) if (Math.hypot(i + 0.5 - ci, j + 0.5 - cj) < rr) { wd[j * P.w + i] = 255; if (polish) pd[j * P.w + i] = 255; else pd[j * P.w + i] = 0; } }
  M.pol.needsUpdate = true;
  M.wetDirty = true; M.dirty = true;
  return res;
}
// the server's exact values for the cells a stroke touched
function applyMaskSet(m) {
  const M = MASKS[m.patch]; if (!M) return; const P = M.p, str = atob(m.d), data = mirror.masks[m.patch];
  let delta = 0;
  const pd = M.pol.image.data; let pc = false;
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) { const k = (m.j0 + j) * P.w + m.i0 + i, v = str.charCodeAt(j * m.w + i); delta += v - data[k]; if (v === 0 && data[k] > 0 && !pd[k]) { pd[k] = 255; pc = true; } if (v > data[k] + 8) { pd[k] = 0; pc = true; } data[k] = v; }
  if (pc) M.pol.needsUpdate = true;
  mirror.maskSum[m.patch] += delta; M.data = data; M.dirty = true;
}
let wetTimer = 0;
function updateMasks(dt) {
  wetTimer += dt; const decay = wetTimer > 0.2; if (decay) wetTimer = 0;
  for (const M of Object.values(MASKS)) {
    if (M.dirty) { M.dirty = false; syncMaskTex(M.p.id); }
    if (decay && M.wetDirty) { const d = M.wet.image.data; let any = false; for (let i = 0; i < d.length; i++) if (d[i]) { d[i] = Math.max(0, d[i] - 2); any = true; } M.wet.needsUpdate = true; M.wetDirty = any; }
  }
}
// ---- mop feedback: glints where dirt lifts, a squeak, and a little chime when a spot comes fully clean ----
const FX = { n: 160, i: 0, life: null, mesh: null, sq: 0 };
function buildFX() {
  const c = textCanvas(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,240,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(31, 2, 2, 60); x.fillRect(2, 31, 60, 2); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FX.n * 3).fill(-999), 3));
  FX.life = new Float32Array(FX.n); FX.mesh = new THREE.Points(geo, new THREE.PointsMaterial({ map: c, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff6e0 })); FX.mesh.frustumCulled = false; FX.mesh.renderOrder = 5; scene.add(FX.mesh);
}
function mopFX(x, z, removed, clean) {
  if (!FX.mesh) return; const pos = FX.mesh.geometry.attributes.position, n = Math.random() < 0.5 ? 1 : Math.min(3, 1 + removed / 1500 | 0), gy = groundY(x, z);
  for (let k = 0; k < n; k++) { const i = FX.i = (FX.i + 1) % FX.n, a = Math.random() * 6.283, r = Math.random() * 0.3; pos.setXYZ(i, x + Math.cos(a) * r, gy + 0.01 + Math.random() * 0.02, z + Math.sin(a) * r); FX.life[i] = clean ? 0.6 + Math.random() * 0.5 : 0.25; }
  pos.needsUpdate = true;
  if (clean && (FX.sq -= removed) < 0) { FX.sq = 2500 + Math.random() * 2500; audio.tone && audio.tone({ f: 1900 + Math.random() * 700, f2: 2600 + Math.random() * 600, v: 0.018, d: 0.09, type: 'sine', wet: 0.3 }); }
}
function updateFX(dt) {
  if (!FX.mesh) return; const pos = FX.mesh.geometry.attributes.position; let any = false;
  for (let i = 0; i < FX.n; i++) if (FX.life[i] > 0) { FX.life[i] -= dt; any = true; pos.setY(i, pos.getY(i) + dt * 0.03); if (FX.life[i] <= 0) pos.setY(i, -999); }
  if (any) pos.needsUpdate = true; FX.mesh.material.size = 0.028 + Math.sin(performance.now() / 70) * 0.012;
}
function patchesAt(x, z) { return PATCHES.filter(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1); }

// ======================= first-person tools =======================
const VM = {};
const glove = new THREE.MeshStandardMaterial({ color: 0x46627a, roughness: 0.55, metalness: 0 });
function makeHand(left) {
  const g = new THREE.Group(), s = left ? -1 : 1;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.095), glove); g.add(palm);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.08, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b3a46, roughness: 0.8 })); cuff.position.z = 0.08; g.add(cuff);
  for (let f = 0; f < 4; f++) { const fg = new THREE.Group(); fg.position.set((-0.03 + f * 0.02) * s, 0, -0.045); g.add(fg); let p = fg; for (let k = 0; k < 3; k++) { const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.018, 3, 6).rotateX(Math.PI / 2), glove); seg.position.z = -0.012; p.add(seg); const j = new THREE.Group(); j.position.z = -0.026; j.rotation.x = -1.0; p.add(j); p = j; } fg.rotation.x = -0.6; }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.035, 3, 6).rotateX(Math.PI / 2), glove); th.position.set(-0.045 * s, -0.012, -0.03); th.rotation.set(-0.3, 0.7 * s, 0); g.add(th);
  return g;
}
function buildViewmodels() {
  VM.vac = makeVacuumModel(); scene.add(VM.vac.root); VM.vac.root.visible = false;
  VM.mop = makeMopModel(); scene.add(VM.mop.root); VM.mop.root.visible = false;
  VM.handR = makeHand(false); camera.add(VM.handR); VM.handL = makeHand(true); camera.add(VM.handL);
  VM.torch = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1d1e, roughness: 0.4, metalness: 0.6 })); VM.torch.add(body);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 0 })); lens.position.z = -0.081; lens.rotation.y = Math.PI; VM.torch.add(lens); VM.torchLens = lens;
  camera.add(VM.torch);
  VM.headPos = new THREE.Vector3(); VM.mopHead = new THREE.Vector3(); VM.sway = new THREE.Vector2();
}
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3();
// pose a stick tool in world space: grip near the hand, head on the floor where the worker aims
function aimFloor(px, py, pz, yaw, pitch, minD, maxD, rects) {
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const fy = groundY(px, pz); let t = dir.y < -0.05 ? (fy + 0.02 - py) / dir.y : 1e9;
  let hx = px + dir.x * t, hz = pz + dir.z * t, hd = Math.hypot(hx - px, hz - pz);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (!(hd < maxD)) { hx = px + fx * maxD; hz = pz + fz * maxD; hd = maxD; }
  if (hd < minD) { hx = px + fx * minD; hz = pz + fz * minD; }
  // never through a wall
  for (let k = 0; k < 8 && segBlocked(px, pz, hx, hz, rects); k++) { hx = lerp(px, hx, 0.75); hz = lerp(pz, hz, 0.75); }
  return [hx, hz];
}
function poseVac(model, gripWorld, headX, headZ, yaw) {
  const fy = groundY(headX, headZ); model.head.position.set(headX, fy, headZ); model.head.rotation.set(0, yaw + Math.PI, 0);
  model.pod.position.copy(gripWorld);
  const a = tmp.set(headX + Math.sin(yaw) * 0.03, fy + 0.1, headZ + Math.cos(yaw) * 0.03), b = gripWorld;
  model.wand.position.copy(a).add(b).multiplyScalar(0.5); model.wand.scale.set(1, a.distanceTo(b), 1);
  model.wand.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), b.clone().sub(a).normalize());
  model.pod.lookAt(b.clone().multiplyScalar(2).sub(a));
}
function poseMop(model, gripWorld, headX, headZ, yaw) {
  const fy = groundY(headX, headZ); model.head.position.set(headX, fy, headZ); model.head.rotation.set(0, yaw, 0);
  const a = tmp.set(headX, fy + 0.08, headZ), b = gripWorld;
  model.handle.position.copy(a).add(b).multiplyScalar(0.5); model.handle.scale.set(1, a.distanceTo(b) / 1.3, 1);
  model.handle.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), b.clone().sub(a).normalize());
}

// ======================= interaction targets =======================
function interactTargets() {
  const list = W.interact.slice();
  list.push({ kind: 'cart', x: cart.x, y: groundY(cart.x, cart.z) + 0.9, z: cart.z });
  const cy = groundY(cart.x, cart.z), cxF = Math.cos(cart.yaw), czF = -Math.sin(cart.yaw);
  list.push({ kind: 'cartbin', x: cart.x + cxF * 0.25, y: cy + 0.7, z: cart.z + czF * 0.25 }, { kind: 'cartbucket', x: cart.x - cxF * 0.25, y: cy + 0.4, z: cart.z - czF * 0.25 });
  for (const r of rbSnap) if (!r[5] || r[5] === pid) list.push({ kind: 'roomba', id: r[0], x: r[1], y: groundY(r[1], r[2]) + 0.1, z: r[2], state: r[4], mine: r[5] === pid, bag: r[6] });
  for (const c of crewSnap) if (c.pid !== pid && c.dn) list.push({ kind: 'revive', pid: c.pid, name: c.name, x: c.x, y: 0.4, z: c.z });
  return list;
}
function pickTarget() {
  const cp = camera.position; camera.getWorldDirection(fwd); let best = null, bs = 0;
  if (cart.holder === pid) return { kind: 'cart' }; // while pushing, E lets go
  const carried = rbSnap.find(r => r[5] === pid); if (carried) return { kind: 'roomba', id: carried[0], mine: true };
  const rects = solidRects(mirror.doors).filter(r => r.door || (r.h > 2.5 && !r.glass));
  for (const it of interactTargets()) {
    if (it.kind === 'plate' && day < 2) continue;
    if (it.kind === 'bolt' && (mirror.doors.d_office.open || !inOffice(P))) continue;
    const dx = it.x - cp.x, dy = it.y - cp.y, dz = it.z - cp.z, d = Math.hypot(dx, dy, dz);
    const range = it.kind === 'door' ? 2.1 : it.kind === 'bin' ? 1.8 : 1.9; if (d > range) continue;
    const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (cos < (['computer', 'rack', 'cot', 'door', 'cart', 'bucket', 'cartbucket', 'cartbin', 'roomba'].includes(it.kind) ? 0.78 : 0.86)) continue;
    if (it.kind !== 'door' && it.kind !== 'bolt' && segBlocked(cp.x, cp.z, it.x - (dx / d) * 0.3, it.z - (dz / d) * 0.3, rects)) continue;
    const s = cos - d * 0.03; if (s > bs) { bs = s; best = it; }
  }
  return best;
}
function promptFor(it) {
  if (!it) return null; const K = isTouch ? 'E' : '[E]';
  switch (it.kind) {
    case 'door': { const st = mirror.doors[it.id]; return `${K} ${st.open ? 'Close' : 'Open'} ${it.id === 'd_office' ? 'office door' : 'door'}${st.bolted ? ' (bolted)' : ''}`; }
    case 'bolt': { const st = mirror.doors.d_office; return inOffice(P) ? `${K} ${st.bolted ? 'Slide the bolt back' : 'Engage the security bolt'}` : null; }
    case 'locker': { const st = mirror.lockers[it.id]; return `${K} ${st?.open ? 'Close' : 'Search'} locker ${it.id.slice(1)}`; }
    case 'rack': return !inv.vacuum ? `${K} Take the vacuum` : !inv.mop ? `${K} Take the mop` : 'Tool rack';
    case 'bin': return myBag ? `${K} Empty the vacuum (${myBag} pieces)` : 'Bin (vacuum empty)';
    case 'computer': return `${K} Use the facilities computer`;
    case 'cot': return phase === 'shift' ? `${K} Rest until 4:00 (crew must be bolted in)` : null;
    case 'vent': return `${K} Listen at the grille`;
    case 'plate': return `${K} Examine the painted-over plate`;
    case 'revive': return `Hold ${K} to help ${it.name} up`;
    case 'cart': return cart.holder === pid ? `${K} Let go of the cart` : cart.holder ? 'Someone is pushing this cart' : `${K} Push the janitor cart`;
    case 'cartbin': return myBag ? `${K} Empty the vacuum into the cart (${myBag})` : null;
    case 'cartbucket': case 'bucket': return inv.mop ? `${K} Rinse the mop (${Math.round(mopDirt * 100)}% dirty)` : null;
    case 'roomba': return it.mine ? `${K} Set the robot vacuum down here` : it.state === 'full' ? `${K} Pick up and empty the robot (${it.bag})` : `${K} Pick up the robot vacuum`;
    case 'desk': return `${K} Search the teacher's desk`;
    case 'cafekey': return keys2.cafekey ? null : `${K} Take the key`;
  }
}
let reviveHold = 0;
function interact(it, held) {
  if (!it) return;
  switch (it.kind) {
    case 'door': net.send({ t: 'door', id: it.id }); break;
    case 'bolt': net.send({ t: 'bolt' }); break;
    case 'locker': net.send({ t: 'locker', id: it.id }); break;
    case 'rack': if (!inv.vacuum) net.send({ t: 'take', tool: 'vacuum' }); else if (!inv.mop) net.send({ t: 'take', tool: 'mop' }); break;
    case 'bin': net.send({ t: 'empty' }); break;
    case 'computer': openOS(); break;
    case 'cot': net.send({ t: 'wait' }); break;
    case 'vent': net.send({ t: 'vent' }); audio.ventVoice({ x: VENT.x, y: VENT.y, z: VENT.z }); break;
    case 'plate': net.send({ t: 'plate' }); break;
    case 'cart': net.send({ t: 'cart' }); break;
    case 'cartbin': net.send({ t: 'empty' }); break;
    case 'cartbucket': case 'bucket': net.send({ t: 'rinse' }); break;
    case 'roomba': net.send({ t: 'roomba', id: it.id }); break;
    case 'desk': net.send({ t: 'desk' }); break;
    case 'cafekey': net.send({ t: 'cafekey' }); break;
  }
}

// ======================= input: pointer lock with a real fallback =======================
const canvas = renderer.domElement;
let locked = false, freeLook = false, lastLockFail = 0, lockReason = '';
const inIframe = (() => { try { return window.top !== window.self; } catch { return true; } })();
function requestLock() {
  if (isTouch) return;
  if (!canvas.requestPointerLock) return enterFree('this browser has no pointer lock');
  try {
    const r = canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch(() => { try { const r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch((e) => enterFree(e && e.name === 'SecurityError' ? 'the page blocked mouse capture' : 'mouse capture was refused')); } catch (e) { enterFree('mouse capture was refused'); } });
  } catch (e) { try { canvas.requestPointerLock(); } catch { enterFree('mouse capture is not allowed here'); } }
}
function enterFree(reason) {
  lastLockFail = performance.now(); freeLook = true; lockReason = reason;
  if (!playing || isTouch) return;
  $('lockText').textContent = `Free-look mode (${reason}). Move the mouse to look; hold it near a screen edge to keep turning. Arrow keys also look.`;
  $('lockTab').hidden = !inIframe; $('lockTab').href = location.href;
  $('lockBanner').hidden = false;
}
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === canvas;
  if (locked) { freeLook = false; $('lockBanner').hidden = true; }
  else if (was && playing && !ui) openPause(); // Esc (or focus loss) released the mouse
});
document.addEventListener('pointerlockerror', () => enterFree('mouse capture was refused'));
$('lockRetry').onclick = (e) => { e.stopPropagation(); requestLock(); canvas.focus(); };
canvas.addEventListener('mousedown', (e) => {
  if (!playing || ui) return;
  if (!locked && !isTouch && performance.now() - lastLockFail > 1500) requestLock();
  if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', (e) => { if (playing) e.preventDefault(); });
let edgeX = 0, edgeY = 0;
addEventListener('mousemove', (e) => {
  if (!playing || ui || P.out) return;
  if (locked || freeLook) {
    const k = 0.0022 * settings.sens * (locked ? 1 : 0.9);
    P.yaw -= e.movementX * k; P.pitch = clamp(P.pitch - e.movementY * k * (settings.inv ? -1 : 1), -1.5, 1.5);
  }
  if (!locked) { edgeX = e.clientX < innerWidth * 0.06 ? -1 : e.clientX > innerWidth * 0.94 ? 1 : 0; edgeY = e.clientY < innerHeight * 0.06 ? -1 : e.clientY > innerHeight * 0.94 ? 1 : 0; } else edgeX = edgeY = 0;
});
function clearInputs() { for (const k in keys) keys[k] = false; mouseL = mouseR = false; touch.mx = touch.my = 0; touch.use = false; edgeX = edgeY = 0; }
addEventListener('blur', clearInputs); document.addEventListener('visibilitychange', () => { if (document.hidden) clearInputs(); });
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Tab') { e.preventDefault(); if (!playing) return; if (ui === 'bag') closeUI(); else if (!ui) openBag(); return; }
  if (!playing) return;
  if (e.code === 'Escape') { if (ui === 'os') closeOS(); else if (ui === 'bag' || ui === 'reader') closeUI(); else if (!ui && !locked) openPause(); return; }
  if (ui) return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' && !e.repeat) { if (hidden) { net.send({ t: 'unhide' }); return; } if (siege && nearOfficeDoor()) return; const it = pickTarget(); if (it && it.kind !== 'revive') interact(it); }
  if (e.code === 'KeyH' && !e.repeat) toggleHide();
  if (e.code === 'KeyF' && !e.repeat) { P.light = !P.light; audio.ui(); }
  if (e.code === 'Digit1') equip('vacuum'); if (e.code === 'Digit2') equip('mop'); if (e.code === 'Digit3') equip('none');
  if (e.code === 'KeyG' && !e.repeat) { camera.getWorldDirection(fwd); net.send({ t: 'ping', x: P.x + fwd.x * 4, y: 1, z: P.z + fwd.z * 4 }); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
function equip(t) { if (t === 'vacuum' && !inv.vacuum) return toast('You have not found a vacuum yet. Try the janitor closet.'); if (t === 'mop' && !inv.mop) return toast('You have not found a mop yet.'); P.tool = t; audio.ui(); }

// ---- touch: an on-screen controller (D-pad, A/B/X/Y, L/R, SELECT/START); drag the right half to look ----
const touch = { dpad: null, look: null, lx: 0, ly: 0, mx: 0, my: 0, use: false, sprint: false, crouch: false, eHeld: false };
function pressA() {
  if (hidden) { net.send({ t: 'unhide' }); return; }
  if (siege && nearOfficeDoor()) { touch.eHeld = true; return; }
  const it = pickTarget(); if (it) { if (it.kind === 'revive') touch.revive = true; else interact(it); return; }
  if (hideTarget()) toggleHide();
}
if (isTouch) {
  const el = $('touch'), dp = $('dpad');
  const setDpad = (t) => {
    const r = dp.getBoundingClientRect(), dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2), l = Math.hypot(dx, dy);
    let mx = 0, my = 0; if (l > 14) { const a = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) * (Math.PI / 4); mx = Math.round(Math.cos(a) * 100) / 100; my = Math.round(Math.sin(a) * 100) / 100; }
    touch.mx = mx; touch.my = my;
    dp.querySelector('.up').classList.toggle('on', my > 0.3); dp.querySelector('.dn').classList.toggle('on', my < -0.3); dp.querySelector('.rt').classList.toggle('on', mx > 0.3); dp.querySelector('.lf').classList.toggle('on', mx < -0.3);
  };
  const clearDpad = () => { touch.dpad = null; touch.mx = touch.my = 0; dp.querySelectorAll('.dp').forEach(d => d.classList.remove('on')); };
  el.addEventListener('touchstart', (e) => { audio.init(); for (const t of e.changedTouches) {
    if (t.target.closest('#dpad') && touch.dpad == null) { touch.dpad = t.identifier; setDpad(t); continue; }
    if (t.target.closest('button')) continue;
    if (t.clientX > innerWidth * 0.36 && touch.look == null) { touch.look = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
  } e.preventDefault(); }, { passive: false });
  el.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) {
    if (t.identifier === touch.dpad) setDpad(t);
    if (t.identifier === touch.look) { const s = 0.0065 * settings.sens; P.yaw -= (t.clientX - touch.lx) * s; P.pitch = clamp(P.pitch - (t.clientY - touch.ly) * s * (settings.inv ? -1 : 1), -1.5, 1.5); touch.lx = t.clientX; touch.ly = t.clientY; }
  } e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === touch.dpad) clearDpad(); if (t.identifier === touch.look) touch.look = null; } };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  const tb = (id, down, up) => { const b = $(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); audio.init(); b.classList.add('on'); down(b); if (navigator.vibrate) navigator.vibrate(8); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); up && up(b); }, { passive: false }); };
  tb('tX', () => { touch.use = true; }, () => { touch.use = false; });
  tb('tA', () => pressA(), () => { touch.revive = false; touch.eHeld = false; });
  tb('tY', () => { P.light = !P.light; audio.ui(); });
  tb('tB', () => { touch.crouch = !touch.crouch; if (touch.crouch) { touch.sprint = false; $('tL').classList.remove('on'); } }, (b) => b.classList.toggle('on', touch.crouch));
  tb('tL', () => { touch.sprint = !touch.sprint; if (touch.sprint) touch.crouch = false; }, (b) => b.classList.toggle('on', touch.sprint));
  tb('tR', () => { const order = ['none', 'vacuum', 'mop'].filter(t => t === 'none' || inv[t]); equip(order[(order.indexOf(P.tool) + 1) % order.length]); });
  tb('tSel', () => { if (!ui) openBag(); else if (ui === 'bag') closeUI(); });
  tb('tStart', () => { if (!ui) openPause(); else closeUI(); });
}
// ---- real controllers (PlayStation / Xbox, standard mapping) ----
const GP = { prev: [], active: false };
function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let g = null; for (const p of pads) if (p && p.connected) { g = p; break; }
  if (!g) { if (GP.active) { GP.active = false; touch.mx = touch.my = 0; touch.use = false; } return; }
  const b = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5)), edge = (i) => b(i) && !GP.prev[i];
  const dz = (v) => Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84;
  let mx = dz(g.axes[0] || 0), my = -dz(g.axes[1] || 0);
  if (b(12)) my = 1; if (b(13)) my = -1; if (b(14)) mx = -1; if (b(15)) mx = 1;
  const any = mx || my || g.buttons.some(x => x.pressed); if (any) GP.active = true;
  if (GP.active) {
    if (!playing && !$('press').hidden) { if (g.buttons.some((x, i) => edge(i))) pressStart(); }
    else if (ui || !playing) { if (edge(1) && !playing) showMenu('mMain'); if (edge(1) || edge(9)) { if (ui === 'os') closeOS(); else if (ui !== 'gameover') closeUI(); } if (edge(0)) { const f = document.activeElement; if (f && f.click && f !== document.body) f.click(); } menuNav(edge(12) || (my > 0.6 && !GP.navLock) ? -1 : edge(13) || (my < -0.6 && !GP.navLock) ? 1 : 0); GP.navLock = Math.abs(my) > 0.6; }
    else {
      touch.mx = mx; touch.my = my;
      const lx = dz(g.axes[2] || 0), ly = dz(g.axes[3] || 0), sp = 2.6 * settings.sens;
      P.yaw -= lx * sp * dt; P.pitch = clamp(P.pitch - ly * sp * 0.7 * dt * (settings.inv ? -1 : 1), -1.5, 1.5);
      touch.use = b(7); mouseR = b(6); touch.sprint = b(10) || (touch.sprint && (mx || my)); touch.eHeld = b(0) && siege && nearOfficeDoor();
      if (edge(0)) pressA(); if (!b(0)) touch.revive = false;
      if (edge(1)) touch.crouch = !touch.crouch; if (edge(2)) toggleHide(); if (edge(3)) { P.light = !P.light; audio.ui(); }
      if (edge(4) || edge(5)) { const order = ['none', 'vacuum', 'mop'].filter(t => t === 'none' || inv[t]); equip(order[(order.indexOf(P.tool) + (edge(5) ? 1 : order.length - 1)) % order.length]); }
      if (edge(9)) openPause(); if (edge(8)) openBag();
    }
  }
  GP.prev = g.buttons.map((x, i) => b(i));
}
function menuNav(dir) {
  if (!dir) return; const root = ui === 'os' ? $('os') : document.querySelector('.screen:not([hidden])'); if (!root) return;
  const items = [...root.querySelectorAll('button:not([disabled]),input,select')].filter(e => e.offsetParent); if (!items.length) return;
  const i = items.indexOf(document.activeElement); items[(i + dir + items.length) % items.length].focus();
}
// ======================= entry / session =======================
const TIPS = ['It does not move while it is watched.', 'Do not stare at it for long.', 'The office was never on the attendance system.', 'If it saw you get into a locker, the locker will not save you.', 'Muddy footprints are never yours.', 'The PA does not know your name. It says it anyway.', 'Room 014 is not on the floor plan.'];
function showMenu(id) { for (const k of ['mMain', 'sCoop', 'sOpts', 'sHow']) $(k).hidden = k !== id; const f = $(id).querySelector('.mi:not([disabled]),input'); if (f) setTimeout(() => f.focus(), 30); audio.ui && audio.ui(); }
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => showMenu('mMain'));
$('mCoop').onclick = () => showMenu('sCoop'); $('mOpts').onclick = () => showMenu('sOpts'); $('mHow').onclick = () => showMenu('sHow');
function pressStart() {
  if ($('press').hidden) return; $('press').hidden = true; audio.init(); showMenu('mMain'); $('entry').hidden = false;
  if (isTouch) { try { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.catch?.(() => { }); screen.orientation?.lock?.('landscape').catch(() => { }); } catch { } }
}
$('press').addEventListener('pointerdown', pressStart); addEventListener('keydown', (e) => { if (!$('press').hidden) { e.preventDefault(); pressStart(); } });
async function showEntry() {
  $('press').hidden = false; $('entry').hidden = true; $('name').value = store.get('name', '');
  if (navigator.webdriver && !new URLSearchParams(location.search).has('press')) pressStart(); // automated tests go straight to the menu
  const params = new URLSearchParams(location.search), code = (params.get('room') || '').toUpperCase();
  if (code) $('code').value = code;
  const hasSave = !!loadSolo(); $('bSolo').textContent = hasSave ? 'Continue' : 'New game'; $('bNewSolo').hidden = !hasSave;
  $('bCreate').disabled = $('bJoin').disabled = true; $('coopNote').textContent = 'Looking for co-op…';
  const ok = !params.has('mockroom') && await serverAvailable();
  if (ok) { coopKind = 'server'; $('bCreate').disabled = $('bJoin').disabled = false; $('coopNote').textContent = code ? `Invited to crew ${code}. Press Join crew.` : 'Create a crew and send your friends the code (up to 4 workers).'; return; }
  roomApi = await getRoomApi();
  if (roomApi) { coopKind = 'room'; $('bCreate').disabled = $('bJoin').disabled = false; $('coopNote').textContent = 'Host a crew and read your friends the 4-letter code. They open this same game (share it with them on claude.ai) and press Join. Up to 4 workers.'; }
  else $('coopNote').textContent = 'Co-op works on the claude.ai link once the game is shared with your friends (Share → invite them). Each of you opens it, one hosts, the others join with the code.';
}
const nm = () => { const n = ($('name').value || '').trim().slice(0, 16) || 'Worker'; store.set('name', n); return n; };
function start(transport) {
  CALM = transport.mode === 'solo' && settings.calm;
  if (CALM) { audio.sting = audio.caught = audio.drag = audio.bang = audio.chime = () => { }; }
  audio.init(); audio.setVolume(settings.vol);
  requestLock(); // a real user gesture: the click on the start button
  net = transport; mode = transport.mode; $('status').textContent = ''; if (monitor) { monitor.root.visible = true; monitor.titled = false; } huntFlickerT = 0;
  net.on(onMessage); net.connect();
  $('status').textContent = mode === 'solo' ? 'Clocking in…' : 'Connecting…';
}
$('calm').checked = settings.calm; $('calm').onchange = (e) => { settings.calm = e.target.checked; saveSettings(); };
$('bSolo').onclick = () => start(new LocalTransport(pid, nm(), settings.calm));
$('bNewSolo').onclick = () => { if (confirmInline($('bNewSolo'), 'Erase your save? Press again')) { clearSolo(); start(new LocalTransport(pid, nm(), settings.calm)); } };
let coopKind = null, roomApi = null;
$('bCreate').onclick = () => start(coopKind === 'room' ? new RoomHost(roomApi, pid, nm(), newRoomCode()) : new WSTransport(pid, nm(), 'NEW', false));
$('bJoin').onclick = () => { const c = $('code').value.trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(c)) { $('status').textContent = 'Crew codes are 4 letters.'; return; } start(coopKind === 'room' ? new RoomGuest(roomApi, pid, nm(), c) : new WSTransport(pid, nm(), c, true)); };
function confirmInline(btn, msg) { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = 'New game'; return true; } btn.dataset.armed = 1; btn.textContent = msg; setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'New game'; }, 3000); return false; }

function applySave(s) {
  mirror = new Sim(s); day = s.day; money = s.money; shiftT = s.shiftT; phase = s.phase;
  discoveries = s.discoveries.slice();
  for (const id in MASKS) { MASKS[id].data = mirror.masks[id]; syncMaskTex(id); }
  DB.hidden.fill(0); DB.active.clear(); for (const d of DEBRIS) { DB.pos[d.id * 3] = d.x; DB.pos[d.id * 3 + 2] = d.z; writeDebris(d.id); }
  applyCollected(mirror.collected);
  for (const id in mirror.doors) setDoor(id, mirror.doors[id], true);
  for (const id in W.lockers) setLocker(id, mirror.lockers[id] || { open: false }, true);
  inv = Object.assign({ vacuum: false, mop: false }, s.inv[pid] || {}); mopDirt = inv.mopDirt || 0;
  keys2 = s.keys || {}; found = s.found || []; if (s.cart) cart = { ...s.cart, holder: null };
  updatePlate();
}
function onMessage(m) {
  switch (m.t) {
    case 'welcome': {
      room = m.room; applySave(m.save); upgrades = m.upgrades; summary = m.summary;
      const me = m.players.find(p => p.pid === pid); if (me) { P.x = me.x; P.z = me.z; P.yaw = me.yw || 0; }
      $('entry').hidden = true; playing = true; showHUD(true); $('status').textContent = '';
      if (mode === 'coop') { history.replaceState(null, '', '?room=' + room + (NORENDER ? '&norender' : '')); toast(`Crew ${room}. Invite link copied to the pause menu.`); }
      if (phase === 'summary' && summary) showSummary(summary);
      if (!locked && !isTouch && freeLook) enterFree(lockReason || 'mouse capture unavailable');
      nightCard(day);
      break;
    }
    case 'reject': if (playing) { centerMsg('CREW ENDED', m.msg, 6); setTimeout(() => location.reload(), 5000); } else { $('status').textContent = m.msg; } playing = false; break;
    case 'resync': applySave(m.save); break;
    case 'netstatus': if (m.status === 'reconnecting') toast('Connection lost. Reconnecting…'); if (m.status === 'online' && playing) toast('Reconnected.'); break;
    case 'snap': {
      shiftT = m.shiftT; money = m.money; crewSnap = m.players;
      if (m.phase !== phase) phase = m.phase;
      if (m.mon) { monSnap.push({ t: performance.now(), ...m.mon }); if (monSnap.length > 20) monSnap.shift(); }
      if (m.cart && m.cart[3] !== pid) { cart.x = m.cart[0]; cart.z = m.cart[1]; cart.yaw = m.cart[2]; cart.holder = m.cart[3]; } else if (m.cart) cart.holder = m.cart[3];
      if (m.rb) rbSnap = m.rb;
      for (const c of m.players) { if (c.pid === pid) { P.downed = !!c.dn; P.out = !!c.out; P.dnT = c.dnT; myBag = c.bag; continue; } remotePush(c); }
      for (const [id, r] of REMOTE) if (!m.players.find(c => c.pid === id)) { scene.remove(r.w.root); scene.remove(r.tool.root); REMOTE.delete(id); }
      break;
    }
    case 'col': { for (const id of m.ids) { mirror.collected[id] = 1; hideDebris(id); } break; }
    case 'maskset': applyMaskSet(m); break;
    case 'mopdirt': mopDirt = m.v; if (m.rinsed) { mopWarned = false; toast('Mop rinsed and wrung out.'); audio.noise({ f: 700, f2: 300, q: 0.7, v: 0.12, d: 0.9, wet: 0.4 }); } break;
    case 'cart': cart = { x: m.x, z: m.z, yaw: m.yaw, holder: m.holder }; break;
    case 'keys': { const fresh = m.keys.cafekey && !keys2.cafekey; keys2 = m.keys; updatePlate(); if (!fresh && !m.quiet) toast('Found a key ring tagged STAIRWELL W. The chained doors at the west end of the hall.'); break; }
    case 'found': found = m.found; break;
    case 'sold': toast(`Lost & Found paid $${m.total.toFixed(2)} for ${m.n} item${m.n > 1 ? 's' : ''}.`); audio.reward(); renderOSApp(); break;
    case 'door': setDoor(m.id, { open: m.open, bolted: m.bolted }); mirror.doors[m.id] = { open: m.open, bolted: m.bolted }; break;
    case 'locker': setLocker(m.id, m); mirror.lockers[m.id] = { open: m.open, searched: m.searched }; if (m.note && m.by === pid) toast(m.note); break;
    case 'inv': inv = m.inv; audio.pickup(); if (inv.vacuum && P.tool === 'none') P.tool = 'vacuum'; toast(inv.mop && inv.vacuum ? 'Picked up the mop. Press 2 to use it.' : 'Picked up the vacuum. Press 1 to use it. Left mouse runs it.'); break;
    case 'bag': myBag = m.bag; if (m.emptied) { toast(`Emptied ${m.emptied} pieces.`); } break;
    case 'bagfull': if (performance.now() - (bagFullT || 0) > 4000) { bagFullT = performance.now(); toast('Vacuum is full. Empty it at a bin (closet, office or the end of the hall).'); } break;
    case 'toast': toast(m.msg); break;
    case 'sfx': { const pos = { x: m.x, y: 1.2, z: m.z }; if (m.k === 'doorbang') { audio.bang(pos); shake = 0.5; } if (m.k === 'rattle') audio.rattle(pos); if (m.k === 'empty') audio.empty(pos); if (m.k === 'rinse') audio.empty(pos); if (m.k === 'bump') audio.tone({ f: 300, v: 0.03, d: 0.04, pos, type: 'triangle' }); if (m.k === 'beep') for (let i = 0; i < 3; i++) audio.tone({ f: 1800, v: 0.05, d: 0.08, delay: i * 0.15, pos }); break; }
    case 'pa': if (!CALM) showPA(m.text); break;
    case 'disc': { discoveries.push({ id: m.id, day, by: m.by }); const c = CLUES[m.id]; centerMsg('EVIDENCE: ' + c.title.toUpperCase(), (m.by ? m.by + ' found it. ' : '') + 'Saved to the journal (Tab).', 4); audio.sting(); updatePlate(); break; }
    case 'buy': upgrades = m.upgrades; money = m.money; mirror.purchased.push(m.skill); toast(`${CONFIG.skills[m.skill].name} installed.`); renderOSApp(); break;
    case 'buyfail': osNote = m.msg; renderOSApp(); break;
    case 'roomdone': centerMsg(`${m.name.toUpperCase()} RESTORED`, `+$${m.bonus.toFixed(2)} completion bonus`, 3); audio.reward(); break;
    case 'phase': phase = m.phase; if (phase === 'lockdown') { centerMsg('4:00 AM', inOffice(P) && mirror.doors.d_office.bolted ? 'Stay quiet. Stay inside.' : 'GET TO THE OFFICE. BOLT THE DOOR.', 4); audio.sting(); } break;
    case 'monfx': if (!CALM && monitor) monFX(m); break;
    case 'monstate': monState = m.st; break;
    case 'caught': if (m.pid === pid) jumpscare(); break;
    case 'downed': if (m.pid === pid) centerMsg('YOU ARE DOWN', 'A crewmate can help you up. Hold on.', 4); else toast(`${nameOf(m.pid)} is down! Get to them and hold E.`); break;
    case 'revived': if (m.pid === pid) centerMsg('BACK ON YOUR FEET', '', 2); break;
    case 'blackout': if (m.pid === pid) { const pen = m.penalty; setTimeout(() => centerMsg('YOU WOKE UP IN THE OFFICE', `Lost half an hour and $${pen.toFixed(2)}. Your cleaning is still done.`, 5), 1400); myBag = 0; } else toast(`${nameOf(m.pid)} blacked out and woke in the office.`); break;
    case 'out': if (m.pid === pid) centerMsg('MARKED PRESENT', 'You are out for the rest of this shift.', 6); else toast(`${nameOf(m.pid)} was marked present.`); break;
    case 'teleport': { const mm = m; pendingTP = mm; setTimeout(() => { if (pendingTP === mm && scareT <= 0) { applyTP(mm); pendingTP = null; } }, 0); break; }
    case 'summary': summary = m.summary; showSummary(m.summary); break;
    case 'scare': if (CALM || ui) break; if (m.k === 'watcher') spawnWatcher(m.seed); else if (m.k === 'lightsout') startLightsOut(m); break;
    case 'hunt': if (CALM) break; if (m.on) { dread = Math.max(dread, 0.7); if (m.loud) { huntFlickerT = 1.2 + Math.random() * 2.4; audio.sting(monitor ? monitor.root.position : null); audio.tone({ f: 46, f2: 30, v: 0.5, d: 1.6, lp: 220, wet: 0.5 }); if (Math.random() < 0.5) showPA(['Attendance.', 'Remain in your seats.', 'Roll call.'][(Math.random() * 3) | 0]); } } break;
    case 'prank': if (!CALM) prankFX(m); break;
    case 'gameover': showGameOver(m); break;
    case 'hidden': if (m.pid === pid) setHidden(m.on ? m.id : null); break;
    case 'trydoor': siegeFX(m); break;
    case 'newday': { clearScares(); $('gameover').hidden = true; if (ui === 'gameover') ui = null; gameOverOn = false; staticLvl = 0; setHidden(null); siege = null; $('holdDoor').hidden = true; applySave(m.save); day = m.day; phase = 'shift'; summary = null; closeUI(true); nightCard(day); requestLock(); break; }
    case 'ping': { const r = REMOTE.get(m.pid); audio.ping({ x: m.x, y: 1, z: m.z }); showPing(m.x, m.y, m.z, m.pid === pid ? 'you' : nameOf(m.pid)); break; }
  }
}
let CALM = false;
let mopDirt = 0, mopWarned = false, keys2 = {}, found = [], rbSnap = [], cart = { x: 4, z: 2.6, yaw: Math.PI / 2, holder: null };
let CART_M = null; const RB_M = new Map();
function playerRects() { const r = solidRects(mirror.doors); if (cart.holder !== pid) r.push({ x0: cart.x - 0.5, z0: cart.z - 0.5, x1: cart.x + 0.5, z1: cart.z + 0.5 }); return r; }
// the cart rolls in front of whoever pushes it; everyone sees where it is
function updateCart(dt) {
  if (!W) return;
  if (!CART_M) { CART_M = makeCartModel(); scene.add(CART_M); }
  if (cart.holder === pid) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), tx = P.x + fx * 1.05, tz = P.z + fz * 1.05;
    const walls = solidRects(mirror.doors);
    [cart.x, cart.z] = moveCircle(cart.x, cart.z, (tx - cart.x) * Math.min(1, dt * 10), (tz - cart.z) * Math.min(1, dt * 10), 0.42, walls);
    cart.yaw = P.yaw + Math.PI / 2;
  }
  CART_M.position.set(cart.x, groundY(cart.x, cart.z), cart.z); CART_M.rotation.y = cart.yaw;
  const seen = new Set();
  for (const r of rbSnap) {
    seen.add(r[0]); let m = RB_M.get(r[0]); if (!m) { m = makeRoombaModel(); scene.add(m); RB_M.set(r[0], m); }
    let x = r[1], z = r[2];
    if (r[5] === pid) { x = P.x - Math.sin(P.yaw) * 0.45; z = P.z - Math.cos(P.yaw) * 0.45; m.position.set(x, P.gy + 0.95, z); }
    else if (r[5]) { const h = crewSnap.find(c => c.pid === r[5]); if (h) m.position.set(h.x, groundY(h.x, h.z) + 0.95, h.z); }
    else { m.position.x = lerp(m.position.x, x, 0.3); m.position.z = lerp(m.position.z, z, 0.3); m.position.y = groundY(x, z); }
    m.rotation.y = r[3]; m.userData.led.material.emissive.setHex(r[4] === 'full' ? 0xff3322 : r[4] === 'run' ? 0x33ff66 : 0x3388ff); m.userData.brush.rotation.y += dt * (r[4] === 'run' ? 20 : 0);
  }
  for (const [id, m] of RB_M) if (!seen.has(id)) { scene.remove(m); RB_M.delete(id); }
}
function nightCard(n) {
  const days = ['THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY'];
  const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:55;display:flex;align-items:center;justify-content:center;flex-direction:column;transition:opacity 1.4s';
  el.innerHTML = `<div style="font:13px var(--type);letter-spacing:.4em;color:#7d786c">HALBERD FACILITIES · NIGHT CREW</div><div style="font:clamp(64px,12vw,150px) var(--disp);letter-spacing:.18em;color:#ece7da;margin-top:8px">NIGHT ${n}</div><div style="font:15px var(--type);color:#8d887c;margin-top:6px;letter-spacing:.2em">${days[(n - 1) % 7]} · 10:00 PM — 4:00 AM</div>`;
  document.body.appendChild(el); audio.tone && audio.tone({ f: 55, f2: 40, v: 0.25, d: 2.2, lp: 200, wet: 0.6 }); setTimeout(() => { el.style.opacity = 0; }, 3000); setTimeout(() => el.remove(), 4500);
}
let bagFullT = 0, monState = 'dormant', shake = 0;
const nameOf = (id) => (crewSnap.find(c => c.pid === id) || {}).name || 'A crewmate';

// ======================= doors / lockers visuals =======================
function setDoor(id, st, snap) { const D = W.doors[id]; if (!D) return; const prev = D.target; D.target = st.open ? (D.d.swing || 1) * 1.65 : 0; D.bolted = st.bolted; if (snap) D.angle = D.target; else if (prev !== D.target) audio.door({ x: D.pivot.position.x, y: 1.2, z: D.pivot.position.z }, st.open, D.d.kind === 'steel'); if (D.bolt && !snap && D.boltOn !== st.bolted) audio.bolt({ x: 21.7, y: 1.3, z: 3.7 }, st.bolted); D.boltOn = st.bolted; }
function setLocker(id, st, snap) { const L = W.lockers[id]; if (!L) return; L.target = st.open ? -1.9 : 0; if (snap) L.angle = L.target; else audio.locker({ x: L.L.x, y: 1.5, z: L.L.z }, st.open); if (L.item && st.searched) L.item.visible = false; }
function updatePlate() { if (!W) return; if (W.chain) W.chain.visible = !keys2.stairkey; if (W.cafeKey) W.cafeKey.visible = !keys2.cafekey; const legible = day >= 2; W.plate014.material.color.setScalar(legible ? 1.25 : 1); W.plate014.scale.setScalar(legible ? 1.05 : 1); }

// ======================= remote players =======================
const REMOTE = new Map();
const CREW_COL = [0x41597a, 0x7a5a41, 0x4f7a41, 0x6a417a];
function remotePush(c) {
  let r = REMOTE.get(c.pid);
  if (!r) { const w = makeWorker(c.name, CREW_COL[REMOTE.size % 4]); scene.add(w.root); const tool = makeVacuumModel(); scene.add(tool.root); const mop = makeMopModel(); scene.add(mop.root); r = { w, tool, mop, buf: [], stepD: 0, last: null }; REMOTE.set(c.pid, r); }
  r.buf.push({ t: performance.now(), ...c }); if (r.buf.length > 20) r.buf.shift();
}
function sampleBuf(buf, delay = 110) {
  const t = performance.now() - delay; if (!buf.length) return null;
  let a = buf[0], b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= t && buf[i + 1].t >= t) { a = buf[i]; b = buf[i + 1]; break; }
  if (t >= b.t || (a.tp != null && a.tp !== b.tp)) return { ...b, k: 1 }; // a relocation: no sliding across the map
  const k = a === b ? 1 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  const out = { ...b }; for (const f of ['x', 'z', 'y']) out[f] = lerp(a[f], b[f], k); out.yw = a.yw + angDiff(a.yw, b.yw) * k; if (a.yaw != null) out.yaw = a.yaw + angDiff(a.yaw, b.yaw) * k; return out;
}
function updateRemotes(dt) {
  for (const [id, r] of REMOTE) {
    const s = sampleBuf(r.buf); if (!s) continue;
    const prev = r.last || s; const sp = Math.hypot(s.x - prev.x, s.z - prev.z) / Math.max(dt, 1e-3); r.last = s;
    r.w.root.position.set(s.x, groundY(s.x, s.z) + (s.dn ? -0.6 : 0), s.z); r.w.root.rotation.set(s.dn ? -1.3 : 0, s.yw, 0);
    r.w.update(dt, sp > 3.6 ? 'run' : sp > 0.3 ? 'walk' : 'idle', clamp(sp / (sp > 3.6 ? 5 : 2.8), 0.5, 1.5));
    r.w.root.visible = !s.out && !s.hid;
    r.stepD += sp * dt; if (r.stepD > 0.75) { r.stepD = 0; audio.step({ x: s.x, y: 0.1, z: s.z }, s.cr ? 0.3 : 0.8); }
    const showVac = s.tool === 'vacuum' && !s.dn && !s.out, showMop = s.tool === 'mop' && !s.dn && !s.out;
    r.tool.root.visible = showVac; r.mop.root.visible = showMop;
    if (showVac || showMop) {
      const yaw = s.yw, rx = Math.cos(yaw) * 0.22, rz = -Math.sin(yaw) * 0.22;
      const gy = groundY(s.x, s.z), grip = tmp2.set(s.x + rx - Math.sin(yaw) * 0.25, gy + (s.cr ? 0.7 : 1.0), s.z + rz - Math.cos(yaw) * 0.25).clone();
      const [hx, hz] = aimFloor(s.x, gy + 1.6, s.z, yaw, s.pt, 0.6, showMop ? 1.8 : 1.3, solidRects(mirror.doors));
      if (showVac) { poseVac(r.tool, grip, hx, hz, yaw); r.tool.led.material.emissiveIntensity = s.act ? 3 : 0; if (s.act) { r.vacSnd = (r.vacSnd || 0) + dt; if (r.vacSnd > 0.15) { r.vacSnd = 0; audio.noise({ f: 1500, q: 0.8, v: 0.05, d: 0.16, pos: { x: s.x, y: 0.8, z: s.z }, wet: 0.2 }); } } }
      else poseMop(r.mop, grip, hx, hz, yaw);
    }
  }
}

// ======================= the Monitor (render side) =======================
let monStepD = 0, monLast = null;
function updateMonitor(dt, t) {
  if (!monitor) return;
  if (CALM) { monitor.root.visible = false; dread = 0; return; }
  const s = sampleBuf(monSnap, 120); if (!s) return;
  const m = monitor;
  const pz = s.pz || 0, gyM = groundY(s.x, s.z), rmM = ROOMS[roomAt(s.x, s.z)];
  m.root.position.set(s.x, pz === 2 ? gyM + (rmM ? rmM.ceil : 2.9) : gyM, s.z); m.root.rotation.set(0, s.yaw, pz === 2 ? Math.PI : 0);
  const sp = monLast ? Math.hypot(s.x - monLast.x, s.z - monLast.z) / Math.max(dt, 1e-3) : 0; monLast = { x: s.x, z: s.z };
  const modeR = s.st === 'hunt' || sp > 2.8 ? 'run' : sp > 0.2 ? 'walk' : 'idle';
  monStillT = modeR === 'idle' && s.st !== 'hunt' ? monStillT + dt : 0; monMoving = sp > 0.2;
  const modeA = pz ? 'crawl' : monStillT > 0.5 ? 'still' : modeR; // standing still it takes the same display pose as the stored mannequins
  if (pz && sp > 0.4 && !s.fr) { scuttleT -= dt; if (scuttleT <= 0) { scuttleT = 0.045 + Math.random() * 0.07; audio.tone({ f: 1800 + Math.random() * 1600, f2: 900, type: 'triangle', v: 0.05, d: 0.025, pos: { x: s.x, y: m.root.position.y, z: s.z }, wet: 0.35 }); } }
  const look = Math.atan2(s.lx - s.x, s.lz - s.z); const rel = angDiff(s.yaw, look);
  m.scr = s.st === 'hunt' ? 0.85 : s.st === 'watch' ? 0.35 : 0.12;
  if (s.fr && scareT <= 0) { m.frozen = true; } else { m.frozen = false; }
  if (m.lastPz !== pz) { m.lastPz = pz; m.posed = false; }
  if (!m.frozen || !m.posed) m.posed = true, m.update(dt, scareT > 0 ? "idle" : modeA, clamp(sp / (modeA === "run" ? 4.3 : 1.2), 0.5, 1.4), t, scareT > 0 ? 0 : rel);
  monStepD += sp * dt; if (monStepD > (modeA === 'run' ? 1.4 : 0.9)) { monStepD = 0; audio.monStep({ x: s.x, y: 0.1, z: s.z }); }
  const d = Math.hypot(s.x - P.x, s.z - P.z);
  if (audio.breath) { audio.breath.move(s.x, 1.9, s.z); audio.breath.g.gain.value = lerp(audio.breath.g.gain.value, d < 10 && s.st !== 'dormant' ? 0.14 * (1 - d / 10) : 0, 0.05); }
  if (audio.chaseG) audio.chaseG.gain.value = lerp(audio.chaseG.gain.value, s.st === 'hunt' && d < 26 ? 0.25 : 0, 0.04);
  // distant dragging now and then when it is far and moving
  if (s.st !== 'dormant' && d > 14 && Math.random() < dt * 0.02) audio.drag({ x: s.x, y: 0.2, z: s.z });
  heartT -= dt; if (d < 14 && s.st !== 'dormant' && heartT <= 0) { const k = 1 - d / 14; heartT = 0.32 + (1 - k) * 0.85; audio.tone({ f: 62, f2: 38, v: 0.06 + k * 0.28, d: 0.11, lp: 180, wet: 0 }); audio.tone({ f: 55, f2: 36, v: 0.04 + k * 0.2, d: 0.1, lp: 160, wet: 0, delay: 0.17 }); }
  if (audio.dreadG) audio.dreadG.gain.value = lerp(audio.dreadG.gain.value, dread * 0.32, 0.03);
  dread = clamp(dread + (d < 12 && s.st !== 'dormant' && s.st !== 'retreat' ? (s.st === 'hunt' ? 0.6 : 0.2) * dt : -0.15 * dt), 0, 1);
}
let scuttleT = 0, dread = 0, monStillT = 0, monMoving = false, heartT = 0, screechT = 0;
let pendingTP = null, scareTP = null;
// ---------------- stalker feedback: hunts, pranks, static, hiding, the siege, game over ----------------
let firstHunt = true, huntFlickerT = 0, staticLvl = 0, blinkT = 0, hidden = null, siege = null, holdingDoor = false, gameOverOn = false;
function nearOfficeDoor() { return inOffice(P) && Math.hypot(P.x - 21.5, P.z - 4.3) < 2.2; }
function hideTarget() {
  if (P.downed || P.out || ui || (P.gy ?? 0) < -1) return null; camera.getWorldDirection(fwd); let best = null, bd = 1.25;
  for (const L of LOCKERS) { const d = Math.hypot(L.x - P.x, L.z - P.z); if (d > bd) continue; const inFront = L.side === 'n' ? P.z > L.z : P.z < L.z; const cos = ((L.x - P.x) * fwd.x + (L.z - P.z) * fwd.z) / Math.max(d, 0.01); if (!inFront || cos < 0.45 || mirror.lockers[L.id]?.open) continue; best = L; bd = d; }
  return best;
}
function toggleHide() { if (hidden) { net.send({ t: 'unhide' }); return; } const L = hideTarget(); if (L) net.send({ t: 'hide', id: L.id }); }
function setHidden(id) {
  if (hidden === id) return; hidden = id; $('lockerView').hidden = !id;
  if (id) { const L = LOCKERS.find(l => l.id === id); P.yaw = L.side === 'n' ? Math.PI : 0; P.pitch = 0; audio.locker({ x: L.x, y: 1.5, z: L.z }, false); audio.tone({ f: 120, f2: 80, v: 0.12, d: 0.3, lp: 400 }); }
}
function monFX(m) {
  const pos = { x: m.x, y: groundY(m.x, m.z) + 1.2, z: m.z }, d = Math.hypot(m.x - P.x, m.z - P.z);
  if (m.k === 'unfreeze') { audio.tone({ f: 380 + Math.random() * 120, f2: 140, type: 'triangle', v: 0.08, d: 0.07, pos, wet: 0.5 }); }
  else if (m.k === 'freeze' && d < 5 && performance.now() > screechT && Math.random() < 0.6) { screechT = performance.now() + 12000; audio.sting(pos); shake = Math.max(shake, 0.2); dread = Math.min(1, dread + 0.4); }
  else if (m.k === 'twitch') { audio.noise({ f: 2600, q: 2, v: 0.4, d: 0.05, pos, wet: 0.4 }); audio.tone({ f: 140, f2: 60, type: 'triangle', v: 0.35, d: 0.09, pos, lp: 700, wet: 0.4 }); if (d < 8) shake = Math.max(shake, 0.12 + (8 - d) * 0.03); dread = 1; }
  else if (m.k === 'drop') { for (let i = 0; i < 4; i++) audio.noise({ f: 2000 + Math.random() * 1500, q: 3, v: 0.3, d: 0.04, pos, wet: 0.4, delay: i * 0.07 + Math.random() * 0.04 }); audio.tone({ f: 90, f2: 50, v: 0.4, d: 0.25, pos, lp: 400, wet: 0.5 }); dread = Math.min(1, dread + 0.5); }
}
function prankFX(m) {
  const pos = { x: m.x, y: groundY(m.x, m.z) + 1.2, z: m.z }, near = Math.hypot(m.x - P.x, m.z - P.z);
  if (m.k === 'slam' || m.k === 'rip') { const L = W.lockers[m.id]; if (L) { L.angle = -1.8; L.target = -1.9; setTimeout(() => { L.target = 0; }, m.k === 'rip' ? 2500 : 220); } audio.noise({ f: 1300, q: 0.7, v: 0.45, d: 0.4, pos, wet: 0.7 }); audio.tone({ f: 180, f2: 80, v: 0.5, d: 0.5, pos, lp: 900, wet: 0.7, type: 'triangle' }); if (near < 9) shake = Math.max(shake, 0.4); }
  else if (m.k === 'knock') { for (let i = 0; i < (m.n || 3); i++) { audio.tone({ f: 96, f2: 66, v: 0.55, d: 0.13, pos, lp: 520, wet: 0.5, delay: i * 0.36 }); audio.noise({ f: 800, q: 1, v: 0.14, d: 0.05, pos, wet: 0.4, delay: i * 0.36 }); } }
  else if (m.k === 'whisper') { for (let i = 0; i < 9; i++) audio.noise({ f: 1900 + Math.random() * 2200, q: 7, v: 0.07, d: 0.14 + Math.random() * 0.22, pos, wet: 0.15, delay: i * 0.2 + Math.random() * 0.1 }); }
  else if (m.k === 'breathe') { const bp = { x: P.x + Math.sin(P.yaw) * 0.6, y: groundY(P.x, P.z) + 1.7, z: P.z + Math.cos(P.yaw) * 0.6 }; for (let i = 0; i < 2; i++) audio.noise({ f: 650, f2: 420, q: 1.3, v: 0.3, d: 1.0, a: 0.4, pos: bp, wet: 0, delay: i * 1.6 }); dread = Math.min(1, dread + 0.3); }
  else if (m.k === 'roll') { for (let i = 0; i < 7; i++) audio.tone({ f: 1300 + Math.random() * 500, v: 0.03, d: 0.09, pos, type: 'triangle', delay: i * 0.13 }); }
  else if (m.k === 'prints') spawnPrints(m);
  else if (m.k === 'skitter') { const n = 18 + ((Math.random() * 10) | 0); for (let i = 0; i < n; i++) { const k = i / n; audio.tone({ f: 2000 + Math.random() * 1800, f2: 1000, type: 'triangle', v: 0.06, d: 0.02, delay: k * 1.3 + Math.random() * 0.03, pos: { x: m.x + (m.x1 - m.x) * k, y: m.y, z: m.z + (m.z1 - m.z) * k }, wet: 0.3 }); } }
  else if (m.k === 'runsteps') { for (let i = 0; i < 9; i++) { const k = i / 9; audio.step({ x: m.x + (m.x1 - m.x) * k, y: 0.1, z: m.z + (m.z1 - m.z) * k }, 1.4); } }
  else if (m.k === 'thud') { audio.tone({ f: 70, f2: 35, v: 0.6, d: 0.5, pos, lp: 300, wet: 0.6 }); audio.noise({ f: 300, q: 1, v: 0.2, d: 0.3, pos, wet: 0.6 }); }
  else if (m.k === 'giggle') { for (let i = 0; i < 5; i++) { const f = 900 + Math.random() * 300; audio.tone({ f, f2: f * 0.85, type: 'sine', v: 0.035, d: 0.09, delay: i * 0.13, pos, wet: 0.8 }); audio.noise({ f: f * 2, q: 5, v: 0.02, d: 0.08, delay: i * 0.13, pos, wet: 0.8 }); } }
  else if (m.k === 'fake') { dread = 1; heartT = 0; const bp = { x: P.x + Math.sin(P.yaw) * 0.8, y: groundY(P.x, P.z) + 1.6, z: P.z + Math.cos(P.yaw) * 0.8 }; audio.noise({ f: 600, f2: 400, q: 1.2, v: 0.25, d: 1.1, a: 0.4, pos: bp, wet: 0 }); for (let i = 0; i < 6; i++) { audio.tone({ f: 62, f2: 38, v: 0.3, d: 0.11, lp: 180, wet: 0, delay: i * 0.42 }); audio.tone({ f: 55, f2: 36, v: 0.22, d: 0.1, lp: 160, wet: 0, delay: i * 0.42 + 0.17 }); } }
}
// bare muddy footprints that come up behind you
const PRINTS = { mesh: null, life: new Float32Array(48), i: 0 };
function buildPrints() {
  const tex = textCanvas(64, 140, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(46,32,20,.92)'; x.beginPath(); x.ellipse(32, 108, 15, 24, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(30, 66, 17, 30, -0.08, 0, 7); x.fill(); for (const [tx, ty, r] of [[19, 24, 7], [30, 18, 6], [39, 20, 5.5], [47, 25, 5], [53, 32, 4.5]]) { x.beginPath(); x.arc(tx, ty, r, 0, 7); x.fill(); } });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -6 });
  PRINTS.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.27).rotateX(-Math.PI / 2), mat, 48); PRINTS.mesh.frustumCulled = false; PRINTS.mesh.renderOrder = 4;
  const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 48; i++) PRINTS.mesh.setMatrixAt(i, z); scene.add(PRINTS.mesh);
}
function spawnPrints(m) {
  if (!PRINTS.mesh) return; const q = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  m.pts.forEach(([x, z], k) => { const i = PRINTS.i = (PRINTS.i + 1) % 48; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw + Math.PI + (k % 2 ? 0.1 : -0.1)); mtx.compose(new THREE.Vector3(x, groundY(x, z) + 0.006, z), q, new THREE.Vector3(k % 2 ? -1 : 1, 1, 1)); PRINTS.mesh.setMatrixAt(i, mtx); PRINTS.life[i] = 110; });
  PRINTS.mesh.instanceMatrix.needsUpdate = true;
}
function updatePrints(dt) { if (!PRINTS.mesh) return; let ch = false; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 48; i++) if (PRINTS.life[i] > 0) { PRINTS.life[i] -= dt; if (PRINTS.life[i] <= 0) { PRINTS.mesh.setMatrixAt(i, z); ch = true; } } if (ch) PRINTS.mesh.instanceMatrix.needsUpdate = true; }
// 4:00 AM: it tries the office door; hold it shut
function siegeFX(m) {
  if (m.on) { siege = { t: 0, dur: m.dur, held: 0, n: m.n, of: m.of }; audio.sting({ x: 21.5, y: 1.2, z: 3.4 }); dread = 1; }
  else { if (siege && m.held) toast(m.n >= m.of ? 'The handle stops moving.' : `It let go of the handle. (${m.n} of ${m.of})`); siege = null; holdingDoor = false; $('holdDoor').hidden = true; }
}
function updateSiege(dt, t) {
  if (!siege) { holdingDoor = false; return; }
  siege.t += dt; const near = nearOfficeDoor(); holdingDoor = near && (keys.KeyE || touch.eHeld);
  if (holdingDoor) siege.held += dt;
  $('holdDoor').hidden = !inOffice(P); $('holdHint').textContent = near ? (holdingDoor ? 'Keep holding' : `Hold ${isTouch ? 'E' : '[E]'} — keep it shut`) : 'Get to the door!';
  $('holdBar').style.width = Math.min(100, siege.held / (siege.dur * CONFIG.monitor.siegeHold) * 100).toFixed(0) + '%';
  const D = W.doors.d_office; if (D) D.pivot.rotation.y = D.angle + Math.sin(t * 40) * (holdingDoor ? 0.004 : 0.02);
  if ((siege.t % 0.5) < dt) { audio.rattle({ x: 21.5, y: 1.1, z: 3.6 }); if (!holdingDoor) audio.bang({ x: 21.5, y: 1.2, z: 3.6 }); shake = Math.max(shake, holdingDoor ? 0.15 : 0.35); }
}
// GAME OVER: static, a last look, and Retry Night
function showGameOver(m) {
  gameOverOn = true; const mine = m.pid === pid;
  setTimeout(() => {
    ui = 'gameover'; try { document.exitPointerLock && document.exitPointerLock(); } catch { }
    $('gameover').hidden = false; $('holdDoor').hidden = true; $('lockerView').hidden = true;
    $('goText').innerHTML = `Night ${m.day} · ${m.at}<br>${mine ? 'It found you.' : m.pid ? `${nameOf(m.pid)} was taken.` : 'The whole crew was taken.'}<br><small>You have been marked absent.</small>`;
    audio.tone({ f: 40, f2: 28, v: 0.35, d: 3, lp: 160, wet: 0.6 });
    const cv = $('goStatic'), x = cv.getContext('2d'), img = x.createImageData(200, 112);
    const tick = () => { if ($('gameover').hidden) return; const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } x.putImageData(img, 0, 0); requestAnimationFrame(tick); }; tick();
  }, mine ? 1400 : 200);
}
$('bRetry').onclick = () => { audio.ui(); net.send({ t: 'retry' }); };
$('bQuit').onclick = () => location.reload();
function applyTP(m) { P.x = m.x; P.z = m.z; P.yaw = m.yaw || 0; P.vx = P.vz = 0; }
function jumpscare() {
  scareTP = pendingTP; pendingTP = null;
  audio.caught(); shake = 1.6; $('hurt').style.opacity = 1; setTimeout(() => { $('blinkFx').style.opacity = 1; }, 1150);
  if (monitor) { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); monitor.root.position.set(P.x + fx * 0.7, groundY(P.x, P.z), P.z + fz * 0.7); monitor.root.rotation.y = P.yaw; scareT = 0.9; }
  setTimeout(() => $('hurt').style.opacity = 0, 1400);
}
let scareT = 0;

// ======================= CCTV =======================
const CCTV = { rt: null, cams: [], i: 0, t: 0, px: null };
function buildCCTV() {
  CCTV.rt = new THREE.WebGLRenderTarget(256, 192);
  for (const [n, p, l] of [['HALL EAST', [39.4, 2.75, 3.3], [10, 1, 1.5]], ['HALL WEST', [0.5, 2.75, 0.3], [25, 0.8, 2.2]], ['SERVICE', [43.6, 2.5, -5.6], [41, 0.5, 8]], ['RM 112', [17.6, 2.7, -0.4], [9, 0.6, -7]], ['OFFICE DOOR', [25.4, 2.6, 0.7], [21.5, 1.0, 3.3]], ['ROOM 014', [7.5, 2.45, 4.1], [14, 0.6, 11]], ['CAFETERIA', [-0.6, -0.4, 19.5], [-7, -3.2, 10]], ['GYM', [-16.6, 2.6, -13.4], [-28, -3.5, -2]]]) { const c = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 60); c.position.set(...p); c.lookAt(...l); CCTV.cams.push({ n, c }); }
  W.cctvScreen.material.map = CCTV.rt.texture; W.cctvScreen.material.needsUpdate = true;
  CCTV.px = new Uint8Array(256 * 192 * 4);
}
function renderCCTV(dt) {
  const near = Math.hypot(P.x - 24, P.z - 6.5) < 6 || ui === 'os'; if (!near || NORENDER) return;
  CCTV.t += dt; if (CCTV.t < (ui === 'os' ? 0.12 : 0.25)) return; CCTV.t = 0;
  const cam = CCTV.cams[CCTV.i].c; const vis = VM.vac.root.visible, vis2 = VM.mop.root.visible; VM.vac.root.visible = VM.mop.root.visible = false;
  flash.visible = false; W.cctvScreen.visible = false; renderer.setRenderTarget(CCTV.rt); renderer.render(scene, cam); renderer.setRenderTarget(null); flash.visible = true; W.cctvScreen.visible = true; VM.vac.root.visible = vis; VM.mop.root.visible = vis2;
  if (ui === 'os' && osApp === 'cctv.exe') { const cv = $('cctvCanvas'); if (cv) { renderer.readRenderTargetPixels(CCTV.rt, 0, 0, 256, 192, CCTV.px); const x = cv.getContext('2d'), img = x.createImageData(256, 192); for (let j = 0; j < 192; j++) { const src = (191 - j) * 256 * 4; img.data.set(CCTV.px.subarray(src, src + 1024), j * 1024); } for (let i = 0; i < img.data.length; i += 4) { const l = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, l * 1.6 + Math.random() * 18); } x.putImageData(img, 0, 0); x.fillStyle = '#fff'; x.font = '12px monospace'; x.fillText(`CAM ${CCTV.i + 1} ${CCTV.cams[CCTV.i].n}  ${clockText(shiftT)}  LIVE`, 6, 14); } }
}

// ======================= lights =======================
function fixtureLevel(L, t) {
  if (L.state === 'off') return 0;
  let k = 1; if (L.state === 'flicker') { const n = Math.sin(t * 13.7 + L.x * 3) + Math.sin(t * 31 + L.z * 7); k = n > 1.2 ? 0.1 : n > 0.9 ? 0.6 : 1; }
  let mk = 1; if (huntFlickerT > 0) mk = Math.sin(t * 61 + L.x * 3) + Math.sin(t * 37 + L.z * 2) > 0.3 ? 0.04 : 1;
  if (!CALM && monitor && monMoving) { const md = Math.hypot(L.x - monitor.root.position.x, L.z - monitor.root.position.z); if (md < 7) mk = Math.sin(t * 47 + L.x * 5) + Math.sin(t * 23 + L.z) > 0.6 + md / 7 ? 0.05 : 1; }
  return k * mk * (blackoutT > 0 ? 0 : 1) * (CALM ? 1 : scareLight(L.x, L.z, t));
}
let blackoutT = 0;
function placePool(cx, cz, force) {
  const t = performance.now() / 1000;
  const lit = LIGHTS.filter(L => L.state !== 'off').map(L => ({ L, d: Math.hypot(L.x - cx, L.z - cz) })).sort((a, b) => a.d - b.d);
  POOL.forEach((pl, i) => { const e = lit[i]; if (!e || e.d > 14) { pl.intensity = 0; return; } pl.position.set(e.L.x, e.L.y - 0.25, e.L.z); pl.color.setHex(e.L.color); pl.userData.L = e.L; pl.distance = e.L.emergency ? 5 : 8.5; pl.userData.base = (e.L.bulb ? 2.2 : e.L.emergency ? 0.8 : 3.4) * e.L.i; });
}
let poolT = 0;
function updateLights(dt, t) {
  poolT += dt; if (poolT > 0.3) { poolT = 0; placePool(P.x, P.z); }
  for (const pl of POOL) if (pl.userData.L) pl.intensity = pl.userData.base * fixtureLevel(pl.userData.L, t);
  for (const f of W.fixtures) f.mat.emissiveIntensity = f.base * fixtureLevel(f.L, t);
  // fluorescent hum follows nearby lit fixtures
  let hum = 0; for (const L of LIGHTS) { const d = Math.hypot(L.x - P.x, L.z - P.z); if (d < 6) hum += fixtureLevel(L, t) * (1 - d / 6) * (L.state === 'flicker' ? 1.6 : 1); }
  if (audio.humG) audio.humG.gain.value = lerp(audio.humG.gain.value, Math.min(0.012, hum * 0.006), 0.1);
  // flashlight
  const lv = upgrades.light || 0; flash.distance = CONFIG.flashlight.range[lv]; flash.angle = CONFIG.flashlight.angle[lv];
  flash.intensity = P.light ? 26 : 0; VM.torchLens.material.emissiveIntensity = P.light ? 3 : 0;
  W.bake.scale.value = blackoutT > 0 ? 0.04 : 1;
}

// ======================= HUD =======================
function showHUD(on) { $('hud').hidden = !on; $('pauseBtn').hidden = !on; $('touch').hidden = !(on && isTouch); }
function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('toasts').appendChild(d); setTimeout(() => d.remove(), 6000); while ($('toasts').children.length > 5) $('toasts').firstChild.remove(); }
let cmT = 0; function centerMsg(a, b, dur) { $('centerMsg').innerHTML = `${a}<small>${b || ''}</small>`; $('centerMsg').classList.add('on'); cmT = dur; }
let paT = 0;
function showPA(text) {
  $('paText').textContent = '“' + text + '”'; $('pa').classList.add('on'); paT = 7; audio.chime();
  try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(text); u.rate = 0.82; u.pitch = 0.55; u.volume = 0.55 * settings.vol; setTimeout(() => speechSynthesis.speak(u), 1500); } } catch { }
}
const pings = []; function showPing(x, y, z, who) { const d = document.createElement('div'); d.className = 'toast'; d.style.position = 'fixed'; d.style.borderLeftColor = '#7ad'; d.textContent = '◆ ' + who; document.body.appendChild(d); pings.push({ el: d, p: new THREE.Vector3(x, y, z), t: 4 }); }
let hudT = 0;
function updateHUD(dt) {
  hudT += dt; if (cmT > 0) { cmT -= dt; if (cmT <= 0) $('centerMsg').classList.remove('on'); }
  if (paT > 0) { paT -= dt; if (paT <= 0) $('pa').classList.remove('on'); }
  for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i]; p.t -= dt; const s = p.p.clone().project(camera); p.el.style.left = ((s.x * 0.5 + 0.5) * innerWidth) + 'px'; p.el.style.top = ((-s.y * 0.5 + 0.5) * innerHeight) + 'px'; p.el.style.display = s.z < 1 ? 'block' : 'none'; if (p.t < 0) { p.el.remove(); pings.splice(i, 1); } }
  if (hudT < 0.15) return; hudT = 0;
  const min = gameClock(shiftT);
  $('clock').textContent = clockText(shiftT);
  $('clock').style.color = phase === 'lockdown' ? '#ff6a5a' : min >= 3 * 60 + 30 && min < 12 * 60 ? '#f0b35a' : '';
  $('phase').textContent = phase === 'lockdown' ? 'HEADCOUNT IN PROGRESS' : `NIGHT ${day}${mode === 'coop' ? ' · CREW ' + room : ''}`;
  $('money').textContent = '$' + money.toFixed(2);
  $('earn').textContent = mirror.shiftStats ? '' : '';
  const ar = roomAt(P.x, P.z), pr = ar ? progressRoom(ar) : null;
  $('area').textContent = ar ? ROOMS[ar].name : '—';
  if (pr && pr !== 'office' && pr !== 'storage') { const rp = mirror.roomProgress()[pr]; if (rp) $('areaProg').innerHTML = `${Math.round((rp.debris * 0.5 + rp.surface * 0.5) * 100)}% restored${rp.done ? ' · done' : ''}<div class="pbar"><i style="width:${Math.round((rp.debris * 0.5 + rp.surface * 0.5) * 100)}%"></i></div>`; }
  else $('areaProg').innerHTML = ar === 'office' ? (mirror.doors.d_office.bolted ? '<span style="color:#9d9">Bolt engaged</span>' : '<span style="color:#f0b35a">Door not bolted</span>') : '';
  $('crew').innerHTML = mode === 'coop' ? crewSnap.map(c => `${c.pid === pid ? '▸ ' : ''}${c.name}${c.dn ? ' <span style="color:#f66">DOWN</span>' : c.out ? ' (out)' : ''}`).join('<br>') : '';
  const vs = vacStats(upgrades);
  $('toolName').textContent = P.tool === 'vacuum' ? 'Vacuum' : P.tool === 'mop' ? 'Mop' : 'Hands';
  $('toolInfo').textContent = P.tool === 'vacuum' ? `Bag ${myBag} / ${vs.bag} · reach ${vs.reach.toFixed(1)} m` : P.tool === 'mop' ? `Mop ${Math.round(mopDirt * 100)}% dirty${mopDirt > 0.75 ? ' — RINSE IT' : ''} · right mouse scrubs` : (inv.vacuum ? '1 vacuum · ' : '') + (inv.mop ? '2 mop · ' : '') + 'F flashlight';
  $('bagBar').hidden = P.tool !== 'vacuum' && P.tool !== 'mop'; const fillK = P.tool === 'mop' ? mopDirt : myBag / vs.bag; $('bagFill').style.width = (fillK * 100) + '%'; $('bagFill').style.background = fillK >= (P.tool === 'mop' ? 0.75 : 1) ? '#e55' : P.tool === 'mop' ? '#9a7a4a' : '';
  const it = hidden ? null : pickTarget(); let pt = promptFor(it);
  if (hidden) pt = `${isTouch ? 'HIDE' : '[H]'} Step out of the locker`; else if (!pt && hideTarget()) pt = `${isTouch ? 'HIDE' : '[H]'} Hide in the locker`;
  $('prompt').hidden = !pt; if (pt) $('prompt').textContent = pt; if (isTouch) $('aLbl').textContent = hidden ? 'EXIT' : siege && nearOfficeDoor() ? 'HOLD' : it ? 'USE' : hideTarget() ? 'HIDE' : 'ACT';
  $('hurt').style.opacity = P.downed ? 0.9 : Math.max(0, dread - 0.5) * 0.8;
}

// ======================= menus =======================
function openUI(name) { ui = name; clearInputs(); if (document.pointerLockElement) document.exitPointerLock(); $('lockBanner').hidden = true; }
function closeUI(noLock) { for (const id of ['pause', 'bag', 'summary']) $(id).hidden = true; $('os').hidden = true; ui = null; if (!noLock) { requestLock(); canvas.focus(); } if (freeLook && !locked) setTimeout(() => { if (!locked && playing && !ui) enterFree(lockReason || 'mouse capture unavailable'); }, 300); }
function openPause() {
  openUI('pause'); $('pause').hidden = false;
  $('pauseNote').textContent = mode === 'coop' ? 'The shift keeps running for your crew while you are paused.' : 'Solo: the world keeps running while paused only in co-op. In solo the clock still moves, so get somewhere safe first.';
  $('pInvite').hidden = mode !== 'coop'; $('inviteText').textContent = mode === 'coop' ? `Crew code ${room}: ${location.origin}${location.pathname}?room=${room}` : '';
  $('sSens').value = settings.sens; $('sFov').value = settings.fov; $('sBob').checked = settings.bob; $('sInv').checked = settings.inv; $('sQual').value = settings.quality; $('sVol').value = settings.vol;
}
$('pResume').onclick = () => closeUI();
$('pauseBtn').onclick = () => openPause();
$('pInvite').onclick = async () => { const link = `${location.origin}${location.pathname}?room=${room}`; try { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } catch { $('inviteText').textContent = 'Copy this: ' + link; } };
$('pLeave').onclick = () => { try { net.close(); } catch { } location.href = location.pathname; };
$('sSens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
$('sFov').oninput = (e) => { settings.fov = +e.target.value; saveSettings(); resize(); };
$('sBob').onchange = (e) => { settings.bob = e.target.checked; saveSettings(); };
$('sInv').onchange = (e) => { settings.inv = e.target.checked; saveSettings(); };
$('sQual').onchange = (e) => { settings.quality = +e.target.value; saveSettings(); $('perfNote').textContent = 'Quality changes fully apply after reloading the page.'; resize(); };
$('sVol').oninput = (e) => { settings.vol = +e.target.value; saveSettings(); audio.setVolume(settings.vol); };
// backpack
let bagTab = 'gear';
function openBag() { openUI('bag'); $('bag').hidden = false; renderBag(); }
document.querySelectorAll('#bag .tabs .btn').forEach(b => b.onclick = () => { bagTab = b.dataset.tab; document.querySelectorAll('#bag .tabs .btn').forEach(x => x.classList.toggle('on', x === b)); renderBag(); });
$('bagClose').onclick = () => closeUI();
function renderBag() {
  const vs = vacStats(upgrades), B = $('bagBody');
  if (bagTab === 'gear') {
    B.innerHTML = [['Work gloves and boots', 'Standard issue.', null], ['Flashlight', `Beam ${CONFIG.flashlight.range[upgrades.light]} m. F toggles. It helps you see, and helps you be seen.`, null],
      ['Cordless vacuum', inv.vacuum ? `Reach ${vs.reach} m · pull ${vs.accel} m/s² · bag ${myBag}/${vs.bag} · heard from ${vs.noise} m` : 'Not found yet. Check the janitor closet.', inv.vacuum ? 'vacuum' : null],
      ['String mop', inv.mop ? `Head ${CONFIG.mop.radius * 2 * 100 | 0} cm · reach ${CONFIG.mop.reach} m. Lifts mud the vacuum cannot.` : 'Not found yet.', inv.mop ? 'mop' : null]]
      .map(([n, d, eq]) => `<div class="item"><div><b>${n}</b><br><span class="note">${d}</span></div>${eq ? `<button class="btn" data-eq="${eq}">${P.tool === eq ? 'Equipped' : 'Equip'}</button>` : ''}</div>`).join('');
    B.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => { equip(b.dataset.eq); renderBag(); });
  } else if (bagTab === 'journal') {
    B.innerHTML = discoveries.length ? discoveries.map(d => { const c = CLUES[d.id]; return `<div class="clue"><h3>${c.title}</h3><p>${c.text}</p><small>${c.where} · night ${d.day}${d.by ? ' · found by ' + d.by : ''}</small></div>`; }).join('') : '<p>Nothing yet. Some things only show up once a place is clean.</p>';
  } else {
    B.innerHTML = Object.entries(CONFIG.skills).map(([k, s]) => `<div class="item"><div><b>${s.name}</b><br><span class="note">${s.desc}</span></div><span class="note">${mirror.purchased.includes(k) ? 'Installed' : '$' + s.cost}</span></div>`).join('') + '<p class="note">Buy upgrades at the office computer (skills.exe).</p>';
  }
}
// ======================= facilities OS =======================
let osApp = null, osNote = '';
const APPS = ['contracts.exe', 'equipment.exe', 'skills.exe', 'lostfound.exe', 'maintenance.exe', 'cctv.exe'];
function openOS() {
  openUI('os'); $('os').hidden = false; osApp = null; $('osWin').hidden = true;
  $('osDesk').innerHTML = APPS.map((a, i) => `<div class="icon" data-app="${a}"><i>${['📋', '🧰', '★', '💰', '🔧', '📹'][i]}</i>${a}</div>`).join('') +
    `<div style="position:absolute;right:20px;bottom:16px;max-width:300px" class="mascot"><b>●●</b><span>${day === 1 ? 'Night. Sit down. Your contract is in contracts.exe. Upgrades are in skills.exe.' : 'Welcome back. There is a new work order.'}</span></div>`;
  $('osDesk').querySelectorAll('.icon').forEach(el => el.onclick = () => { osApp = el.dataset.app; osNote = ''; renderOSApp(); audio.ui(); });
}
function closeOS() { closeUI(); }
$('osX').onclick = () => { osApp = null; $('osWin').hidden = true; };
$('osLogout').onclick = () => { net.send({ t: 'clockout' }); };
$('osBack').onclick = () => closeOS();
function renderOSApp() {
  if (ui !== 'os' || !osApp) return; $('osWin').hidden = false; $('osTitle').textContent = osApp; $('osTask').textContent = osApp; const B = $('osBody'); const rp = mirror.roomProgress();
  const pct = (x) => (x * 100).toFixed(0) + '%';
  if (osApp === 'contracts.exe') {
    B.innerHTML = `<b>HALBERD FACILITIES — NIGHT ${day}</b><br>Site: Blackbriar High (closed 1998)<br><br>
      <table><tr><th>Assignment</th><th>Progress</th><th>Pay</th></tr>
      <tr><td>East Hallway: remove debris, lift dust and mud</td><td>${pct(rp.hall.debris)} debris · ${pct(rp.hall.surface)} floor</td><td>$${CONFIG.pay.piece}/item · bonus $${CONFIG.roomBonus.hall}</td></tr>
      <tr><td>Room 112: debris and the mud by the desks</td><td>${pct(rp.class.debris)} · ${pct(rp.class.surface)}</td><td>bonus $${CONFIG.roomBonus.class}</td></tr>
      <tr><td>Service corridor and storage</td><td>${pct(rp.service.debris)} · ${pct(rp.service.surface)}</td><td>bonus $${CONFIG.roomBonus.service}</td></tr>
      ${day >= 2 ? `<tr><td style="color:#a11"><b>PRIORITY: Room 014, deep clean</b></td><td>not on floor plan</td><td>$???</td></tr>` : ''}</table>
      <p><b>Clause 7.</b> Be inside the maintenance office, with the security bolt engaged, before 4:00 AM. ${day >= 2 ? '<b>Do not let them mark you absent.</b>' : 'Do not answer the attendance announcements.'}</p>
      <b>Evidence logged</b><br>${discoveries.length ? discoveries.map(d => '• ' + CLUES[d.id].title + ' — ' + CLUES[d.id].where).join('<br>') : '(none)'}`;
  } else if (osApp === 'equipment.exe') {
    const vs = vacStats(upgrades);
    B.innerHTML = `<b>Your equipment</b><br>Vacuum: ${inv.vacuum ? `reach ${vs.reach} m, pull ${vs.accel} m/s², bag ${myBag}/${vs.bag}` : 'not collected (closet rack)'}<br>Mop: ${inv.mop ? 'yes' : 'not collected (closet rack)'}<br>Flashlight: ${CONFIG.flashlight.range[upgrades.light]} m<br><br>
      <b>Crew</b><br>${crewSnap.map(c => `${c.name}: ${c.tool}${c.dn ? ' (DOWN)' : ''}`).join('<br>')}`;
  } else if (osApp === 'skills.exe') {
    const vs = vacStats(upgrades);
    B.innerHTML = `<div class="mascot"><b>●●</b><span>Balance is shared by the whole crew. Each upgrade is bought once and applies to everyone's gear.</span></div>
      ${['Vacuum', 'Mop', 'Gear', 'Robots'].map(cat => `<h4 style="margin:10px 0 4px;color:#0b1d8c">${cat}</h4><table>${Object.entries(CONFIG.skills).filter(([, s]) => s.cat === cat).map(([k, s]) => { const have = mirror.purchased.includes(k), locked = s.needs && !mirror.purchased.includes(s.needs); return `<tr><td><b>★ ${s.name}</b><br>${s.desc}</td><td>${have ? (s.item ? 'OWNED' : 'INSTALLED') : '$' + s.cost.toFixed(2)}</td><td><button class="ob" data-buy="${k}" ${have || locked || money < s.cost ? 'disabled' : ''}>${locked ? 'Locked' : s.item ? 'Buy' : 'Upgrade'}</button></td></tr>`; }).join('')}</table>`).join('')}
      <p>Current vacuum: reach <b>${vs.reach} m</b>, pull <b>${vs.accel} m/s²</b>, cone ${vs.cone}°, bag ${vs.bag}, heard from ${vs.noise} m.</p>
      <p style="color:#a11">${osNote || ''}</p><div class="task" style="border:0;background:#ddd">Balance: $${money.toFixed(2)}</div>`;
    B.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { b.disabled = true; net.send({ t: 'buy', skill: b.dataset.buy }); });
  } else if (osApp === 'lostfound.exe') {
    const total = found.reduce((a, f) => a + f.v, 0);
    B.innerHTML = `<b>LOST & FOUND</b><p>Halberd buys back anything you turn in from the lockers.</p><table>${found.length ? found.map(f => `<tr><td>${f.n}</td><td>$${f.v.toFixed(2)}</td></tr>`).join('') : '<tr><td>Nothing turned in yet. Search the lockers.</td></tr>'}</table><p><button class="ob" id="sellAll" ${found.length ? '' : 'disabled'}>Sell all ($${total.toFixed(2)})</button></p>`;
    const sb = $('sellAll'); if (sb) sb.onclick = () => { sb.disabled = true; net.send({ t: 'sell' }); };
  } else if (osApp === 'maintenance.exe') {
    B.innerHTML = `<b>Restoration progress</b><table><tr><th>Area</th><th>Debris left</th><th>Floor</th><th>Status</th></tr>${Object.entries(rp).map(([k, r]) => `<tr><td>${ROOMS[k].name}</td><td>${r.debrisLeft} / ${r.debrisTotal}</td><td>${pct(r.surface)}</td><td>${mirror.roomBonus[k] ? 'RESTORED' : r.done ? 'complete' : '—'}</td></tr>`).join('')}</table><p>Items removed tonight: ${summary ? summary.pieces : '—'}</p>`;
  } else if (osApp === 'cctv.exe') {
    B.innerHTML = `<canvas id="cctvCanvas" width="256" height="192"></canvas><div class="row">${CCTV.cams.map((c, i) => `<button class="ob" data-cam="${i}">${i + 1} ${c.n}</button>`).join('')}</div><p>Live feed from the building's cameras.</p>`;
    B.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { CCTV.i = +b.dataset.cam; CCTV.t = 1; });
  }
}
// ======================= summary =======================
function showSummary(s) {
  openUI('summary'); $('summary').hidden = false;
  $('sumBody').innerHTML = `<h2>${s.failed ? 'Shift failed — everyone was marked present' : s.clockedOut ? 'Signed out for the night' : 'Shift over — you made it to morning'}</h2>
    <p>Night ${s.day} · earned <b>$${s.earned.toFixed(2)}</b>${s.penalty ? ` · penalty -$${s.penalty.toFixed(2)}` : ''} · balance <b>$${(money).toFixed(2)}</b></p>
    <p>Items removed: ${s.pieces} · floor cells cleaned: ${s.cells} · times caught: ${s.caught}</p>
    ${s.disc.length ? `<p>Evidence found: ${s.disc.map(d => CLUES[d].title).join(', ')}</p>` : ''}
    <p class="note">All cleaning and purchases are kept. The building will be exactly as you left it.</p>
    <div class="row"><button class="btn primary" id="bSleep">Sleep — start night ${s.day + 1}</button></div>`;
  $('bSleep').onclick = () => { net.send({ t: 'sleep' }); };
}

// ======================= main loop =======================
let lastT = performance.now(), sendT = 0, colQ = [], mopQ = {}, vacFilmLast = null, mopLast = null, tickCount = 0, rewardCount = 0;
let vacSpin = 0;
let frameMs = 0; const prof = {};
function frame(now) {
  requestAnimationFrame(frame); const f0 = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; const t = now / 1000;
  const PR = (k, f) => { const a = performance.now(); f(); prof[k] = lerp(prof[k] || 0, performance.now() - a, 0.2); };
  pollGamepad(dt);
  if (playing) {
    PR('player', () => updatePlayer(dt, t));
    PR('tools', () => updateTools(dt, t));
    PR('remotes', () => updateRemotes(dt));
    PR('monitor', () => updateMonitor(dt, t));
    if (monitor && scareT <= 0) monitor.lock = false;
    if (scareT > 0 && scareT - dt <= 0 && scareTP) { applyTP(scareTP); scareTP = null; $('hurt').style.opacity = 1; }
    if (scareT > 0) { scareT -= dt; const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); if (monitor) { const k = Math.max(0, scareT); monitor.root.position.set(P.x + fx * (0.5 + k * 0.5), groundY(P.x, P.z) - 0.3, P.z + fz * (0.5 + k * 0.5)); monitor.lock = true; monitor.root.rotation.y = P.yaw; monitor.scr = 1.1; } }
    sendT += dt; if (sendT > 0.066) { sendT = 0; sendState(); }
    PR('masks', () => { updateMasks(dt); updateFX(dt); }); PR('hud', () => updateHUD(dt)); PR('anim', () => { animateWorld(dt, t); updateScares(dt, t); updateSiege(dt, t); updatePrints(dt); if (huntFlickerT > 0) huntFlickerT -= dt;
      if (hidden) { VM.vac.root.visible = VM.mop.root.visible = VM.handL.visible = VM.torch.visible = false; P.light = false; }
      if (W.crowd2) { W.crowd2.visible = (P.gy ?? groundY(P.x, P.z)) > -2; if (!CALM && updateCrowd(W.crowd2, MANNEQUIN_SPOTS.filter(s => s.y > -1), 0, P.x, P.z, camera, dt, 0.3)) audio.tone({ f: 260 + Math.random() * 200, f2: 120, type: 'triangle', v: 0.05, d: 0.08, wet: 0.7, pos: { x: P.x + Math.sin(P.yaw) * 4, y: 1, z: P.z + Math.cos(P.yaw) * 4 } }); }
      if (W.crowd) { W.crowd.visible = (P.gy ?? groundY(P.x, P.z)) < -2; if (!CALM && updateCrowd(W.crowd, MANNEQUIN_SPOTS.filter(s => s.y < -1), -4, P.x, P.z, camera, dt, 0.35)) audio.tone({ f: 300 + Math.random() * 200, f2: 120, type: 'triangle', v: 0.05, d: 0.08, wet: 0.7, pos: { x: P.x - Math.sin(P.yaw) * -4, y: -3, z: P.z - Math.cos(P.yaw) * -4 } }); } });
    if (!P.out && touch.revive) holdRevive(dt);
    if (keys.KeyE) holdRevive(dt);
  } else if (W) { // attract view behind the entry screen
    if (VM.handL) { VM.handL.visible = VM.torch.visible = false; if (VM.handR) VM.handR.visible = false; VM.vac.root.visible = VM.mop.root.visible = false; }
    const ph = (t * 0.018) % 1; camera.position.set(4 + ph * 14, 1.58 + Math.sin(t * 0.6) * 0.012, 1.8 + Math.sin(t * 0.11) * 0.25); camera.rotation.set(-0.02 + Math.sin(t * 0.23) * 0.01, -Math.PI / 2 + Math.sin(t * 0.07) * 0.06, Math.sin(t * 0.13) * 0.006); animateWorld(dt, t);
    if (monitor && !CALM) { const cyc = t % 17; monitor.root.visible = cyc < 11; huntFlickerT = cyc > 10.6 && cyc < 11.6 ? 0.2 : huntFlickerT; monitor.root.position.set(33, 0, 1.8); monitor.root.rotation.set(0, -Math.PI / 2, 0); if (!monitor.titled) { monitor.titled = true; monitor.update(0.016, 'still', 1, t, 0); } }
    if (huntFlickerT > 0) huntFlickerT -= dt;
  }
  if (W) { PR('lights', () => updateLights(dt, t)); PR('cctv', () => renderCCTV(dt)); audio.listen(camera); if (!NORENDER) PR('render', () => { if (post) post.render(t, dread); else renderer.render(scene, camera); }); }
  frameMs = lerp(frameMs, performance.now() - f0, 0.1);
  // adaptive resolution from the real frame interval (includes GPU time)
  if (playing && !NORENDER) { fpsAcc += dt; fpsN++; if (fpsAcc > 1.2) { const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0;
    if (avg > 1 / 48 && renderScale > 0.55) { renderScale = Math.max(0.55, renderScale * 0.85); resize(); }
    else if (avg < 1 / 58 && renderScale < 1) { goodT++; if (goodT > 3) { goodT = 0; renderScale = Math.min(1, renderScale * 1.1); resize(); } } else goodT = 0; } }
}
let fpsAcc = 0, fpsN = 0, goodT = 0;
function holdRevive(dt) { const it = pickTarget(); if (it && it.kind === 'revive') { reviveHold += dt; if (reviveHold > 0.25) { reviveHold = 0; net.send({ t: 'revive', pid: it.pid }); } } }
function animateWorld(dt, t) {
  for (const D of Object.values(W.doors)) { D.angle = lerp(D.angle, D.target, 1 - Math.pow(0.004, dt)); D.pivot.rotation.y = (D.d.axis === 'x' ? 1 : 1) * D.angle * (D.d.axis === 'x' ? 1 : 1); if (D.bolt) { D.boltT = lerp(D.boltT, D.boltOn ? 1 : 0, 1 - Math.pow(0.001, dt)); D.bolt.position.x = (D.d.a1 - D.d.a0 - 0.04) - 0.2 + D.boltT * 0.1; } }
  for (const L of Object.values(W.lockers)) { L.angle = lerp(L.angle, L.target, 1 - Math.pow(0.003, dt)); L.piv.rotation.y = (L.side === 'n' ? 0 : Math.PI) + L.angle * (L.side === 'n' ? 1 : 1); }
  const min = Math.floor(gameClock(shiftT)); for (const c of W.clocks) if (c.last !== min) { c.last = min; c.draw(min); }
  if (W.screens.pc && (t * 4 | 0) !== W.screens.pc.k) { W.screens.pc.k = t * 4 | 0; const x = W.screens.pc.canvas.getContext('2d'); x.fillStyle = '#2f7d7d'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.font = '14px monospace'; x.fillText('HALBERD FACILITIES OS', 12, 22); x.fillText(clockText(shiftT), 12, 44); ['contracts.exe', 'equipment.exe', 'skills.exe', 'maintenance.exe', 'cctv.exe'].forEach((a, i) => { x.fillStyle = '#d8d8d0'; x.fillRect(16, 60 + i * 34, 22, 22); x.fillStyle = '#fff'; x.fillText(a, 46, 76 + i * 34); }); x.fillStyle = '#c9c9c2'; x.fillRect(0, 220, 320, 20); if ((t | 0) % 2) { x.fillStyle = '#000'; x.fillRect(260, 225, 8, 12); } W.screens.pc.tex.needsUpdate = true; }
}
function updatePlayer(dt, t) {
  if (hidden) {
    const L = LOCKERS.find(l => l.id === hidden); if (!L) { hidden = null; return; }
    const fy = L.side === 'n' ? Math.PI : 0; P.vx = P.vz = 0; P.moving = false;
    if (locked || isTouch) { P.yaw = fy + clamp(angDiff(fy, P.yaw), -0.55, 0.55); P.pitch = clamp(P.pitch, -0.35, 0.3); }
    shake = Math.max(0, shake - dt);
    camera.position.set(L.x, 1.52 + (Math.random() - 0.5) * shake * 0.05, L.z + (L.side === 'n' ? 0.27 : -0.27));
    camera.rotation.set(P.pitch, P.yaw, 0); camera.updateMatrixWorld(); return;
  }
  const ix = (keys.KeyD || keys.ArrowRight && false ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.mx, iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touch.my;
  if (!locked && !isTouch) { P.yaw -= edgeX * 2.2 * dt * settings.sens; P.pitch = clamp(P.pitch - edgeY * 1.4 * dt * settings.sens, -1.5, 1.5); }
  if (keys.ArrowLeft) P.yaw += 2 * dt; if (keys.ArrowRight) P.yaw -= 2 * dt; if (keys.ArrowUp) P.pitch = clamp(P.pitch + 1.4 * dt, -1.5, 1.5); if (keys.ArrowDown) P.pitch = clamp(P.pitch - 1.4 * dt, -1.5, 1.5);
  const crouch = keys.ControlLeft || keys.ControlRight || keys.KeyC || touch.crouch;
  const sprint = (keys.ShiftLeft || keys.ShiftRight || touch.sprint) && !crouch;
  let ml = Math.hypot(ix, iz); let mx = ix, mz = iz; if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  const canMove = !P.downed && !P.out && scareT <= 0;
  const spd = (sprint ? CONFIG.sprintSpeed : crouch ? CONFIG.crouchSpeed : CONFIG.walkSpeed) * (P.tool === 'vacuum' && (mouseL || touch.use) ? 0.8 : 1) * (upgrades.shoes ? 1.15 : 1) * (cart.holder === pid ? CONFIG.cart.speed : 1);
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  const tvx = canMove ? (-sy * mz + cy * mx) * spd : 0, tvz = canMove ? (-cy * mz - sy * mx) * spd : 0;
  const acc = 1 - Math.pow(0.0001, dt); P.vx = lerp(P.vx, tvx, acc); P.vz = lerp(P.vz, tvz, acc);
  [P.x, P.z] = moveCircle(P.x, P.z, P.vx * dt, P.vz * dt, CONFIG.playerRadius, playerRects());
  updateCart(dt);
  const speed = Math.hypot(P.vx, P.vz); P.moving = speed > 0.3; P.sprint = sprint && P.moving; P.crouching = crouch;
  P.crouch = lerp(P.crouch, crouch ? 1 : 0, 1 - Math.pow(0.0005, dt));
  if (P.moving) { P.bob += dt * speed * 2.3; P.stepD += speed * dt; if (P.stepD > (sprint ? 0.95 : 0.72)) { P.stepD = 0; const wetFloor = patchesAt(P.x, P.z).some(p => p.type === 'mud'); audio.step({ x: P.x, y: 0.05, z: P.z }, crouch ? 0.25 : sprint ? 1.3 : 0.8, wetFloor); } }
  P.gy = lerp(P.gy ?? groundY(P.x, P.z), groundY(P.x, P.z), 1 - Math.pow(0.00001, dt));
  const eye = P.gy + lerp(CONFIG.eyeHeight, CONFIG.crouchEye, P.crouch) - (P.downed ? 1.15 : 0);
  const bob = settings.bob && P.moving ? Math.sin(P.bob) * 0.035 * (sprint ? 1.4 : 1) : 0;
  shake = Math.max(0, shake - dt);
  camera.position.set(P.x, eye + bob + (Math.random() - 0.5) * shake * 0.05, P.z);
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * shake * 0.03, P.yaw, settings.bob && P.moving ? Math.sin(P.bob * 0.5) * 0.004 : 0);
  camera.updateMatrixWorld();
}
function sendState() {
  if (scareT > 0) return; // hold position until the lunge is over
  const act = P.tool !== 'none' && (mouseL || touch.use) && !ui && !P.downed;
  const tp = P.tp; P.tp = false;
  net.send({ t: 'st', hd: holdingDoor ? 1 : 0, tp, cart: cart.holder === pid ? [+cart.x.toFixed(3), +cart.z.toFixed(3), +cart.yaw.toFixed(3)] : undefined, p: [P.x, 0, P.z], yw: P.yaw, pt: P.pitch, tool: P.tool, act, fl: P.light, cr: !!P.crouching, sp: !!P.sprint, mv: !!P.moving });
  if (colQ.length) { net.send({ t: 'col', ids: colQ.splice(0, 80) }); }
  for (const id in mopQ) { if (mopQ[id].pts.length) { net.send({ t: 'mop', patch: id, pts: mopQ[id].pts.splice(0, 40), k: mopQ[id].k }); } }
}
function queueStroke(x, z, s, kind) {
  x = +x.toFixed(3); z = +z.toFixed(3); s = Math.max(0, Math.min(255, s | 0)); if (!s) return; // identical numbers to what the server applies
  const r = kind === 'vac' ? vacStats(upgrades).film : mopStats(upgrades).radius;
  const smear = kind === 'mop' && mopDirt > 0.75 ? Math.round(CONFIG.mop.smear * (mopDirt - 0.75) / 0.25) : 0;
  const sEff = kind === 'mop' ? Math.round(s * (1 - 0.8 * Math.min(1, mopDirt))) : s;
  for (const p of patchesAt(x, z)) {
    if (kind === 'vac' && p.type === 'mud') continue;
    const res = applyMop(p.id, [[x, z, sEff]], r, smear, kind);
    if (kind === 'mop' && res && res.removed > 0) mopFX(x, z, res.removed, !smear);
    if (kind === 'mop' && res) mopDirt = Math.min(1, mopDirt + res.removed / mopStats(upgrades).capacity * (p.type === 'mud' ? 1 : 0.25)); // prediction; the server sends the truth
    const key = p.id; if (!mopQ[key]) mopQ[key] = { pts: [], k: kind }; if (mopQ[key].k !== kind && mopQ[key].pts.length) { net.send({ t: 'mop', patch: key, pts: mopQ[key].pts.splice(0), k: mopQ[key].k }); } mopQ[key].k = kind; mopQ[key].pts.push([x, z, s]);
  }
}
function updateTools(dt, t) {
  const using = (mouseL || touch.use) && !ui && !P.downed && !P.out;
  const alt = mouseR && !ui;
  const rects = solidRects(mirror.doors);
  // first-person hands and torch
  const sway = VM.sway; sway.x = lerp(sway.x, P.vx * 0.006, 0.1); sway.y = lerp(sway.y, Math.sin(P.bob) * 0.01, 0.2);
  VM.handL.visible = VM.torch.visible = P.light;
  VM.torch.position.set(-0.22 + sway.x, -0.24 + sway.y, -0.42); VM.torch.rotation.set(0.05, 0.05, 0);
  VM.handL.position.set(-0.22 + sway.x, -0.255 + sway.y, -0.38); VM.handL.rotation.set(0.1, 0, -0.3);
  flash.position.set(-0.22, -0.22, -0.5);
  const showVac = P.tool === 'vacuum', showMop = P.tool === 'mop';
  VM.vac.root.visible = showVac; VM.mop.root.visible = showMop; VM.handR.visible = showVac || showMop;
  const gripLocal = new THREE.Vector3(0.2 + sway.x, -0.3 + sway.y - P.crouch * 0.05, -0.42);
  VM.handR.position.copy(gripLocal); VM.handR.rotation.set(-0.4, -0.15, 0.25);
  const grip = camera.localToWorld(gripLocal.clone().add(new THREE.Vector3(0, -0.02, 0.02)));
  const vs = vacStats(upgrades);
  // ---------- vacuum ----------
  vacSpin = lerp(vacSpin, showVac && using ? 1 : 0, 1 - Math.pow(showVac && using ? 0.02 : 0.15, dt));
  if (audio.vacG) { audio.vacG.gain.value = vacSpin * 0.13; audio.vacOsc.frequency.value = 50 + vacSpin * 160 + (alt ? 30 : 0); audio.vo2.frequency.value = 51 + vacSpin * 163; audio.vacFl.frequency.value = 250 + vacSpin * (alt ? 4200 : 3200); }
  if (showVac) {
    const [hx, hz] = aimFloor(P.x, camera.position.y, P.z, P.yaw, P.pitch, 0.55, 1.35, rects);
    VM.headPos.x = lerp(VM.headPos.x || hx, hx, 1 - Math.pow(0.0001, dt)); VM.headPos.z = lerp(VM.headPos.z || hz, hz, 1 - Math.pow(0.0001, dt));
    poseVac(VM.vac, grip, VM.headPos.x, VM.headPos.z, P.yaw);
    VM.vac.fill.scale.y = Math.max(0.001, myBag / vs.bag); VM.vac.led.material.emissiveIntensity = vacSpin * 3;
    VM.vac.brush.rotation.x += vacSpin * dt * 40;
    if (vacSpin > 0.05) VM.vac.root.position.set((Math.random() - 0.5) * 0.002 * vacSpin, 0, 0); // restrained vibration
    vacuumPhysics(dt, using && vacSpin > 0.4, alt, vs, rects);
  } else vacuumPhysics(dt, false, false, vs, rects);
  // ---------- mop ----------
  if (showMop) {
    let [hx, hz] = aimFloor(P.x, camera.position.y, P.z, P.yaw, P.pitch, 0.6, CONFIG.mop.reach, rects);
    if (alt && using) { hx += Math.cos(t * 9) * 0.12; hz += Math.sin(t * 9) * 0.12; }
    const prev = VM.mopHead.clone(); if (!VM.mopInit) { VM.mopHead.set(hx, 0, hz); VM.mopInit = true; }
    VM.mopHead.x = lerp(VM.mopHead.x, hx, 1 - Math.pow(0.0004, dt)); VM.mopHead.z = lerp(VM.mopHead.z, hz, 1 - Math.pow(0.0004, dt));
    const push = using ? Math.sin(t * 7) * 0.05 : 0;
    poseMop(VM.mop, grip, VM.mopHead.x - Math.sin(P.yaw) * push, VM.mopHead.z - Math.cos(P.yaw) * push, P.yaw);
    VM.mop.strandMat.color.setRGB(lerp(0.91, 0.32, mopDirt), lerp(0.89, 0.24, mopDirt), lerp(0.82, 0.14, mopDirt)); if (using) VM.mop.strandMat.color.multiplyScalar(0.85);
    if (mopDirt > 0.75 && !mopWarned) { mopWarned = true; toast('Your mop is filthy and smearing dirt around. Rinse it in a bucket (closet, or the janitor cart).'); }
    if (using) { // erase along the path the head actually travels; holding still does nothing
      const hp = new THREE.Vector3(VM.mopHead.x - Math.sin(P.yaw) * push, 0, VM.mopHead.z - Math.cos(P.yaw) * push);
      if (!mopLast) mopLast = hp.clone();
      const seg = hp.distanceTo(mopLast);
      if (seg > 0.04) { const n = Math.ceil(seg / 0.06); for (let k = 1; k <= n; k++) { const p = mopLast.clone().lerp(hp, k / n); queueStroke(p.x, p.z, Math.min(255, CONFIG.mop.strength * (seg / n) / 0.05), 'mop'); } mopLast.copy(hp); if (audio.wetSwish) audio.wetSwish.g.gain.value = Math.min(0.08, seg * 1.5); if (Math.random() < 0.08) audio.noise({ f: 2400, q: 6, v: 0.02, d: 0.06, wet: 0.2 }); }
      else if (audio.wetSwish) audio.wetSwish.g.gain.value *= 0.8;
    } else { mopLast = null; if (audio.wetSwish) audio.wetSwish.g.gain.value *= 0.8; }
  } else { VM.mopInit = false; if (audio.wetSwish) audio.wetSwish.g.gain.value = 0; }
}
// debris: tremble, then accelerate and swirl into the visible intake. Pieces must actually reach the nozzle to count.
function vacuumPhysics(dt, on, focus, vs, rects) {
  const act = DB.active;
  const ix = VM.headPos.x + (-Math.sin(P.yaw)) * 0.08, iz = VM.headPos.z + (-Math.cos(P.yaw)) * 0.08, iy = groundY(ix, iz) + 0.03;
  const full = myBag + colQ.length >= vs.bag;
  if (on && !full) {
    const R = vs.reach * (focus ? 1.25 : 1), cone = (focus ? vs.cone * 0.5 : vs.cone) * Math.PI / 180;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const c0x = Math.floor(ix - R), c1x = Math.floor(ix + R), c0z = Math.floor(iz - R), c1z = Math.floor(iz + R);
    let added = 0;
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const list = DB.grid.get(cx + ',' + cz); if (!list) continue;
      for (const id of list) {
        if (DB.hidden[id] || act.has(id) || act.size > 500) continue;
        const px = DB.pos[id * 3], pz = DB.pos[id * 3 + 2], dx = px - ix, dz = pz - iz, d = Math.hypot(dx, dz);
        if (d > R) continue;
        const ang = Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1));
        if (d > 0.3 && ang > cone) continue;
        if (segBlocked(ix, iz, px, pz, rects)) continue;
        act.set(id, { vx: 0, vy: 0, vz: 0, t: 0, delay: 0.04 + Math.random() * 0.25 * (d / R), spin: Math.random() * 6, sw: Math.random() < 0.5 ? 1 : -1 });
        if (++added > 60) break;
      }
    }
    // the floor head also lifts the fine dust film it passes over
    if (!vacFilmLast || Math.hypot(ix - vacFilmLast[0], iz - vacFilmLast[1]) > 0.07) { queueStroke(ix, iz, 70, 'vac'); vacFilmLast = [ix, iz]; }
  } else if (!on) vacFilmLast = null;
  for (const [id, a] of act) {
    const o = id * 3; let px = DB.pos[o], py = DB.pos[o + 1], pz = DB.pos[o + 2];
    a.t += dt;
    if (on && !full) {
      const dx = ix - px, dy = iy - py, dz = iz - pz, d = Math.hypot(dx, dy, dz);
      if (d > vs.reach * 1.45) { act.delete(id); continue; }
      if (a.t < a.delay) { px += (Math.random() - 0.5) * 0.004; pz += (Math.random() - 0.5) * 0.004; } // tremble first
      else {
        // spiral in: velocity eases toward an inward speed that rises near the intake, plus a swirl that fades as it arrives
        const hd = Math.hypot(dx, dz) || 1e-4, pullK = vs.accel * (focus ? 1.4 : 1);
        const vin = 0.6 + pullK * 0.3 * (1.25 - Math.min(1, hd / vs.reach)), swirl = vin * 0.55 * Math.min(1, hd / 0.7) * a.sw;
        const tvx = dx / hd * vin - dz / hd * swirl, tvz = dz / hd * vin + dx / hd * swirl;
        const ty = iy + 0.05 * Math.min(1, hd / 0.5) + Math.sin(a.t * 18 + id) * 0.008, tvy = (ty - py) * 10;
        const k = 1 - Math.exp(-(4 + pullK * 0.6) * dt);
        a.vx += (tvx - a.vx) * k; a.vy += (tvy - a.vy) * k; a.vz += (tvz - a.vz) * k;
        px += a.vx * dt; py = Math.max(0.003, py + a.vy * dt); pz += a.vz * dt; a.spin += dt * (8 + vin * 6);
        if (Math.hypot(ix - px, iz - pz) < 0.1) { // into the nozzle
          DB.pos[o] = px; DB.pos[o + 1] = py; DB.pos[o + 2] = pz; hideDebris(id); colQ.push(id);
          tickCount++; if (tickCount % 2 === 0) audio.tick({ x: ix, y: 0.1, z: iz });
          rewardCount++; if (rewardCount % 50 === 0) audio.reward();
          continue;
        }
      }
    } else { // motor off: pieces drop and settle where they are
      a.vy -= 9.8 * dt; const damp = Math.pow(0.05, dt); a.vx *= damp; a.vz *= damp;
      px += a.vx * dt; py += a.vy * dt; pz += a.vz * dt;
      const rest = groundY(px, pz) + KIND[DEBRIS[id].kind].h * DEBRIS[id].s;
      if (py <= rest) { py = rest; if (Math.abs(a.vy) < 1) { act.delete(id); regrid(id, px, pz); } a.vy = 0; }
    }
    DB.pos[o] = px; DB.pos[o + 1] = py; DB.pos[o + 2] = pz; writeDebris(id, a.spin);
  }
}
function regrid(id, x, z) { // keep the spatial hash right after a piece settles somewhere new
  for (const [k, list] of DB.grid) { const i = list.indexOf(id); if (i >= 0) { list.splice(i, 1); break; } }
  const key = Math.floor(x) + ',' + Math.floor(z); if (!DB.grid.has(key)) DB.grid.set(key, []); DB.grid.get(key).push(id);
}

// ======================= debug / test hooks =======================
window.__bb = {
  get state() { return { mopDirt, cartPos: { ...cart }, playing, ui, locked, freeLook, mode, room, P: { ...P }, money, shiftT, phase, day, inv, myBag, upgrades, discoveries: discoveries.map(d => d.id), monState, crew: crewSnap.length }; },
  teleport(x, z, yaw = P.yaw, pitch = P.pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch; P.tp = true; },
  activeInfo() { const ix = VM.headPos.x - Math.sin(P.yaw) * 0.08, iz = VM.headPos.z - Math.cos(P.yaw) * 0.08; const a = [...DB.active.entries()].slice(0, 5).map(([id, s]) => [id, +DB.pos[id * 3].toFixed(2), +DB.pos[id * 3 + 1].toFixed(3), +DB.pos[id * 3 + 2].toFixed(2), +s.t.toFixed(2)]); return { n: DB.active.size, intake: [+ix.toFixed(2), +iz.toFixed(2)], a }; },
  get frameMs() { return frameMs; }, get boot() { return BOOT; }, get prof() { return prof; },
  // advance gameplay logic at a fixed 60 Hz without rendering (CPU-emulated test browsers render at a few fps)
  scareState() { return scareDebug(); },
  scare(k, seed = 1) { if (k === 'clear') return clearScares(); if (k === 'lightsout') startLightsOut({ x: P.x, z: P.z, r: 11, d: 20 }); else spawnWatcher(seed); },
  step(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { const t = performance.now() / 1000 + i / 60; updatePlayer(1 / 60, t); updateTools(1 / 60, t); updateMonitor(1 / 60, t); animateWorld(1 / 60, t); updateScares(1 / 60, t); updateSiege(1 / 60, t); if (i % 4 === 0) sendState(); } updateMasks(1); updateHUD(1); },
  mirrorDoor(id) { return mirror && mirror.doors[id] && mirror.doors[id].open; },
  press(code, down = true) { keys[code] = down; }, mouse(l, r = false) { mouseL = l; mouseR = r; },
  debrisLeft() { return mirror.collected.reduce((a, b) => a + (b ? 0 : 1), 0); },
  maskSum(id) { return mirror.maskSum[id]; }, roomProgress() { return mirror.roomProgress(); },
  send(m) { net.send(m); }, dropSocket() { try { net.ws.close(); } catch { } }, get net() { return net && net.status; }, sim() { return net && net.sim; }, pick() { const it = pickTarget(); return it && { kind: it.kind, id: it.id }; },
  get renderer() { return renderer; },
};
boot();
