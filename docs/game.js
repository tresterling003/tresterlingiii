// EMBERFALL: OPEN REALM — the game itself. Ties the world, the people, the rules and the screen together.
import * as THREE from 'three';
import { CLASSES, MONSTERS, NPCS, QUESTS, DIALOGUE, ITEMS, KEY_ITEMS, XP_LEVELS, TINTS, STATS, TIPS, WEAPONS, START_WEAPON, MATERIALS, HORSES } from './data.js';
import { SITES, SHRINES, SHARDS, GLOWCAPS, CHESTS, SPAWNS, DUNGEON_START, DUNGEON_SPAWNS, dTile, SETTLEMENTS, PLANS, NPC_POS, START, INSIDE_X, WOOD, BERTRAM, ORE } from './world.js';
import { loadAssets, part } from './assets.js';
import { Physics } from './physics.js';
import { Scenery } from './scenery.js';
import { Actor, FX } from './actors.js';
import { Input, Player, d, roll } from './player.js';
import { updateMob, updateVillager, updateNpc, updateHorse, updateAlly } from './ai.js';
import { UI, isTouch } from './ui.js';
import { Sfx } from './sfx.js';
import { Net } from './net.js';
import { Rooms, ROOM_NAME } from './interiors.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SAVE = 'realm.save.v2';
const DAY_SECS = 420; // one day and night, in real seconds (7 minutes)
// distance from point c to the segment a→b (so fast projectiles cannot skip through a target)
const segPoint = (a, b, c) => { const ab = b.clone().sub(a), l = ab.lengthSq(); const t = l ? Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / l)) : 0; return a.clone().addScaledVector(ab, t).distanceTo(c); };
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

