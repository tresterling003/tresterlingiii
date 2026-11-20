// Interiors: every house, tavern, smithy, church, castle, barracks and tower in a town has an inside.
// Walk into the front door and you are in it; walk back out through the same door.
// Only one interior exists at a time, built when you step in, far off the map (like the Barrow).
import * as THREE from 'three';
import { part, kitSize } from './assets.js';
import { rng } from './world.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ROOM_X = 5000, ROOM_Z = 0;

// building model → kind of room
export function roomKind(name) {
  const m = /building_(home_A|home_B|tavern|blacksmith|church|castle|barracks|tower_A|tower_B|archeryrange)_/.exec(name);
  if (!m) return null;
  return { home_A: 'home', home_B: 'home', tavern: 'tavern', blacksmith: 'smith', church: 'church', castle: 'castle', barracks: 'barracks', tower_A: 'tower', tower_B: 'tower', archeryrange: 'home' }[m[1]];
}
// width (x), depth (z), height
const SIZE = { home: [14, 12, 4.8], tavern: [24, 18, 6.2], smith: [17, 13, 5.6], church: [16, 30, 10], castle: [28, 34, 11], barracks: [22, 13, 5.6], tower: [11, 11, 9] };
export const ROOM_NAME = { home: 'a house', tavern: 'the tavern', smith: 'the smithy', church: 'the church', castle: 'the great hall', barracks: 'the barracks', tower: 'the tower' };

// ---------------------------------------------------------------- painted textures
const texCache = {};
function tex(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(kind.length * 977);
  if (kind === 'planks') {
    for (let y = 0; y < 256; y += 32) for (let x = -((y / 32) % 2) * 64; x < 256; x += 128) {
      const v = 0.85 + R() * 0.3;
      g.fillStyle = `rgb(${132 * v | 0},${92 * v | 0},${58 * v | 0})`; g.fillRect(x, y, 128, 32);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + 30, 128, 2); g.fillRect(x + 126, y, 2, 32);
      g.fillStyle = 'rgba(255,255,255,.05)'; for (let k = 0; k < 4; k++) g.fillRect(x + R() * 120, y + 6 + R() * 20, 30 + R() * 50, 1);
    }
  } else if (kind === 'stone') {
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      const v = 0.85 + R() * 0.25;
      g.fillStyle = `rgb(${150 * v | 0},${144 * v | 0},${134 * v | 0})`; g.fillRect(x, y, 64, 64);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, y + 62, 64, 2); g.fillRect(x + 62, y, 2, 64);
    }
  } else if (kind === 'plaster') {
    g.fillStyle = '#e6d8bc'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,100,70' : '255,255,255'},${0.04 + R() * 0.05})`; g.fillRect(R() * 256, R() * 256, 3 + R() * 8, 3 + R() * 8); }
  } else if (kind === 'brick') {
    for (let y = 0; y < 256; y += 32) for (let x = -((y / 32) % 2) * 32; x < 256; x += 64) {
      const v = 0.8 + R() * 0.3;
      g.fillStyle = `rgb(${128 * v | 0},${122 * v | 0},${116 * v | 0})`; g.fillRect(x, y, 64, 32);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + 30, 64, 2); g.fillRect(x + 62, y, 2, 32);
    }
  } else if (kind === 'carpet') {
    g.fillStyle = '#8a1c22'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#d8a840'; g.fillRect(14, 0, 8, 256); g.fillRect(234, 0, 8, 256);
    for (let y = 16; y < 256; y += 64) { g.beginPath(); g.moveTo(128, y); g.lineTo(160, y + 32); g.lineTo(128, y + 64); g.lineTo(96, y + 32); g.closePath(); g.fill(); }
  } else if (kind === 'rug') {
    g.fillStyle = '#5a3a6a'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#d8b060'; g.lineWidth = 10; g.strokeRect(20, 20, 216, 216);
    g.strokeStyle = '#a86040'; g.lineWidth = 6; g.strokeRect(50, 50, 156, 156);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[kind] = t);
}
const mat = (o) => new THREE.MeshLambertMaterial(o);

export class Rooms {
  constructor(g) {
    this.g = g;
    this.group = null;
    this.shapes = [];
    this.ents = [];
    this.door = null;
    this.ceil = 0;
    this.busy = false;
  }
  get inside() { return this.g.zone === 'inside'; }

