// Authoritative world simulation. Runs on the co-op server, and inside the browser for solo play.
// All shared progress (money, debris, dirt masks, doors, discoveries, upgrades, clock, the Monitor) lives here.
import { CONFIG } from './config.js';
import {
  ROOMS, DOORS, LOCKERS, SEARCHABLE, DEBRIS, DEBRIS_TOTAL_BY_ROOM, PATCHES, initialMask, CLUE_SPOT, CLUES, BINS, TOOL_RACK,
  COMPUTER, COT, VENT, SPAWN, LIGHTS, PATROL, WATCH_POINTS, LAIR, roomAt, progressRoom, solidRects, segBlocked, wallsBetween,
  buildNav, findPath, doorCenter, rng,
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
export function vacStats(up) { const s = up.suction || 0; return { reach: CONFIG.vacuum.reach[s], accel: CONFIG.vacuum.accel[s], cone: CONFIG.vacuum.coneDeg[s], bag: CONFIG.vacuum.bag[up.bag || 0], noise: CONFIG.vacuum.noise[up.quiet || 0] }; }

export class Sim {
  constructor(save, opts = {}) {
    this.opts = opts;
    this.out = [];
    this.rand = rng((Date.now() & 0xffff) + 7);
    this.players = new Map(); // pid -> runtime
    this.fresh();
    if (save) this.load(save);
    this.resetMonster(true);
  }
  fresh() {
    this.day = 1; this.money = 0; this.shiftT = 0; this.phase = 'shift'; this.timeScale = 1;
    this.collected = new Uint8Array(DEBRIS.length);
    this.masks = {}; this.maskInit = {}; this.maskSum = {};
    for (const p of PATCHES) { const m = initialMask(p); this.masks[p.id] = m; this.maskInit[p.id] = m.reduce((a, b) => a + b, 0); this.maskSum[p.id] = this.maskInit[p.id]; }
    this.doors = Object.fromEntries(DOORS.map(d => [d.id, { open: d.id === 'd_office', bolted: false }]));
    this.lockers = {};
    this.discoveries = []; this.purchased = []; this.upgrades = { suction: 0, bag: 0, quiet: 0, light: 0 };
    this.roomBonus = {}; this.inv = {}; this.firedPA = {};
    this.shiftStats = this.newStats(); this.summary = null; this.safeT = 0;
    this.collectedByRoom = {};
  }
  newStats() { return { earned: 0, pieces: 0, cells: 0, caught: 0, disc: [] }; }

  // ---------- persistence ----------
  serialize() {
    return {
      v: CONFIG.saveVersion, savedAt: Date.now(), day: this.day, money: +this.money.toFixed(4), shiftT: this.shiftT, phase: this.phase === 'summary' ? 'summary' : this.phase,
      collected: b64enc(this.collected), masks: Object.fromEntries(Object.entries(this.masks).map(([k, v]) => [k, b64enc(v)])),
      doors: this.doors, lockers: this.lockers, discoveries: this.discoveries, purchased: this.purchased, roomBonus: this.roomBonus,
      inv: this.inv, firedPA: this.firedPA, shiftStats: this.shiftStats, summary: this.summary,
    };
  }
  load(s) {
    if (!s || s.v !== CONFIG.saveVersion) throw new Error('Unsupported save version ' + (s && s.v));
    this.day = s.day; this.money = s.money; this.shiftT = s.shiftT; this.phase = s.phase;
    const c = b64dec(s.collected); if (c.length === DEBRIS.length) this.collected = c;
    for (const [k, v] of Object.entries(s.masks || {})) { const m = b64dec(v); if (this.masks[k] && m.length === this.masks[k].length) { this.masks[k] = m; this.maskSum[k] = m.reduce((a, b) => a + b, 0); } }
    Object.assign(this.doors, s.doors || {}); this.lockers = s.lockers || {};
    this.discoveries = s.discoveries || []; this.purchased = s.purchased || []; this.roomBonus = s.roomBonus || {}; this.inv = s.inv || {};
    this.firedPA = s.firedPA || {}; this.shiftStats = s.shiftStats || this.newStats(); this.summary = s.summary || null;
    this.applyUpgrades();
    // a mid-shift save resumes in the office with the door shut and unbolted
    if (this.phase !== 'summary') { this.doors.d_office.bolted = false; }
  }
  applyUpgrades() {
    const has = (k) => this.purchased.includes(k);
    this.upgrades = { suction: has('suction2') ? 2 : has('suction1') ? 1 : 0, bag: has('bag1') ? 1 : 0, quiet: has('quiet1') ? 1 : 0, light: has('light1') ? 1 : 0 };
  }

  // ---------- connection ----------
  connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }
  join(pid, name) {
    let p = this.players.get(pid);
    if (!p || !p.connected) { if (this.connectedCount() >= CONFIG.maxPlayers) return { error: 'This crew is full (4 workers).' }; }
    if (!this.inv[pid]) this.inv[pid] = { vacuum: false, mop: false, name };
    this.inv[pid].name = name || this.inv[pid].name;
    if (!p) { p = { pid, x: SPAWN.x + (this.players.size % 2) * 0.8, y: 0, z: SPAWN.z + Math.floor(this.players.size / 2) * 0.8, yaw: SPAWN.yaw, pitch: 0, tool: 'none', act: 0, fl: 0, cr: 0, sp: 0, mv: 0, bag: 0, downed: false, downT: 0, out: false, revive: 0, lastSeen: 0 }; this.players.set(pid, p); }
    p.connected = true; p.name = this.inv[pid].name;
    this.emit({ t: 'toast', msg: `${p.name} clocked in.` }, { except: pid });
    return { ok: true, welcome: this.fullState(pid) };
  }
  leave(pid) { const p = this.players.get(pid); if (p) { p.connected = false; p.act = 0; this.emit({ t: 'toast', msg: `${p.name} disconnected.` }); } }
  fullState(pid) {
    return { t: 'welcome', you: pid, save: this.serialize(), players: this.snapPlayers(), mon: this.snapMon(), phase: this.phase, upgrades: this.upgrades, summary: this.summary, maxPlayers: CONFIG.maxPlayers };
  }
  emit(ev, route = {}) { this.out.push({ ev, ...route }); }

  // ---------- player messages ----------
  handle(pid, m) {
    const p = this.players.get(pid); if (!p || !p.connected) return;
    const inv = this.inv[pid];
    const near = (x, z, r) => dist(p.x, p.z, x, z) < r;
    switch (m.t) {
      case 'st': {
        if (p.downed || p.out) { p.yaw = m.yw; p.pitch = m.pt; return; }
        // light sanity: reject impossible jumps (except respawns the server initiated)
        if (dist(p.x, p.z, m.p[0], m.p[2]) < 4 || p.teleportOk || (m.tp && this.opts.allowTeleport)) { p.x = m.p[0]; p.y = m.p[1]; p.z = m.p[2]; p.teleportOk = false; }
        p.yaw = m.yw; p.pitch = m.pt; p.tool = m.tool; p.act = m.act ? 1 : 0; p.fl = m.fl ? 1 : 0; p.cr = m.cr ? 1 : 0; p.sp = m.sp ? 1 : 0; p.mv = m.mv ? 1 : 0;
        p.lastSeen = this.time || 0;
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
          this.money += CONFIG.pay.piece; this.shiftStats.earned += CONFIG.pay.piece; this.shiftStats.pieces++;
        }
        if (got.length) { this.emit({ t: 'col', ids: got, by: pid }); this.emit({ t: 'bag', bag: p.bag }, { to: pid }); this.checkRooms(); }
        return;
      }
      case 'mop': { // exact spatial cleaning: circles erased from a persistent mask. Commutative, so order never matters.
        const P = PATCH[m.patch]; if (!P) return;
        const viaVac = m.k === 'vac';
        if (viaVac ? !inv.vacuum : !inv.mop) return;
        if (P.type === 'mud' && viaVac) return; // the vacuum cannot lift mud
        const r = viaVac ? CONFIG.vacuum.filmRadius : CONFIG.mop.radius, reach = viaVac ? vacStats(this.upgrades).reach : CONFIG.mop.reach;
        const pts = (m.pts || []).slice(0, 40).filter(([x, z, s]) => near(x, z, reach + 2.5)).map(([x, z, s]) => [x, z, Math.max(0, Math.min(255, s | 0))]);
        if (!pts.length) return;
        const cells = this.erase(P, pts, r);
        if (cells > 0) {
          const pay = (P.type === 'mud' ? CONFIG.pay.mudCell : CONFIG.pay.dustCell) * cells;
          this.money += pay; this.shiftStats.earned += pay; this.shiftStats.cells += cells;
        }
        this.emit({ t: 'mop', patch: P.id, pts, r }, { except: pid });
        if (P.id === CLUE_SPOT.patch) this.checkClueSpot();
        this.checkRooms();
        return;
      }
      case 'door': {
        const d = DOORS.find(x => x.id === m.id); if (!d) return; const c = doorCenter(d); if (!near(c.x, c.z, 2.3)) return;
        const st = this.doors[d.id];
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
      case 'empty': {
        const b = BINS.find(b => near(b.x, b.z, 1.9)); if (!b || p.bag === 0) return;
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
      case 'sleep': {
        if (this.phase !== 'summary') return;
        this.startDay(this.day + 1);
        return;
      }
    }
  }

  // ---------- cleaning helpers ----------
  erase(P, pts, r) {
    const m = this.masks[P.id]; let removed = 0;
    for (const [x, z, s] of pts) {
      const ci = (x - P.x0) * P.res, cj = (z - P.z0) * P.res, rr = r * P.res;
      for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(P.h - 1, Math.ceil(cj + rr)); j++)
        for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(P.w - 1, Math.ceil(ci + rr)); i++) {
          const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / rr; if (d > 1) continue;
          const k = j * P.w + i, v = m[k]; if (!v) continue;
          const nv = Math.max(0, v - Math.round(s * Math.sqrt(1 - d))); removed += v - nv; m[k] = nv;
        }
    }
    this.maskSum[P.id] -= removed;
    return removed / 255;
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
    for (const room of ['hall', 'class', 'closet', 'service']) {
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
    if (this.phase === 'summary') { this.snapTimer(dt); return; }
    this.shiftT += dt * this.timeScale;
    const min = gameClock(this.shiftT);
    const pa = (key, text) => { if (this.opts.calm) return; if (!this.firedPA[key]) { this.firedPA[key] = 1; this.emit({ t: 'pa', text }); } };
    if (this.shiftT > 3) pa('d' + this.day + 'start', this.day === 1 ? 'Good evening. The building is closed. Attendance will be taken at four.' : 'Good evening. Attendance will be taken at four. Room zero one four is expected.');
    if (this.shiftT > CONFIG.shiftSeconds * 0.42) pa('d' + this.day + 'mid', 'Would Margaret Arden please return to her assigned room.');
    if (this.shiftT >= CONFIG.shiftSeconds * (330 / 360)) pa('d' + this.day + '330', 'It is three thirty. All students should now make their way to their assigned rooms.');
    if (this.shiftT >= CONFIG.shiftSeconds * (350 / 360)) pa('d' + this.day + '350', 'Final headcount in ten minutes. Do not answer the register from outside your room.');
    if (this.phase === 'shift' && this.shiftT >= CONFIG.shiftSeconds) {
      this.phase = 'lockdown'; this.timeScale = 1; this.safeT = 0;
      this.emit({ t: 'phase', phase: 'lockdown' }); pa('d' + this.day + '400', 'Four o\'clock. The headcount has begun.');
      if (this.mon.state === 'dormant' || this.mon.state === 'retreat') this.setMon('patrol');
    }
    if (this.phase === 'lockdown') {
      if (this.allSafe()) this.safeT += dt; else this.safeT = 0;
      if (this.connectedCount() && this.safeT >= CONFIG.lockdownGrace) this.endShift(false);
      let anyAlive = false; for (const p of this.players.values()) if (p.connected && !p.out && !p.downed) anyAlive = true;
      if (this.connectedCount() && !anyAlive) this.endShift(true);
    }
    // downed workers
    for (const p of this.players.values()) {
      if (!p.downed) continue; p.downT -= dt;
      if (!p.connected || p.downT <= 0) this.blackout(p);
    }
    this.tickMonitor(dt);
    this.snapTimer(dt);
    this.saveTimer = (this.saveTimer || 0) + dt; if (this.saveTimer > 20) { this.saveTimer = 0; this.save('periodic'); }
  }
  snapTimer(dt) { this.snapT = (this.snapT || 0) + dt; if (this.snapT >= 0.1) { this.snapT = 0; this.emit({ t: 'snap', shiftT: this.shiftT, phase: this.phase, money: this.money, players: this.snapPlayers(), mon: this.snapMon(), safeT: this.safeT }); } }
  snapPlayers() { return [...this.players.values()].filter(p => p.connected).map(p => ({ pid: p.pid, name: p.name, x: p.x, y: p.y, z: p.z, yw: p.yaw, pt: p.pitch, tool: p.tool, act: p.act, fl: p.fl, cr: p.cr, dn: p.downed ? 1 : 0, dnT: p.downT, out: p.out ? 1 : 0, bag: p.bag, rv: p.revive })); }
  snapMon() { const m = this.mon; return m ? { x: m.x, z: m.z, yaw: m.yaw, st: m.state, mv: m.moving, lx: m.lookX, lz: m.lookZ, v: m.visible } : null; }
  save(reason) { if (this.opts.onSave) this.opts.onSave(this.serialize(), reason); }
  endShift(failed) {
    if (this.phase === 'summary') return;
    this.phase = 'summary';
    const rp = this.roomProgress();
    this.summary = { day: this.day, failed, earned: this.shiftStats.earned, pieces: this.shiftStats.pieces, cells: Math.round(this.shiftStats.cells), caught: this.shiftStats.caught, disc: this.shiftStats.disc.slice(), money: this.money, rooms: rp };
    if (failed) { const pen = Math.min(this.money, CONFIG.failPenalty * 2); this.money -= pen; this.summary.penalty = pen; }
    this.setMon('dormant');
    this.emit({ t: 'summary', summary: this.summary });
    this.save('shift end');
  }
  startDay(day) {
    this.day = day; this.shiftT = 0; this.phase = 'shift'; this.timeScale = 1; this.summary = null; this.safeT = 0; this.shiftStats = this.newStats();
    this.doors.d_office.bolted = false; this.doors.d_office.open = false;
    for (const p of this.players.values()) { p.downed = false; p.out = false; p.bag = p.bag; this.respawnInOffice(p); }
    this.resetMonster(false);
    if (day === 2) { this.discover('room014', null); }
    this.emit({ t: 'newday', day, save: this.serialize() });
    this.save('new day');
  }
  respawnInOffice(p) { p.x = SPAWN.x + (Math.random() - 0.5); p.z = SPAWN.z + (Math.random() - 0.5); p.teleportOk = true; this.emit({ t: 'teleport', x: p.x, z: p.z, yaw: SPAWN.yaw }, { to: p.pid }); }
  blackout(p) {
    // failure before 4:00: wake in the office, lose time and a fee; after 4:00: out for the rest of the shift
    p.downed = false; p.revive = 0; this.shiftStats.caught++;
    if (this.phase === 'lockdown') {
      p.out = true; const pen = Math.min(this.money, CONFIG.lockdownCatchPenalty); this.money -= pen;
      this.emit({ t: 'out', pid: p.pid, penalty: pen });
    } else {
      const pen = Math.min(this.money, CONFIG.failPenalty); this.money -= pen; p.bag = 0;
      this.shiftT = Math.min(this.shiftT + CONFIG.shiftSeconds / 12, CONFIG.shiftSeconds - 5);
      this.respawnInOffice(p);
      this.emit({ t: 'blackout', pid: p.pid, penalty: pen });
    }
  }
  catchPlayer(p) {
    const others = [...this.players.values()].filter(o => o !== p && o.connected && !o.downed && !o.out);
    if (others.length) { p.downed = true; p.downT = 45; p.revive = 0; this.emit({ t: 'downed', pid: p.pid }); }
    else this.blackout(p);
    this.emit({ t: 'caught', pid: p.pid });
    this.mon.lastEncounter = this.time; this.mon.encounters++;
    if (this.phase === 'lockdown') this.setMon('search'); else this.setMon('retreat');
  }

  // ======================= THE MONITOR =======================
  resetMonster(initial) {
    const prev = this.mon;
    this.mon = { x: LAIR.x, z: LAIR.z, yaw: Math.PI, state: 'dormant', stateT: 0, path: null, pathT: 0, target: null, lastKnown: null, susp: {}, goal: null,
      encounters: prev?.encounters || 0, lastEncounter: -999, retreatFor: 0, watchFor: 0, firstSighting: false, doorWait: 0, moving: 0, lookX: LAIR.x, lookZ: LAIR.z - 1, visible: 1, bangT: 20 };
  }
  setMon(state, extra = {}) {
    const m = this.mon; if (m.state !== state) { m.state = state; m.stateT = 0; m.path = null; this.emit({ t: 'monstate', st: state }); }
    Object.assign(m, extra);
  }
  tickMonitor(dt) {
    const m = this.mon, C = CONFIG.monitor, lock = this.phase === 'lockdown';
    if (this.opts.calm) { if (m.state !== 'dormant') this.setMon('dormant'); m.x = 47.5; m.z = 11; m.moving = 0; this.noises = []; return; } // calm mode: no monster at all
    m.stateT += dt;
    const rects = solidRects(this.doors);
    const alive = [...this.players.values()].filter(p => p.connected && !p.downed && !p.out);
    const peaceful = !lock && this.shiftT < (this.day === 1 ? CONFIG.peacefulSeconds : CONFIG.peacefulSeconds * 0.5) && this.timeScale === 1;
    const facing = Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw));
    // ---- perception ----
    let best = null, bestS = 0;
    for (const p of alive) {
      const d = dist(m.x, m.z, p.x, p.z);
      const los = !segBlocked(m.x, m.z, p.x, p.z, rects, { sight: true });
      let seen = false;
      if (los) {
        const lit = Math.max(this.lightAt(p.x, p.z), p.fl ? 0.85 : 0);
        let range = C.viewRange * (0.45 + 0.55 * lit) * (p.cr ? 0.7 : 1) * (p.fl ? 1.25 : 1);
        if (lock) range *= 1.2;
        const ang = Math.abs(angDiff(facing, Math.atan2(p.x - m.x, p.z - m.z)));
        if (d < C.closeSense || (d < range && ang < C.viewHalfAngleDeg * Math.PI / 180)) seen = true;
      }
      const s0 = m.susp[p.pid] || 0;
      m.susp[p.pid] = seen ? s0 + dt * (1.6 * Math.max(0, 1 - d / C.viewRange) + 0.35 + (p.mv ? 0.25 : 0)) : Math.max(0, s0 - dt * 0.25);
      p._seenByMon = seen;
      if (seen && m.susp[p.pid] > bestS) { bestS = m.susp[p.pid]; best = p; }
      // continuous noise from what the player is doing
      let r = 0; if (p.act && p.tool === 'vacuum') r = vacStats(this.upgrades).noise; else if (p.mv && p.sp) r = CONFIG.noise.sprint; else if (p.mv && !p.cr) r = CONFIG.noise.walk;
      if (r) this.noise(p.x, p.z, r, p.pid);
    }
    // discrete + continuous noises -> the loudest heard
    let heard = null;
    for (const n of (this.noises || [])) {
      const walls = wallsBetween(m.x, m.z, n.x, n.z, rects);
      const eff = n.r * Math.pow(0.5, walls) * (lock ? C.lockdownHearMul : C.hearMul);
      const d = dist(m.x, m.z, n.x, n.z);
      if (d < eff) { const s = 1 - d / eff; if (!heard || s > heard.s) heard = { ...n, s, d }; }
    }
    this.noises = [];
    if (best) m.lastKnown = { x: best.x, z: best.z, t: this.time };
    // ---- pacing director: recovery time after an encounter; no hunting during the peaceful opening ----
    const recovering = !lock && this.time - m.lastEncounter < 30;
    const speedMul = lock ? C.lockdownSpeedMul : 1;
    const st = m.state;
    if (st === 'dormant') {
      m.moving = 0;
      if (!peaceful) this.setMon('patrol');
      else if (this.day === 1 && !m.firstSighting && this.shiftT > CONFIG.peacefulSeconds * 0.7 && alive.length) {
        // first sighting: walk (physically) to a watch point that can see a worker, from far away
        const wp = this.pickWatchPoint(alive, rects, 9, 30);
        if (wp) { m.firstSighting = true; this.setMon('watch', { goal: wp, watchFor: 6, target: null, scripted: true }); }
      }
    } else if (st === 'watch') {
      const wp = m.goal;
      if (wp && dist(m.x, m.z, wp.x, wp.z) > 0.4) this.moveTo(wp.x, wp.z, C.speed.investigate * speedMul, dt, rects);
      else {
        m.moving = 0; m.watchFor -= dt;
        const tgt = best || alive.find(p => p.pid === m.target);
        if (tgt) { m.yaw = turnTo(m.yaw, Math.atan2(tgt.x - m.x, tgt.z - m.z), dt * 2); m.lookX = tgt.x; m.lookZ = tgt.z; }
        if (!m.scripted && best && m.susp[best.pid] > 1.0 && !peaceful) this.setMon('chase', { target: best.pid });
        else if (m.watchFor <= 0) this.setMon(m.scripted ? 'retreat' : (best ? 'stalk' : 'search'), { scripted: false, retreatFor: 20 });
      }
    } else if (st === 'patrol') {
      if (!m.path || !m.path.length) { const g = this.pickPatrol(lock); this.planPath(g[0], g[1]); }
      this.followPath(C.speed.patrol * speedMul, dt, rects);
      this.reactToSenses(best, heard, recovering, lock);
      if (!lock && m.stateT > 50 && this.rand() < dt * 0.05) { const wp = this.pickWatchPoint(alive, rects, 6, 22); if (wp) this.setMon('watch', { goal: wp, watchFor: 4 + this.rand() * 4, target: null }); }
    } else if (st === 'investigate') {
      if (!m.path) this.planPath(m.goal.x, m.goal.z);
      const arrived = this.followPath(C.speed.investigate * speedMul, dt, rects);
      if (arrived) this.setMon('search', { searchFor: CONFIG.monitor.searchSeconds * 0.6 });
      this.reactToSenses(best, heard, recovering, lock, true);
    } else if (st === 'stalk') {
      const lk = m.lastKnown;
      if (lk && dist(m.x, m.z, lk.x, lk.z) > 7) { if (!m.path || m.pathT > 1) this.planPath(lk.x, lk.z); m.pathT += dt; this.followPath(C.speed.stalk * speedMul, dt, rects); }
      else { m.moving = 0; if (lk) m.yaw = turnTo(m.yaw, Math.atan2(lk.x - m.x, lk.z - m.z), dt * 2); }
      if (best && m.susp[best.pid] > 1.1) this.setMon('chase', { target: best.pid });
      if (m.stateT > 22) this.setMon(lock ? 'search' : 'retreat', { retreatFor: 35 });
    } else if (st === 'chase') {
      const tgt = alive.find(p => p.pid === m.target);
      if (!tgt) { this.setMon('search'); }
      else {
        if (tgt._seenByMon || dist(m.x, m.z, tgt.x, tgt.z) < 2.5) { m.lastKnown = { x: tgt.x, z: tgt.z, t: this.time }; m.lostT = 0; } else m.lostT = (m.lostT || 0) + dt;
        m.pathT += dt;
        if (!m.path || m.pathT > 0.35) { m.pathT = 0; this.planPath(m.lastKnown.x, m.lastKnown.z); }
        const blocked = !m.path;
        if (blocked) { m.moving = 0; m.blockedT = (m.blockedT || 0) + dt; this.bangDoor(dt); if (m.blockedT > 6) this.setMon('search'); }
        else { m.blockedT = 0; this.followPath(C.speed.chase * speedMul, dt, rects); }
        m.lookX = tgt.x; m.lookZ = tgt.z;
        if (dist(m.x, m.z, tgt.x, tgt.z) < C.catchRadius && !segBlocked(m.x, m.z, tgt.x, tgt.z, rects)) this.catchPlayer(tgt);
        else if (m.lostT > C.loseSightSeconds) this.setMon('search', { searchFor: C.searchSeconds });
      }
    } else if (st === 'search') {
      m.searchFor = m.searchFor ?? C.searchSeconds;
      if (!m.path || !m.path.length) {
        const lk = m.lastKnown || { x: m.x, z: m.z }, a = this.rand() * 6.283, r = 1 + this.rand() * 5;
        if (!this.planPath(lk.x + Math.cos(a) * r, lk.z + Math.sin(a) * r)) m.path = [];
        m.pause = 1 + this.rand() * 2;
      }
      if (m.pause > 0) { m.pause -= dt; m.moving = 0; m.yaw += Math.sin(this.time * 1.3) * dt; } else this.followPath(C.speed.search * speedMul, dt, rects);
      this.reactToSenses(best, heard, false, lock, true);
      if (m.stateT > m.searchFor) { m.searchFor = undefined; this.setMon(lock ? 'patrol' : 'retreat', { retreatFor: C.retreatSeconds[0] + this.rand() * (C.retreatSeconds[1] - C.retreatSeconds[0]) }); m.lastEncounter = this.time; }
    } else if (st === 'retreat') {
      if (dist(m.x, m.z, LAIR.x, LAIR.z) > 0.6) { if (!m.path) this.planPath(LAIR.x, LAIR.z); this.followPath(C.speed.retreat * speedMul, dt, rects); }
      else { m.moving = 0; }
      const crew = Math.max(1, alive.length);
      if (m.stateT > (m.retreatFor || 40) / (1 + 0.15 * (crew - 1))) this.setMon(peaceful ? 'dormant' : 'patrol');
      if (best && dist(m.x, m.z, best.x, best.z) < 4 && m.susp[best.pid] > 0.8) this.setMon('chase', { target: best.pid });
      if (lock) this.setMon('patrol');
    }
    // inside the bolted office at 4:00: something checks the door now and then
    if (lock && this.doors.d_office.bolted) {
      const inside = alive.some(p => inOffice(p));
      if (inside) { m.bangT -= dt; if (m.bangT < 0 && dist(m.x, m.z, 21.5, 2.2) < 9) { m.bangT = 20 + this.rand() * 20; this.emit({ t: 'sfx', k: 'doorbang', x: 21.5, z: 3.6 }); } }
    }
  }
  reactToSenses(best, heard, recovering, lock, already) {
    const m = this.mon;
    if (best) {
      const s = m.susp[best.pid];
      if (s > 1.0) return this.setMon('chase', { target: best.pid, lostT: 0 });
      if (s > 0.35 && m.state !== 'watch') return this.setMon('watch', { goal: null, watchFor: 1.5 + this.rand() * 2, target: best.pid, scripted: false });
    }
    if (heard && !(recovering && heard.d > 6)) {
      const unc = heard.d * 0.15; const gx = heard.x + (this.rand() - 0.5) * unc * 2, gz = heard.z + (this.rand() - 0.5) * unc * 2;
      if (m.state !== 'investigate' || dist(gx, gz, m.goal.x, m.goal.z) > 3) this.setMon('investigate', { goal: { x: gx, z: gz } });
    }
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
      if (!s.open && !s.bolted && dist(m.x, m.z, c.x, c.z) < 1.0) {
        m.doorWait += dt; m.moving = 0; if (m.doorWait > 0.9) { s.open = true; m.doorWait = 0; this.emit({ t: 'door', id: d.id, open: true, bolted: false, by: 'monitor' }); }
        return false;
      }
      if (s.bolted && dist(m.x, m.z, c.x, c.z) < 0.9) { m.path = null; m.moving = 0; return false; }
    }
    const [wx, wz] = m.path[0];
    const dx = wx - m.x, dz = wz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { m.path.shift(); return !m.path.length; }
    const step = Math.min(d, speed * dt);
    m.x += dx / d * step; m.z += dz / d * step; m.moving = speed;
    m.yaw = turnTo(m.yaw, Math.atan2(dx, dz), dt * 6);
    m.lookX = m.x + Math.sin(m.yaw) * 3; m.lookZ = m.z + Math.cos(m.yaw) * 3;
    return false;
  }
  moveTo(x, z, speed, dt, rects) { if (!this.mon.path || this.mon.pathT > 2) this.planPath(x, z); this.mon.pathT += dt; this.followPath(speed, dt, rects); }
  bangDoor(dt) { const m = this.mon; m.bangT -= dt; if (m.bangT < 0) { m.bangT = 2.5 + this.rand() * 2; const c = doorCenter(DOORS.find(d => d.id === 'd_office')); if (dist(m.x, m.z, c.x, c.z) < 3) this.emit({ t: 'sfx', k: 'doorbang', x: c.x, z: c.z }); } }
}
export function inOffice(p) { return p.x > OFFICE.x0 && p.x < OFFICE.x1 && p.z > OFFICE.z0 + 0.15 && p.z < OFFICE.z1; }
function turnTo(a, b, k) { return a + Math.max(-k, Math.min(k, angDiff(a, b))); }