class Game {
  constructor() {
    const canvas = $('stage');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fc8e8, 0.006);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 540);
    this.phys = new Physics();
    this.scenery = new Scenery(this.scene, this.phys);
    this.fx = new FX(this.scene, $('floats'), this.camera);
    this.sfx = new Sfx();
    this.input = new Input(canvas);
    try { const s = localStorage.getItem('realm.sens'); if (s) this.input.sens = +s; } catch { /* fine */ }
    this.ui = new UI(this);
    this.rooms = new Rooms(this);
    this.input.onPad = () => this.ui.toast('🎮 Controller connected — press Start for the controls list.', 'good');
    this.entities = [];
    this.pickups = [];
    this.points = []; // fixed interaction spots: chests, stalls, doors, shrines
    this.zone = 'world';
    this.time = 0.3;
    this.bounty = 0;
    this.unseenT = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.shakeT = 0;
    this.state = 'loading';
    this.idSeq = 0;
    addEventListener('resize', () => this.resize());
    this.resize();
    window.__realm = this;
    // installed on a phone: keep the whole game offline; take updates when they arrive
    if ('serviceWorker' in navigator && !/^(localhost|127\.)/.test(location.hostname) && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      let fresh = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (fresh && this.state !== 'play') location.reload(); fresh = true; });
    }
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.baseFov = this.camera.fov = w / h < 0.8 ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  // ================================================================== boot
  async boot() {
    $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    await loadAssets(f => { $('loadFill').style.width = `${Math.round(f * 85)}%`; });
    await sleep(30);
    this.scenery.build();
    $('loadFill').style.width = '95%';
    await sleep(30);
    this.ui.mapImg = this.scenery.mapCanvas(520);
    this.populate();
    this.net = new Net(this);
    $('loadFill').style.width = '100%';
    $('loading').classList.add('done');
    setTimeout(() => $('loading').remove(), 600);
    this.titleScreen();
    const clock = new THREE.Clock();
    this.maxDt = 0.1;
    this.loop = () => this.frame(Math.min(clock.getDelta(), this.maxDt));
    this.renderer.setAnimationLoop(this.loop);
    // for automated tests: hold the picture still while a screenshot is taken
    window.__hold = on => { this.renderer.setAnimationLoop(on ? null : this.loop); if (on) this.renderer.render(this.scene, this.camera); clock.getDelta(); };
  }

  titleScreen() {
    this.state = 'title';
    $('title').hidden = false;
    let save = null;
    try { save = JSON.parse(localStorage.getItem(SAVE)); } catch { /* none */ }
    $('tContinue').hidden = !save;
    if (save) $('tContinue').textContent = `▶ Continue — ${save.hero.name}, level ${save.hero.level} ${CLASSES[save.hero.cls].name}`;
    $('tContinue').onclick = () => { this.sfx.unlock(); $('title').hidden = true; this.loadGame(save); };
    $('tNew').onclick = () => { this.sfx.unlock(); $('title').hidden = true; this.newGame(); };
    $('tHow').onclick = () => this.rules(false);
    this.showcase = 0;
  }
  async rules(first) {
    const pages = [...document.querySelectorAll('#rules section')];
    let i = 0;
    const show = () => {
      pages.forEach((p, k) => { p.hidden = k !== i; });
      $('rBack').style.visibility = i ? '' : 'hidden';
      $('rNext').textContent = i === pages.length - 1 ? (first ? 'Begin the adventure' : 'Got it') : 'Next';
      $('rDots').replaceChildren(...pages.map((_, k) => { const e = document.createElement('i'); if (k === i) e.className = 'on'; return e; }));
      $('rules').scrollTop = 0;
    };
    show();
    $('rules').showModal();
    return new Promise(res => {
      $('rBack').onclick = () => { i = Math.max(0, i - 1); show(); };
      $('rNext').onclick = () => { if (i < pages.length - 1) { i++; show(); } else $('rules').close(); };
      $('rules').onclose = () => { try { localStorage.setItem('realm.rules', '1'); } catch { /* fine */ } res(); };
    });
  }

  newGame(coop) {
    this.state = 'creator';
    this.ui.creator(async st => {
      this.createHero(st);
      let seen = false;
      try { seen = !!localStorage.getItem('realm.rules'); } catch { /* fine */ }
      if (!seen) await this.rules(true);
      this.startPlay(true, coop);
    });
  }
  createHero(st) {
    const C = CLASSES[st.cls];
    const base = { ...C.stats };
    for (const k of Object.keys(st.bonus)) base[k] += Math.max(0, Math.min(2, st.bonus[k] || 0));
    this.hero = {
      v: 1, name: st.name, cls: st.cls, bg: st.bg, tint: st.tint, base, level: 1, xp: 0, hp: 0,
      gold: 30 + (st.bg === 'merchant' ? 60 : 0), potions: 2 + (st.bg === 'herbalist' ? 3 : 0), fate: st.bg === 'scholar' ? 2 : 1,
      items: [], keys: {}, counters: {}, flags: {}, quests: {}, done: {}, tracked: null, shrines: { emberfall: true }, got: {}, bosses: {},
      pos: [...START], zone: 'world', ownsHorse: false, time: 0.3, yaw: Math.PI, found: {},
      weapons: ['fists', START_WEAPON[st.cls]], weapon: START_WEAPON[st.cls], mats: { iron: 0, hide: 0, ember: 0 }, horses: [], horse: null,
    };
    this._kit = null;
    this.hero.hp = this.maxHp();
  }
  loadGame(save) {
    this.hero = save.hero;
    this._kit = null;
    this.time = save.hero.time || 0.3;
    this.startPlay(false);
  }
  // put the hero into the world and start playing
  async startPlay(fresh, coop) {
    const h = this.hero;
    this.clearPreview();
    // remove anything the save says is gone
    for (const e of this.entities) if (e.bossId && h.bosses[e.bossId]) this.removeEntity(e);
    this.pickups.forEach(p => { if (h.got[p.id]) { p.mesh.visible = false; p.taken = true; } });
    this.points.forEach(p => { if (p.chest && h.got[p.id]) p.open(true); });
    if (h.flags.barrowOpen && this.scenery.barrowGate) this.scenery.barrowGate.position.y += 4.2;
    if (h.flags.vargPeace) this.entities.filter(e => e.camp === 'keep').forEach(e => { e.neutral = true; e.talk = null; });

    // saves from before weapons, materials and horse breeds
    if (!h.weapons) { h.weapons = ['fists', START_WEAPON[h.cls]]; h.weapon = START_WEAPON[h.cls]; }
    h.mats = h.mats || { iron: 0, hide: 0, ember: 0 };
    if (!h.horses) { h.horses = h.ownsHorse ? ['bay'] : []; h.horse = h.horses[0] || null; }
    const actor = new Actor(this.scene, { model: h.cls, gear: CLASSES[h.cls].gear, hat: CLASSES[h.cls].hat, tint: TINTS[h.tint] || null });
    this.player = new Player(this, actor);
    this.equip(h.weapon, true);
    this.player.yaw = h.yaw || Math.PI;
    if (h.zone === 'barrow') { this.zone = 'barrow'; this.spawnDungeon(); }
    this.player.pos.set(h.pos[0], 0, h.pos[1]);
    this.player.pos.y = this.phys.ground(h.pos[0], h.pos[1]);
    this.player.camPos.copy(this.player.pos).add(V3(0, 4, 8));
    if (h.ownsHorse && !h.horse) this.claimHorse(h.horsePos);
    this.heroSpawns();
    this.state = 'play';
    $('hud').hidden = false;
    if (!isTouch) this.input.lock();
    if (fresh) await this.intro();
    else this.ui.toast(`Welcome back, ${h.name}.`);
    if (fresh && !coop) this.ui.toast('Elder Maren (!) at the chapel has work for you — or go anywhere you like.', 'good');
    this.save();
  }

  // ================================================================== the population
  populate() {
    // named people
    for (const [id, n] of Object.entries(NPCS)) {
      const pos = n.zone === 'barrow' ? dTile(18, 9) : NPC_POS[id];
      const home = id === 'pell' || id === 'morwen' ? { x: pos[0] - 8, z: pos[1] - 8 } : SETTLEMENTS[0];
      const face = Math.atan2(home.x - pos[0], home.z - pos[1]);
      const e = this.addEntity({ type: 'npc', npcId: id, name: n.name, def: { name: n.name, title: n.title }, model: n.model, gear: n.gear, hat: n.hat, tint: n.tint, ghost: n.ghost, x: pos[0], z: pos[1], rot: face, idle: n.idle, zone: n.zone || 'world' });
      e.face = face;
      e.talk = id;
      e.seated = n.idle === 'Sit_Chair_Idle';
      if (id === 'aldous') { e.pos.x += 1.5; }
      this.phys.circle(e.pos.x, e.pos.z, 0.55);
    }
    // townsfolk, guards and stable horses appear as you come near each town
    this.crowds = SETTLEMENTS.map(st => ({ s: st, plan: PLANS[st.id], ents: [] }));
    const u = this.addEntity({ type: 'unicorn', name: 'Unicorn', def: { name: 'Unicorn' }, model: 'unicorn', x: SITES.glade.x + 2, z: SITES.glade.z, zone: 'world' });
    u.radius = 1;
    // monsters
    for (const [key, n, x, z, spread, extra] of SPAWNS) for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
      const e = this.spawnMob(key, x + Math.cos(a) * r, z + Math.sin(a) * r, { ...(extra || {}) });
      if (Math.hypot(x - SITES.keep.x, z - SITES.keep.z) < 30) e.camp = 'keep';
    }
    // pickups
    SHARDS.forEach(([x, z], i) => this.addPickup('shard' + i, 'shard', x, z));
    GLOWCAPS.forEach(([x, z], i) => this.addPickup('glow' + i, 'glowcap', x, z));
    // chests
    for (const c of CHESTS) this.addChest(c);
    // fixed spots
    for (const st of SETTLEMENTS) PLANS[st.id].stalls.forEach(([x, z], i) => this.points.push({ id: `stall_${st.id}_${i}`, x, z: z + 3, label: 'Steal from the stall', zone: 'world', act: () => this.talkTo({ name: 'Market stall', def: { title: '' } }, 'stall') }));
    this.points.push({ id: 'barrowdoor', get x() { return this.g.scenery.barrowDoor.x; }, get z() { return this.g.scenery.barrowDoor.z; }, g: this, label: 'Examine the Barrow door', zone: 'world', range: 4, act: () => this.talkTo({ name: 'The Barrow Door', def: { title: '' } }, 'barrowdoor') });
    const [ex, ez] = DUNGEON_START;
    this.points.push({ id: 'exit', x: ex, z: ez + 1.5, label: 'Leave the Barrow', zone: 'barrow', range: 3, act: () => this.leaveBarrow() });
    // every house, tavern, smithy, church, castle, barracks and tower can be walked into
    const LORDS = { emberfall: 'Queen Isolde', solmara: 'Sultana Ravi', frosthold: 'Jarl Haldor', tidewatch: 'Lord Admiral Penn' };
    const TINT = { red: '#ff9a8a', blue: '#8fb3ff', green: '#9ae0a0', yellow: '#ffe08a' };
    for (const dr of this.scenery.doors) {
      dr.tint = TINT[dr.color]; dr.lord = LORDS[dr.sid] || 'the Reeve';
      dr.title = dr.sign ? `${dr.town} — ${dr.sign}` : `${dr.town} — ${ROOM_NAME[dr.kind]}`;
      this.points.push({ id: 'door_' + dr.id, door: dr, x: dr.x, z: dr.z, label: dr.sign ? `Go into the ${dr.sign.replace(/^The /, '')}` : `Go into ${ROOM_NAME[dr.kind]}`, zone: 'world', range: 2.6, act: () => this.rooms.enter(dr) });
    }
    this.doorGrid = new Map();
    for (const dr of this.scenery.doors) for (const ox of [-1, 0, 1]) for (const oz of [-1, 0, 1]) { const k = (Math.floor(dr.x / 20) + ox) + ',' + (Math.floor(dr.z / 20) + oz); if (!this.doorGrid.has(k)) this.doorGrid.set(k, []); this.doorGrid.get(k).push(dr); }
    this.missionSpawns();
    for (const s of SHRINES) this.points.push({ id: 'shrine_' + s.id, x: s.x, z: s.z, label: 'Touch the shrine', zone: 'world', range: 3.2, shrine: s, act: () => this.touchShrine(s) });
  }
  addEntity(o) {
    const actor = new Actor(this.scene, { model: o.model, gear: o.gear, hat: o.hat, tint: o.tint, scale: o.scale, ghost: o.ghost, crown: o.crown });
    const e = {
      id: o.id || 'e' + (++this.idSeq), type: o.type, name: o.name, def: o.def, actor, npcId: o.npcId,
      pos: V3(o.x, 0, o.z), home: V3(o.x, 0, o.z), rot: o.rot || 0, zone: o.zone || (o.x > INSIDE_X ? 'barrow' : 'world'),
      hp: 10, max: 10, armor: 10, state: 'idle', timer: 0, cd: 0, spCd: 2, burnT: 0, stunT: 0, frozenT: 0, radius: 0.55 * (o.scale || 1),
      idleAnim: o.idle, scale: o.scale || 1, slot: Math.random() * Math.PI * 2,
    };
    e.pos.y = this.phys.ground(e.pos.x, e.pos.z);
    actor.idle = o.idle;
    actor.play(o.idle || 'Idle', { fade: 0 });
    actor.root.position.copy(e.pos);
    this.entities.push(e);
    return e;
  }
  spawnMob(key, x, z, extra = {}) {
    const def = MONSTERS[key];
    const e = this.addEntity({ type: 'mob', id: extra.id, name: def.name, def, model: def.model, gear: def.gear, hat: false, tint: extra.tint || def.tint, scale: def.scale, crown: def.crown, x, z, zone: extra.zone });
    e.key = key;
    e.hp = e.max = def.hp; e.armor = def.armor; e.team = def.team || 'monster';
    e.talk = extra.talk || null;
    e.neutral = !!extra.neutral;
    e.night = !!extra.night;
    e.patrol = extra.patrol || null;
    e.hidden = !!extra.hidden;
    e.bossId = def.boss ? extra.id || key : null;
    e.radius = def.boss ? 0.9 * (def.scale || 1) : 0.5 * (def.scale || 1) + (def.model === 'wolf' ? 0.3 : 0);
    if (key === 'troll') e.idleAnim = 'Idle';
    if (e.hidden) { e.actor.root.visible = true; e.actor.play('Idle'); }
    if (extra.rise) { e.state = 'rising'; e.riseT = 0; e.actor.root.position.y = e.pos.y - 2.2; e.dormant = true; }
    if (extra.aggro) { e.state = 'chase'; e.provoked = true; e.dormant = false; this.risingNow(e); }
    if (def.model === 'wyvern') e.awake = false;
    return e;
  }
  risingNow(e) { e.state = 'rising'; e.riseT = 0; e.dormant = false; this.sfx.boom(); this.fx.burst(e.pos.clone().add(V3(0, 0.3, 0)), 0x7dffb0, 20, 3, 2); }
  removeEntity(e) { e.actor.dispose(); if (e.plate) e.plate.remove(); this.entities = this.entities.filter(x => x !== e); }
  byId(id) { return this.entities.find(e => e.id === id || e.bossId === id); }

  // ---- crowds: the people of a town exist while you are near it
  updateCrowds(dt) {
    if ((this.crowdT = (this.crowdT || 0) - dt) > 0) return;
    this.crowdT = 1;
    const p = this.player.pos;
    for (const c of this.crowds) {
      const d = Math.hypot(p.x - c.s.x, p.z - c.s.z);
      if (!c.spawned && d < c.s.r + 230 && this.zone === 'world') this.spawnCrowd(c);
      else if (c.spawned && (d > c.s.r + 330 || this.zone !== 'world') && !c.ents.some(e => e.type === 'mob' && (e.state === 'chase' || e.state === 'windup'))) this.despawnCrowd(c);
      // arriving somewhere new
      const h = this.hero;
      if (d < c.s.r * 0.8 && this.zone === 'world' && !(h.found || (h.found = {}))[c.s.id]) {
        h.found[c.s.id] = 1;
        this.ui.banner(c.s.name, c.s.sub, 'zone');
        this.sfx.bell();
        this.gainXP(c.s.kingdom ? 60 : 30);
      }
      if (d < c.s.r * 0.8 && this.here !== c.s.id && this.zone === 'world') { this.here = c.s.id; if (h.found[c.s.id] && this.lastHere !== c.s.id) this.ui.toast(c.s.name); this.lastHere = c.s.id; }
      if (this.here === c.s.id && d > c.s.r + 20) this.here = null;
    }
  }
  spawnCrowd(c) {
    c.spawned = true;
    const { s, plan } = c, R = Math.random;
    const looks = [['rogue', '#d8b8a0'], ['mage', '#b8c8e8'], ['barbarian', '#e8d0a0'], ['warden', '#a8c8a0'], ['rogue', '#e8a8b8'], ['mage', '#e8e0c8'], ['barbarian', '#c8a890'], ['warden', '#d8c8e8'], ['rogue', '#a8b8d0'], ['mage', '#d8a888']];
    const names = ['Agnes', 'Bram', 'Cedric', 'Dalia', 'Edda', 'Finn', 'Greta', 'Hugo', 'Isolde', 'Jasper', 'Kira', 'Lothar', 'Mira', 'Nils', 'Orla', 'Piet', 'Quinn', 'Rosa'];
    const n = s.id === 'emberfall' ? 26 : s.kingdom ? 16 : 6;
    for (let i = 0; i < n; i++) {
      const [m, tint] = looks[Math.floor(R() * looks.length)], sp = plan.spots[i % plan.spots.length], name = names[Math.floor(R() * names.length)];
      const e = this.addEntity({ type: 'villager', name, def: { name }, model: m, gear: R() < 0.2 ? ['Mug'] : [], hat: R() < 0.35, tint, x: sp[0] + (R() - 0.5) * 4, z: sp[1] + (R() - 0.5) * 4, zone: 'world' });
      e.hp = e.max = 12; e.armor = 10; e.spots = plan.spots; e.panic = 0; e.timer = R() * 4;
      c.ents.push(e);
    }
    const tint = { red: '#ff9a8a', blue: '#8fb3ff', green: '#9ae0a0', yellow: '#ffe08a' }[s.color];
    for (const path of plan.patrols) { const e = this.spawnMob('watch', path[0][0], path[0][1], { patrol: path, tint }); c.ents.push(e); }
    for (const [gx, gz] of plan.gates || []) {
      const a = Math.atan2(gz - s.z, gx - s.x);
      for (const side of [-1, 1]) { const b = a + side * 0.03, x = s.x + Math.cos(b) * (s.r - 7), z = s.z + Math.sin(b) * (s.r - 7); const e = this.spawnMob('watch', x, z, { tint }); e.rot = e.postRot = Math.atan2(gx - s.x, gz - s.z); e.post = true; c.ents.push(e); }
    }
    if (plan.stable) for (let i = 0; i < 4; i++) {
      const st = plan.stable, breed = ['pony', 'bay', 'black', 'white'][i];
      const e = this.addEntity({ type: 'horse', name: HORSES[breed].name, def: { name: HORSES[breed].name }, model: 'horse', tint: HORSES[breed].tint, x: st.x - 5 + i * 3.4, z: st.z + (i % 2) * 3, zone: 'world' });
      e.breed = breed;
      e.pen = { x: st.x, z: st.z, w: st.w - 4, d: st.d - 4 }; e.timer = R() * 5; e.radius = 1.0; e.crowd = c;
      c.ents.push(e);
    }
    if (this.bounty > 0) c.ents.forEach(e => { if (e.team === 'town' && e.pos.distanceTo(this.player.pos) < 80) { e.state = 'chase'; } });
  }
  despawnCrowd(c) {
    c.spawned = false;
    for (const e of c.ents) if (!(e.type === 'horse' && e.owned)) this.removeEntity(e);
    c.ents = c.ents.filter(e => e.type === 'horse' && e.owned);
  }

  addPickup(id, kind, x, z) {
    const y = this.phys.ground(x, z);
    let mesh;
    if (kind === 'shard') {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: 0xff8a30, emissive: 0xff6a10, emissiveIntensity: 1.6 }));
      mesh.scale.y = 1.6;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.22, depthWrite: false })); mesh.add(halo);
    } else {
      mesh = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0xd8e8f0, emissive: 0x4fb8ff, emissiveIntensity: 0.4 }));
      stalk.position.y = 0.22;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6fd8ff, emissive: 0x2fa8ff, emissiveIntensity: 1.2 }));
      cap.position.y = 0.42;
      mesh.add(stalk, cap);
      mesh.userData.cap = cap;
    }
    mesh.position.set(x, y + (kind === 'shard' ? 1.1 : 0), z);
    this.scene.add(mesh);
    const p = { id, kind, x, z, y, mesh, zone: 'world' };
    this.pickups.push(p);
    return p;
  }
  addChest(c) {
    const y = this.phys.ground(c.x, c.z);
    const mesh = part('dungeon', 'chest', 0.75);
    mesh.position.set(c.x, y, c.z);
    mesh.rotation.y = Math.atan2(-c.x, -c.z);
    this.scene.add(mesh);
    this.phys.circle(c.x, c.z, 0.7);
    const p = { id: 'chest_' + c.id, chest: c, x: c.x, z: c.z, zone: c.x > INSIDE_X ? 'barrow' : 'world', range: 2.6, mesh,
      label: c.owned ? 'Open someone else\'s chest' : 'Open the chest', act: () => this.openChest(p),
      open: quiet => { p.opened = true; mesh.rotation.x = -0.12; if (!quiet) this.fx.burst(mesh.position.clone().add(V3(0, 1, 0)), 0xffd34d, 30, 3, 3); } };
    this.points.push(p);
  }

  // ================================================================== the frame
  frame(rdt) {
    this.slowT = Math.max(0, this.slowT - rdt);
    this.shakeT = Math.max(0, this.shakeT - rdt);
    if (this.hitstop > 0) { this.hitstop -= rdt; rdt *= 0.08; }
    const dt = rdt * (this.slowT > 0 ? 0.3 : 1) * (this.wheel ? 0.12 : 1);
    this.adapt(rdt);
    if (this.state !== 'play') this.cull(this.state === 'creator' && this.preview ? this.preview.root.position : this.plaza());
    this.input.poll(Math.min(rdt, 0.1), this.ui.nav);
    if (this.state === 'play' && !this.paused) { for (let i = 0; i < (this.speedup || 1); i++) if (this.state === 'play' && !this.paused) this.tick(dt); }
    else if (this.state === 'title' || this.state === 'creator' || this.state === 'loading') this.idleCamera(rdt);
    const focus = this.player ? this.player.pos : this.state === 'creator' && this.preview ? this.preview.root.position : this.plaza();
    this.scenery.update(rdt, focus);
    this.scenery.setTime(this.time, focus, this.zone);
    this.fx.update(dt, (pos, p) => this.projectileHit(pos, p));
    if (this.state === 'play' || this.state === 'creator') this.entities.forEach(e => { if (e.preview || (this.state === 'creator' && e.near)) e.actor.update(dt); });
    if (this.state === 'play') this.ui.hud();
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
  plaza() { const k = SETTLEMENTS[0]; return this._plaza || (this._plaza = V3(k.x, this.phys.ground(k.x, k.z + 30), k.z + 30)); }
  // outside of play, only draw the people near what the camera looks at
  cull(focus) {
    for (const e of this.entities) e.actor.root.visible = e.zone === 'world' && e.pos.distanceTo(focus) < 75 && !(e.night && e.state === 'idle');
  }
  idleCamera(dt) {
    this.showcase += dt * 0.05;
    const a = this.showcase;
    if (this.state === 'creator' && this.preview) {
      // a turntable: the hero slowly turns, the camera stays put
      const p = this.preview.root.position;
      this.preview.root.rotation.y += dt * 0.45;
      const d = this.previewDist || 5.2;
      this.camera.position.set(p.x, p.y + 1.55, p.z + d);
      this.camera.lookAt(p.x, p.y + 1.15, p.z);
      this.framePreview();
      this.preview.update(dt);
      return;
    }
    const c = this.plaza();
    if (!this.titleCrowd) { this.titleCrowd = true; this.spawnCrowd(this.crowds[0]); }
    this.camera.position.set(c.x + Math.sin(a) * 110, c.y + 48, c.z + Math.cos(a) * 110);
    this.camera.lookAt(c.x, c.y + 8, c.z - 20);
    this.time = 0.72;
    this.entities.forEach(e => { if (e.zone === 'world' && e.pos.distanceTo(c) < 70) { if (e.type === 'villager') updateVillager(this, e, dt); e.actor.root.position.copy(e.pos); e.actor.root.rotation.y = e.rot; e.actor.update(dt); } });
  }
  // the hero in the character creator
  previewHero(st) {
    this.clearPreview();
    const C = CLASSES[st.cls];
    this.preview = new Actor(this.scene, { model: st.cls, gear: C.gear, hat: C.hat, tint: TINTS[st.tint] || null });
    const pz = this.plaza();
    this.preview.root.position.set(pz.x + 3, this.phys.ground(pz.x + 3, pz.z + 8), pz.z + 8);
    this.preview.root.rotation.y = 0.25;
    this.preview.play(C.style === 'melee' ? (st.cls === 'barbarian' ? '2H_Melee_Idle' : 'Idle') : 'Idle');
    setTimeout(() => this.preview && this.preview.once(C.attacks[0], 1), 250);
  }
  // shift the picture so the hero stands in the part of the screen the creator panel leaves free
  framePreview() {
    const W = innerWidth, H = innerHeight, r = $('creator').getBoundingClientRect();
    if (!r.width) return;
    const side = r.left > W * 0.3; // panel on the right; otherwise it sits along the bottom
    const cx = side ? r.left / 2 : W / 2, cy = side ? H / 2 : Math.max(60, r.top / 2);
    const frac = side ? r.left / W : r.top / H;
    this.previewDist = 2.6 + 3.2 * Math.min(1, frac / 0.5) * (side ? 1 : 0.8);
    const key = `${W}x${H}:${cx | 0}:${cy | 0}`;
    if (this.viewKey === key) return;
    this.viewKey = key;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  }
  clearPreview() { if (this.preview) { this.preview.dispose(); this.preview = null; } this.camera.clearViewOffset(); this.viewKey = null; }

  tick(dt) {
    const p = this.player, h = this.hero;
    const t0 = this.time;
    this.time = (this.time + (dt / DAY_SECS) * (this.scenery.dayK < 0.3 ? 3 : 1)) % 1; // nights pass three times faster
    if (this.time < t0) h.dayCount = (h.dayCount || 0) + 1;
    h.time = this.time;
    const frozen = this.cineActive || this.talking || this.state !== 'play' || !!this.wheel;
    if (!frozen && this.input.hit('Escape', 'KeyP')) return this.togglePause();
    if (!frozen && this.input.hit('KeyM')) { this.togglePause('map'); return; }
    if (!frozen && this.input.hit('KeyG')) this.toggleTorch();
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.breakCombo();
    if (this.finalT > 0) this.finalT -= dt;
    if (this.camPunch > 0) this.camPunch -= dt;
    if (!frozen && this.input.hit('KeyJ')) { this.togglePause('quests'); return; }
    if (!frozen && this.input.hit('KeyC', 'KeyI')) { this.togglePause('hero'); return; }
    if (this.cineActive && this.input.hit('Escape', 'Space', 'Enter')) this.skipCine = true;
    this.aiming = this.kit().style !== 'melee';
    { const E = SETTLEMENTS[0]; this.inTown = this.zone === 'world' && Math.hypot(p.pos.x - E.x, p.pos.z - E.z) < E.r; }
    p.update(dt, this.input, frozen);
    // the world around you
    const night = this.scenery.dayK < 0.35;
    let combat = false;
    this.bossActive = null;
    for (const e of this.entities) {
      const near = e.zone === this.zone && (e.pos.distanceTo(p.pos) < 115 || e.called);
      e.near = near;
      const show = near && !(e.night && !night && e.state === 'idle') && !(e.dead && e.deadT > 8);
      e.actor.root.visible = show;
      if (!near) continue;
      if (e.night && !night && e.state === 'idle') continue;
      if (e.state === 'rising') this.rise(e, dt);
      else if (e.type === 'mob') updateMob(this, e, dt);
      else if (e.type === 'villager') updateVillager(this, e, dt);
      else if (e.type === 'npc') updateNpc(this, e, dt);
      else if (e.type === 'horse') updateHorse(this, e, dt);
      else if (e.type === 'ally') updateAlly(this, e, dt);
      else if (e.type === 'unicorn') { e.actor.root.visible = show && !(h.flags.unicornDay === Math.floor(this.day())); }
      if (!e.ridden) { e.actor.root.position.copy(e.pos); e.actor.root.rotation.y = e.rot; }
      if (e.actor.extra && !e.actor.extra.parent) e.actor.root.add(e.actor.extra);
      e.actor.update(dt);
      if (e.type === 'mob' && !e.dead && e.state === 'chase' && this.isHostile(e)) {
        combat = true;
        if (e.def.boss && e.pos.distanceTo(p.pos) < 40 && (!this.bossActive || e.pos.distanceTo(p.pos) < this.bossActive.pos.distanceTo(p.pos))) this.bossActive = e;
      }
      if (e.def.boss && e.def.special === 'flyer' && e.awake && !e.dead && e.pos.distanceTo(p.pos) < 50) this.bossActive = e;
    }
    this.inCombat = combat;
    this.updateCrowds(dt);
    // once you have paid (or out-riddled) Gorm, he steps off the bridge
    if (this.hero.flags.trollpass && !this.trollMoved) { const t = this.byId('troll'); if (t && !t.dead && t.neutral) { this.trollMoved = true; t.pos.set(12, 0, -96); t.pos.y = this.phys.ground(12, -96); t.home.copy(t.pos); } }
    this.separate();
    this.updateBounty(dt);
    this.updateTraps(dt);
    this.updatePickups(dt);
    this.autoTalk();
    this.updatePrompt();
    this.walkIn();
    this.rooms.update(dt);
    this.updateTorch(dt);
    this.sfx.music(dt, this.inCombat || !!this.arenaRun);
    this.ui.wheelTick && this.ui.wheelTick(dt);
    if (this.net) this.net.tick(dt);
    if ((this.saveT = (this.saveT || 0) + dt) > 20) { this.saveT = 0; this.save(); }
    if (this.input.hit('KeyV')) this.sfx.setMuted(!this.sfx.muted);
  }
  day() { return this.time + (this.hero.dayCount || 0); }
  // a night's sleep at the inn: wake at dawn, fully rested
  restNight() { return this.sleepUntil(0.27); }
  async sleepUntil(t) {
    const h = this.hero;
    this.ui.fade(true);
    await sleep(700);
    if (this.time > t) h.dayCount = (h.dayCount || 0) + 1;
    this.time = t; h.time = this.time;
    this.healPlayer(999, true);
    this.player.stamina = 100;
    this.save();
    await sleep(500);
    this.ui.fade(false);
    this.ui.toast(t < 0.5 ? 'You sleep soundly and wake at dawn, fully rested.' : 'You doze until the sun goes down.', 'good');
  }
  // the drill sergeant teaches swordplay: a practice bout with a blunted blade
  spar() {
    const p = this.player, R = this.rooms;
    const e = this.spawnMob('sparring', p.pos.x - 3, p.pos.z - 3, { zone: this.zone });
    e.state = 'chase'; e.alerted = true; e.spar = true;
    if (R && R.ents) R.ents.push(e);
    this.ui.toast('Block (right mouse) just as the blow lands to PARRY, then strike back for a counter!', 'good');
  }
  // walking into a front door takes you inside
  walkIn() {
    const p = this.player;
    if (this.zone !== 'world' || p.mount || p.state !== 'move' || this.rooms.busy || this.talking || this.cineActive) return;
    const list = this.doorGrid.get(Math.floor(p.pos.x / 20) + ',' + Math.floor(p.pos.z / 20));
    if (!list) return;
    for (const dr of list) {
      if (Math.hypot(p.pos.x - dr.x, p.pos.z - dr.z) > 1.9) continue;
      const into = -(p.vel.x * Math.sin(dr.rot) + p.vel.z * Math.cos(dr.rot));
      if (into > 1.5) { this.rooms.enter(dr); return; }
    }
  }
  rise(e, dt) {
    if (e.dormant) {
      // skeletons sleep under the floor until you come close
      if (this.zone === e.zone && e.pos.distanceTo(this.player.pos) < 11) { this.risingNow(e); }
      return;
    }
    e.riseT += dt;
    e.actor.root.position.y = e.pos.y - 2.2 * Math.max(0, 1 - e.riseT / 1.1);
    e.actor.root.position.x = e.pos.x; e.actor.root.position.z = e.pos.z;
    if (e.actor.currentName !== 'Skeletons_Awaken_Standing') e.actor.play('Skeletons_Awaken_Standing', { once: true, then: () => {} });
    e.actor.update(dt);
    if (e.riseT > 1.4) { e.state = 'chase'; e.provoked = true; }
  }
  separate() {
    const list = this.entities.filter(e => e.near && !e.dead && (e.type === 'mob' || e.type === 'villager') && !e.flying);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dd = Math.hypot(dx, dz), m = a.radius + b.radius;
      if (dd < m && dd > 1e-3) { const k = (m - dd) / 2 / dd; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
    }
    // and nobody walks through you
    const p = this.player;
    for (const e of list) { const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dd = Math.hypot(dx, dz), m = e.radius + p.radius; if (dd < m && dd > 1e-3) { const k = (m - dd) / dd; e.pos.x += dx * k * 0.6; e.pos.z += dz * k * 0.6; p.pos.x -= dx * k * 0.4; p.pos.z -= dz * k * 0.4; } }
    for (const e of this.entities) if (e.near && e.type === 'mob' && e.neutral && !e.dead) { const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, dd = Math.hypot(dx, dz), m = e.radius + p.radius + 0.4; if (dd < m && dd > 1e-3) { p.pos.x = e.pos.x + (dx / dd) * m; p.pos.z = e.pos.z + (dz / dd) * m; } }
  }

  // ================================================================== stats
  stat(k) { let v = this.hero.base[k]; for (const it of this.hero.items) v += (ITEMS[it].mods[k] || 0); return v; }
  prof() { return 2 + Math.floor((this.hero.level - 1) / 2); }
  maxHp() { const h = this.hero, C = CLASSES[h.cls]; let v = C.hp + (h.level - 1) * C.hpLv + (h.bg === 'soldier' ? 6 : 0); for (const it of h.items) v += ITEMS[it].mods.hp || 0; return v; }
  armor() { let v = CLASSES[this.hero.cls].armor; for (const it of this.hero.items) v += ITEMS[it].mods.armor || 0; return v; }
  attackBonus() { let v = this.stat(this.kit().atk) + this.prof(); for (const it of this.hero.items) v += ITEMS[it].mods.hit || 0; return v; }
  dmgBonus() { let v = (this.hero.flags.smith || 0) + Math.floor(this.hero.level / 2); for (const it of this.hero.items) v += ITEMS[it].mods.dmg || 0; return v; }
  // the class, with the weapon in hand laid over it
  kit() { if (this._kit && this._kitFor === this.hero.weapon) return this._kit; const h = this.hero, w = WEAPONS[h.weapon] || WEAPONS[START_WEAPON[h.cls]]; this._kitFor = h.weapon; return (this._kit = { ...CLASSES[h.cls], ...w }); }
  hasFire() { return this.hero.items.some(it => ITEMS[it].mods.fire); }

  // ================================================================== who fights whom
  isHostile(e) {
    if (e.type !== 'mob' || e.dead || e.neutral || e.hidden) return false;
    if (e.team === 'town') return this.bounty > 0 || e.angry;
    return true;
  }
  // Attack tokens: at most two melee and two ranged enemies attack at the same moment.
  mayAttack(e) {
    const ranged = e.def.kind !== 'melee';
    let n = 0;
    for (const o of this.entities) {
      if (o === e || o.dead || o.type !== 'mob' || !o.near || (o.def.kind !== 'melee') !== ranged) continue;
      if (o.state === 'windup' || (o.state === 'recover' && o.timer > 0.2)) n++;
    }
    if (e.holdTok > performance.now()) return true;
    if (n < 2) { e.holdTok = performance.now() + 2500; return true; }
    return false;
  }
  targetsForPlayer() { return this.entities.filter(e => e.zone === this.zone && e.near && this.isHostile(e) && e.state !== 'rising'); }
  peopleNear(pos, r) { return this.entities.filter(e => e.zone === this.zone && !e.dead && e.pos.distanceTo(pos) < r + e.radius && (e.type === 'villager' || e.type === 'npc' || (e.type === 'mob' && e.team === 'town' && !this.isHostile(e)))); }
  targetFor(e) {
    const p = this.player;
    if (!p || p.state === 'dead' || this.talking || this.cineActive || this.zone !== e.zone) return null;
    if (e.team === 'town' && !(this.bounty > 0 || e.angry)) return null;
    if (p.invisT > 0) return null;
    // the freed ghost knight draws some attention
    const ally = this.entities.find(a => a.type === 'ally' && !a.dead && a.zone === e.zone);
    if (ally && ally.pos.distanceTo(e.pos) < p.pos.distanceTo(e.pos) * 0.6) return { pos: ally.pos, radius: 0.6, ally };
    return { pos: p.pos, vel: p.vel, radius: p.radius, player: true };
  }
  alert(e) {
    if (e.alerted) return;
    e.alerted = true;
    this.fx.text(e.pos.clone().add(V3(0, (e.actor.height || 2.4) * (e.def.scale || 1) + 0.6, 0)), '!', 'alert');
    if (e.def.boss && !e.introDone) this.bossIntro(e);
  }

  // ================================================================== attacks
  // You hit something. o: { kind, dmg, name, sure, crit, fire }
  playerHits(e, o = {}) {
    if (e.dead) return;
    const h = this.hero, C = this.kit(), p = this.player;
    // hitting the wrong people
    if (e.type === 'npc') { e.actor.once('Hit_A'); this.fx.text(e.pos.clone().add(V3(0, 2.8, 0)), 'Hey!', 'say'); this.crime(1, 'assault', e.pos); return; }
    if (e.type === 'horse' || e.type === 'unicorn') return;
    if (e.type === 'villager' && !e.hurtCrime) { e.hurtCrime = true; setTimeout(() => { e.hurtCrime = false; }, 4000); this.crime(1, 'assault', e.pos); }
    if (e.type === 'mob' && e.team === 'town' && !this.isHostile(e)) { e.angry = true; this.crime(2, 'attacking the watch', e.pos); }
    if (e.neutral) return;
    // ---- swordplay: counters, guards, guard breaks
    const melee = o.kind === 'weapon' && (C.style === 'melee' || p.mount);
    const open = e.type === 'mob' && (e.stunT > 0 || e.frozenT > 0 || e.downT > 0);
    const grounded = e.type === 'mob' && e.downT > 0;
    const now = p.clock;
    const takedown = melee && o.heavy && (this.combo || 0) >= 8 && e.type === 'mob' && !e.def.boss;
    if (takedown) { o.crit = true; o.sure = true; o.name = 'TAKEDOWN'; o.dmg = e.hp + 50; this.combo -= 5; this.slowT = 0.8; this.finalT = 1.1; this.ui.flash('rgba(255,220,150,.4)', 300); }
    else if (melee && e.type === 'mob' && (open || p.counterT > 0)) { o.crit = true; o.sure = true; if (!o.name) o.name = grounded ? 'GROUND TAKEDOWN' : 'COUNTER'; p.counterT = 0; }
    else if (melee && e.type === 'mob' && e.def.guard && e.state !== 'windup' && e.state !== 'rising') {
      e.streak = now - (e.streakAt || -9) < 1.4 ? (e.streak || 0) + 1 : 0;
      e.streakAt = now;
      const toP = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z), facing = Math.abs(Math.atan2(Math.sin(e.rot - toP), Math.cos(e.rot - toP))) < 1.25;
      const chance = Math.min(0.85, e.def.guard + e.streak * 0.2); // hammering away just makes them turtle up
      if (facing && Math.random() < chance) {
        const at = e.pos.clone().add(V3(0, 1.4 * (e.def.scale || 1), 0)).lerp(p.pos.clone().add(V3(0, 1.4, 0)), 0.35);
        if (o.heavy) {
          this.fx.text(at.clone().add(V3(0, 1.4, 0)), 'GUARD BREAK!', 'crit big');
          this.sfx.clang(); this.sfx.boom && this.sfx.boom(); this.shake(0.3);
          this.fx.burst(at, 0xffd070, 26, 6, 1.2);
          this.stun(e, e.def.boss ? 1.2 : 1.6, true);
          o.sure = true;
        } else {
          this.fx.text(at.clone().add(V3(0, 1.2, 0)), 'blocked', 'miss');
          this.sfx.clang();
          this.fx.burst(at, 0xffe0a0, 12, 4, 0.6);
          if (!e.actor.procedural) e.actor.once('Block_Hit', 1.4);
          this.hitstop = 0.06;
          p.vel.addScaledVector(p.pos.clone().sub(e.pos).setY(0).normalize(), 4);
          p.stamina = Math.max(0, p.stamina - 6);
          e.cd = Math.min(e.cd, 0.25); // and they answer straight back
          if (e.state === 'idle' || e.state === 'wander') { e.state = 'chase'; this.alert(e); }
          return;
        }
      }
    }
    const dd = d(20), bonus = this.attackBonus();
    let armor = e.armor - (e.bossId === 'boneking' && h.flags.aldous === 'crack' ? 3 : 0);
    const crit = o.crit || dd === 20;
    const hit = o.sure || crit || (dd !== 1 && dd + bonus >= armor);
    const head = e.pos.clone().add(V3(0, (e.actor.height || 2.2) * (e.def.scale || 1) * 0.85 + (e.flying ? 0 : 0), 0));
    if (!hit) {
      this.fx.text(head, dd === 1 ? `🎲1 FUMBLE` : `🎲${dd}+${bonus} MISS`, 'miss');
      this.sfx.clang();
      if (e.type === 'mob' && e.state === 'idle') { e.state = 'chase'; this.alert(e); }
      return;
    }
    let dmg = o.dmg ?? roll(C.dmg[0], C.dmg[1], this.stat(C.atk) + this.dmgBonus());
    if (crit) dmg += o.dmg ? o.dmg : roll(C.dmg[0], C.dmg[1]);
    // rogues: sneak attack anyone not watching them
    const unaware = e.type === 'mob' && (e.state === 'idle' || e.state === 'wander' || Math.abs(Math.atan2(Math.sin(e.rot - Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z)), Math.cos(e.rot - Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z)))) > 1.9);
    let sneak = 0;
    if ((h.cls === 'rogue' || C.sneak) && (unaware || o.name === 'Backstab')) { sneak = roll(2, 6); dmg += sneak; }
    if (p.rageT > 0) dmg = Math.round(dmg * 1.5);
    if (o.heavy) dmg *= 1.7; else if (o.finisher) dmg *= 1.3;
    if (grounded && !o.counter) dmg *= 1.5;
    if ((this.combo || 0) >= 10) dmg *= 1.3; else if ((this.combo || 0) >= 5) dmg *= 1.15;
    if (e.type === 'mob' && (melee || o.kind === 'weapon')) this.addCombo();
    // big blows knock ordinary foes off balance
    if (e.type === 'mob' && !e.def.boss && !e.dead && e.hp > dmg && (o.heavy || o.finisher) && e.stunT <= 0 && !e.downT && o.name !== 'COUNTER') { if (o.heavy) setTimeout(() => this.knockDown(e, 1.5), 0); else this.stun(e, 0.5, true); }
    if (o.fire || this.hasFire() || C.style === 'magic' && o.kind === 'weapon' && false) e.burnT = 5;
    if (o.fire) e.burnT = 5;
    if (p.rageT > 0) this.healPlayer(Math.ceil(dmg * 0.25), true);
    dmg = Math.max(1, Math.round(dmg));
    const label = (o.sure ? '' : `🎲${dd}${crit ? '' : '+' + bonus} `) + (crit ? `CRITICAL! −${dmg}` : `−${dmg}`) + (sneak ? ' sneak!' : '');
    this.fx.text(head, (o.name ? o.name + ' ' : '') + label, crit ? 'crit big' : 'dmg');
    if (crit) { this.slowT = 0.35; this.shake(0.4); this.ui.flash('#fff3c0', 220); this.sfx.crit(); } else this.hitstop = o.heavy ? 0.11 : 0.05;
    if (e.spar && e.hp - dmg <= 0) { dmg = Math.max(0, e.hp - 1); this.endSpar(e, true); }
    this.sfx.hit();
    this.ui.hitMarker(crit);
    this.fx.burst(head.clone().add(V3(0, -0.5, 0)), o.fire || e.burnT > 4.9 ? 0xff7a20 : e.def.undead ? 0xd8d8c8 : 0xff3030, crit ? 22 : 10, 4, 2);
    this.damage(e, dmg, 'player', o);
  }
  allyHits(a, e) {
    const dd = d(20), hit = dd + 6 >= e.armor;
    const head = e.pos.clone().add(V3(0, 2.6 * (e.def.scale || 1), 0));
    if (!hit) { this.fx.text(head, 'MISS', 'miss small'); return; }
    const dmg = roll(1, 10, 4);
    this.fx.text(head, `Ser Aldous −${dmg}`, 'dmg ally');
    this.sfx.hit();
    this.damage(e, dmg, 'ally');
  }
  damage(e, dmg, by, o = {}) {
    if (this.net && this.net.guest && e.type === 'mob') return this.net.sendHit(e, dmg, o);
    e.hp -= dmg;
    e.actor.flash(0xffffff, 90);
    if (e.type === 'villager') { e.panic = 10; e.threat = this.player.pos.clone(); }
    if (e.type === 'mob') {
      if (e.state === 'idle' || e.state === 'wander' || e.state === 'return') { e.state = 'chase'; this.alert(e); }
      if (!e.def.boss && e.state !== 'windup' && Math.random() < 0.7) e.actor.once('Hit_A', 1.4);
      if (e.def.boss && e.def.special === 'king' && e.hp / e.max < 0.5 && !e.enraged) { e.enraged = true; e.rageK = 1.3; this.ui.caption('The green fire roars higher!', 'bad'); setTimeout(() => this.ui.caption(''), 2000); this.flash('#40ff90', 300); }
      // the troll learns to fear fire
      if (e.def.regen && e.burnT > 4.9) this.fx.text(e.pos.clone().add(V3(0, 4.6, 0)), 'burning — no regeneration!', 'heal small');
    }
    if (e.hp <= 0) this.kill(e, by);
  }
  kill(e, by) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    e.hp = 0;
    e.actor.play('Death_A', { once: true, fade: 0.1, then: () => {} });
    if (e.plate) e.plate.hidden = true;
    const h = this.hero;
    if (e.type === 'villager') { this.crime(2, 'murder', e.pos); this.respawnLater(e, 180); return; }
    if (e.type !== 'mob') return;
    const def = e.def;
    if (e.arena) { this.arenaKill(e); return; }
    if (e.team === 'town') { this.crime(2, 'killing a guard', e.pos); this.respawnLater(e, 240); return; }
    if (def.xp) this.gainXP(def.xp, e.pos);
    if (def.drop && Math.random() < (def.drop === 'hide' ? 0.7 : 0.5)) this.addMat(def.drop, 1, e.pos);
    this.onKill(e, by);
    const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1));
    if (gold) { h.gold += gold; this.fx.text(e.pos.clone().add(V3(0, 1.5, 0)), `+${gold} gold`, 'gold'); this.sfx.coin(); }
    if (Math.random() < (def.boss ? 1 : 0.12)) { h.potions += def.boss ? 2 : 1; this.ui.toast(`Found ${def.boss ? 2 : 1} potion${def.boss ? 's' : ''}`); }
    if (def.boss) {
      h.bosses[e.bossId] = true;
      this.slowT = 1.2;
      this.ui.flash('#fff6d0', 700);
      this.sfx.sting('good');
      this.ui.banner(`${def.name} defeated`, def.title || '', 'boss');
      for (const k of def.loot || []) { if (ITEMS[k]) this.giveItem(k); else if (KEY_ITEMS[k]) this.giveKey(k); }
      this.bossDown(e);
      this.save();
    } else this.respawnLater(e, 210);
    if (this.net && this.net.host) this.net.sendDead(e, by);
  }
  respawnLater(e, secs) {
    setTimeout(() => {
      if (this.player && e.pos.distanceTo(this.player.pos) < 70 && e.zone === this.zone) return this.respawnLater(e, 30);
      e.dead = false; e.hp = e.max; e.state = 'idle'; e.alerted = false; e.angry = false;
      e.pos.copy(e.home); e.pos.y = this.phys.ground(e.pos.x, e.pos.z);
      e.actor.root.visible = true; e.actor.play('Idle', { force: true });
    }, secs * 1000);
  }
  // Something hits you (or the ghost knight).
  mobHits(e, tgt, o = {}) {
    if (tgt.ally) { const a = tgt.ally; a.actor.flash(0xff4040, 100); return; }
    const p = this.player, def = e.def, h = this.hero, C = this.kit();
    if (this.net && this.net.host && tgt.peer) return this.net.hurtGuest(tgt.peer, e);
    const head = p.pos.clone().add(V3(0, 2.6, 0));
    const toE = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    const facing = Math.abs(Math.atan2(Math.sin(p.rot - toE), Math.cos(p.rot - toE))) < 1.4;
    // rolled out of the way — right at the last instant, and time slows for your answer
    if (p.iframes > 0) {
      if (p.dodgeAge < 0.24 && !o.ranged) {
        this.fx.text(head, 'PERFECT DODGE', 'parry');
        this.slowT = 0.5; p.counterT = 1.4; p.stamina = Math.min(100, p.stamina + 15);
        this.sfx.chime && this.sfx.chime(); this.ui.flash('rgba(140,220,255,.35)', 220);
      } else this.fx.text(head, 'Dodged!', 'miss');
      return;
    }
    // a guard raised just as the blow lands is a parry: no damage, and they are wide open
    if (p.blocking && facing && !o.unblockable) {
      if (p.blockT < 0.24) {
        const at = p.pos.clone().add(V3(0, 1.5, 0)).lerp(e.pos.clone().add(V3(0, 1.5, 0)), 0.4);
        this.fx.text(head, 'PARRY!', 'parry');
        this.fx.burst(at, 0xfff0a0, 30, 7, 1.2);
        this.sfx.clang(); this.sfx.crit();
        this.hitstop = 0.12; this.slowT = Math.max(this.slowT, 0.3); this.shake(0.2);
        p.stamina = Math.min(100, p.stamina + 12);
        p.actor.once('Block_Hit', 1.6, 'Blocking');
        if (!o.ranged) this.stun(e, def.boss ? 0.9 : 1.7, true);
        p.counterT = Math.max(p.counterT, 1.2);
        return;
      }
      const raw = roll(def.dmg[0], def.dmg[1], def.dmg[2]);
      let dmg = Math.ceil(raw * C.block);
      p.stamina -= 8 + raw * 1.4; p.staminaWait = 0.8;
      this.sfx.clang();
      if (p.stamina <= 0) {
        p.stamina = 0; dmg = Math.ceil(raw * 0.7);
        this.fx.text(head, `GUARD BROKEN −${dmg}`, 'hurt');
        p.stagger(0.9, e.pos);
      } else { p.actor.once('Block_Hit', 1.4, 'Blocking'); this.fx.text(head, `blocked −${dmg}`, 'hurt small'); p.vel.addScaledVector(p.pos.clone().sub(e.pos).setY(0).normalize(), 3); }
      this.hurtPlayer(dmg, e);
      return;
    }
    const dd = d(20), armor = this.armor();
    const crit = dd === 20, hit = crit || (dd !== 1 && dd + def.hit >= armor);
    if (!hit) { this.fx.text(head, `🎲${dd} glances off your armor`, 'miss small'); this.sfx.clang(); return; }
    let dmg = roll(def.dmg[0], def.dmg[1], def.dmg[2]) * (crit ? 2 : 1);
    if (dmg > this.maxHp() * 0.14 || crit || p.state === 'attack' && p.heavy) p.stagger(0.32, e.pos);
    this.fx.text(head, (crit ? 'CRIT! ' : '') + `−${dmg}`, 'hurt');
    this.hurtPlayer(dmg, e);
  }
  // the end of a practice bout
  endSpar(e, won) {
    if (e.sparDone) return;
    e.sparDone = true;
    const h = this.hero;
    e.neutral = true; e.state = 'idle';
    this.fx.text(e.pos.clone().add(V3(0, 2.8, 0)), won ? '"Enough! Well fought."' : '"Yield! Back on your feet."', 'say');
    if (won) {
      const today = Math.floor(this.day());
      if (h.flags.sparDay !== today) { h.flags.sparDay = today; this.gainXP(30, e.pos); }
      this.ui.toast('You won the bout!', 'good');
    } else { h.hp = Math.max(h.hp, Math.ceil(this.maxHp() * 0.3)); this.ui.toast('You lost the bout. Watch for the wind-up, then parry.', 'bad'); }
    setTimeout(() => { if (this.entities.includes(e)) this.removeEntity(e); }, 2500);
  }
  // A big attack on an area. Inside it? Make a saving throw for half.
  areaHit(e, at, r, dmg, name, o = {}) {
    const p = this.player;
    for (const a of this.entities) if (a.type === 'ally' && a.pos.distanceTo(at) < r) a.actor.flash(0xff4040, 100);
    if (this.net && this.net.host) this.net.areaGuests(e, at, r, dmg, name, o);
    if (this.zone !== e.zone || Math.hypot(p.pos.x - at.x, p.pos.z - at.z) > r + p.radius) return;
    if (p.iframes > 0) { this.fx.text(p.pos.clone().add(V3(0, 2.6, 0)), 'Dodged!', 'miss'); return; }
    const stat = o.save || 'agility', sv = d(20) + this.stat(stat);
    const saved = sv >= 13;
    if (saved) dmg = Math.ceil(dmg / 2);
    this.fx.text(p.pos.clone().add(V3(0, 2.6, 0)), `${name}! −${dmg}${saved ? ` (saved: 🎲${sv})` : ''}`, 'hurt');
    if (o.poison) { this.slowT = 0; this.poisonT = 5; this.ui.toast('Poisoned!', 'bad'); }
    p.stagger(0.45, at);
    this.hurtPlayer(dmg, e);
  }
  hurtPlayer(dmg, src) {
    const h = this.hero, p = this.player;
    if (p.state === 'dead') return;
    if (p.rageT > 0) dmg = Math.ceil(dmg * 0.75);
    if (src && src.spar) { if (h.hp - dmg < this.maxHp() * 0.2) { this.endSpar(src, false); return; } }
    if (dmg > 0) this.breakCombo();
    h.hp -= dmg;
    p.hurtT = 0.3;
    this.ui.flash('rgba(200,0,0,.55)', 380);
    this.sfx.hurt();
    this.shake(0.18);
    if (h.hp <= 0 && this.arenaRun) { this.arenaLose(); return; }
    if (h.hp <= 0) { h.hp = 0; if (src && src.team === 'town') this.busted(); else this.fallen(); }
  }
  healPlayer(n, quiet) {
    const h = this.hero;
    const before = h.hp;
    h.hp = Math.min(this.maxHp(), h.hp + n);
    if (!quiet && h.hp > before) this.fx.text(this.player.pos.clone().add(V3(0, 2.6, 0)), `+${Math.round(h.hp - before)}`, 'heal');
  }
  drinkPotion() {
    const h = this.hero, p = this.player;
    if (p.potionT > 0) return;
    if (h.potions < 1) { this.ui.toast('No potions left. Traders sell them.'); return; }
    if (h.hp >= this.maxHp()) { this.ui.toast('You are already at full health.'); return; }
    h.potions--;
    p.potionT = 1.2;
    this.healPlayer(roll(2, 4, 8 + h.level * 3));
    this.fx.burst(p.pos.clone().add(V3(0, 1.4, 0)), 0x7dff9a, 20, 2, 2);
    if (!p.mount) p.actor.once('Use_Item', 1.6);
    this.sfx.chime();
  }
  stun(e, s, offBalance) {
    if (e.def.boss) s *= 0.5;
    e.stunT = s; e.state = e.state === 'windup' ? 'chase' : e.state;
    this.fx.text(e.pos.clone().add(V3(0, 2.8 * (e.def.scale || 1), 0)), offBalance ? 'OFF BALANCE' : '★ stunned', offBalance ? 'warn' : 'miss small');
    if (!e.actor.procedural) e.actor.once(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', 0.8);
  }
  freeze(e, s) { if (e.def.boss) s *= 0.5; e.frozenT = s; e.actor.setTint(0x9fe8ff, 0.75); }
  shake(p) { this.shakeT = 0.3; this.shakeP = p; }
  flash(c, ms) { this.ui.flash(c, ms); }
  ring(pos, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).add(V3(0, 0.2, 0));
    this.scene.add(m);
    this.fx.items.push({ obj: m, t: 0, life: 0.5, tick: k => { m.scale.setScalar(0.5 + k * r); m.material.opacity = 0.9 * (1 - k); } });
  }
  shoot(p) {
    if (p.by === 'player') p.byPlayer = true;
    this.fx.projectile(p);
  }
  projectileHit(pos, p) {
    if (p.byPlayer) {
      for (const e of this.targetsForPlayer()) {
        const c = e.pos.clone().add(V3(0, (e.actor.height || 2) * (e.def.scale || 1) * 0.5, 0));
        if (segPoint(p.prev || pos, pos, c) < 1.2 * (e.def.scale || 1) + (e.flying ? 1.5 : 0)) {
          if (p.aoe) this.explode(pos, p.aoe);
          else this.playerHits(e, { kind: 'weapon', fire: p.kind === 'fire' });
          return e;
        }
      }
      if (pos.y < this.phys.ground(pos.x, pos.z) + 0.2 || (this.zone !== 'world' && this.phys.blocked(pos.x - 0.3, pos.z - 0.3, pos.x + 0.3, pos.z + 0.3))) { if (p.aoe) this.explode(pos, p.aoe); return true; }
      return null;
    }
    const pl = this.player;
    if (pl.state !== 'dead' && segPoint(p.prev || pos, pos, pl.pos.clone().add(V3(0, 1.2, 0))) < 1.2) {
      const e = p.by;
      if (e && e.def) this.mobHits(e, { pos: pl.pos, player: true }, { ranged: true });
      return true;
    }
    if (pos.y < this.phys.ground(pos.x, pos.z) + 0.1) return true;
    return null;
  }
  explode(pos, aoe) {
    if (!aoe.quiet) { this.fx.burst(pos, aoe.fire ? 0xff7a20 : 0xe8e0c8, 50, 8, 3); this.ring(pos, aoe.r, aoe.fire ? 0xff8a30 : 0xffffff); this.sfx.boom(); this.shake(0.25); }
    let first = true;
    for (const e of this.targetsForPlayer()) if (e.pos.distanceTo(pos) < aoe.r + (e.def.boss ? 1.5 : 0)) { this.playerHits(e, { kind: 'ability', dmg: aoe.dmg(), name: first ? aoe.name : '', sure: true, fire: aoe.fire }); first = false; }
  }

  // ================================================================== crime and the watch
  crime(stars, kind, pos) {
    pos = pos || this.player.pos;
    const seen = this.entities.some(e => e.zone === this.zone && !e.dead && (
      (e.type === 'mob' && e.team === 'town' && e.pos.distanceTo(pos) < 40) ||
      ((e.type === 'villager' || e.type === 'npc') && e.pos.distanceTo(pos) < 24 && e.npcId !== 'aldous')));
    if (!seen) { if (kind === 'theft' || kind === 'horse theft') this.ui.toast('Nobody saw a thing.'); return false; }
    const before = this.bounty;
    this.bounty = Math.min(5, this.bounty + stars);
    this.unseenT = 0;
    if (this.bounty > before) { this.ui.toast(`Crime witnessed: ${kind}! ${'★'.repeat(this.bounty)}`, 'bad'); this.sfx.alarm(); }
    for (const e of this.entities) {
      if (e.type === 'villager' && e.pos.distanceTo(pos) < 30) { e.panic = 8; e.threat = this.player.pos.clone(); }
      if (e.type === 'mob' && e.team === 'town' && e.pos.distanceTo(pos) < 70) { e.state = 'chase'; e.alerted = false; this.alert(e); }
    }
    return true;
  }
  updateBounty(dt) {
    if (this.bounty <= 0) return;
    const p = this.player;
    const seen = p.invisT <= 0 && this.entities.some(e => e.type === 'mob' && e.team === 'town' && !e.dead && e.zone === this.zone && e.pos.distanceTo(p.pos) < 46 && !this.phys.blocked(e.pos.x, e.pos.z, p.pos.x, p.pos.z));
    this.unseenT = seen ? 0 : this.unseenT + dt;
    if (this.unseenT > 14) { this.clearBounty(); this.ui.toast('You lost them. Your bounty is cleared.', 'good'); return; }
    // the watch sends more men when things get serious
    this.reinforceT = (this.reinforceT || 0) - dt;
    if (this.bounty >= 3 && seen && this.reinforceT <= 0 && this.zone === 'world') {
      this.reinforceT = 14;
      const extra = this.entities.filter(e => e.extraGuard && !e.dead).length;
      if (extra < 2 + this.bounty) {
        const a = p.rot + Math.PI + (Math.random() - 0.5);
        const x = p.pos.x + Math.sin(a) * 30, z = p.pos.z + Math.cos(a) * 30;
        const g = this.spawnMob('watch', x, z, {});
        g.extraGuard = true; g.state = 'chase'; g.alerted = true;
        if (this.bounty >= 4) { g.hp = g.max = 60; g.armor = 17; g.actor.setTint(0xffd34d, 0.4); }
        this.ui.toast(this.bounty >= 4 ? 'The Knight-Captain joins the hunt!' : 'More guards are coming!', 'bad');
      }
    }
  }
  clearBounty() {
    this.bounty = 0;
    this.unseenT = 0;
    for (const e of this.entities) if (e.team === 'town') { e.angry = false; if (e.state === 'chase' || e.state === 'windup') e.state = 'return'; if (e.extraGuard) setTimeout(() => this.removeEntity(e), 3000); }
  }
  fine() { return Math.min(this.hero.gold, this.bounty * 40); }
  async busted() {
    const h = this.hero, fine = this.fine(), p = this.player;
    p.state = 'dead';
    this.ui.banner('BUSTED', `The watch takes ${fine} gold and throws you out of the cells.`, 'bad');
    this.sfx.sting('sad');
    await sleep(2600);
    h.gold -= fine;
    this.clearBounty();
    { const b = PLANS.emberfall.landmarks.barracks; this.teleport(b.x - 6, b.z + 16, 'world'); }
    h.hp = this.maxHp();
    p.state = 'move';
    p.actor.play('Idle', { force: true });
  }
  async fallen() {
    const h = this.hero, p = this.player;
    if (p.state === 'dead') return;
    p.state = 'dead';
    if (p.mount) this.dismount();
    p.actor.play('Death_A', { once: true, fade: 0.1, then: () => {} });
    this.slowT = 1.6;
    this.sfx.sting('sad');
    await sleep(1400);
    const lost = Math.floor(h.gold * 0.1);
    this.ui.banner('YOU HAVE FALLEN', lost ? `A cleric drags you to safety… for ${lost} gold.` : 'A cleric drags you to safety.', 'bad');
    await sleep(2600);
    h.gold -= lost;
    for (const e of this.entities) if (e.type === 'mob' && !e.dead && (e.state === 'chase' || e.state === 'windup')) { e.state = 'return'; if (e.def.boss) { e.hp = e.max; e.introDone = false; e.alerted = false; e.summon1 = e.summon2 = false; } }
    this.entities.filter(e => e.extraGuard || e.summoned).forEach(e => this.removeEntity(e));
    this.clearBounty();
    // wake at the nearest shrine you know
    if (this.zone === 'inside' && this.rooms.door) p.pos.set(this.rooms.door.ox, 0, this.rooms.door.oz);
    if (this.zone === 'barrow') { const [x, z] = DUNGEON_START; this.teleport(x, z - 2, 'barrow'); }
    else {
      let best = SHRINES[0], bd = Infinity;
      for (const s of SHRINES) if (h.shrines[s.id]) { const dd = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); if (dd < bd) { bd = dd; best = s; } }
      this.teleport(best.x + 2, best.z + 2, 'world');
    }
    h.hp = this.maxHp();
    p.state = 'move';
    p.actor.play('Idle', { force: true });
  }
  loseTrack() { for (const e of this.entities) if (e.type === 'mob' && e.state === 'chase' && !e.def.boss) e.state = 'return'; this.unseenT = Math.max(this.unseenT, 9); }
  guardsAttack() { this.bounty = Math.max(this.bounty, 2); for (const e of this.entities) if (e.team === 'town' && e.pos.distanceTo(this.player.pos) < 60) { e.angry = true; e.state = 'chase'; } }

  // ================================================================== moving about
  teleport(x, z, zone) {
    if (this.zone === 'inside' && zone !== 'inside') this.rooms.clear();
    this.zone = zone;
    const p = this.player;
    p.pos.set(x, 0, z);
    p.pos.y = this.phys.ground(x, z);
    p.vel.set(0, 0, 0);
    p.camPos.copy(p.pos).add(V3(Math.sin(p.yaw) * 6, 3, Math.cos(p.yaw) * 6));
    p.actor.root.position.copy(p.pos);
  }
  async fastTravel(s) {
    if (this.inCombat) { this.ui.toast('Not while enemies are hunting you.', 'bad'); return; }
    if (this.bounty > 0) { this.ui.toast('Not while you are wanted.', 'bad'); return; }
    this.resume();
    this.ui.fade(true);
    await sleep(450);
    if (this.player.mount) this.dismount();
    this.teleport(s.x + 2.5, s.z + 2.5, 'world');
    const horse = this.entities.find(e => e.type === 'horse' && e.owned);
    if (horse) { horse.pos.set(s.x - 3, 0, s.z + 3); horse.pos.y = this.phys.ground(horse.pos.x, horse.pos.z); }
    await sleep(200);
    this.ui.fade(false);
    this.ui.toast(`Shrine of ${s.name}`);
  }
  touchShrine(s) {
    const h = this.hero;
    const fresh = !h.shrines[s.id];
    h.shrines[s.id] = true;
    this.healPlayer(999);
    this.ui.flash('#5fd8ff', 400);
    this.sfx.chime();
    this.scenery.shrineMeshes[s.id].material.opacity = 0.95;
    if (fresh) { this.ui.banner(`Shrine of ${s.name}`, 'Fast travel unlocked — open the map (M) and pick a shrine.', 'good'); this.gainXP(40); }
    else this.ui.toast('The shrine restores you.');
    this.save();
  }
  whistle() {
    const h = this.hero, p = this.player;
    const horse = this.entities.find(e => e.type === 'horse' && e.owned);
    if (!horse) { this.ui.toast('You have no horse. Old Tom at the stables sells them — or you could "borrow" one.'); return; }
    if (this.zone !== 'world') { this.ui.toast(this.zone === 'inside' ? 'Your horse will not fit through the door.' : 'Your horse will not come into the Barrow.'); return; }
    this.sfx.whistle();
    this.fx.text(p.pos.clone().add(V3(0, 2.8, 0)), '♪ whistle', 'say');
    if (horse.pos.distanceTo(p.pos) > 70) { const a = p.yaw; horse.pos.set(p.pos.x + Math.sin(a) * 35, 0, p.pos.z + Math.cos(a) * 35); horse.pos.y = this.phys.ground(horse.pos.x, horse.pos.z); }
    horse.called = true;
  }
  mountHorse(horse) {
    const p = this.player;
    if (!horse.owned) {
      this.crime(1, 'horse theft', horse.pos);
      const old = this.horseEntity(); if (old && old !== horse) this.removeEntity(old);
      this.claimHorse(null, horse);
      if (horse.breed) { const h = this.hero; if (!h.horses.includes(horse.breed)) h.horses.push(horse.breed); h.horse = horse.breed; }
      this.ui.toast('This horse is yours now. Whistle (H) to call her.', this.bounty ? 'bad' : '');
    }
    horse.ridden = true;
    horse.called = false;
    p.mount = horse;
    p.pos.copy(horse.pos);
    p.rot = horse.rot;
    p.state = 'move';
    this.sfx.neigh();
  }
  dismount() {
    const p = this.player, h = p.mount;
    if (!h) return;
    h.ridden = false;
    p.mount = null;
    if (h.actor.gallop) h.actor.gallop.timeScale = 0;
    p.pos.add(V3(Math.cos(p.rot) * 1.6, 0, -Math.sin(p.rot) * 1.6));
    p.pos.y = this.phys.ground(p.pos.x, p.pos.z);
  }
  claimHorse(pos, horse) {
    horse = horse || this.entities.find(e => e.type === 'horse' && !e.owned);
    if (!horse) { const st = PLANS.emberfall.stable; horse = this.addEntity({ type: 'horse', name: 'Horse', def: { name: 'Horse' }, model: 'horse', tint: '#8a5a3a', x: st.x, z: st.z, zone: 'world' }); horse.radius = 1; horse.timer = 3; }
    horse.owned = true;
    horse.pen = null;
    if (horse.crowd) { horse.crowd.ents = horse.crowd.ents.filter(x => x !== horse); horse.crowd = null; }
    horse.name = 'Your horse';
    this.hero.ownsHorse = true;
    if (pos) { horse.pos.set(pos[0], 0, pos[1]); horse.pos.y = this.phys.ground(pos[0], pos[1]); }
    return horse;
  }
  buyHorse() {
    const horse = this.claimHorse(null);
    if (horse) { const st = PLANS.emberfall.stable; horse.pos.set(st.x + st.w / 2 + 6, 0, st.z); horse.pos.y = this.phys.ground(horse.pos.x, horse.pos.z); if (horse.crowd) horse.crowd.ents = horse.crowd.ents.filter(x => x !== horse); horse.crowd = null; }
    this.ui.toast('She is yours. Ride with E, call her with H.', 'good');
  }

  // ================================================================== the Barrow
  async openBarrow() {
    const h = this.hero;
    if (!h.flags.barrowOpen) {
      h.flags.barrowOpen = 1;
      this.sfx.boom();
      this.shake(0.4);
      const gate = this.scenery.barrowGate, y0 = gate.position.y;
      const t0 = performance.now();
      await new Promise(res => { const up = () => { const k = Math.min(1, (performance.now() - t0) / 1400); gate.position.y = y0 + k * 4.2; if (k < 1) requestAnimationFrame(up); else res(); }; up(); });
    }
    this.enterBarrow();
  }
  async enterBarrow() {
    if (this.player.mount) this.dismount();
    this.ui.fade(true);
    await sleep(500);
    this.spawnDungeon();
    const [x, z] = DUNGEON_START;
    this.teleport(x, z - 1, 'barrow');
    this.player.yaw = 0;
    this.player.rot = Math.PI;
    if (this.hero.quests.main === 2) this.setStep('main', 3);
    await sleep(250);
    this.ui.fade(false);
    this.ui.banner('The Barrow', 'Where the dead do not sleep', 'zone');
    this.sfx.sting('evil');
    this.save();
  }
  spawnDungeon() {
    if (this.dungeonSpawned) return;
    this.dungeonSpawned = true;
    for (const [key, n, x, z, spread, extra] of DUNGEON_SPAWNS) {
      if (key === 'boneking' && this.hero.bosses.boneking) continue;
      for (let i = 0; i < n; i++) this.spawnMob(key, x + (Math.random() - 0.5) * spread * 2, z + (Math.random() - 0.5) * spread * 2, { ...(extra || {}), zone: 'barrow' });
    }
  }
  async leaveBarrow() {
    this.ui.fade(true);
    await sleep(450);
    const d0 = this.scenery.barrowDoor;
    this.teleport(d0.x, d0.z + 4, 'world');
    this.player.yaw = Math.PI;
    await sleep(200);
    this.ui.fade(false);
  }
  updateTraps(dt) {
    if (this.zone !== 'barrow') return;
    const p = this.player;
    this.trapCd = (this.trapCd || 0) - dt;
    for (const s of this.scenery.spikes) {
      if (s.up && Math.abs(p.pos.x - s.x) < 2 && Math.abs(p.pos.z - s.z) < 2 && this.trapCd <= 0 && p.iframes <= 0 && p.pos.y < 1) {
        this.trapCd = 0.9;
        const dmg = roll(2, 6, 0);
        this.fx.text(p.pos.clone().add(V3(0, 2.6, 0)), `Spikes! −${dmg}`, 'hurt');
        p.vel.y = 6;
        this.hurtPlayer(dmg, null);
        this.sfx.clang();
      }
    }
  }

  // ================================================================== bosses and story beats
  // cutscenes started from a conversation wait for it to close first
  async afterTalk() { while (this.talking) await sleep(50); await sleep(60); }
  async bossIntro(e) {
    e.introDone = true;
    const def = e.def;
    this.sfx.roar();
    const p = this.player;
    await this.afterTalk();
    if (this.cineActive) return;
    const top = (e.actor.height || 2.5) * (def.scale || 1);
    const from = e.pos.clone().add(V3(Math.sin(e.rot) * 6 + 2, top * 0.7, Math.cos(e.rot) * 6 + 2));
    const to = e.pos.clone().add(V3(Math.sin(e.rot) * 4.5 - 2, top * 0.5, Math.cos(e.rot) * 4.5 - 1));
    await this.cine([{ from, to, look: e.pos.clone().add(V3(0, top * 0.75, 0)), dur: 2.4, title: def.name, sub: def.title }], true);
  }
  // camera shots: [{ from, to, look, lookTo, dur, caption, title, sub }]
  async cine(shots, quick) {
    this.cineActive = true;
    this.skipCine = false;
    this.ui.cinema(true);
    for (const s of shots) {
      if (this.skipCine) break;
      this.ui.caption(s.caption || '', s.cls);
      this.ui.cineTitle(s.title || '', s.sub || '', s.cls);
      const t0 = performance.now();
      await new Promise(res => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (s.dur * 1000));
          const e = ease(k);
          this.camera.position.lerpVectors(s.from, s.to || s.from, e);
          this.camera.lookAt(s.lookTo ? s.look.clone().lerp(s.lookTo, e) : s.look);
          if (k >= 1 || this.skipCine) res(); else requestAnimationFrame(step);
        };
        step();
      });
    }
    this.ui.caption('');
    this.ui.cineTitle('');
    this.ui.cinema(false);
    this.cineActive = false;
  }
  async intro() {
    const p = this.player.pos, B = SITES.barrow;
    const k = SETTLEMENTS[0], K2 = SETTLEMENTS[1], K3 = SETTLEMENTS[2];
    await this.cine([
      { from: V3(k.x - 340, 160, k.z + 360), to: V3(k.x - 140, 95, k.z + 190), look: V3(k.x, 10, k.z), dur: 6, caption: 'This is the realm of Emberfall: four kingdoms, three villages, and a great deal of wilderness in between.' },
      { from: V3(K2.x - 160, 70, K2.z + 120), to: V3(K2.x - 60, 50, K2.z + 150), look: V3(K2.x, 10, K2.z), dur: 4.5, caption: 'Solmara, in the eastern sands. Frosthold, high in the snowy north. Tidewatch, by the western lake.' },
      { from: V3(B.x + 80, 50, B.z + 90), to: V3(B.x + 26, 22, B.z + 46), look: V3(B.x, 8, B.z), dur: 5, caption: 'And far to the north, the old Barrow has woken. The Ash Crown has been stolen — and the dead have begun to walk.', cls: 'bad' },
      { from: V3(p.x + 18, p.y + 12, p.z + 20), to: V3(p.x + 3, p.y + 3, p.z + 6), look: p.clone().add(V3(0, 1.8, 0)), dur: 4.2, title: 'EMBERFALL', sub: `${this.hero.name} the ${CLASSES[this.hero.cls].name} has arrived` },
    ]);
  }
  fight(id, alone) {
    const e = this.byId(id);
    if (!e) return;
    this.inFight = true;
    setTimeout(() => { this.inFight = false; }, 50);
    e.neutral = false;
    e.talk = null;
    e.state = 'chase';
    e.provoked = true;
    if (id === 'varg') {
      this.hero.flags.vargAlone = !!alone;
      if (alone) this.entities.filter(x => x.camp === 'keep' && x !== e).forEach(x => { x.neutral = true; });
      else this.entities.filter(x => x.camp === 'keep').forEach(x => { x.state = 'chase'; x.provoked = true; });
    }
    if (id === 'boneking' && this.hero.flags.kingstun) { e.stunT = 5; this.ui.toast('"Aldric…?" The Bone King staggers, remembering.', 'good'); }
    if (id === 'boneking' && this.hero.flags.aldous === 'ally' && !this.byId('aldous_ally')) {
      const a = this.addEntity({ type: 'ally', id: 'aldous_ally', name: 'Ser Aldous', def: { name: 'Ser Aldous' }, model: 'knight', gear: ['1H_Sword', 'Round_Shield'], hat: true, ghost: true, x: this.player.pos.x + 2, z: this.player.pos.z - 2, zone: 'barrow' });
      a.cd = 0;
      this.ui.toast('Ser Aldous charges through the wall to fight at your side!', 'good');
    }
    this.alert(e);
  }
  vargYields() {
    const h = this.hero;
    h.flags.vargPeace = 1;
    this.giveKey('gravekey');
    this.entities.filter(e => e.camp === 'keep').forEach(e => { e.neutral = true; e.talk = null; e.state = 'idle'; });
    this.gainXP(200);
    if (h.quests.main === 1) this.setStep('main', 2);
  }
  callBandits(e) { for (let i = 0; i < 2; i++) { const b = this.spawnMob('bandit', e.pos.x + (i ? 6 : -6), e.pos.z + 5, {}); b.state = 'chase'; b.provoked = true; b.summoned = true; } this.ui.toast('"Lads! To me!"', 'bad'); }
  bossDown(e) {
    const h = this.hero, id = e.bossId;
    if (id === 'varg') { if (h.quests.main === 1) this.setStep('main', 2); this.entities.filter(x => x.camp === 'keep' && !x.dead).forEach(x => { x.neutral = false; }); }
    if (id === 'grub' && h.quests.goblins === 0) this.setStep('goblins', 1);
    if (id === 'troll') { h.flags.trollpass = 1; if (!h.done.troll) this.completeQuest('troll'); }
    if (id === 'mimic' && h.quests.lute === 0) this.setStep('lute', 1);
    if (id === 'wyvern' && h.quests.wyvern === 0) this.setStep('wyvern', 1);
    if (id === 'boneking') {
      const at = e.pos.clone();
      const crown = new THREE.Group();
      crown.add(part('dungeon', 'coin_stack_large', 0.6));
      this.scene.add(crown);
      crown.position.copy(at);
      this.points.push({ id: 'crown', x: at.x, z: at.z, label: 'Take up the Ash Crown', zone: 'barrow', range: 3.5, crownMesh: crown, act: () => this.talkTo({ name: 'The Ash Crown', def: { title: '' } }, 'crown') });
      if (h.quests.main === undefined) this.startQuest('main', 4); else this.setStep('main', 4);
      this.removeEntity(this.byId('aldous_ally') || { actor: { dispose() {} } });
      this.entities.filter(x => x.zone === 'barrow' && x.type === 'mob' && !x.dead).forEach(x => this.kill(x, 'crown'));
    }
  }
  async endMain(kind) {
    const h = this.hero;
    if (h.done.main || this.ending) return;
    this.ending = true;
    await this.afterTalk();
    h.flags.ending = kind;
    this.points = this.points.filter(p => { if (p.id === 'crown') { this.scene.remove(p.crownMesh); return false; } return true; });
    delete h.keys.ashcrown;
    if (h.quests.main === undefined) h.quests.main = 5;
    const lines = {
      ashes: ['You bring the crown down on the throne. It shatters into cold cinders.', 'All through the Barrow, bones lie down with a sound like rain. Emberfall sleeps soundly tonight.'],
      home: ['You set the crown back on the chapel altar. The candles flare, then settle.', 'Maren counts the vault into your hands. Emberfall will tell this story for a hundred years.'],
      sovereign: ['The crown settles on your brow. The whispers break against your will — and fall silent.', 'The dead of the Barrow kneel to you. Emberfall has a new protector.'],
      cursed: ['The crown settles on your brow. It is warm. It is so very warm.', 'Somewhere below, the dead begin to march — for you. Emberfall has a new and terrible ruler.'],
    }[kind];
    this.ui.cinema(true);
    this.cineActive = true;
    for (const l of lines) { this.ui.caption(l, kind === 'cursed' ? 'bad' : 'good'); await sleep(4200); }
    this.ui.cineTitle('THE END', 'of the Ash Crown — but the realm is still yours to roam', kind === 'cursed' ? 'bad' : 'good');
    this.sfx.sting(kind === 'cursed' ? 'evil' : 'good');
    this.sfx.bell();
    await sleep(4200);
    this.ui.cineTitle('');
    this.ui.caption('');
    this.ui.cinema(false);
    this.cineActive = false;
    if (kind === 'home') h.gold += 300;
    if (kind === 'ashes') this.gainXP(300);
    if (kind === 'sovereign') this.giveItem('crownsov');
    if (kind === 'cursed') this.giveItem('crowncursed');
    this.completeQuest('main');
    this.ending = false;
  }

  // ================================================================== quests
  startQuest(id, step = 0) {
    const h = this.hero;
    if (h.done[id] || h.quests[id] !== undefined) { if (h.quests[id] !== undefined && step > h.quests[id]) this.setStep(id, step); return; }
    h.quests[id] = step;
    if (!h.tracked || QUESTS[id].main || !h.quests[h.tracked]) h.tracked = id;
    this.ui.banner('New quest', QUESTS[id].title, 'quest');
    this.sfx.chime();
    this.questStarted(id);
    this.checkCounters();
    this.save();
  }
  setStep(id, s) {
    const h = this.hero;
    if (h.quests[id] === undefined) { h.quests[id] = s; } else if (s <= h.quests[id]) return;
    h.quests[id] = s;
    h.tracked = h.tracked || id;
    this.ui.toast(`${QUESTS[id].title}: ${QUESTS[id].steps[s].text}`, 'quest');
    this.sfx.chime();
    this.save();
  }
  completeQuest(id) {
    const h = this.hero, q = QUESTS[id];
    if (h.done[id]) return;
    delete h.quests[id];
    h.done[id] = true;
    const r = q.reward || {}, bits = [];
    if (r.gold) { h.gold += r.gold; bits.push(`+${r.gold} gold`); }
    if (r.potions) { h.potions += r.potions; bits.push(`+${r.potions} potions`); }
    if (r.item) { this.giveItem(r.item, true); bits.push(`${ITEMS[r.item].icon} ${ITEMS[r.item].name}`); }
    if (r.mat) for (const [k, v] of Object.entries(r.mat)) { h.mats[k] = (h.mats[k] || 0) + v; bits.push(`+${v} ${MATERIALS[k].name.toLowerCase()}`); }
    if (id === 'bertram') { const b = this.byId('bertram'); if (b) this.removeEntity(b); }
    if (id === 'goblins') { delete h.keys.piebasket; h.potions += 1; }
    if (id === 'lute') delete h.keys.lute;
    if (id === 'shards') h.counters.shard = 0;
    if (id === 'glowcaps') h.counters.glowcap = Math.max(0, (h.counters.glowcap || 0) - 5);
    this.ui.banner('QUEST COMPLETE', `${q.title}${bits.length ? ' · ' + bits.join(' · ') : ''}`, 'gold');
    this.sfx.sting('good');
    if (h.tracked === id) h.tracked = Object.keys(h.quests)[0] || null;
    if (r.xp) setTimeout(() => this.gainXP(r.xp), 900);
    this.save();
  }
  trackedQuest() { const h = this.hero; const id = h.tracked && h.quests[h.tracked] !== undefined ? h.tracked : Object.keys(h.quests)[0]; return id ? { id, step: h.quests[id] } : null; }
  questTarget(id) {
    const h = this.hero, step = QUESTS[id].steps[h.quests[id]];
    if (!step) return null;
    const at = step.at;
    const ent = k => { const e = this.byId(k) || this.entities.find(x => x.npcId === k); return e && !e.dead ? { x: e.pos.x, z: e.pos.z, y: e.pos.y + (e.actor.height || 2.5) * (e.def.scale || 1) - 2, zone: e.zone } : null; };
    if (NPCS[at]) return ent(at);
    if (at === 'keep') return ent('varg') || { x: SITES.keep.x, z: SITES.keep.z, zone: 'world' };
    if (at === 'warren') return h.keys.piebasket ? ent('pell') : ent('grub') || { x: SITES.warren.x, z: SITES.warren.z, zone: 'world' };
    if (at === 'tower') return h.keys.lute ? ent('lirel') : { x: SITES.tower.x + 7, z: SITES.tower.z + 2, zone: 'world' };
    if (at === 'peak') return ent('wyvern') || { x: SITES.peak.x, z: SITES.peak.z, zone: 'world' };
    if (at === 'bridge') return ent('troll') || { x: 0, z: -82, zone: 'world' };
    if (at === 'barrowdoor') return { ...this.scenery.barrowDoor, zone: 'world' };
    const L = PLANS.emberfall.landmarks;
    if (at === 'guild') return { x: L.guild.x + Math.sin(L.guild.rot) * 8, z: L.guild.z + Math.cos(L.guild.rot) * 8, zone: 'world' };
    if (at === 'arena') return { x: PLANS.emberfall.arena.x, z: PLANS.emberfall.arena.z, zone: 'world' };
    if (at === 'wood') { const w = this.entities.find(e => e.key === 'wolf' && !e.dead && Math.hypot(e.pos.x - WOOD.x, e.pos.z - WOOD.z) < WOOD.r + 40); return w ? { x: w.pos.x, z: w.pos.z, zone: 'world' } : { x: WOOD.x, z: WOOD.z, zone: 'world' }; }
    if (at === 'bertram') return ent('bertram') || { x: BERTRAM[0], z: BERTRAM[1], zone: 'world' };
    if (at === 'camp') return { x: SITES.camp.x, z: SITES.camp.z, zone: 'world' };
    if (at === 'nightknife') return ent('nightknife') || { x: PLANS.emberfall.nightknife[0], z: PLANS.emberfall.nightknife[1], zone: 'world' };
    if (at === 'throne') { if (this.zone !== 'barrow') return { ...this.scenery.barrowDoor, zone: 'world' }; const c = this.points.find(p => p.id === 'crown'); return c ? { x: c.x, z: c.z, y: 1, zone: 'barrow' } : { x: this.scenery.throne.x, z: this.scenery.throne.z, y: 2, zone: 'barrow' }; }
    if (at === 'shard' || at === 'swamp') {
      const p = this.player.pos;
      let best = null, bd = Infinity;
      for (const pk of this.pickups) if (!pk.taken && pk.kind === (at === 'shard' ? 'shard' : 'glowcap')) { const dd = Math.hypot(pk.x - p.x, pk.z - p.z); if (dd < bd) { bd = dd; best = pk; } }
      return best ? { x: best.x, z: best.z, y: best.y + 1, zone: 'world' } : null;
    }
    return null;
  }
  npcHasQuest(e) {
    const h = this.hero, id = e.npcId;
    if (!h || !id) return false;
    const q = h.quests;
    return (id === 'maren' && (q.main === undefined && !h.done.main || q.main === 0 || q.main === 5)) || (id === 'pell' && (!h.done.goblins && (q.goblins === undefined || h.keys.piebasket))) ||
      (id === 'lirel' && !h.done.lute && (q.lute === undefined || h.keys.lute)) || (id === 'morwen' && !h.done.glowcaps && (q.glowcaps === undefined || q.glowcaps === 1)) ||
      (id === 'hale' && !h.done.wyvern && (q.wyvern === undefined || q.wyvern === 1)) || (id === 'doran' && !h.done.shards && (q.shards === undefined || q.shards === 1));
  }
  checkCounters() {
    const h = this.hero;
    if (h.quests.shards === 0 && (h.counters.shard || 0) >= 6) this.setStep('shards', 1);
    if (h.quests.glowcaps === 0 && (h.counters.glowcap || 0) >= 5) this.setStep('glowcaps', 1);
    if (h.quests.wolves === 0 && (h.counters.wolf || 0) >= 6) this.setStep('wolves', 1);
    if (h.quests.bertram === 1 && (h.counters.bertwolf || 0) >= 3) this.setStep('bertram', 2);
    if (h.quests.camp === 0 && (h.counters.camp || 0) >= 5) this.setStep('camp', 1);
  }
  gainXP(n, at) {
    const h = this.hero;
    if (!n) return;
    h.xp += n;
    if (at) this.fx.text(at.clone().add(V3(0, 2.2, 0)), `+${n} XP`, 'xp');
    this.levelCheck();
  }
  async levelCheck() {
    const h = this.hero;
    if (this.leveling) return;
    while (h.level < XP_LEVELS.length && h.xp >= XP_LEVELS[h.level]) {
      this.leveling = true;
      h.level++;
      h.hp = this.maxHp();
      this.ui.banner(`LEVEL ${h.level}`, 'You feel stronger.', 'gold');
      this.sfx.sting('good');
      this.sfx.chime();
      this.fx.burst(this.player.pos.clone().add(V3(0, 1, 0)), 0xffd34d, 80, 5, 4);
      await sleep(900);
      this.paused = true;
      const k = await this.ui.levelUp(h.level);
      h.base[k]++;
      this.paused = false;
      h.hp = this.maxHp();
      this.save();
    }
    this.leveling = false;
  }
  giveItem(k, quiet) { const h = this.hero; if (h.items.includes(k)) return; h.items.push(k); if (ITEMS[k].mods.hp) h.hp += ITEMS[k].mods.hp; if (!quiet) this.ui.banner(`${ITEMS[k].icon} ${ITEMS[k].name}`, ITEMS[k].text, 'loot'); this.sfx.coin(); }
  giveKey(k) { this.hero.keys[k] = true; this.ui.toast(`Got: ${KEY_ITEMS[k].icon} ${KEY_ITEMS[k].name}`, 'good'); this.sfx.coin(); }

  // ================================================================== interacting
  nearbyAction() {
    const p = this.player, h = this.hero;
    if (p.state === 'dead') return null;
    const cands = [];
    const add = (dist, range, label, act) => { if (dist < range) cands.push({ dist, label, act }); };
    if (p.mount) return { label: 'Get off your horse', act: () => this.dismount() };
    for (const e of this.entities) {
      if (e.zone !== this.zone || e.dead || !e.near) continue;
      const dd = e.pos.distanceTo(p.pos) - e.radius;
      if (e.type === 'npc') add(dd, 2.8, `Talk to ${e.name}`, () => this.talkTo(e, e.talk));
      else if (e.type === 'horse') add(dd, 2.4, e.owned ? 'Ride your horse' : 'Ride this horse (it is not yours…)', () => this.mountHorse(e));
      else if (e.type === 'unicorn' && e.actor.root.visible) add(dd, 3.5, 'Approach the unicorn', () => this.unicorn(e));
      else if (e.type === 'villager' && e.panic <= 0) add(dd, 1.9, `Pickpocket ${e.name}`, () => this.pickpocket(e));
      else if (e.type === 'mob' && e.neutral && e.talk) add(dd, 4.5, `Talk to ${e.def.name}`, () => this.talkTo(e, e.talk));
      else if (e.type === 'mob' && e.hidden) add(dd, 2.6, 'Open the chest', () => this.revealMimic(e));
      else if (e.type === 'mob' && e.team === 'town' && this.bounty > 0 && !this.inCombatWithMonsters()) add(dd, 3.2, `Surrender (pay ${this.fine()} gold)`, () => this.busted());
    }
    for (const pt of this.points) if (pt.zone === this.zone && !pt.opened) add(Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z), pt.range || 2.6, pt.label, pt.act);
    for (const pk of this.pickups) if (!pk.taken && pk.zone === this.zone) add(Math.hypot(pk.x - p.pos.x, pk.z - p.pos.z), 2.4, pk.kind === 'shard' ? 'Take the Ember Shard' : 'Pick the glowcap', () => this.takePickup(pk));
    cands.sort((a, b) => a.dist - b.dist);
    return cands[0] || null;
  }
  inCombatWithMonsters() { return this.entities.some(e => e.type === 'mob' && e.team !== 'town' && e.state === 'chase' && !e.dead && e.near); }
  updatePrompt() {
    const a = this.cineActive || this.talking || this.paused ? null : this.nearbyAction();
    this.action = a;
    this.ui.prompt(a ? `${isTouch ? '✋' : 'E'} — ${a.label}` : '');
  }
  interact() { if (this.action) this.action.act(); }
  autoTalk() {
    if (this.talking || this.cineActive) return;
    const p = this.player;
    for (const e of this.entities) {
      if (e.type !== 'mob' || !e.neutral || !e.talk || e.dead || e.zone !== this.zone || !e.near) continue;
      const dd = e.pos.distanceTo(p.pos);
      if (dd < (e.def.boss ? 9 : 6) && !(e.talkCd > performance.now()) && e.talk !== 'troll' || (e.talk === 'troll' && dd < 11 && !this.hero.flags.trollpass && !(e.talkCd > performance.now()))) {
        e.talkCd = performance.now() + 15000;
        this.talkTo(e, e.talk);
        return;
      }
    }
  }
  async talkTo(e, id) {
    if (this.talking) return;
    this.talking = true;
    const p = this.player;
    if (p.mount && e.type !== 'npc') this.dismount();
    // frame the conversation
    if (e.pos) {
      const mid = e.pos.clone().add(p.pos).multiplyScalar(0.5);
      const side = V3(-(e.pos.z - p.pos.z), 0, e.pos.x - p.pos.x).normalize();
      const top = (e.actor ? e.actor.height || 2.4 : 2.4) * (e.def.scale || 1);
      this.cineActive = true;
      // over the hero's shoulder, looking at the speaker, who sits in the upper half of the screen
      const back = p.pos.clone().sub(e.pos).setY(0).normalize();
      const dist = Math.max(4.5, top * 1.6);
      this.camera.position.copy(p.pos).addScaledVector(back, dist * 0.55).addScaledVector(side, 1.4).add(V3(0, Math.min(top, 3.2) * 0.75 + 0.8, 0));
      this.camera.lookAt(e.pos.clone().add(V3(0, top * 0.38, 0)));
      e.rot = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      p.rot = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (e.actor && e.type === 'npc') e.actor.once('Interact', 1);
    }
    const node = DIALOGUE[id];
    await this.ui.talk(e.name || e.def.name, e.def.title || '', node, this.api());
    this.talking = false;
    this.cineActive = false;
    p.camPos.copy(this.camera.position);
  }
  // The game, as seen by dialogue (data.js).
  api() {
    const g = this, h = this.hero;
    return {
      get hero() { return h; }, get gold() { return h.gold; }, get bounty() { return g.bounty; }, get ownsHorse() { return h.ownsHorse; }, get fateCount() { return h.fate; },
      fmt: s => String(s).replace(/\{name\}/g, h.name),
      node: name => DIALOGUE[name](this.api()),
      step: id => h.quests[id], done: id => !!h.done[id], setStep: (id, s) => g.setStep(id, s),
      startQuest: (id, s) => g.startQuest(id, s), completeQuest: id => g.completeQuest(id),
      flag: k => h.flags[k], setFlag: (k, v) => { h.flags[k] = v; },
      has: k => h.items.includes(k) || !!h.keys[k], giveItem: k => g.giveItem(k), giveKey: k => g.giveKey(k),
      pay: n => { h.gold = Math.max(0, h.gold - n); g.sfx.coin(); }, addPotions: n => { h.potions += n; g.ui.toast(`+${n} potion`); }, addFate: n => { h.fate = Math.min(3, h.fate + n); g.ui.toast(`+${n} Fate`, 'good'); },
      toast: t => g.ui.toast(t), count: k => h.counters[k] || 0, statMod: s => g.stat(s),
      fine: () => g.fine(), clearBounty: () => g.clearBounty(), guardsAttack: () => g.guardsAttack(),
      buyHorse: () => g.buyHorse(), fight: (id, alone) => g.fight(id, alone), vargYields: () => g.vargYields(),
      openBarrow: () => g.openBarrow(), endMain: k => g.endMain(k), hurtHero: n => g.hurtPlayer(n, null), healHero: n => g.healPlayer(n),
      stealDC: () => 12 + (g.entities.some(e => e.team === 'town' && !e.dead && e.pos.distanceTo(g.player.pos) < 15) ? 3 : 0) - (h.bg === 'outlaw' ? 3 : 0),
      stealLoot: () => { if (Math.random() < 0.5) { h.potions++; g.ui.toast('Swiped a potion'); } else { const n = 10 + Math.floor(Math.random() * 16); h.gold += n; g.ui.toast(`Swiped ${n} gold`); g.sfx.coin(); } },
      crime: (n, k) => g.crime(n, k, g.player.pos),
      isNight: () => g.scenery.dayK < 0.3, town: () => (g.rooms.door ? g.rooms.door.town : 'here'), lord: () => (g.rooms.door ? g.rooms.door.lord : ''),
      leaveRoom: () => setTimeout(() => g.rooms.exit(), 50),
      rob: () => { const n = 8 + Math.floor(Math.random() * 25); h.gold += n; g.ui.toast(`+${n} gold`); g.sfx.coin(); g.crime(1, 'robbery', g.player.pos); },
      rest: () => g.restNight(), pray: () => g.rooms.pray(), level: () => h.level,
      spar: () => g.spar(),
      hasWeapon: k => (h.weapons || []).includes(k), giveWeapon: k => g.giveWeapon(k),
      mat: k => (h.mats || {})[k] || 0, addMat: (k, n) => g.addMat(k, n), earn: n => { h.gold += n; g.sfx.coin(); g.ui.toast(`+${n} gold`); },
      canCraft: c => Object.entries(c).every(([k, v]) => (k === 'gold' ? h.gold : (h.mats[k] || 0)) >= v),
      spend: c => { for (const [k, v] of Object.entries(c)) { if (k === 'gold') h.gold -= v; else h.mats[k] -= v; } g.sfx.clang(); },
      matsText: () => Object.keys(MATERIALS).map(k => `${h.mats[k] || 0} ${MATERIALS[k].name.toLowerCase()}`).join(', '),
      sleepUntil: t => g.sleepUntil(t), saveGame: () => g.save(), startArena: () => g.startArena(),
      horseText: () => (h.horses.length ? `You own: ${h.horses.map(k => HORSES[k].name).join(', ')}.` : ''),
      ownsBreed: k => h.horses.includes(k), ownedBreeds: () => h.horses.slice(), buyBreed: k => g.buyBreed(k), pickHorse: k => g.pickHorse(k),
      sellBreed: k => g.sellBreed(k), bertramWolves: () => g.bertramWolves(),
    };
  }
  async pickpocket(e) {
    this.talking = true;
    const dc = 12 + (this.hero.bg === 'outlaw' ? -3 : 0) + (this.entities.some(x => x.team === 'town' && !x.dead && x.pos.distanceTo(this.player.pos) < 15) ? 2 : 0);
    const ok = await this.ui.check('agility', dc, this.stat('agility'), e.name);
    this.talking = false;
    if (ok) { const n = 4 + Math.floor(Math.random() * 14); this.hero.gold += n; this.ui.toast(`You lift ${n} gold from ${e.name}.`); this.sfx.coin(); }
    else { this.fx.text(e.pos.clone().add(V3(0, 2.8, 0)), 'THIEF!', 'say'); e.panic = 8; e.threat = this.player.pos.clone(); this.crime(1, 'pickpocketing', e.pos); }
  }
  async openChest(pt) {
    const c = pt.chest;
    this.talking = true;
    const ok = await this.ui.check('agility', c.dc, this.stat('agility'), 'Lock');
    this.talking = false;
    if (!ok) { this.ui.toast('The lock holds. Try again, or smash it (it takes a while).'); c.dc = Math.max(8, c.dc - 2); return; }
    pt.open();
    const h = this.hero, bits = [];
    h.got[pt.id] = true;
    if (c.gold) { h.gold += c.gold; bits.push(`${c.gold} gold`); }
    if (c.potions) { h.potions += c.potions; bits.push(`${c.potions} potion${c.potions > 1 ? 's' : ''}`); }
    if (c.fate) { h.fate = Math.min(3, h.fate + c.fate); bits.push('+1 Fate'); }
    if (c.item) this.giveItem(c.item);
    this.ui.toast(`Chest: ${bits.join(', ') || 'empty'}`, 'good');
    this.sfx.coin();
    if (c.owned) this.crime(1, 'theft');
    this.gainXP(15);
    this.save();
  }
  revealMimic(e) {
    e.hidden = false;
    e.state = 'chase';
    e.provoked = true;
    e.actor.play('attack');
    this.sfx.roar();
    this.shake(0.5);
    this.fx.text(e.pos.clone().add(V3(0, 2, 0)), 'IT HAS TEETH', 'crit big');
    this.alert(e);
  }
  async unicorn(e) {
    this.talking = true;
    const ok = await this.ui.check('charm', 12, this.stat('charm'), 'Unicorn');
    this.talking = false;
    this.hero.flags.unicornDay = Math.floor(this.day());
    if (ok) { this.healPlayer(999); this.hero.fate = Math.min(3, this.hero.fate + 1); this.gainXP(60); this.ui.banner('The unicorn bows', 'Fully healed · +1 Fate', 'good'); this.sfx.chime(); this.fx.burst(e.pos.clone().add(V3(0, 2, 0)), 0xfff6ff, 60, 4, 3); }
    else this.ui.toast('It bolts between one blink and the next. Maybe tomorrow.');
  }
  takePickup(pk) {
    const h = this.hero;
    pk.taken = true;
    pk.mesh.visible = false;
    h.got[pk.id] = true;
    const k = pk.kind === 'shard' ? 'shard' : 'glowcap';
    h.counters[k] = (h.counters[k] || 0) + 1;
    this.fx.burst(pk.mesh.position.clone(), pk.kind === 'shard' ? 0xff8a30 : 0x6fd8ff, 30, 3, 3);
    this.sfx.chime();
    this.ui.toast(pk.kind === 'shard' ? `Ember Shard (${h.counters.shard}/6)${h.quests.shards === undefined && !h.done.shards ? ' — Doran the smith would want these' : ''}` : `Glowcap (${h.counters.glowcap})${h.quests.glowcaps === undefined && !h.done.glowcaps ? ' — a witch in the Mirefen collects these' : ''}`, 'good');
    this.gainXP(10);
    this.checkCounters();
  }
  updatePickups(dt) {
    const t = performance.now() / 1000, night = 1 - this.scenery.dayK;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (pk.kind === 'shard') { pk.mesh.rotation.y = t * 1.6; pk.mesh.position.y = pk.y + 1.1 + Math.sin(t * 2 + pk.x) * 0.15; }
      else pk.mesh.userData.cap.material.emissiveIntensity = 0.3 + night * 2.2;
    }
  }

  // ================================================================== pause, saving
  togglePause(tab) {
    if (this.paused && !tab) return this.resume();
    if (this.paused) { this.ui.menuTab(tab); return; }
    this.paused = true;
    this.input.unlock();
    this.ui.openMenu(tab || 'map');
  }
  resume() { this.paused = false; this.ui.closeMenu(); if (!isTouch) this.input.lock(); }


  // ================================================================== freeflow: counters, knockdowns, the combo meter
  // Block (or aim) while an attacker shows the counter spark: you meet every one of them at once.
  tryCounter() {
    const p = this.player;
    const list = this.entities.filter(e => e.type === 'mob' && e.zone === this.zone && e.near && !e.dead && e.state === 'windup' && e.cued && e.def.kind === 'melee' && this.isHostile(e) && e.pos.distanceTo(p.pos) < 8.5)
      .sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos)).slice(0, 3);
    if (!list.length) return false;
    const main = list[0], dx = main.pos.x - p.pos.x, dz = main.pos.z - p.pos.z, dd = Math.hypot(dx, dz);
    const near = 1.7 + (main.def.boss ? 0.9 * (main.def.scale || 1) : 0);
    if (dd > near + 0.4) { p.pos.x = main.pos.x - (dx / dd) * near; p.pos.z = main.pos.z - (dz / dd) * near; this.phys.resolve(p.pos, p.radius); p.pos.y = this.phys.ground(p.pos.x, p.pos.z); this.fx.burst(p.pos.clone().add(V3(0, 1, 0)), 0x9fd8ff, 14, 3, 0.5); }
    p.rot = Math.atan2(dx, dz); p.faceTo = p.rot;
    p.state = 'counter'; p.counterAnim = 0.5; p.iframes = 0.55; p.vel.set(0, p.vel.y, 0);
    if (p.charging) { p.charging = false; p.actor.clearTint(); }
    const C = this.kit();
    p.actor.play(C.style === 'melee' ? (C.heavy || '1H_Melee_Attack_Chop') : 'Unarmed_Melee_Attack_Kick', { once: true, fade: 0.04, speed: 1.9, then: () => {} });
    for (const e of list) { e.state = 'recover'; e.timer = 0.6; e.cued = false; }
    p.pendingCounter = { list, t: 0.13 };
    this.slowT = Math.max(this.slowT, 0.32); this.camPunch = 0.25;
    this.sfx.swish();
    this.fx.text(p.pos.clone().add(V3(0, 2.8, 0)), list.length > 1 ? `${list.length}× COUNTER` : 'COUNTER', 'parry');
    return true;
  }
  counterHit(list) {
    for (const e of list) {
      if (e.dead) continue;
      this.playerHits(e, { kind: 'weapon', crit: true, sure: true, name: 'COUNTER', counter: true });
      if (!e.dead) this.knockDown(e, e.def.boss ? 0 : 1.9);
    }
    this.hitstop = 0.12; this.shake(0.35); this.sfx.crit();
    this.ui.flash('rgba(160,220,255,.3)', 180);
  }
  knockDown(e, secs) {
    if (e.dead) return;
    if (!secs || e.def.boss || e.flying) { this.stun(e, 1.0, true); return; }
    const p = this.player, dir = e.pos.clone().sub(p.pos).setY(0).normalize();
    e.pos.addScaledVector(dir, 1.6); this.phys.resolve(e.pos, e.radius); e.pos.y = this.phys.ground(e.pos.x, e.pos.z);
    e.downT = secs; e.state = 'down';
    if (e.actor.actions && e.actor.actions.Lie_Down) e.actor.play('Lie_Down', { once: true, fade: 0.05, speed: 1.6, then: () => {} });
    else e.actor.once('Hit_B', 0.6);
  }
  addCombo(n = 1) {
    this.combo = (this.combo || 0) + n;
    this.comboT = 2.4;
    this.ui.combo(this.combo);
  }
  breakCombo() { if (this.combo > 2) this.ui.combo(0, true); this.combo = 0; this.comboT = 0; }

  // ================================================================== weapons, torch, materials
  equip(id, quiet) {
    const h = this.hero, p = this.player, w = WEAPONS[id];
    if (!w || !h.weapons.includes(id)) return;
    h.weapon = id; this._kit = null;
    p.actor.setGear([w.r, w.l], !!h.torchOn);
    p.combo = 0; p.queued = null;
    if (!quiet) { this.ui.toast(w.name); this.sfx.clang(); p.actor.once(w.style === 'melee' ? 'Interact' : 'Use_Item', 1.6); }
    this.ui.slotsDirty = true;
  }
  toggleTorch(on) {
    const h = this.hero;
    if (!h.flags.torch) { this.ui.toast('You have no torch. The Armory and the General Store sell them.'); return; }
    h.torchOn = on ?? !h.torchOn;
    const w = WEAPONS[h.weapon];
    this.player.actor.setGear([w.r, w.l], h.torchOn);
    this.sfx.fire && this.sfx.fire();
  }
  updateTorch(dt) {
    if (!this.torchLight) {
      this.torchLight = new THREE.PointLight(0xffa050, 0, 22, 1.6);
      this.scene.add(this.torchLight);
      this.torchFlame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
      this.scene.add(this.torchFlame);
    }
    const on = !!(this.hero && this.hero.torchOn && this.player && this.player.actor.torchObj);
    this.torchFlame.visible = on;
    if (!on) { this.torchLight.intensity = 0; return; }
    const t = this.player.actor.torchObj, wp = new THREE.Vector3();
    t.getWorldPosition(wp); wp.y += 0.55;
    this.torchFlame.position.copy(wp);
    this.torchFlame.scale.y = 0.85 + Math.sin(performance.now() / 70) * 0.2;
    this.torchLight.position.copy(wp).add(V3(0, 0.4, 0));
    this.torchLight.intensity = (this.zone === 'world' ? 6 + (1 - this.scenery.dayK) * 26 : 22) * (0.92 + Math.random() * 0.12);
  }
  giveWeapon(k) {
    const h = this.hero;
    if (!h.weapons.includes(k)) h.weapons.push(k);
    this.ui.banner('New weapon', WEAPONS[k].name, 'gold');
    this.sfx.sting('good');
    this.equip(k, true);
    this.save();
  }
  addMat(k, n = 1, at) {
    const h = this.hero;
    h.mats[k] = (h.mats[k] || 0) + n;
    if (at) this.fx.text(at.clone().add(V3(0, 1.9, 0)), `+${n} ${MATERIALS[k].name.toLowerCase()}`, 'gold');
    else this.ui.toast(`+${n} ${MATERIALS[k].name}`);
  }
  takeOre(pt) {
    const h = this.hero, today = Math.floor(this.day());
    (h.flags.ore = h.flags.ore || {})[pt.id] = today;
    pt.mesh.visible = false; pt.opened = true;
    this.player.actor.once('PickUp', 1.4);
    this.sfx.clang();
    this.fx.burst(V3(pt.x, this.phys.ground(pt.x, pt.z) + 0.8, pt.z), 0xffa040, 18, 3, 1);
    this.addMat('iron', 1 + (Math.random() < 0.4 ? 1 : 0), V3(pt.x, this.phys.ground(pt.x, pt.z), pt.z));
  }

  // ================================================================== horses: breeds you can buy, sell or steal
  horseEntity() { return this.entities.find(e => e.type === 'horse' && e.owned); }
  spawnOwnedHorse(breed, x, z) {
    const old = this.horseEntity();
    if (old) { if (this.player.mount === old) this.dismount(); this.removeEntity(old); }
    const st = PLANS.emberfall.stable;
    const e = this.addEntity({ type: 'horse', name: HORSES[breed].name, def: { name: HORSES[breed].name }, model: 'horse', tint: HORSES[breed].tint, x: x ?? st.x + st.w / 2 + 6, z: z ?? st.z, zone: 'world' });
    e.radius = 1; e.timer = 3; e.owned = true; e.breed = breed;
    this.hero.ownsHorse = true;
    return e;
  }
  buyBreed(k) {
    const h = this.hero;
    if (!h.horses.includes(k)) h.horses.push(k);
    h.horse = k;
    this.spawnOwnedHorse(k);
    this.ui.banner('New horse', `${HORSES[k].name} — ride with E, whistle with H`, 'good');
    this.save();
  }
  pickHorse(k) { this.hero.horse = k; this.spawnOwnedHorse(k); this.ui.toast(`The ${HORSES[k].name} is saddled and waiting outside the stable.`); }
  sellBreed(k) {
    const h = this.hero;
    h.horses = h.horses.filter(x => x !== k);
    h.gold += Math.floor(HORSES[k].price / 2); this.sfx.coin();
    if (h.horse === k) { h.horse = h.horses[0] || null; if (h.horse) this.spawnOwnedHorse(h.horse); else { const e = this.horseEntity(); if (e) this.removeEntity(e); h.ownsHorse = false; } }
    this.ui.toast(`Sold the ${HORSES[k].name}.`);
  }

  // ================================================================== missions
  onKill(e, by) {
    const h = this.hero, k = e.key;
    if ((k === 'wolf' || k === 'icewolf') && h.quests.wolves === 0 && Math.hypot(e.pos.x - WOOD.x, e.pos.z - WOOD.z) < WOOD.r + 60) h.counters.wolf = (h.counters.wolf || 0) + 1;
    if (e.bertWolf && h.quests.bertram === 1) h.counters.bertwolf = (h.counters.bertwolf || 0) + 1;
    if (e.camp2 && h.quests.camp === 0) h.counters.camp = (h.counters.camp || 0) + 1;
    if (k === 'nightknife' && h.quests.nightknife === 0) this.setStep('nightknife', 1);
    if (e.camp2 || k === 'nightknife' || e.bertWolf) { const q = e.camp2 ? 'camp' : e.bertWolf ? 'bertram' : null; if (q && h.quests[q] !== undefined) { const st = QUESTS[q].steps[h.quests[q]]; if (st && st.count) this.ui.toast(`${QUESTS[q].title}: ${h.counters[st.count] || 0}/${st.need}`); } }
    if (k === 'wolf' && h.quests.wolves === 0) this.ui.toast(`Wolves hunted: ${h.counters.wolf || 0}/6`);
    this.checkCounters();
    // the last enemy standing goes down in slow motion
    if (by === 'player' && !this.entities.some(o => o !== e && o.type === 'mob' && !o.dead && o.near && this.isHostile(o) && o.state === 'chase' && o.pos.distanceTo(this.player.pos) < 30)) this.finalBlow(e);
  }
  finalBlow(e) {
    if (this.arenaRun && this.arenaRun.left > 0) return;
    this.slowT = Math.max(this.slowT, 0.9); this.finalT = 1.1;
    this.shake(0.3);
    this.ui.flash('rgba(255,240,200,.35)', 260);
  }
  missionSpawns() {
    const C = SITES.camp;
    // the Red Hand camp
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const e = this.spawnMob('redhand', C.x + Math.cos(a) * 7, C.z + Math.sin(a) * 7); e.camp2 = true; }
    const chief = this.spawnMob('redchief', C.x + 1, C.z - 3, { id: 'redchief' }); chief.camp2 = true;
    // iron ore in the wood
    this.ores = ORE.map(([x, z], i) => {
      const y = this.phys.ground(x, z), mesh = part('nature', 'rock_single_' + 'ABCDE'[i % 5], 2.2);
      mesh.position.set(x, y - 0.2, z);
      mesh.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0x8a7a6a); o.material.emissive = new THREE.Color(0xff6a10); o.material.emissiveIntensity = 0.25; } });
      this.scene.add(mesh);
      const pt = { id: 'ore' + i, x, z, zone: 'world', range: 2.8, label: 'Mine the iron ore', mesh };
      pt.act = () => this.takeOre(pt);
      this.points.push(pt);
      return pt;
    });
    // a board outside the Guild, the pit master at the arena gate, and the stablemaster
    const G = PLANS.emberfall.landmarks.guild, A = PLANS.emberfall.arena;
    if (G) this.points.push({ id: 'guildboard', x: G.x + Math.sin(G.rot) * 7 + Math.cos(G.rot) * 3, z: G.z + Math.cos(G.rot) * 7 - Math.sin(G.rot) * 3, zone: 'world', range: 2.6, label: 'Read the Guild contracts', act: () => this.talkTo({ name: 'Contract board', def: { title: "Adventurers' Guild" } }, 'guild') });
    if (A) {
      const ga = this.scenery.arenaInfo ? this.scenery.arenaInfo.gateA : 0;
      const x = A.x + Math.cos(ga) * (A.r + 4) + Math.cos(ga + Math.PI / 2) * 3, z = A.z + Math.sin(ga) * (A.r + 4) + Math.sin(ga + Math.PI / 2) * 3;
      const pm = this.addEntity({ type: 'npc', npcId: 'pitmaster', name: 'Brakka', def: { name: 'Brakka', title: 'Pit Master' }, model: 'barbarian', gear: ['2H_Axe'], hat: true, tint: '#c8a070', x, z, rot: ga, zone: 'world' });
      pm.talk = 'pitmaster'; pm.face = ga + Math.PI;
    }
    const tom = this.entities.find(e => e.npcId === 'tom'); if (tom) tom.talk = 'stable';
  }
  // the parts that depend on the save
  heroSpawns() {
    const h = this.hero;
    for (const pt of this.ores || []) { const day = (h.flags.ore || {})[pt.id]; const gone = day !== undefined && Math.floor(this.day()) - day < 1; pt.opened = gone; pt.mesh.visible = !gone; }
    if (h.quests.bertram !== undefined && h.quests.bertram < 3) this.spawnBertram();
    if (h.quests.nightknife === 0) this.questStarted('nightknife');
    if (h.horse && !this.horseEntity()) this.spawnOwnedHorse(h.horse, h.horsePos && h.horsePos[0], h.horsePos && h.horsePos[1]);
  }
  spawnBertram() {
    if (this.byId('bertram')) return;
    const b = this.addEntity({ type: 'npc', id: 'bertram', npcId: 'bertram', name: 'Bertram', def: { name: 'Bertram', title: 'woodcutter' }, model: 'barbarian', gear: ['1H_Axe'], hat: false, tint: '#a8865e', x: BERTRAM[0], z: BERTRAM[1], zone: 'world' });
    b.talk = 'bertram'; b.face = 0;
  }
  bertramWolves() {
    const b = this.byId('bertram'); if (!b) return;
    this.setStep('bertram', 1);
    this.hero.counters.bertwolf = 0;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const w = this.spawnMob('wolf', b.pos.x + Math.cos(a) * 14, b.pos.z + Math.sin(a) * 14, { aggro: true }); w.bertWolf = true; w.state = 'chase'; }
    this.sfx.roar && this.sfx.roar();
  }
  questStarted(id) {
    const h = this.hero;
    const k = { wolves: 'wolf', camp: 'camp', bertram: 'bertwolf' }[id];
    if (k) h.counters[k] = 0;
    if (id === 'bertram') this.spawnBertram();
    if (id === 'nightknife' && !this.byId('nightknife')) { const [x, z] = PLANS.emberfall.nightknife; const e = this.spawnMob('nightknife', x, z, { id: 'nightknife', night: true }); e.bossId = 'nightknife'; }
  }

  // ================================================================== the fighting pit
  startArena() {
    const A = PLANS.emberfall.arena, h = this.hero;
    if (this.arenaRun) return;
    if (h.quests.pit === undefined && !h.done.pit) this.startQuest('pit', 0);
    const tier = h.flags.pitTier || 0;
    this.arenaRun = { wave: 0, tier, ents: [], crowd: [], left: 0 };
    this.teleport(A.x + Math.cos(this.scenery.arenaInfo.gateA) * (A.r - 4), A.z + Math.sin(this.scenery.arenaInfo.gateA) * (A.r - 4), 'world');
    this.player.yaw = this.scenery.arenaInfo.gateA - Math.PI / 2 + Math.PI / 2; // face the middle
    this.player.yaw = Math.atan2(-(A.x - this.player.pos.x), -(A.z - this.player.pos.z)) + Math.PI;
    // a crowd on the stands
    const looks = [['rogue', '#d8b8a0'], ['mage', '#b8c8e8'], ['barbarian', '#e8d0a0'], ['warden', '#a8c8a0']];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17, rr = A.r + 3 + (i % 2) * 2.2, [m, tint] = looks[i % 4];
      const e = this.addEntity({ type: 'villager', name: 'Spectator', def: { name: 'Spectator' }, model: m, tint, x: A.x + Math.cos(a) * rr, z: A.z + Math.sin(a) * rr, zone: 'world', idle: 'Cheer' });
      e.stay = true; e.seated = true; e.panic = 0; e.spots = [[e.pos.x, e.pos.z]]; e.hp = e.max = 999; e.rot = Math.atan2(A.x - e.pos.x, A.z - e.pos.z); e.pos.y += 1.6 + (i % 2) * 1.2; e.spectator = true;
      this.arenaRun.crowd.push(e);
    }
    this.nextWave();
  }
  nextWave() {
    const R = this.arenaRun, A = PLANS.emberfall.arena;
    R.wave++;
    const t = R.tier, waves = [['pitfighter', 'pitfighter', 'pitfighter'], ['pitfighter', 'pitfighter', 'pitfighter', 'pitfighter'], ['pitfighter', 'pitfighter', 'pitbrute']];
    const list = waves[R.wave - 1].concat(t >= 1 ? ['pitfighter'] : [], t >= 2 ? ['pitbrute'] : []);
    this.ui.banner(`ROUND ${R.wave}`, R.wave === 3 ? 'Final round!' : 'Fight!', 'boss');
    this.sfx.sting('evil');
    R.left = list.length;
    list.forEach((k, i) => {
      const a = (i / list.length) * Math.PI * 2 + 0.5;
      const e = this.spawnMob(k, A.x + Math.cos(a) * 9, A.z + Math.sin(a) * 9, { aggro: true });
      e.arena = true; e.state = 'chase'; e.alerted = true; e.hp = e.max = Math.round(e.max * (1 + t * 0.35));
      R.ents.push(e);
    });
  }
  arenaKill(e) {
    const R = this.arenaRun;
    setTimeout(() => this.entities.includes(e) && this.removeEntity(e), 4000);
    if (!R) return;
    R.left--;
    R.crowd.forEach(c => c.actor.once('Cheer', 1.2, 'Cheer'));
    this.sfx.crowd ? this.sfx.crowd() : this.sfx.chime();
    if (R.left > 0) return;
    this.finalT = 1.1; this.slowT = 0.9;
    if (R.wave < 3) { setTimeout(() => this.arenaRun && this.nextWave(), 2600); return; }
    // won the bout
    const h = this.hero, gold = 60 + R.tier * 50;
    setTimeout(() => {
      h.gold += gold; this.sfx.coin();
      this.ui.banner('CHAMPION OF THE PIT', `+${gold} gold · +${80 + R.tier * 40} XP`, 'gold');
      this.gainXP(80 + R.tier * 40);
      h.flags.pitTier = Math.min(4, R.tier + 1);
      if (h.quests.pit === 0) this.completeQuest('pit');
      this.endArena();
    }, 1500);
  }
  arenaLose() {
    const h = this.hero, A = PLANS.emberfall.arena, ga = this.scenery.arenaInfo.gateA;
    h.hp = Math.ceil(this.maxHp() * 0.35);
    this.ui.banner('DEFEATED', 'The crowd boos. Brakka drags you out.', 'bad');
    this.endArena();
    this.teleport(A.x + Math.cos(ga) * (A.r + 6), A.z + Math.sin(ga) * (A.r + 6), 'world');
  }
  endArena() {
    const R = this.arenaRun; if (!R) return;
    this.arenaRun = null;
    for (const e of [...R.crowd, ...R.ents]) if (this.entities.includes(e)) this.removeEntity(e);
  }

  save() {
    if (!this.hero || !this.player || (this.net && this.net.guest)) return;
    const h = this.hero, p = this.player;
    const inB = this.zone === 'barrow', inR = this.zone === 'inside' && this.rooms.door;
    h.pos = inR ? [this.rooms.door.ox, this.rooms.door.oz] : inB ? [this.scenery.barrowDoor.x, this.scenery.barrowDoor.z + 4] : [Math.round(p.pos.x * 10) / 10, Math.round(p.pos.z * 10) / 10];
    h.zone = 'world';
    h.yaw = p.yaw;
    const horse = this.entities.find(e => e.type === 'horse' && e.owned);
    if (horse) h.horsePos = [horse.pos.x, horse.pos.z];
    try { localStorage.setItem(SAVE, JSON.stringify({ hero: h, t: Date.now() })); } catch { /* storage may be off */ }
  }

  adapt(dt) {
    if (dt > 1) return;
    this.fAcc = (this.fAcc || 0) + dt;
    this.fN = (this.fN || 0) + 1;
    if (this.fAcc < 2.5) return;
    const avg = this.fAcc / this.fN;
    this.fAcc = this.fN = 0;
    this.quality = this.quality || 0;
    if (avg < 0.04 || this.quality >= 3 || this.state !== 'play') return;
    this.quality++;
    if (this.quality === 1) this.renderer.setPixelRatio(1);
    if (this.quality === 2) { this.renderer.shadowMap.enabled = false; this.scenery.sun.castShadow = false; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    if (this.quality === 3) this.renderer.setPixelRatio(0.7);
    this.resize();
  }
}

const game = new Game();
game.boot().catch(e => { console.error(e); $('loadErr').textContent = 'Something went wrong loading the realm: ' + e.message; });