  // ------------------------------------------------------------ in and out
  async enter(door) {
    const g = this.g, p = g.player;
    if (this.busy || g.zone !== 'world' || p.state === 'dead') return;
    this.busy = true;
    if (p.mount) g.dismount();
    // the watch remembers who was chasing you
    const chasers = g.bounty > 0 ? g.entities.filter(e => e.team === 'town' && !e.dead && e.state === 'chase' && e.pos.distanceTo(p.pos) < 45).length : 0;
    g.ui.fade(true);
    g.sfx.door ? g.sfx.door() : g.sfx.swish();
    await sleep(260);
    this.build(door);
    g.teleport(ROOM_X + this.spawn.x, ROOM_Z + this.spawn.z, 'inside');
    p.yaw = 0; p.rot = Math.PI; p.pitch = 0.18;
    p.camPos.set(ROOM_X, 2.6, ROOM_Z + this.D / 2 - 0.6);
    this.followT = chasers ? 2.5 : 0;
    this.followN = Math.min(3, chasers);
    await sleep(160);
    g.ui.fade(false);
    g.ui.toast(door.title);
    this.busy = false;
  }
  async exit() {
    const g = this.g, p = g.player, door = this.door;
    if (this.busy || !door) return;
    this.busy = true;
    g.ui.fade(true);
    g.sfx.door ? g.sfx.door() : g.sfx.swish();
    await sleep(240);
    g.teleport(door.ox, door.oz, 'world');
    p.rot = door.rot; p.yaw = door.rot + Math.PI; p.pitch = 0.2;
    p.camPos.copy(p.pos).add(V3(-Math.sin(door.rot) * 5, 2.8, -Math.cos(door.rot) * 5));
    await sleep(140);
    g.ui.fade(false);
    this.busy = false;
  }
  // tear the room down (called whenever you leave the 'inside' zone)
  clear() {
    const g = this.g;
    if (this.group) {
      g.scene.remove(this.group);
      const base = new Set(Object.values(texCache));
      this.group.traverse(o => {
        if (!o.isMesh || o.userData.kit) return;
        o.geometry.dispose();
        if (o.material.map && !base.has(o.material.map)) o.material.map.dispose();
        o.material.dispose();
      });
      this.group = null;
    }
    for (const s of this.shapes) g.phys.remove(s);
    this.shapes = [];
    g.phys.purge && g.phys.purge();
    for (const e of this.ents) if (g.entities.includes(e)) g.removeEntity(e);
    this.ents = [];
    g.points = g.points.filter(pt => !pt.room);
    g.scenery.torches = g.scenery.torches.filter(t => !t.room);
    this.anim = [];
    this.door = null;
    this.ceil = 0;
  }

  // ------------------------------------------------------------ per frame (only while inside)
  update(dt) {
    const g = this.g, p = g.player;
    if (!this.inside || !this.door) return;
    for (const f of this.anim) f(dt, performance.now() / 1000);
    // daylight through the windows
    const day = g.scenery.dayK ?? 1;
    if (this.winMat) this.winMat.color.setRGB(0.12 + day * 0.7, 0.16 + day * 0.74, 0.3 + day * 0.68);
    // walk back out through the door
    const lz = p.pos.z - ROOM_Z, lx = p.pos.x - ROOM_X;
    if (!this.busy && lz > this.D / 2 - 1.1 && Math.abs(lx) < 1.4 && p.vel.z > 1.2) this.exit();
    // the watch followed you in
    if (this.followT > 0 && (this.followT -= dt) <= 0 && g.bounty > 0) {
      for (let i = 0; i < this.followN; i++) {
        const e = g.spawnMob('watch', ROOM_X + (i - 1) * 1.4, ROOM_Z + this.D / 2 - 1.6, { zone: 'inside', tint: this.door.tint });
        e.state = 'chase'; e.angry = true; e.extraGuard = true; e.alerted = true;
        this.ents.push(e);
      }
      g.ui.toast('The watch followed you inside!', 'bad');
      g.sfx.sting && g.sfx.sting('evil');
    }
  }

