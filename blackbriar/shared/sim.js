// Authoritative world simulation. Runs on the co-op server, and inside the browser for solo play.
// All shared progress (money, debris, dirt masks, doors, discoveries, upgrades, clock, the Monitor) lives here.
import { CONFIG } from './config.js';
import { tickStalker, resetStalker } from './stalker.js';
import {
  ROOMS, DOORS, LOCKERS, SEARCHABLE, TEACHER_DESK, CAFE_KEY, BUCKET, CART_HOME, ROOMBA_DOCK, groundY, DEBRIS, DEBRIS_TOTAL_BY_ROOM, PATCHES, initialMask, CLUE_SPOT, CLUES, BINS, TOOL_RACK,
  COMPUTER, COT, VENT, SPAWN, LIGHTS, PATROL, WATCH_POINTS, LAIR, roomAt, progressRoom, solidRects, segBlocked, wallsBetween,
  buildNav, findPath, doorCenter, rng, NAV,
} from './level.js';

const b64enc = (u8) => { if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const b64dec = (s) => { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const PATCH = Object.fromEntries(PATCHES.map(p => [p.id, p]));
const NAVGRID = buildNav();
const OFFICE = ROOMS.office;
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
const angDiff = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export function gameClock(shiftT) { // minutes since midnight, wrapping (22:00 -> 04:00)
  const m = 22 * 60 + Math.min(360, shiftT / CONFIG.shiftSeconds * 360);
  return m % (24 * 60);
}
export function clockText(shiftT) { const m = Math.floor(gameClock(shiftT)); let h = Math.floor(m / 60), mm = m % 60; const ap = h >= 12 && h < 24 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, '0')} ${ap}`; }
export function vacStats(up) { const s = up.suction || 0; return { reach: CONFIG.vacuum.reach[s], accel: CONFIG.vacuum.accel[s], cone: CONFIG.vacuum.coneDeg[s] + (up.wide ? CONFIG.vacuum.wideCone : 0), film: CONFIG.vacuum.filmRadius[up.wide || 0], bag: CONFIG.vacuum.bag[up.bag || 0], noise: CONFIG.vacuum.noise[up.quiet || 0] }; }
export function mopStats(up) { return { radius: CONFIG.mop.radius[up.mop || 0], capacity: CONFIG.mop.capacity[up.mopcap || 0] }; }
export const piecePay = (id) => DEBRIS[id].kind === 5 ? CONFIG.pay.coin : CONFIG.pay.piece;
// server-side spatial hash of the original debris positions (robot vacuums use it)
const DGRID = new Map(); for (const d of DEBRIS) { const k = Math.floor(d.x) + ',' + Math.floor(d.z); if (!DGRID.has(k)) DGRID.set(k, []); DGRID.get(k).push(d.id); }

export class Sim {
  constructor(save, opts = {}) {
    this.opts = opts;
    this.out = [];
    this.rand = rng((Date.now() & 0xffff) + 7);
    this.players = new Map(); // pid -> runtime
    this.fresh();
    if (save) this.load(save);
    this.nightStart = (save && save.night) || this.serializeCore();
    this.resetMonster(true);
  }
  fresh() {
    this.day = 1; this.money = 0; this.shiftT = 0; this.phase = 'shift'; this.timeScale = 1;
    this.collected = new Uint8Array(DEBRIS.length);
    this.masks = {}; this.maskInit = {}; this.maskSum = {};
    this.maskBest = {};
    for (const p of PATCHES) { const m = initialMask(p); this.masks[p.id] = m; this.maskBest[p.id] = Uint8Array.from(m); this.maskInit[p.id] = m.reduce((a, b) => a + b, 0); this.maskSum[p.id] = this.maskInit[p.id]; }
    this.keys = {}; this.found = []; this.cart = { ...CART_HOME, holder: null }; this.roombas = []; this.searchedDesk = false;
    this.doors = Object.fromEntries(DOORS.map(d => [d.id, { open: d.id === 'd_office', bolted: false }]));
    this.lockers = {};
    this.discoveries = []; this.purchased = []; this.upgrades = { suction: 0, bag: 0, quiet: 0, light: 0 };
    this.roomBonus = {}; this.inv = {}; this.firedPA = {};
    this.shiftStats = this.newStats(); this.summary = null; this.safeT = 0;
    this.collectedByRoom = {};
  }
  newStats() { return { earned: 0, pieces: 0, cells: 0, caught: 0, disc: [] }; }

  // ---------- persistence ----------
  serialize() { const s = this.serializeCore(); s.night = this.nightStart || null; return s; }
  serializeCore() {
    return {
      v: CONFIG.saveVersion, savedAt: Date.now(), day: this.day, money: +this.money.toFixed(4), shiftT: this.shiftT, phase: this.phase === 'summary' ? 'summary' : this.phase === 'gameover' ? 'shift' : this.phase,
      collected: b64enc(this.collected), masks: Object.fromEntries(Object.entries(this.masks).map(([k, v]) => [k, b64enc(v)])),
      doors: this.doors, lockers: this.lockers, discoveries: this.discoveries, purchased: this.purchased, roomBonus: this.roomBonus,
      inv: this.inv, firedPA: this.firedPA, shiftStats: this.shiftStats, summary: this.summary,
      best: Object.fromEntries(Object.entries(this.maskBest).map(([k, v]) => [k, b64enc(v)])), keys: this.keys, found: this.found, searchedDesk: this.searchedDesk,
      cart: { x: this.cart.x, z: this.cart.z, yaw: this.cart.yaw }, roombas: this.roombas.map(r => ({ id: r.id, x: r.x, z: r.z, yaw: r.yaw, state: r.state === 'carried' ? 'idle' : r.state, bag: r.bag })),
    };
  }
  load(s) {
    if (!s || s.v !== CONFIG.saveVersion) throw new Error('Unsupported save version ' + (s && s.v));
    this.day = s.day; this.money = s.money; this.shiftT = s.shiftT; this.phase = s.phase;
    const c = b64dec(s.collected); if (c.length === DEBRIS.length) this.collected = c; else if (c.length < DEBRIS.length) this.collected.set(c); // new areas were added since this save
    for (const [k, v] of Object.entries(s.masks || {})) { const m = b64dec(v); if (this.masks[k] && m.length === this.masks[k].length) { this.masks[k] = m; this.maskSum[k] = m.reduce((a, b) => a + b, 0); } }
    Object.assign(this.doors, s.doors || {}); this.lockers = s.lockers || {};
    this.discoveries = s.discoveries || []; this.purchased = s.purchased || []; this.roomBonus = s.roomBonus || {}; this.inv = s.inv || {};
    this.firedPA = s.firedPA || {}; this.shiftStats = s.shiftStats || this.newStats(); this.summary = s.summary || null;
    for (const [k, v] of Object.entries(s.best || {})) { const m = b64dec(v); if (this.maskBest[k] && m.length === this.maskBest[k].length) this.maskBest[k] = m; }
    this.keys = s.keys || {}; this.found = s.found || []; this.searchedDesk = !!s.searchedDesk;
    if (s.cart) this.cart = { ...s.cart, holder: null };
    this.roombas = (s.roombas || []).map(r => ({ ...r, holder: null, t: 0 }));
    this.applyUpgrades();
    // a mid-shift save resumes in the office with the door shut and unbolted
    if (this.phase !== 'summary') { this.doors.d_office.bolted = false; }
  }
  applyUpgrades() {
    const has = (k) => this.purchased.includes(k);
    this.upgrades = { suction: has('suction2') ? 2 : has('suction1') ? 1 : 0, bag: has('bag2') ? 2 : has('bag1') ? 1 : 0, quiet: has('quiet1') ? 1 : 0, light: has('light1') ? 1 : 0, wide: has('wide1') ? 1 : 0, mop: has('mop1') ? 1 : 0, mopcap: has('mop2') ? 1 : 0, shoes: has('shoes1') ? 1 : 0 };
  }

  // ---------- connection ----------
  connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }
  join(pid, name) {
    let p = this.players.get(pid);
    if (!p || !p.connected) { if (this.connectedCount() >= CONFIG.maxPlayers) return { error: 'This crew is full (4 workers).' }; }
    if (!this.inv[pid]) this.inv[pid] = { vacuum: false, mop: false, name, mopDirt: 0 };
    this.inv[pid].name = name || this.inv[pid].name;
    if (!p) { p = { pid, x: SPAWN.x + (this.players.size % 2) * 0.8, y: 0, z: SPAWN.z + Math.floor(this.players.size / 2) * 0.8, yaw: SPAWN.yaw, pitch: 0, tool: 'none', act: 0, fl: 0, cr: 0, sp: 0, mv: 0, bag: 0, downed: false, downT: 0, out: false, revive: 0, lastSeen: 0 }; this.players.set(pid, p); }
    p.connected = true; p.name = this.inv[pid].name;
    this.emit({ t: 'toast', msg: `${p.name} clocked in.` }, { except: pid });
    return { ok: true, welcome: this.fullState(pid) };
  }
  leave(pid) { const p = this.players.get(pid); if (p) { p.connected = false; p.act = 0; this.emit({ t: 'toast', msg: `${p.name} disconnected.` }); } }
  fullState(pid) {
    return { t: 'welcome', you: pid, save: this.serialize(), players: this.snapPlayers(), mon: this.snapMon(), phase: this.phase, upgrades: this.upgrades, summary: this.summary, maxPlayers: CONFIG.maxPlayers, calm: !!this.opts.calm };
  }
  emit(ev, route = {}) { this.out.push({ ev, ...route }); }

  // ---------- player messages ----------
  handle(pid, m) {
    const p = this.players.get(pid); if (!p || !p.connected) return;
    const inv = this.inv[pid];
    const near = (x, z, r) => dist(p.x, p.z, x, z) < r;
    switch (m.t) {
      case 'st': {
        p.hold = !!m.hd;
        if (p.downed || p.out || p.hidden) { p.yaw = m.yw; p.pitch = m.pt; return; }
        // light sanity: reject impossible jumps (except respawns the server initiated)
        if (dist(p.x, p.z, m.p[0], m.p[2]) < 4 || p.teleportOk || (m.tp && this.opts.allowTeleport)) { p.x = m.p[0]; p.y = m.p[1]; p.z = m.p[2]; p.teleportOk = false; }
        p.yaw = m.yw; p.pitch = m.pt; p.tool = m.tool; p.act = m.act ? 1 : 0; p.fl = m.fl ? 1 : 0; p.cr = m.cr ? 1 : 0; p.sp = m.sp ? 1 : 0; p.mv = m.mv ? 1 : 0;
        p.lastSeen = this.time || 0;
        if (this.cart.holder === pid && m.cart) { this.cart.x = m.cart[0]; this.cart.z = m.cart[1]; this.cart.yaw = m.cart[2]; }
        for (const r of this.roombas) if (r.holder === pid) { r.x = p.x; r.z = p.z; }
        return;
      }
      case 'col': { // vacuum collected pieces (idempotent: each id pays once, crew-wide)
        if (!inv.vacuum || p.downed) return;
        const vs = vacStats(this.upgrades), got = [];
        for (const id of (m.ids || []).slice(0, 80)) {
          const d = DEBRIS[id]; if (!d || this.collected[id]) continue;
          if (p.bag >= vs.bag) { this.emit({ t: 'bagfull' }, { to: pid }); break; }
          if (dist(p.x, p.z, d.x, d.z) > vs.reach + 2.5) continue;
          this.collected[id] = 1; p.bag++; got.push(id);
          const pay = piecePay(id); this.money += pay; this.shiftStats.earned += pay; this.shiftStats.pieces++;
        }
        if (got.length) { this.emit({ t: 'col', ids: got, by: pid }); this.emit({ t: 'bag', bag: p.bag }, { to: pid }); this.checkRooms(); }
        return;
      }
      case 'mop': { // exact spatial cleaning: circles erased from a persistent mask. Commutative, so order never matters.
        const P = PATCH[m.patch]; if (!P) return;
        const viaVac = m.k === 'vac';
        if (viaVac ? !inv.vacuum : !inv.mop) return;
        if (P.type === 'mud' && viaVac) return; // the vacuum cannot lift mud
        const r = viaVac ? vacStats(this.upgrades).film : mopStats(this.upgrades).radius, reach = viaVac ? vacStats(this.upgrades).reach : CONFIG.mop.reach;
        const pts = (m.pts || []).slice(0, 40).filter(([x, z, s]) => near(x, z, reach + 2.5)).map(([x, z, s]) => [x, z, Math.max(0, Math.min(255, s | 0))]);
        if (!pts.length) return;
        let res;
        if (viaVac) res = this.erase(P, pts, r);
        else { // a mop gets dirtier as it lifts mud: weaker, then it starts smearing dirt back down
          const cap = mopStats(this.upgrades).capacity; let dirt = inv.mopDirt || 0;
          res = this.erase(P, pts.map(([x, z, s]) => [x, z, Math.round(s * (1 - 0.8 * Math.min(1, dirt)))]), r, dirt > 0.75 ? Math.round(CONFIG.mop.smear * (dirt - 0.75) / 0.25) : 0);
          if (P.type === 'mud') dirt = Math.min(1, dirt + res.removed / cap); else dirt = Math.min(1, dirt + res.removed / cap * 0.25);
          if (Math.abs(dirt - (inv.mopDirt || 0)) > 0.004 || dirt >= 1) { inv.mopDirt = dirt; this.emit({ t: 'mopdirt', v: dirt }, { to: pid }); }
        }
        const cells = res.paid;
        if (cells > 0) {
          const pay = (P.type === 'mud' ? CONFIG.pay.mudCell : CONFIG.pay.dustCell) * cells;
          this.money += pay; this.shiftStats.earned += pay; this.shiftStats.cells += cells;
        }
        this.emit(this.region(P, res.box));
        if (P.id === CLUE_SPOT.patch) this.checkClueSpot();
        this.checkRooms();
        return;
      }
      case 'door': {
        const d = DOORS.find(x => x.id === m.id); if (!d) return; const c = doorCenter(d); if (!near(c.x, c.z, 2.3)) return;
        const st = this.doors[d.id];
        if (d.lock && !this.keys[d.lock]) { this.emit({ t: 'toast', msg: 'Locked and chained. The tag on the chain reads STAIRWELL W. There must be a key somewhere on this floor.' }, { to: pid }); this.emit({ t: 'sfx', k: 'rattle', x: c.x, z: c.z }); return; }
        if (st.bolted) { this.emit({ t: 'toast', msg: inOffice(p) ? 'Slide the bolt back first.' : 'Bolted from the inside.' }, { to: pid }); this.emit({ t: 'sfx', k: 'rattle', x: c.x, z: c.z }); return; }
        st.open = !st.open; this.emit({ t: 'door', id: d.id, open: st.open, bolted: st.bolted, by: pid }); this.noise(c.x, c.z, CONFIG.noise.door);
        return;
      }
      case 'bolt': {
        const d = DOORS.find(x => x.id === 'd_office'), c = doorCenter(d), st = this.doors.d_office;
        if (!near(c.x, c.z, 2.3) || !inOffice(p)) { this.emit({ t: 'toast', msg: 'The bolt is on the inside of the door.' }, { to: pid }); return; }
        if (st.open) { this.emit({ t: 'toast', msg: 'Shut the door first.' }, { to: pid }); return; }
        st.bolted = !st.bolted; this.emit({ t: 'door', id: d.id, open: st.open, bolted: st.bolted, by: pid }); this.noise(c.x, c.z, CONFIG.noise.bolt);
        return;
      }
      case 'take': {
        if (!near(TOOL_RACK.x, TOOL_RACK.z, 2.2) || !['vacuum', 'mop'].includes(m.tool)) return;
        if (inv[m.tool]) return;
        inv[m.tool] = true; this.emit({ t: 'inv', inv }, { to: pid });
        this.emit({ t: 'toast', msg: m.tool === 'vacuum' ? `${p.name} took a vacuum.` : `${p.name} took a mop.` }, { except: pid });
        return;
      }
      case 'rinse': {
        const atBucket = near(BUCKET.x, BUCKET.z, 1.8) || near(this.cart.x, this.cart.z, 1.9);
        if (!atBucket || !inv.mop) return; inv.mopDirt = 0; this.emit({ t: 'mopdirt', v: 0, rinsed: true }, { to: pid }); this.emit({ t: 'sfx', k: 'rinse', x: p.x, z: p.z });
        return;
      }
      case 'cart': {
        if (this.cart.holder === pid) { this.cart.holder = null; this.emit({ t: 'cart', ...this.cart }); return; }
        if (this.cart.holder || !near(this.cart.x, this.cart.z, 2.0)) return;
        this.cart.holder = pid; this.emit({ t: 'cart', ...this.cart }); return;
      }
      case 'roomba': {
        const r = this.roombas.find(r => r.id === m.id); if (!r) return;
        if (r.holder === pid) { // set it down where you stand; it starts cleaning
          r.holder = null; r.x = p.x + Math.sin(p.yaw) * -0.6; r.z = p.z + Math.cos(p.yaw) * -0.6; r.state = r.bag >= CONFIG.roomba.bag ? 'full' : 'run'; r.yaw = p.yaw + Math.PI; this.emit({ t: 'toast', msg: r.state === 'full' ? 'Its bin is full. Pick it up again to empty it.' : 'The robot vacuum chirps and sets off.' }, { to: pid });
        } else if (!r.holder && near(r.x, r.z, 1.8)) { if (r.bag) { this.emit({ t: 'toast', msg: `You empty the robot (${r.bag} pieces).` }, { to: pid }); r.bag = 0; } r.holder = pid; r.state = 'carried'; }
        return;
      }
      case 'cafekey': {
        if (!near(CAFE_KEY.x, CAFE_KEY.z, 2.0)) return;
        if (this.keys.cafekey) return;
        this.keys.cafekey = true; this.emit({ t: 'keys', keys: this.keys }); this.emit({ t: 'toast', msg: 'A key on a lanyard hangs from the lifeguard chair. The tag reads CAFETERIA — STORAGE.' }, { to: pid });
        return;
      }
      case 'desk': {
        if (!near(TEACHER_DESK.x, TEACHER_DESK.z, 1.8)) return;
        if (this.searchedDesk) { this.emit({ t: 'toast', msg: 'Just red pens and a dried-out apple.' }, { to: pid }); return; }
        this.searchedDesk = true; this.keys.stairkey = true; this.discover('key', pid);
        this.emit({ t: 'keys', keys: this.keys });
        return;
      }
      case 'sell': {
        if (!near(COMPUTER.x, COMPUTER.z, 2.8) || !this.found.length) return;
        const total = this.found.reduce((a, f) => a + f.v, 0); this.money += total; this.shiftStats.earned += total;
        this.emit({ t: 'sold', total, n: this.found.length }); this.found = []; this.emit({ t: 'found', found: [] }); this.save('sold');
        return;
      }
      case 'clockout': { // log off for the night: everyone must be in the office
        if (this.phase === 'summary' || !near(COMPUTER.x, COMPUTER.z, 2.8)) return;
        const out = [...this.players.values()].filter(o => o.connected && !o.out && !inOffice(o));
        if (out.length) { this.emit({ t: 'toast', msg: `Can't sign out yet: ${out.map(o => o.name).join(', ')} still out in the building.` }, { to: pid }); return; }
        this.endShift(false, true);
        return;
      }
      case 'empty': {
        const b = BINS.find(b => near(b.x, b.z, 1.9)) || (near(this.cart.x, this.cart.z, 1.9) ? { x: this.cart.x, z: this.cart.z } : null); if (!b || p.bag === 0) return;
        const n = p.bag; p.bag = 0; this.emit({ t: 'bag', bag: 0, emptied: n }, { to: pid }); this.emit({ t: 'sfx', k: 'empty', x: b.x, z: b.z }); this.noise(b.x, b.z, CONFIG.noise.empty);
        return;
      }
      case 'locker': {
        const L = LOCKERS.find(l => l.id === m.id); const S = SEARCHABLE[m.id]; if (!L || !S || !near(L.x, L.z, 1.7)) return;
        const st = this.lockers[m.id] || (this.lockers[m.id] = { open: false, searched: false });
        st.open = !st.open; this.noise(L.x, L.z, CONFIG.noise.locker);
        let note = null;
        if (st.open && !st.searched) {
          st.searched = true; note = S.note;
          if (S.item === 'supplies') { this.money += 2; this.shiftStats.earned += 2; note += ' (+$2.00)'; }
          if (S.item && S.item.startsWith('coins:')) { const c = +S.item.slice(6); this.money += c; this.shiftStats.earned += c; }
          if (S.item && S.item.startsWith('loot:')) { const [, n, v] = S.item.split(':'); this.found.push({ n, v: +v }); this.emit({ t: 'found', found: this.found }); }
          if (S.item && S.item.startsWith('clue:')) this.discover(S.item.slice(5), pid);
        }
        this.emit({ t: 'locker', id: m.id, ...st, note, by: pid });
        return;
      }
      case 'vent': if (near(VENT.x, VENT.z, 1.9)) this.discover('vent_voice', pid); return;
      case 'plate': if (this.day >= 2 && near(0.3, 1.8, 2.6)) this.discover('plate014', pid); return;
      case 'buy': {
        const sk = CONFIG.skills[m.skill]; if (!sk || !near(COMPUTER.x, COMPUTER.z, 2.8)) return;
        const fail = (msg) => this.emit({ t: 'buyfail', skill: m.skill, msg }, { to: pid });
        if (this.purchased.includes(m.skill)) return fail('Already installed.');
        if (sk.needs && !this.purchased.includes(sk.needs)) return fail('Requires ' + CONFIG.skills[sk.needs].name + '.');
        if (this.money + 1e-9 < sk.cost) return fail('Not enough crew balance.');
        this.money -= sk.cost; this.purchased.push(m.skill); this.applyUpgrades();
        if (m.skill.startsWith('roomba')) this.roombas.push({ id: m.skill, x: ROOMBA_DOCK.x + this.roombas.length * 0.6, z: ROOMBA_DOCK.z, yaw: 0, state: 'idle', bag: 0, holder: null, t: 0 });
        this.emit({ t: 'buy', skill: m.skill, by: pid, upgrades: this.upgrades, money: this.money });
        this.save('purchase');
        return;
      }
      case 'revive': {
        const tgt = this.players.get(m.pid); if (!tgt || !tgt.downed || p.downed || !near(tgt.x, tgt.z, 1.8)) return;
        tgt.revive += 0.25; if (tgt.revive >= 3) { tgt.downed = false; tgt.revive = 0; this.emit({ t: 'revived', pid: tgt.pid, by: pid }); }
        return;
      }
      case 'ping': this.emit({ t: 'ping', pid, x: m.x, y: m.y, z: m.z, kind: m.kind || 'look' }); return;
      case 'wait': { // at the cot: skip ahead to 4:00 when the whole crew is safely locked in
        if (!near(COT.x, COT.z, 2.2) || this.phase !== 'shift') return;
        if (!this.allSafe()) { this.emit({ t: 'toast', msg: 'Everyone has to be inside with the bolt across before you can rest.' }, { to: pid }); return; }
        this.timeScale = 30; this.emit({ t: 'toast', msg: 'You lie down. The clock moves faster than it should.' });
        return;
      }
      case 'hide': { // squeeze into a hall locker
        const L = LOCKERS.find(l => l.id === m.id); if (!L || p.hidden || p.downed || p.out || dist(p.x, p.z, L.x, L.z) > 1.5 || this.lockers[L.id]?.open) return;
        const mon = this.mon; // did it see you get in? (judged from where you stood)
        mon.sawHide = mon.state === 'hunt' && mon.target === pid && dist(mon.x, mon.z, p.x, p.z) < 16 && !segBlocked(mon.x, mon.z, p.x, p.z, solidRects(this.doors), { sight: true });
        p.hidden = L.id; p.hx = L.x; p.hz = L.side === 'n' ? L.z + 0.5 : L.z - 0.5; p.x = L.x; p.z = L.z;
        this.emit({ t: 'hidden', pid, id: L.id, on: 1 }); this.emit({ t: 'sfx', k: 'lockerclose', x: L.x, z: L.z }); this.noise(L.x, L.z, CONFIG.noise.locker);
        return;
      }
      case 'unhide': { if (!p.hidden) return; const L = LOCKERS.find(l => l.id === p.hidden); p.hidden = null; if (L) { p.x = L.x; p.z = L.side === 'n' ? L.z + 0.55 : L.z - 0.55; p.teleportOk = true; this.emit({ t: 'teleport', x: p.x, z: p.z, yaw: L.side === 'n' ? Math.PI : 0 }, { to: pid }); } this.emit({ t: 'hidden', pid, on: 0 }); return; }
      case 'blink': p.blinkT = 0.45; return;
      case 'retry': if (this.phase === 'gameover') this.restartNight(); return;
      case 'sleep': {
        if (this.phase !== 'summary') return;
        this.startDay(this.day + 1);
        return;
      }
    }
  }

  // ---------- cleaning helpers ----------
  erase(P, pts, r, smear = 0) {
    const m = this.masks[P.id], best = this.maskBest[P.id]; let removed = 0, paid = 0;
    const box = [1e9, 1e9, -1, -1];
    for (const [x, z, s] of pts) {
      const ci = (x - P.x0) * P.res, cj = (z - P.z0) * P.res, rr = r * P.res;
      for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(P.h - 1, Math.ceil(cj + rr)); j++)
        for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(P.w - 1, Math.ceil(ci + rr)); i++) {
          const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / rr; if (d > 1) continue;
          const k = j * P.w + i, v = m[k];
          box[0] = Math.min(box[0], i); box[1] = Math.min(box[1], j); box[2] = Math.max(box[2], i); box[3] = Math.max(box[3], j);
          let nv = Math.max(0, v - Math.round(s * Math.sqrt(1 - d)));
          if (smear) nv = Math.min(255, nv + Math.round(smear * (1 - d)));
          if (nv === v) continue;
          if (nv < v) removed += v - nv;
          this.maskSum[P.id] += nv - v; m[k] = nv;
          if (nv < best[k]) { paid += best[k] - nv; best[k] = nv; } // each bit of floor pays once, however often it gets dirty again
        }
    }
    return { removed, paid: paid / 255, box };
  }
  region(P, box) { // authoritative values for the cells a stroke touched
    if (box[2] < 0) return { t: 'noop' };
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1, d = new Uint8Array(w * h), m = this.masks[P.id];
    for (let j = 0; j < h; j++) d.set(m.subarray((box[1] + j) * P.w + box[0], (box[1] + j) * P.w + box[0] + w), j * w);
    return { t: 'maskset', patch: P.id, i0: box[0], j0: box[1], w, h, d: b64enc(d) };
  }
  checkClueSpot() {
    if (this.discoveries.find(d => d.id === 'scratched_name')) return;
    const P = PATCH[CLUE_SPOT.patch], m = this.masks[P.id]; let s = 0, n = 0;
    for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) { const x = P.x0 + (i + 0.5) / P.res, z = P.z0 + (j + 0.5) / P.res; if (dist(x, z, CLUE_SPOT.x, CLUE_SPOT.z) < CLUE_SPOT.r) { s += m[j * P.w + i]; n++; } }
    if (n && s / n < 60) this.discover('scratched_name', null);
  }
  discover(id, pid) {
    if (this.discoveries.find(d => d.id === id) || !CLUES[id]) return;
    this.discoveries.push({ id, day: this.day, by: pid ? this.inv[pid]?.name : null }); this.shiftStats.disc.push(id);
    this.emit({ t: 'disc', id, by: pid ? this.inv[pid]?.name : null });
    this.save('discovery');
  }
  roomProgress() {
    const res = {};
    const col = {}; for (let i = 0; i < DEBRIS.length; i++) if (this.collected[i]) col[DEBRIS[i].room] = (col[DEBRIS[i].room] || 0) + 1;
    for (const room of ['hall', 'class', 'closet', 'service', 'lcorr', 'gym', 'lockers', 'pool', 'cafe', 'w014']) {
      const tot = DEBRIS_TOTAL_BY_ROOM[room] || 0, c = col[room] || 0;
      const patches = PATCHES.filter(p => p.room === room);
      let mi = 0, ms = 0; for (const p of patches) { mi += this.maskInit[p.id]; ms += this.maskSum[p.id]; }
      res[room] = { debrisLeft: tot - c, debrisTotal: tot, debris: tot ? c / tot : 1, surface: mi ? 1 - ms / mi : 1 };
      res[room].done = res[room].debris >= 0.95 && res[room].surface >= 0.92;
    }
    return res;
  }
  checkRooms() {
    const now = this.time || 0; if (this._lastRoomCheck && now - this._lastRoomCheck < 0.5) return; this._lastRoomCheck = now;
    const rp = this.roomProgress();
    for (const [room, r] of Object.entries(rp)) if (r.done && !this.roomBonus[room]) {
      this.roomBonus[room] = true; const b = CONFIG.roomBonus[room] || 0; this.money += b; this.shiftStats.earned += b;
      this.emit({ t: 'roomdone', room, name: ROOMS[room].name, bonus: b });
      this.save('room complete');
    }
  }

  // ---------- noise, light, safety ----------
  noise(x, z, radius, pid) { (this.noises || (this.noises = [])).push({ x, z, r: radius, pid, t: this.time || 0 }); }
  lightAt(x, z) {
    let l = 0; for (const L of LIGHTS) { if (L.state === 'off' || L.emergency) continue; const d = dist(x, z, L.x, L.z); if (d < 5.5) l += (L.state === 'flicker' ? 0.5 : 1) * (1 - d / 5.5); }
    return Math.min(1, l);
  }
  allSafe() {
    const st = this.doors.d_office;
    for (const p of this.players.values()) if (p.connected && !p.out && !(inOffice(p) && st.bolted && !st.open)) return false;
    return true;
  }

  // ---------- the clock ----------
  tick(dt) {
    this.time = (this.time || 0) + dt;
    if (this.phase === 'summary' || this.phase === 'gameover') { this.snapTimer(dt); return; }
    this.shiftT += dt * this.timeScale;
    if (!this.keys['014'] && (this.day > 1 || this.shiftT > CONFIG.shiftSeconds * 0.3)) {
      this.keys['014'] = true; this.emit({ t: 'keys', keys: this.keys, quiet: true });
      this.emit({ t: 'toast', msg: 'Somewhere in the east hallway, a door that is not on the floor plan is standing open.' });
      if (!this.opts.calm) this.emit({ t: 'pa', text: 'Room zero one four is now open. Room zero one four, please.' });
    }
    const min = gameClock(this.shiftT);
    const pa = (key, text) => { if (this.opts.calm) return; if (!this.firedPA[key]) { this.firedPA[key] = 1; this.emit({ t: 'pa', text }); } };
    if (this.shiftT > 3) pa('d' + this.day + 'start', this.day === 1 ? 'Good evening. The building is closed. Attendance will be taken at four.' : 'Good evening. Attendance will be taken at four. Room zero one four is expected.');
    if (this.shiftT > CONFIG.shiftSeconds * 0.42) pa('d' + this.day + 'mid', 'Would Margaret Arden please return to her assigned room.');
    if (this.shiftT >= CONFIG.shiftSeconds * (330 / 360)) pa('d' + this.day + '330', 'It is three thirty. All students should now make their way to their assigned rooms.');
    if (this.shiftT >= CONFIG.shiftSeconds * (350 / 360)) pa('d' + this.day + '350', 'Final headcount in ten minutes. Do not answer the register from outside your room.');
    if (this.phase === 'shift' && this.shiftT >= CONFIG.shiftSeconds) {
      this.phase = 'lockdown'; this.timeScale = 1; this.safeT = 0;
      this.emit({ t: 'phase', phase: 'lockdown' }); pa('d' + this.day + '400', 'Four o\'clock. The headcount has begun.');
    }
    if (this.phase === 'lockdown' && this.opts.calm && this.allSafe()) { this.safeT += dt; if (this.safeT >= CONFIG.lockdownGrace) this.endShift(false); }
    // downed workers
    for (const p of this.players.values()) {
      if (!p.downed) continue; p.downT -= dt;
      if (!p.connected || p.downT <= 0) { p.downed = false; p.out = true; this.emit({ t: 'out', pid: p.pid }); this.checkWipe(); }
    }
    this.tickMonitor(dt);
    this.tickRoombas(dt);
    this.snapTimer(dt);
    this.saveTimer = (this.saveTimer || 0) + dt; if (this.saveTimer > 20) { this.saveTimer = 0; this.save('periodic'); }
  }
  snapTimer(dt) { this.snapT = (this.snapT || 0) + dt; if (this.snapT >= 0.1) { this.snapT = 0; this.emit({ t: 'snap', shiftT: this.shiftT, phase: this.phase, money: this.money, players: this.snapPlayers(), mon: this.snapMon(), safeT: this.safeT, cart: [this.cart.x, this.cart.z, this.cart.yaw, this.cart.holder], rb: this.roombas.map(r => [r.id, +r.x.toFixed(3), +r.z.toFixed(3), +r.yaw.toFixed(3), r.state, r.holder, r.bag]) }); } }
  snapPlayers() { return [...this.players.values()].filter(p => p.connected).map(p => ({ pid: p.pid, name: p.name, x: p.x, y: p.y, z: p.z, yw: p.yaw, pt: p.pitch, tool: p.tool, act: p.act, fl: p.fl, cr: p.cr, dn: p.downed ? 1 : 0, hid: p.hidden ? 1 : 0, dnT: p.downT, out: p.out ? 1 : 0, bag: p.bag, rv: p.revive })); }
  snapMon() { const m = this.mon; return m ? { x: m.x, z: m.z, yaw: m.yaw, st: m.state, mv: m.moving, lx: m.lookX, lz: m.lookZ, v: m.visible, fr: m.frozen ? 1 : 0, tp: m.tpN || 0 } : null; }
  save(reason) { if (this.opts.onSave) this.opts.onSave(this.serialize(), reason); }
  endShift(failed, clockedOut = false) {
    if (this.phase === 'summary') return;
    this.phase = 'summary'; this.cart.holder = null; for (const r of this.roombas) if (r.holder) { r.holder = null; r.state = 'idle'; }
    const rp = this.roomProgress();
    this.summary = { day: this.day, failed, clockedOut, earned: this.shiftStats.earned, pieces: this.shiftStats.pieces, cells: Math.round(this.shiftStats.cells), caught: this.shiftStats.caught, disc: this.shiftStats.disc.slice(), money: this.money, rooms: rp };
    if (failed) { const pen = Math.min(this.money, CONFIG.failPenalty * 2); this.money -= pen; this.summary.penalty = pen; }
    this.setMon('dormant');
    this.emit({ t: 'summary', summary: this.summary });
    this.save('shift end');
  }
  startDay(day) {
    this.day = day; this.dir = null; this.shiftT = 0; this.phase = 'shift'; this.timeScale = 1; this.summary = null; this.safeT = 0; this.shiftStats = this.newStats();
    this.doors.d_office.bolted = false; this.doors.d_office.open = false;
    for (const p of this.players.values()) { p.downed = false; p.out = false; p.bag = p.bag; this.respawnInOffice(p); }
    this.resetMonster(false);
    if (day === 2) { this.discover('room014', null); }
    this.nightStart = this.serializeCore();
    this.emit({ t: 'newday', day, save: this.serialize() });
    this.save('new day');
  }
  respawnInOffice(p) { p.x = SPAWN.x + (Math.random() - 0.5); p.z = SPAWN.z + (Math.random() - 0.5); p.teleportOk = true; this.emit({ t: 'teleport', x: p.x, z: p.z, yaw: SPAWN.yaw }, { to: p.pid }); }
  catchPlayer(p) {
    if (this.phase === 'gameover') return;
    this.shiftStats.caught++;
    this.emit({ t: 'caught', pid: p.pid });
    const others = [...this.players.values()].filter(o => o !== p && o.connected && !o.downed && !o.out);
    if (others.length) { p.downed = true; p.downT = 45; p.revive = 0; p.hidden = null; this.emit({ t: 'downed', pid: p.pid }); }
    else this.gameOver(p.pid);
  }
  checkWipe() { if (![...this.players.values()].some(p => p.connected && !p.downed && !p.out)) this.gameOver(null); }
  gameOver(pid) {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover'; this.timeScale = 1; this.setMon('dormant');
    this.emit({ t: 'gameover', pid, day: this.day, at: clockText(this.shiftT) });
    if (this.opts.onSave && this.nightStart) this.opts.onSave({ ...this.nightStart, night: this.nightStart }, 'game over'); // reloading the page means retrying the night
  }
  restartNight() {
    const ns = this.nightStart, inv = this.inv; if (!ns) return;
    this.fresh(); this.load(ns); this.inv = Object.assign(inv, ns.inv || {});
    this.phase = 'shift'; this.shiftT = 0; this.timeScale = 1; this.safeT = 0; this.summary = null;
    for (const q of this.players.values()) { q.downed = false; q.out = false; q.hidden = null; q.bag = 0; this.respawnInOffice(q); }
    this.resetMonster(false);
    this.emit({ t: 'newday', day: this.day, save: this.serialize(), retry: true });
    this.save('retry');
  }

  // ======================= ROBOT VACUUMS =======================
  tickRoombas(dt) {
    if (!this.roombas.length) return;
    const R = CONFIG.roomba, rects = solidRects(this.doors);
    for (const r of this.roombas) {
      if (r.state !== 'run') continue;
      r.t = (r.t || 0) + dt;
      const sp = R.speed * dt, nx = r.x - Math.sin(r.yaw) * sp, nz = r.z - Math.cos(r.yaw) * sp;
      const hit = rects.some(b => { const cx = Math.max(b.x0, Math.min(nx, b.x1)), cz = Math.max(b.z0, Math.min(nz, b.z1)); return (nx - cx) ** 2 + (nz - cz) ** 2 < R.radius * R.radius; }) || !roomAt(nx, nz);
      if (hit) { r.yaw += Math.PI * (0.55 + this.rand() * 0.9); this.emit({ t: 'sfx', k: 'bump', x: r.x, z: r.z }); continue; }
      r.x = nx; r.z = nz; if (this.rand() < dt * 0.15) r.yaw += (this.rand() - 0.5) * 1.2;
      const got = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const id of (DGRID.get((Math.floor(r.x) + a) + ',' + (Math.floor(r.z) + b)) || [])) {
        if (this.collected[id]) continue; const d = DEBRIS[id]; if (dist(d.x, d.z, r.x, r.z) > R.pickup) continue;
        this.collected[id] = 1; got.push(id); r.bag++; const pay = piecePay(id); this.money += pay; this.shiftStats.earned += pay; this.shiftStats.pieces++;
        if (r.bag >= R.bag) break;
      }
      if (got.length) this.emit({ t: 'col', ids: got, by: r.id });
      for (const P of PATCHES) if (r.x > P.x0 && r.x < P.x1 && r.z > P.z0 && r.z < P.z1 && P.type === 'dust') { const res = this.erase(P, [[r.x, r.z, 40]], 0.16); if (res.paid) { const pay = CONFIG.pay.dustCell * res.paid; this.money += pay; this.shiftStats.earned += pay; } const ev = this.region(P, res.box); if (ev.t !== 'noop') this.emit(ev); }
      if (r.bag >= R.bag) { r.state = 'full'; this.emit({ t: 'sfx', k: 'beep', x: r.x, z: r.z }); this.emit({ t: 'toast', msg: 'A robot vacuum is full and beeping.' }); }
      if (!this.opts.calm) this.noise(r.x, r.z, R.noise);
      if (got.length || r.t > 5) { r.t = 0; this.checkRooms(); }
    }
  }

  // ======================= THE MONITOR =======================
  resetMonster(initial) {
    const prev = this.mon;
    this.mon = { x: LAIR.x, z: LAIR.z, yaw: Math.PI, state: 'dormant', stateT: 0, path: null, pathT: 0, target: null, lastKnown: null, susp: {}, goal: null,
      encounters: prev?.encounters || 0, lastEncounter: -999, retreatFor: 0, watchFor: 0, firstSighting: false, doorWait: 0, moving: 0, lookX: LAIR.x, lookZ: LAIR.z - 1, visible: 1, bangT: 20, frozen: false, tpN: (prev?.tpN || 0) + 1, seenT: 0 };
    resetStalker(this);
  }
  setMon(state, extra = {}) {
    const m = this.mon; if (m.state !== state) { m.state = state; m.stateT = 0; m.path = null; this.emit({ t: 'monstate', st: state }); }
    Object.assign(m, extra);
  }
  tickMonitor(dt) {
    const m = this.mon;
    if (this.opts.calm) { if (m.state !== 'dormant') this.setMon('dormant'); m.x = 47.5; m.z = 11; m.moving = 0; m.frozen = false; this.noises = []; return; } // calm mode: no monster at all
    tickStalker(this, dt);
  }
  isInOffice(p) { return inOffice(p); }
  navFree(x, z) { const i = Math.floor((x - NAV.x0) / NAV.cell), j = Math.floor((z - NAV.z0) / NAV.cell); return i >= 0 && j >= 0 && i < NAV.w && j < NAV.h && NAVGRID[j * NAV.w + i] === 0; }
  // a worker sees it: on screen (player cameras face -z at yaw 0), nothing solid between, and enough light to make it out
  playerSees(p, m, rects) {
    const d = dist(m.x, m.z, p.x, p.z); if (d > 34) return false;
    const toMon = Math.atan2(m.x - p.x, m.z - p.z), facing = Math.atan2(-Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0));
    if (Math.abs(angDiff(facing, toMon)) > CONFIG.monitor.viewFreezeHalf && d > 0.4) return false;
    if (segBlocked(p.x, p.z, m.x, m.z, rects, { sight: true })) return false;
    return d < 3 || this.lightAt(m.x, m.z) > 0.12 || (p.fl && d < 15);
  }
  pickPatrol(lock) {
    const pts = lock ? [[21.5, 2.2], [13, 1.8], [30, 1.8], [13, -4.5], [4, 2.2], [36, 1.8]] : PATROL;
    let g; do { g = pts[this.rand() * pts.length | 0]; } while (pts.length > 1 && dist(g[0], g[1], this.mon.x, this.mon.z) < 3);
    return g;
  }
  pickWatchPoint(alive, rects, dmin, dmax) {
    const opts = [];
    for (const wp of WATCH_POINTS) for (const p of alive) { const d = dist(wp.x, wp.z, p.x, p.z); if (d > dmin && d < dmax && !segBlocked(wp.x, wp.z, p.x, p.z, rects, { sight: true })) opts.push(wp); }
    return opts.length ? opts[this.rand() * opts.length | 0] : null;
  }
  planPath(tx, tz) {
    const m = this.mon;
    const passDoor = (i) => { const d = DOORS[i], s = this.doors[d.id]; return s.open || !s.bolted; };
    m.path = findPath(NAVGRID, m.x, m.z, tx, tz, passDoor); m.pathT = 0;
    return !!m.path;
  }
  followPath(speed, dt, rects) { // returns true when arrived
    const m = this.mon;
    if (!m.path || !m.path.length) { m.moving = 0; return true; }
    // checking doors: a closed, unbolted door on the way is opened by hand, with a pause
    for (const d of DOORS) {
      const s = this.doors[d.id], c = doorCenter(d);
      if (d.lock && !this.keys[d.lock]) continue; // locked doors it simply passes (only ever while nobody is looking)
      if (!s.open && !s.bolted && dist(m.x, m.z, c.x, c.z) < 1.0) {
        m.doorWait += dt; m.moving = 0; if (m.doorWait > 0.9) { s.open = true; m.doorWait = 0; this.emit({ t: 'door', id: d.id, open: true, bolted: false, by: 'monitor' }); }
        return false;
      }
      if (s.bolted && dist(m.x, m.z, c.x, c.z) < 0.9) { m.path = null; m.moving = 0; return false; }
    }
    let left = speed * dt, dx = 0, dz = 0; // spend the whole step, across waypoints
    while (left > 1e-6 && m.path.length) {
      const [wx, wz] = m.path[0]; dx = wx - m.x; dz = wz - m.z; const d = Math.hypot(dx, dz);
      if (d < 0.15) { m.path.shift(); if (d > 1e-6) { const k = Math.min(d, left); m.x += dx / d * k; m.z += dz / d * k; left -= k; } continue; }
      const step = Math.min(d, left); m.x += dx / d * step; m.z += dz / d * step; left -= step;
    }
    m.moving = speed;
    if (!m.path.length) return true;
    if (dx || dz) m.yaw = turnTo(m.yaw, Math.atan2(dx, dz), dt * 6);
    m.lookX = m.x + Math.sin(m.yaw) * 3; m.lookZ = m.z + Math.cos(m.yaw) * 3;
    return false;
  }
  moveTo(x, z, speed, dt, rects) { if (!this.mon.path || this.mon.pathT > 2) this.planPath(x, z); this.mon.pathT += dt; this.followPath(speed, dt, rects); }
  bangDoor(dt) { const m = this.mon; m.bangT -= dt; if (m.bangT < 0) { m.bangT = 2.5 + this.rand() * 2; const c = doorCenter(DOORS.find(d => d.id === 'd_office')); if (dist(m.x, m.z, c.x, c.z) < 3) this.emit({ t: 'sfx', k: 'doorbang', x: c.x, z: c.z }); } }
}
export function inOffice(p) { return p.x > OFFICE.x0 && p.x < OFFICE.x1 && p.z > OFFICE.z0 + 0.15 && p.z < OFFICE.z1; }
function turnTo(a, b, k) { return a + Math.max(-k, Math.min(k, angDiff(a, b))); }
