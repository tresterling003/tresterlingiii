// Transports. Solo runs the same authoritative Sim in the page; co-op talks to server.js over a WebSocket.
import { Sim } from '../shared/sim.js';

const SOLO_KEY = 'blackbriar.solo.v1';
export function loadSolo() { try { const s = localStorage.getItem(SOLO_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearSolo() { try { localStorage.removeItem(SOLO_KEY); } catch { } }

export class LocalTransport {
  constructor(pid, name, calm = false) {
    this.calm = calm; this.pid = pid; this.handlers = []; this.mode = 'solo';
    let save = null; try { save = loadSolo(); } catch { }
    try { this.sim = new Sim(save, { calm, allowTeleport: true, onSave: (d) => { try { localStorage.setItem(SOLO_KEY, JSON.stringify(d)); } catch { } } }); }
    catch (e) { console.warn('solo save unreadable, starting fresh', e); this.sim = new Sim(null, { calm, allowTeleport: true, onSave: (d) => { try { localStorage.setItem(SOLO_KEY, JSON.stringify(d)); } catch { } } }); }
    this.name = name;
  }
  connect() {
    const r = this.sim.join(this.pid, this.name);
    setTimeout(() => { this.emit({ ...r.welcome, room: 'SOLO' }); this.flush(); }, 0);
    let last = performance.now();
    this.timer = setInterval(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; this.sim.tick(dt); this.flush(); }, 50);
    addEventListener('pagehide', () => this.sim.save('pagehide'));
  }
  flush() { const out = this.sim.out; this.sim.out = []; for (const { ev, to, except } of out) { if (to && to !== this.pid) continue; if (except === this.pid) continue; this.emit(ev); } }
  send(m) { this.sim.handle(this.pid, m); if (m.t !== 'st') this.flush(); }
  on(fn) { this.handlers.push(fn); }
  emit(m) { m = JSON.parse(JSON.stringify(m)); for (const h of this.handlers) h(m); } // same isolation as the network: never share objects with the sim
  close() { clearInterval(this.timer); this.sim.save('close'); }
}

export class WSTransport {
  constructor(pid, name, room, join) { this.pid = pid; this.name = name; this.room = room; this.join = join; this.handlers = []; this.mode = 'coop'; this.backoff = 500; this.closed = false; this.status = 'connecting'; }
  url() { const u = new URL(location.href); return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host + '/ws'; }
  connect() {
    if (this.closed) return;
    let ws; try { ws = new WebSocket(this.url()); } catch (e) { this.status = 'unavailable'; this.emit({ t: 'netstatus', status: 'unavailable', msg: 'Co-op is not available on this link.' }); return; }
    this.ws = ws; this.status = 'connecting'; this.emit({ t: 'netstatus', status: 'connecting' });
    ws.onopen = () => { this.backoff = 500; ws.send(JSON.stringify({ t: 'hello', pid: this.pid, name: this.name, room: this.room, join: this.join })); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.t === 'welcome') { this.room = m.room; this.join = true; this.status = 'online'; this.emit({ t: 'netstatus', status: 'online' }); } if (m.t === 'reject') { this.closed = true; } this.emit(m); };
    ws.onclose = () => { if (this.closed) return; this.status = 'reconnecting'; this.emit({ t: 'netstatus', status: 'reconnecting' }); setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(8000, this.backoff * 1.8); };
    ws.onerror = () => { };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  on(fn) { this.handlers.push(fn); }
  emit(m) { for (const h of this.handlers) h(m); }
  close() { this.closed = true; try { this.ws.close(); } catch { } }
}
export async function serverAvailable() {
  try { const r = await fetch('healthz', { cache: 'no-store' }); return r.ok && (await r.text()) === 'ok'; } catch { return false; }
}

// ======================= co-op by code over the artifact host's live "room" (presence only) =======================
// The host's tab runs the authoritative Sim (its own save) and publishes, in its presence: the latest snapshot, a short
// numbered log of recent events, and — while anyone is joining or catching up — the full state in gzip chunks.
// Guests publish their movement and a short numbered list of actions. Presence is ≤4 KB per player, ~30 updates/s.
const ROOM_PREFIX = 'blackbriar-';
const r2 = (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
const size = (o) => JSON.stringify(o).length;
async function gz(str) { const cs = new CompressionStream('gzip'), b = await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer(); let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function gunz(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const ds = new DecompressionStream('gzip'); return await new Response(new Blob([u]).stream().pipeThrough(ds)).text(); }
export function newRoomCode() { const A = 'BCDFGHJKLMNPQRSTVWXZ'; return Array.from({ length: 4 }, () => A[Math.random() * A.length | 0]).join(''); }
export async function getRoomApi() {
  if (new URLSearchParams(location.search).has('mockroom')) return mockRoom();
  try { if (window.claude && window.claude.use) return await Promise.race([window.claude.use('room'), new Promise(r => setTimeout(() => r(null), 6000))]); } catch { }
  return null;
}

export class RoomHost {
  constructor(api, pid, name, code) { this.api = api; this.pid = pid; this.name = name; this.code = code; this.mode = 'coop'; this.handlers = []; this.seq = 0; this.log = []; this.guests = new Map(); this.blob = null; this.status = 'connecting'; this.room = code;
    let save = null; try { save = loadSolo(); } catch { }
    try { this.sim = new Sim(save, { onSave: (d) => { try { localStorage.setItem(SOLO_KEY, JSON.stringify(d)); } catch { } } }); } catch { this.sim = new Sim(null, { onSave: (d) => { try { localStorage.setItem(SOLO_KEY, JSON.stringify(d)); } catch { } } }); }
  }
  async connect() {
    try { this.g = await this.api.join(ROOM_PREFIX + this.code.toLowerCase()); } catch (e) { this.emit({ t: 'reject', msg: 'Could not open the co-op room (' + (e.code || e.message) + ').' }); return; }
    const r = this.sim.join(this.pid, this.name);
    setTimeout(() => { this.emit({ ...r.welcome, room: this.code }); this.emit({ t: 'netstatus', status: 'online' }); this.flush(); }, 0);
    this.g.onPeers((ch) => this.peers(ch.peers));
    let last = performance.now();
    this.timer = setInterval(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; this.sim.tick(dt); this.flush(); this.publish(); }, 50);
    addEventListener('pagehide', () => this.sim.save('pagehide'));
  }
  peers(list) {
    const seen = new Set();
    for (const p of list) {
      const pr = p.presence || {}; if (p.isMe || pr.r !== 'g' || typeof pr.pid !== 'string' || pr.pid.length > 40) continue;
      seen.add(pr.pid); let g = this.guests.get(pr.pid);
      if (!g) { const res = this.sim.join(pr.pid, String(pr.name || 'Worker').slice(0, 16)); if (res.error) continue; g = { lastA: 0, need: true }; this.guests.set(pr.pid, g); }
      if (pr.st && typeof pr.st === 'object') this.sim.handle(pr.pid, { ...pr.st, t: 'st' });
      if (Array.isArray(pr.a)) for (const [n, m] of pr.a) if (n > g.lastA && m && typeof m === 'object' && typeof m.t === 'string' && m.t !== 'st') { g.lastA = n; this.sim.handle(pr.pid, m); }
      g.need = !!pr.need; g.needId = pr.need;
    }
    for (const [pid] of this.guests) if (!seen.has(pid)) { this.guests.delete(pid); this.sim.leave(pid); }
    this.flush();
  }
  flush() {
    const out = this.sim.out; this.sim.out = [];
    for (const { ev, to, except } of out) {
      if (ev.t === 'snap') { this.snap = ev; if (!(to && to !== this.pid)) this.emit(ev); continue; }
      if ((!to || to === this.pid) && except !== this.pid) this.emit(ev);
      if (to === this.pid) continue;
      if (ev.t === 'welcome') continue;
      const lean = ev.t === 'newday' ? { ...ev, save: null } : ev; // a whole save never fits: guests fetch it as a full state
      this.log.push([++this.seq, to || 0, except || 0, lean]); if (this.log.length > 60) this.log.shift();
    }
  }
  async makeBlob() {
    if (this.blobBusy) return; this.blobBusy = true;
    const s = this.sim, state = { save: s.serialize(), players: s.snapPlayers(), mon: s.snapMon(), phase: s.phase, upgrades: s.upgrades, summary: s.summary, maxPlayers: 4, sq: this.seq };
    const d = await gz(JSON.stringify(state)), n = Math.ceil(d.length / 1800), id = (this.blob?.id || 0) + 1;
    this.blob = { id, n, parts: Array.from({ length: n }, (_, i) => d.slice(i * 1800, (i + 1) * 1800)), i: 0, t: performance.now() }; this.blobBusy = false;
  }
  publish() {
    if (!this.g) return;
    const needing = [...this.guests.values()].some(g => g.need);
    if (needing && (!this.blob || performance.now() - this.blob.t > 4000) && !this.blobBusy) this.makeBlob();
    const o = { r: 'h', v: 1, code: this.code, pid: this.pid, name: this.name, sq: this.seq, snap: this.snap ? JSON.parse(JSON.stringify(this.snap, r2)) : null, ev: [], b: null };
    if (needing && this.blob) { const b = this.blob; o.b = { id: b.id, n: b.n, i: b.i, d: b.parts[b.i] }; b.i = (b.i + 1) % b.n; }
    let room = 3900 - size(o);
    for (let k = this.log.length - 1; k >= 0; k--) { const e = this.log[k], sz = size(e) + 1; if (sz > room) break; room -= sz; o.ev.unshift(e); }
    this.g.presence(o).catch(() => { });
  }
  send(m) { this.sim.handle(this.pid, m); if (m.t !== 'st') this.flush(); }
  on(fn) { this.handlers.push(fn); }
  emit(m) { m = JSON.parse(JSON.stringify(m)); for (const h of this.handlers) h(m); }
  close() { clearInterval(this.timer); this.sim.save('close'); try { this.g && this.g.leave(); } catch { } }
}

export class RoomGuest {
  constructor(api, pid, name, code) { this.api = api; this.pid = pid; this.name = name; this.code = code; this.mode = 'coop'; this.handlers = []; this.aseq = 0; this.acts = []; this.st = null; this.lastSeq = -1; this.need = 'join'; this.parts = {}; this.room = code; this.status = 'connecting'; }
  async connect() {
    this.emit({ t: 'netstatus', status: 'connecting' });
    try { this.g = await this.api.join(ROOM_PREFIX + this.code.toLowerCase()); } catch (e) { this.emit({ t: 'reject', msg: 'Could not reach that crew (' + (e.code || e.message) + ').' }); return; }
    this.g.onPeers((ch) => this.onPeers(ch.peers));
    this.pub = setInterval(() => this.publish(), 50);
    this.waitT = setTimeout(() => { if (!this.hostSeen) this.emit({ t: 'reject', msg: `No crew is hosting ${this.code} right now. Check the code, and ask the host to keep the game open.` }); }, 12000);
  }
  onPeers(list) {
    const h = list.find(p => !p.isMe && p.presence && p.presence.r === 'h' && p.presence.code === this.code); 
    if (!h) { if (this.hostSeen && !this.lostT) this.lostT = setTimeout(() => this.emit({ t: 'reject', msg: 'The host left. The crew has ended.' }), 6000); return; }
    if (this.lostT) { clearTimeout(this.lostT); this.lostT = null; }
    const pr = h.presence; if (pr === this.lastPr) return; this.lastPr = pr;
    if (!this.hostSeen) { this.hostSeen = true; clearTimeout(this.waitT); }
    // the full state, in chunks
    if (this.need && pr.b && typeof pr.b.d === 'string') {
      const b = pr.b; if (this.blobId !== b.id) { this.blobId = b.id; this.parts = {}; }
      this.parts[b.i] = b.d;
      if (Object.keys(this.parts).length === b.n) { const d = Array.from({ length: b.n }, (_, i) => this.parts[i]).join(''); this.parts = {}; this.need = null; this.applyBlob(d); }
    }
    if (this.lastSeq < 0) return; // not in the game yet
    if (pr.snap) this.emit(pr.snap);
    const ev = Array.isArray(pr.ev) ? pr.ev : [];
    if (ev.length && ev[0][0] > this.lastSeq + 1 && pr.sq > this.lastSeq) { this.need = 'resync'; } // missed some: catch up from a fresh full state
    for (const [n, to, except, e] of ev) { if (n <= this.lastSeq) continue; this.lastSeq = n; if ((to && to !== this.pid) || except === this.pid || !e || typeof e.t !== 'string') continue; if (e.t === 'newday' && !e.save) { this.pendingDay = e; this.need = 'newday'; continue; } this.emit(e); }
  }
  async applyBlob(d) {
    let st; try { st = JSON.parse(await gunz(d)); } catch { this.need = 'resync'; return; }
    const first = this.lastSeq < 0; this.lastSeq = st.sq;
    if (first) { this.emit({ t: 'welcome', you: this.pid, room: this.code, ...st }); this.emit({ t: 'netstatus', status: 'online' }); this.status = 'online'; }
    else if (this.pendingDay) { const e = this.pendingDay; this.pendingDay = null; this.emit({ ...e, save: st.save }); }
    else this.emit({ t: 'resync', save: st.save });
  }
  publish() {
    if (!this.g) return;
    const o = { r: 'g', v: 1, pid: this.pid, name: this.name, need: this.need, st: this.st, a: [] };
    let room = 3800 - size(o);
    for (let k = this.acts.length - 1; k >= 0; k--) { const e = this.acts[k], sz = size(e) + 1; if (sz > room) break; room -= sz; o.a.unshift(e); }
    this.g.presence(o).catch(() => { });
  }
  send(m) { if (m.t === 'st') { const { t, ...rest } = m; this.st = JSON.parse(JSON.stringify(rest, r2)); return; } this.acts.push([++this.aseq, m]); if (this.acts.length > 30) this.acts.shift(); }
  on(fn) { this.handlers.push(fn); }
  emit(m) { for (const h of this.handlers) h(m); }
  close() { clearInterval(this.pub); try { this.g && this.g.leave(); } catch { } }
}

// A stand-in for the host's room for local testing (?mockroom): two tabs of the same browser share it via BroadcastChannel.
function mockRoom() {
  return { join: async (name) => {
    const bc = new BroadcastChannel('mockroom-' + name), me = Math.random().toString(36).slice(2), peers = new Map(), subs = [];
    let mine = {}; const fire = () => { const list = [{ peer: me, isMe: true, presence: mine }, ...[...peers.entries()].map(([peer, v]) => ({ peer, isMe: false, presence: v.p }))]; for (const f of subs) f({ peers: list }); };
    bc.onmessage = (e) => { const { from, p, bye } = e.data; if (bye) peers.delete(from); else peers.set(from, { p, t: Date.now() }); fire(); };
    setInterval(() => { const now = Date.now(); let ch = false; for (const [k, v] of peers) if (now - v.t > 3000) { peers.delete(k); ch = true; } if (ch) fire(); bc.postMessage({ from: me, p: mine }); }, 1000);
    addEventListener('pagehide', () => bc.postMessage({ from: me, bye: 1 }));
    return { name, presence: async (patch) => { mine = { ...mine, ...patch }; if (JSON.stringify(mine).length > 4096) throw Object.assign(new Error('too big'), { code: 'invalid_argument' }); bc.postMessage({ from: me, p: mine }); }, onPeers: (f) => { subs.push(f); setTimeout(fire, 0); return () => { }; }, leave: async () => bc.postMessage({ from: me, bye: 1 }) };
  } };
}