  // ------------------------------------------------------------ building a room
  build(door) {
    this.clear();
    const g = this.g, kind = door.kind, [W, D, H] = SIZE[kind];
    const R = rng(Math.abs(Math.round(door.x * 31 + door.z * 17)) + 7);
    this.door = door; this.W = W; this.D = D; this.ceil = H; this.anim = [];
    this.spawn = { x: 0, z: D / 2 - 3.4 };
    const root = (this.group = new THREE.Group());
    root.position.set(ROOM_X, 0, ROOM_Z);
    g.scene.add(root);
    const stone = kind === 'church' || kind === 'castle' || kind === 'tower';
    const floorT = tex(stone ? 'stone' : 'planks').clone(); floorT.needsUpdate = true; floorT.repeat.set(W / 4, D / 4);
    const wallT = tex(stone || kind === 'smith' ? 'brick' : 'plaster').clone(); wallT.needsUpdate = true; wallT.repeat.set(W / 4, H / 4);
    const M = {
      floor: mat({ map: floorT }), wall: mat({ map: wallT }), wallD: null, timber: mat({ color: 0x5a3a24 }), wood: mat({ color: 0x8a5a34 }), woodL: mat({ color: 0xa87444 }),
      stoneM: mat({ color: 0x8a8680 }), dark: mat({ color: 0x2a2624 }), iron: mat({ color: 0x3a3a40 }), gold: mat({ color: 0xd8a840 }), red: mat({ color: 0x8a1c22 }),
      cloth: mat({ color: 0xe8e0d0 }), ceil: mat({ color: stone ? 0x6a6660 : 0x6a4a30 }),
    };
    const wallT2 = wallT.clone(); wallT2.needsUpdate = true; wallT2.repeat.set(D / 4, H / 4);
    M.wallD = mat({ map: wallT2 });
    this.winMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff });
    const box = (w, h, d, x, y, z, m, solid = false, low = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.own = true;
      root.add(mesh);
      if (solid) { const s = g.phys.box(ROOM_X + x, ROOM_Z + z, w / 2, d / 2, 0); if (low) s.low = true; this.shapes.push(s); }
      return mesh;
    };
    const kit = (k, name, x, z, rot = 0, sc = 1, o = {}) => {
      const obj = part(k, name, sc);
      obj.traverse(c => { c.userData.kit = true; });
      obj.position.set(x, o.y || 0, z); obj.rotation.y = rot;
      root.add(obj);
      if (o.solid !== false) {
        const s = kitSize(k, name), c = Math.cos(rot), sn = Math.sin(rot);
        const hw = Math.abs(c) > 0.5 ? s.x * sc * 0.45 : s.z * sc * 0.45, hd = Math.abs(c) > 0.5 ? s.z * sc * 0.45 : s.x * sc * 0.45;
        const sh = g.phys.box(ROOM_X + x, ROOM_Z + z, hw, hd, 0); sh.low = true; this.shapes.push(sh);
      }
      return obj;
    };
    const light = (x, y, z, color = 0xffb060, base = 22, dist = 16) => g.scenery.torches.push({ pos: V3(ROOM_X + x, y, ROOM_Z + z), color: new THREE.Color(color), base, dist, zone: 'inside', room: true });
    const flame = (x, y, z, s = 1, color = 0xffa040) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.7 * s, 6), new THREE.MeshBasicMaterial({ color }));
      f.position.set(x, y + 0.35 * s, z); f.userData.own = true; root.add(f);
      const k = Math.random() * 10;
      this.anim.push((dt, t) => { f.scale.set(1, 0.8 + Math.sin(t * 12 + k) * 0.25, 1); });
      return f;
    };

    // floor, ceiling, walls (the front wall has the door in it)
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.userData.own = true; root.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceil); ce.rotation.x = Math.PI / 2; ce.position.y = H; ce.userData.own = true; root.add(ce);
    const T = 0.5;
    box(W + T * 2, H, T, 0, H / 2, -D / 2 - T / 2, M.wall, true);
    box(T, H, D, -W / 2 - T / 2, H / 2, 0, M.wallD, true);
    box(T, H, D, W / 2 + T / 2, H / 2, 0, M.wallD, true);
    const gap = 2.6, side = (W - gap) / 2;
    box(side, H, T, -(gap / 2 + side / 2), H / 2, D / 2 + T / 2, M.wall, true);
    box(side, H, T, gap / 2 + side / 2, H / 2, D / 2 + T / 2, M.wall, true);
    box(gap, H - 3.2, T, 0, 3.2 + (H - 3.2) / 2, D / 2 + T / 2, M.wall);
    // the door itself, shut behind you: walk into it to leave
    box(gap, 3.2, 0.2, 0, 1.6, D / 2 + T, M.timber, true);
    box(gap + 0.5, 0.3, 0.6, 0, 3.3, D / 2 + 0.1, M.timber);
    for (const sx of [-1, 1]) box(0.3, 3.3, 0.6, sx * (gap / 2 + 0.15), 1.65, D / 2 + 0.1, M.timber);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12), M.iron); ring.position.set(0.8, 1.4, D / 2 + T - 0.12); ring.userData.own = true; root.add(ring);
    const mat2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), mat({ color: 0x7a5a3a })); mat2.rotation.x = -Math.PI / 2; mat2.position.set(0, 0.02, D / 2 - 1); root.add(mat2);
    this.g.points.push({ id: 'roomexit', room: true, x: ROOM_X, z: ROOM_Z + D / 2 - 0.9, label: `Leave ${ROOM_NAME[kind]}`, zone: 'inside', range: 2.2, act: () => this.exit() });
    // timber frame / beams
    if (!stone) {
      for (let x = -W / 2 + 0.2; x <= W / 2; x += W / Math.max(2, Math.round(W / 4))) box(0.35, 0.4, D, x, H - 0.2, 0, M.timber);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.45, H, 0.45, sx * (W / 2 - 0.22), H / 2, sz * (D / 2 - 0.22), M.timber);
    } else {
      for (let z = -D / 2 + 3; z < D / 2 - 1; z += 6) for (const sx of [-1, 1]) box(1.1, H, 1.1, sx * (W / 2 - 0.55), H / 2, z, M.stoneM, true);
    }
    // windows down both long walls
    for (let z = -D / 2 + 3; z < D / 2 - 2; z += stone ? 6 : 4.5) for (const sx of [-1, 1]) {
      const wy = stone ? H * 0.62 : 2.4, wh = stone ? H * 0.32 : 1.3;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, wh), this.winMat); w.position.set(sx * (W / 2 - 0.02), wy, z); w.rotation.y = -sx * Math.PI / 2; w.userData.own = true; root.add(w);
      box(0.2, 0.16, 1.6, sx * (W / 2 - 0.05), wy - wh / 2 - 0.08, z, M.timber);
      box(0.2, 0.16, 1.6, sx * (W / 2 - 0.05), wy + wh / 2 + 0.08, z, M.timber);
      box(0.2, wh, 0.12, sx * (W / 2 - 0.05), wy, z, M.timber);
    }

    // furniture
    const table = (x, z, w = 2.4, d = 1.3, rot = 0) => {
      const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = rot; root.add(t);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), M.woodL); top.position.y = 0.95; t.add(top);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), M.wood); l.position.set(sx * (w / 2 - 0.15), 0.45, sz * (d / 2 - 0.15)); t.add(l); }
      const s = g.phys.box(ROOM_X + x, ROOM_Z + z, (Math.abs(Math.cos(rot)) > 0.5 ? w : d) / 2, (Math.abs(Math.cos(rot)) > 0.5 ? d : w) / 2, 0); s.low = true; this.shapes.push(s);
    };
    const stool = (x, z) => { box(0.6, 0.55, 0.6, x, 0.275, z, M.wood); };
    const bench = (x, z, w, rot = 0) => { const b = box(Math.abs(Math.cos(rot)) > 0.5 ? w : 0.55, 0.5, Math.abs(Math.cos(rot)) > 0.5 ? 0.55 : w, x, 0.25, z, M.wood, true, true); return b; };
    const hearth = (x, z, rot) => {
      const hg = new THREE.Group(); hg.position.set(x, 0, z); hg.rotation.y = rot; root.add(hg);
      const add = (w, h, d, px, py, pz, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); hg.add(b); };
      add(3.4, 2.6, 1.2, 0, 1.3, 0, M.stoneM); add(1.8, 1.2, 0.5, 0, 0.6, 0.45, M.dark); add(1.2, H - 2.6, 0.9, 0, 2.6 + (H - 2.6) / 2, -0.1, M.stoneM); add(3.6, 0.2, 1.4, 0, 2.6, 0.1, M.timber);
      const fx = x + Math.sin(rot) * 0.5, fz = z + Math.cos(rot) * 0.5;
      flame(fx - 0.25, 0.05, fz, 1.2); flame(fx + 0.25, 0.05, fz, 1); flame(fx, 0.05, fz + 0.1, 1.5, 0xffc060);
      light(fx + Math.sin(rot) * 1.2, 1.4, fz + Math.cos(rot) * 1.2, 0xff8a3c, 40, 22);
      const s = g.phys.box(ROOM_X + x, ROOM_Z + z, Math.abs(Math.cos(rot)) > 0.5 ? 1.7 : 0.6, Math.abs(Math.cos(rot)) > 0.5 ? 0.6 : 1.7, 0); this.shapes.push(s);
    };
    const candles = (x, y, z) => { kit('dungeon', 'candle_triple', x, z, R() * 6, 1, { y, solid: false }); light(x, y + 1.2, z, 0xffc070, 14, 10); };
    const loot = (x, z, rot, o) => {
      const looted = (g.hero.flags.looted || {})[door.id];
      const fresh = looted === undefined || g.day() - looted > 3;
      kit('dungeon', o.gold ? 'chest_gold' : o.chest ? 'chest' : 'trunk_large_A', x, z, rot, o.sc || 1);
      if (!fresh) return;
      const pt = { id: 'roomloot', room: true, x: ROOM_X + x, z: ROOM_Z + z, label: o.gold ? 'Pick the treasury lock' : `Search the ${o.chest ? 'chest' : 'trunk'}`, zone: 'inside', range: 2.6,
        act: () => this.search(pt, o) };
      g.points.push(pt);
    };
    const person = (x, z, rot, o = {}) => {
      const looks = [['rogue', '#d8b8a0'], ['mage', '#b8c8e8'], ['barbarian', '#e8d0a0'], ['warden', '#a8c8a0'], ['rogue', '#e8a8b8'], ['mage', '#e8e0c8']];
      const [m, tint] = looks[Math.floor(R() * looks.length)];
      const names = ['Agnes', 'Bram', 'Cedric', 'Dalia', 'Edda', 'Finn', 'Greta', 'Hugo', 'Isolde', 'Jasper', 'Kira', 'Lothar', 'Mira', 'Nils', 'Orla', 'Piet'];
      const name = o.name || names[Math.floor(R() * names.length)];
      const e = g.addEntity({ type: o.talk ? 'npc' : 'villager', name, def: { name, title: o.title || '' }, model: o.model || m, gear: o.gear || (R() < 0.4 ? ['Mug'] : []), hat: !!o.hat, tint: o.tint || tint,
        x: ROOM_X + x, z: ROOM_Z + z, rot, idle: o.sit ? 'Sit_Chair_Idle' : o.idle, zone: 'inside' });
      e.rot = rot; e.face = rot;
      if (o.talk) { e.talk = o.talk; e.seated = !!o.sit; }
      else { e.hp = e.max = 12; e.armor = 10; e.spots = [[ROOM_X + x, ROOM_Z + z]]; e.panic = 0; e.timer = 99; e.stay = true; e.resident = !!o.resident; }
      if (o.sit) { e.seated = true; e.sitY = o.sitY ?? 0; }
      this.ents.push(e);
      return e;
    };
    const guard = (x, z, rot) => { const e = g.spawnMob('watch', ROOM_X + x, ROOM_Z + z, { zone: 'inside', tint: door.tint }); e.rot = e.postRot = rot; e.post = true; e.home.copy(e.pos); this.ents.push(e); return e; };
    const rug = (x, z, w, d, t = 'rug') => { const tt = tex(t).clone(); tt.needsUpdate = true; if (t === 'carpet') tt.repeat.set(1, d / 4); const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat({ map: tt })); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.025, z); r.receiveShadow = true; root.add(r); };

    if (kind === 'home') {
      hearth(0, -D / 2 + 0.6, 0);
      kit('dungeon', 'bed_floor', -W / 2 + 1.3, -D / 2 + 2, 0, 1.25);
      if (R() < 0.6) kit('dungeon', 'bed_floor', -W / 2 + 3.4, -D / 2 + 2, 0, 1.25);
      table(3, 0.5); stool(1.6, 0.5); stool(4.4, 0.5); stool(3, -0.6);
      candles(3, 1.02, 0.5);
      kit('dungeon', 'shelf_large', W / 2 - 0.35, -2.5, -Math.PI / 2, 1.4, { y: 1.6, solid: false });
      kit('dungeon', 'shelf_large', W / 2 - 0.35, -2.5, -Math.PI / 2, 1.4, { y: 2.6, solid: false });
      kit('dungeon', 'barrel_small', W / 2 - 1, D / 2 - 1.4); kit('dungeon', 'barrel_small', W / 2 - 2.1, D / 2 - 1.2);
      kit('town', 'sack', -W / 2 + 1, D / 2 - 1.4, 0.4, 6, { solid: false });
      rug(-1.5, 0.5, 4, 3);
      loot(-W / 2 + 1.1, 1.5, Math.PI / 2, {});
      light(0, H - 0.8, 1.5, 0xffc080, 12, 14);
      const night = g.scenery.dayK < 0.35;
      person(R() < 0.5 ? 1.6 : 4.4, 0.5, R() < 0.5 ? Math.PI / 2 : -Math.PI / 2, { talk: 'resident', title: 'lives here', sit: !night && R() < 0.5, sitY: 0 });
      if (R() < 0.5) person(-2, -1, R() * 6, { resident: true });
    } else if (kind === 'tavern') {
      // the bar
      box(12, 1.25, 1.1, -W / 2 + 8, 0.62, -D / 2 + 3.6, M.wood, true);
      box(12.3, 0.12, 1.35, -W / 2 + 8, 1.3, -D / 2 + 3.6, M.woodL);
      for (let i = 0; i < 4; i++) kit('dungeon', 'keg', -W / 2 + 3.5 + i * 2.6, -D / 2 + 1, 0, 0.75);
      kit('dungeon', 'shelf_large', -W / 2 + 8, -D / 2 + 0.3, 0, 2, { y: 2.6, solid: false });
      for (let i = 0; i < 5; i++) stool(-W / 2 + 4 + i * 2.2, -D / 2 + 4.9);
      person(-W / 2 + 8, -D / 2 + 2.1, 0, { talk: 'barkeep', name: ['Old Wynn', 'Marta', 'Big Osric', 'Hilde'][Math.floor(R() * 4)], title: 'keeps the bar', gear: ['Mug'], model: 'barbarian', tint: '#e8c8a0' });
      hearth(W / 2 - 0.6, -2, -Math.PI / 2);
      const tables = [[-6, 3], [-1, 5.5], [5, 2.5], [4, 7], [-6.5, 7.5]];
      for (const [x, z] of tables) {
        table(x, z, 2.6, 1.4);
        bench(x, z - 1.3, 2.4); bench(x, z + 1.3, 2.4);
        candles(x, 1.02, z);
        if (R() < 0.75) person(x + (R() - 0.5) * 1.2, z + (R() < 0.5 ? -1.3 : 1.3), 0, { sit: true, gear: ['Mug'] });
      }
      this.ents.filter(e => e.seated && e.type === 'villager').forEach(e => { e.rot = e.pos.z - ROOM_Z > 0 ? Math.PI : 0; for (const [x, z] of tables) if (Math.abs(e.pos.x - ROOM_X - x) < 1.5 && Math.abs(e.pos.z - ROOM_Z - z) < 2) e.rot = e.pos.z - ROOM_Z > z ? Math.PI : 0; });
      person(-3, 1, 0.5, { resident: true, gear: ['Mug'] });
      kit('dungeon', 'stairs', W / 2 - 3, D / 2 - 3.5, Math.PI / 2, 1);
      kit('dungeon', 'barrel_large', -W / 2 + 1.2, D / 2 - 1.5); kit('dungeon', 'barrel_small', -W / 2 + 1, D / 2 - 3.2);
      kit('dungeon', 'banner_patternA_red', -4, -D / 2 + 0.1, 0, 1, { y: 2, solid: false });
      light(-4, H - 1, 2, 0xffc070, 18, 18); light(4, H - 1, 4, 0xffc070, 18, 18);
      this.g.points.push({ id: 'board', room: true, x: ROOM_X - W / 2 + 0.6, z: ROOM_Z + 1, label: 'Read the notice board', zone: 'inside', range: 2.4, act: () => this.g.talkTo({ name: 'Notice board', def: { title: '' } }, 'board') });
      box(0.1, 1.6, 2.4, -W / 2 + 0.06, 2, 1, M.woodL);
    } else if (kind === 'smith') {
      // the forge
      box(3.4, 1.2, 2.2, W / 2 - 2.2, 0.6, -D / 2 + 1.6, M.stoneM, true);
      const coals = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ color: 0xff5a10 })); coals.rotation.x = -Math.PI / 2; coals.position.set(W / 2 - 2.2, 1.22, -D / 2 + 1.6); root.add(coals);
      this.anim.push((dt, t) => coals.material.color.setRGB(1, 0.3 + Math.sin(t * 3) * 0.08, 0.05));
      box(2.4, H - 1.2, 1.4, W / 2 - 2.2, 1.2 + (H - 1.2) / 2, -D / 2 + 0.9, M.stoneM);
      flame(W / 2 - 2.6, 1.2, -D / 2 + 1.6, 1, 0xff7020); flame(W / 2 - 1.8, 1.2, -D / 2 + 1.7, 0.8, 0xff9030);
      light(W / 2 - 2.2, 2.4, -D / 2 + 3, 0xff6a20, 46, 20);
      // anvil
      box(0.7, 0.8, 0.7, 1.5, 0.4, -1, M.timber, true, true); box(1.4, 0.35, 0.6, 1.5, 0.98, -1, M.iron);
      box(0.4, 0.2, 0.4, 2.3, 1.05, -1, M.iron);
      for (let i = 0; i < 3; i++) kit('town', 'weaponrack', -W / 2 + 0.7, -D / 2 + 2.5 + i * 2.5, Math.PI / 2, 6.5);
      kit('town', 'bucket_water', 3, -2.2, 0, 6, { solid: false });
      kit('dungeon', 'crates_stacked', -W / 2 + 1.5, D / 2 - 2, 0.2, 0.8);
      kit('dungeon', 'barrel_small', W / 2 - 1, D / 2 - 1.5);
      kit('dungeon', 'sword_shield_broken', -2, -D / 2 + 0.3, 0, 1.2, { y: 1.8, solid: false });
      loot(W / 2 - 1.2, 1.5, -Math.PI / 2, { chest: true });
      person(1.5, -2.4, 0, { talk: 'smithy', name: ['Gunnar', 'Ida', 'Torvald', 'Brann'][Math.floor(R() * 4)], title: 'smith', model: 'barbarian', gear: ['1H_Axe'], tint: '#b8a090' });
      light(-2, H - 1, 2, 0xffc080, 10, 14);
    } else if (kind === 'church') {
      rug(0, 0, 3, D - 6, 'carpet');
      for (let z = -D / 2 + 8; z < D / 2 - 3; z += 2.4) for (const sx of [-1, 1]) { bench(sx * 3.6, z, 4.2); box(4.2, 0.9, 0.12, sx * 3.6, 0.8, z + 0.3, M.wood); }
      // altar
      box(W - 2, 0.5, 5, 0, 0.25, -D / 2 + 2.5, M.stoneM, true, true);
      box(3.4, 1.2, 1.3, 0, 1.1, -D / 2 + 2.4, M.cloth, true);
      box(3.6, 0.08, 1.5, 0, 1.73, -D / 2 + 2.4, M.gold);
      candles(-1.2, 1.77, -D / 2 + 2.4); candles(1.2, 1.77, -D / 2 + 2.4);
      for (const sx of [-1, 1]) kit('dungeon', 'banner_thin_green', sx * 3, -D / 2 + 0.1, 0, 1.4, { y: 2.6, solid: false });
      const rose = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffd890 })); rose.position.set(0, H - 2.8, -D / 2 + 0.02); root.add(rose);
      this.anim.push(() => rose.material.color.copy(this.winMat.color).lerp(new THREE.Color(0xffc060), 0.5));
      person(0, -D / 2 + 4.2, 0, { talk: 'priest', name: ['Sister Ama', 'Brother Ewan', 'Mother Ysolde'][Math.floor(R() * 3)], title: 'priest', model: 'mage', tint: '#f0e8d8', hat: false });
      for (let i = 0; i < 3; i++) if (R() < 0.7) person((R() < 0.5 ? -1 : 1) * (2.2 + R() * 2.4), -D / 2 + 8 + Math.floor(R() * 5) * 2.4 + 0.1, Math.PI, { sit: true, gear: [] });
      this.g.points.push({ id: 'altar', room: true, x: ROOM_X, z: ROOM_Z - D / 2 + 4, label: 'Pray at the altar', zone: 'inside', range: 2.6, act: () => this.pray() });
      light(0, H - 2, -D / 2 + 5, 0xffe0b0, 30, 24); light(0, H - 2, 4, 0xffe0b0, 22, 22);
    } else if (kind === 'castle') {
      rug(0, 2, 3.6, D - 8, 'carpet');
      box(12, 0.8, 6, 0, 0.4, -D / 2 + 3, M.stoneM, true, true);
      box(12, 0.8, 1, 0, 0.2, -D / 2 + 6.4, M.stoneM, false); // step
      // throne
      box(2.2, 1.2, 1.6, 0, 1.4, -D / 2 + 2.2, M.red, true); box(2.4, 3.6, 0.4, 0, 2.6, -D / 2 + 1.4, M.gold); box(0.3, 1.0, 1.6, -1.2, 1.9, -D / 2 + 2.2, M.gold); box(0.3, 1.0, 1.6, 1.2, 1.9, -D / 2 + 2.2, M.gold);
      for (const sx of [-1, 1]) for (let z = -D / 2 + 8; z < D / 2 - 4; z += 6) { kit('dungeon', 'pillar_decorated', sx * 7, z, 0, 1, { y: 0 }); kit('dungeon', 'pillar', sx * 7, z, 0, 1, { y: 4, solid: false }); }
      for (const sx of [-1, 1]) for (let z = -D / 2 + 6; z < D / 2 - 4; z += 6) kit('dungeon', 'banner_shield_red', sx * (W / 2 - 0.25), z + 3, -sx * Math.PI / 2, 1.3, { y: 3.4, solid: false });
      for (const sx of [-1, 1]) { table(sx * 11, 0, 2.2, 10); kit('dungeon', 'candle_triple', sx * 11, 0, 0, 1, { y: 1.02, solid: false }); light(sx * 11, 3, 0, 0xffc070, 22, 18); }
      person(1.6, -D / 2 + 3.4, 0, { talk: 'lord', name: door.lord, title: `ruler of ${door.town}`, model: 'knight', gear: ['1H_Sword'], tint: '#e8d8a0', hat: true });
      for (const sx of [-1, 1]) { guard(sx * 4, -D / 2 + 7, 0); guard(sx * 3.2, D / 2 - 4, Math.PI); }
      loot(W / 2 - 2, -D / 2 + 2.5, -Math.PI / 2, { gold: true, sc: 1.1 });
      kit('dungeon', 'coin_stack_large', W / 2 - 3.6, -D / 2 + 1.6, 0, 1, { solid: false });
      light(0, 4, -D / 2 + 5, 0xffd090, 40, 26); light(0, H - 2, 4, 0xffd090, 26, 26);
      for (const sx of [-1, 1]) { const t = kit('dungeon', 'torch_mounted', sx * (W / 2 - 0.3), 6, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.4, { y: 3, solid: false }); flame(sx * (W / 2 - 0.6), 3.9, 6, 0.8); }
    } else if (kind === 'barracks') {
      for (let i = 0; i < 6; i++) kit('dungeon', 'bed_floor', -W / 2 + 2 + i * 3.4, -D / 2 + 2, 0, 1.25);
      for (let i = 0; i < 3; i++) kit('town', 'weaponrack', W / 2 - 0.7, -1 + i * 2.6, -Math.PI / 2, 6.5);
      kit('town', 'target', -W / 2 + 2, 2.5, Math.PI / 2, 6.5);
      kit('town', 'target', -W / 2 + 2, 5.2, Math.PI / 2, 6.5);
      table(2, 2, 2.6, 1.4); stool(0.6, 2); stool(3.4, 2); candles(2, 1.02, 2);
      kit('dungeon', 'crates_stacked', W / 2 - 1.6, D / 2 - 1.8, 0, 0.8);
      loot(-W / 2 + 1.2, D / 2 - 2, Math.PI / 2, { chest: true });
      person(-3, 3.5, Math.PI / 2, { talk: 'sergeant', name: 'Sergeant ' + ['Brakka', 'Dunmore', 'Vell', 'Okafor'][Math.floor(R() * 4)], title: 'drill sergeant', model: 'knight', gear: ['1H_Sword', 'Round_Shield'], tint: door.tint, hat: true });
      guard(3.4, 2, -Math.PI / 2);
      light(-4, H - 1, 1, 0xffc080, 16, 16); light(5, H - 1, 1, 0xffc080, 16, 16);
    } else if (kind === 'tower') {
      kit('dungeon', 'stairs', W / 2 - 3, -D / 2 + 2.5, 0, 1);
      table(-2, -1, 2.2, 1.3); stool(-2, 0.2); candles(-2, 1.02, -1);
      kit('dungeon', 'shelf_large', -W / 2 + 0.35, 1.5, Math.PI / 2, 1.4, { y: 1.5, solid: false });
      kit('dungeon', 'shelf_large', -W / 2 + 0.35, 1.5, Math.PI / 2, 1.4, { y: 2.5, solid: false });
      kit('dungeon', 'box_large', W / 2 - 1.2, D / 2 - 2, 0.3, 0.9);
      kit('dungeon', 'barrel_small', W / 2 - 1, 1);
      loot(-W / 2 + 1.1, -D / 2 + 1.2, Math.PI / 2, {});
      person(-2, 0.2, Math.PI, { talk: 'resident', title: 'lives here', sit: true, model: 'mage', tint: '#c8b8e8' });
      light(0, H - 2, 0, 0xffc080, 18, 16);
    }
  }

  // ------------------------------------------------------------ things to do inside
  async search(pt, o) {
    const g = this.g, h = g.hero, door = this.door;
    // a lock on the treasury: an Agility check
    if (o.gold) {
      g.talking = true;
      const ok = await g.ui.check('agility', 15 - (h.bg === 'outlaw' ? 3 : 0), g.stat('agility'), 'The treasury lock');
      g.talking = false;
      if (!ok) { g.ui.toast('The lock holds — and someone heard that.', 'bad'); this.witnessed(2, 'burglary'); return; }
    }
    (h.flags.looted = h.flags.looted || {})[door.id] = g.day();
    g.points = g.points.filter(x => x !== pt);
    const gold = o.gold ? 90 + Math.floor(Math.random() * 90) : o.chest ? 15 + Math.floor(Math.random() * 30) : 4 + Math.floor(Math.random() * 22);
    h.gold += gold; g.sfx.coin();
    let msg = `+${gold} gold`;
    if (Math.random() < (o.gold ? 1 : 0.3)) { h.potions++; msg += ', a potion'; }
    g.fx.text(V3(pt.x, 1.8, pt.z), msg, 'gold');
    g.ui.toast(`You help yourself: ${msg}.`);
    this.witnessed(o.gold ? 2 : 1, 'theft');
  }
  // did anyone see that?
  witnessed(n, what) {
    const g = this.g, p = g.player;
    const seen = this.ents.filter(e => !e.dead && e.zone === 'inside' && e.pos.distanceTo(p.pos) < 16 && (e.type !== 'mob' || e.team === 'town'));
    if (!seen.length) { g.ui.toast('Nobody saw a thing.', 'good'); return; }
    for (const e of seen) {
      if (e.type === 'villager' || e.type === 'npc') { g.fx.text(e.pos.clone().add(V3(0, 2.8, 0)), ['Thief!', 'Guards! GUARDS!', 'Put that back!'][Math.floor(Math.random() * 3)], 'say'); if (e.type === 'villager') { e.panic = 8; e.threat = p.pos.clone(); } }
    }
    g.crime(n, what, p.pos);
    // anyone in uniform in the room deals with it now
    for (const e of this.ents) if (e.type === 'mob' && e.team === 'town' && !e.dead) { e.angry = true; e.state = 'chase'; }
  }
  pray() {
    const g = this.g, h = g.hero, today = Math.floor(g.day());
    if (h.flags.prayed === today) { g.ui.toast('You feel at peace. (Come back tomorrow.)'); return; }
    h.flags.prayed = today;
    g.healPlayer(999);
    g.poisonT = 0;
    g.ui.flash('#fff6c8', 400); g.sfx.chime();
    g.ui.toast('A warm light washes over you. Fully healed.', 'good');
  }
}
