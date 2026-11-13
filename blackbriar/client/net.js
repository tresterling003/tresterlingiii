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

// ======================= co-op anywhere: browser-to-browser (WebRTC) via PeerJS's free public matchmaker =======================
// No server of ours and no sign-in. The host's browser runs the Sim (its own save); friends connect straight to it with the code.
const PEER_PREFIX = 'blackbriar-crew-v1-';
async function loadPeerJS() {
  if (window.Peer) return window.Peer;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('./vendor/peerjs.min.js', import.meta.url).href; s.onload = res; s.onerror = () => rej(new Error('peerjs failed to load')); document.head.appendChild(s); });
  return window.Peer;
}
function peerOpts() {
  const q = new URLSearchParams(location.search), o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] } };
  if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 9000); o.path = q.get('peerpath') || '/'; o.secure = false; } // local testing
  return o;
}
export const peerSupported = () => typeof RTCPeerConnection !== 'undefined' || typeof WebSocket !== 'undefined';

// ======================= relay: when a direct link cannot get through (phones, strict routers) =======================
// The same messages go through a free public MQTT broker over a secure WebSocket, which works on nearly any network.
// The host listens on every broker; a guest uses the first one it can reach. Big messages are sent in chunks.
const RELAY_Q = new URLSearchParams(location.search).get('relay'), RELAY_ONLY = new URLSearchParams(location.search).has('relayonly'); // read once: the address bar changes to the invite link
const RELAYS = () => RELAY_Q ? [RELAY_Q] : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const te = new TextEncoder(), td = new TextDecoder();
const mstr = (s) => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function mpkt(type, head, body) {
  const n = head.length + (body ? body.length : 0), len = []; let x = n; do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; len.push(d); } while (x > 0);
  const out = new Uint8Array(1 + len.length + n); out[0] = type; out.set(len, 1); out.set(head, 1 + len.length); if (body) out.set(body, 1 + len.length + head.length); return out;
}
class Mqtt { // just enough MQTT 3.1.1: connect, subscribe, publish at QoS 0, keepalive
  constructor(url) { this.url = url; this.subs = []; this.onmsg = null; this.ok = false; this.pid = 1; this.buf = new Uint8Array(0); }
  connect(timeout = 7000) {
    return new Promise((res, rej) => {
      let ws; try { ws = this.ws = new WebSocket(this.url, ['mqtt']); } catch (e) { rej(e); return; }
      ws.binaryType = 'arraybuffer'; let done = false;
      const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch { } rej(new Error('timeout')); } }, timeout);
      ws.onopen = () => ws.send(mpkt(0x10, [...mstr('MQTT'), 4, 2, 0, 60], mstr('bb' + Math.random().toString(36).slice(2, 12))));
      ws.onmessage = (e) => this.data(new Uint8Array(e.data), (ok) => { if (done) return; done = true; clearTimeout(to); if (!ok) { rej(new Error('refused')); return; } this.ok = true;
        for (const t of this.subs) this.sendSub(t); this.ping = setInterval(() => { if (ws.readyState === 1) ws.send(new Uint8Array([0xC0, 0])); }, 25000); res(this); });
      ws.onclose = () => { this.ok = false; clearInterval(this.ping); if (!done) { done = true; clearTimeout(to); rej(new Error('closed')); } else if (this.onclose) this.onclose(); };
      ws.onerror = () => { };
    });
  }
  data(chunk, onConnack) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
    for (;;) {
      if (this.buf.length < 2) return; let n = 0, m = 1, i = 1, d;
      do { if (i >= this.buf.length) return; d = this.buf[i++]; n += (d & 127) * m; m *= 128; } while (d & 128);
      if (this.buf.length < i + n) return; const type = this.buf[0], p = this.buf.subarray(i, i + n); this.buf = this.buf.slice(i + n);
      const k = type >> 4;
      if (k === 2) onConnack(p[1] === 0);
      else if (k === 3) { const tl = (p[0] << 8) | p[1], topic = td.decode(p.subarray(2, 2 + tl)), q = (type >> 1) & 3, off = 2 + tl + (q ? 2 : 0); if (this.onmsg) try { this.onmsg(topic, td.decode(p.subarray(off))); } catch (e) { console.warn(e); } }
    }
  }
  sendSub(topic) { const id = this.pid = (this.pid % 65000) + 1; this.ws.send(mpkt(0x82, [id >> 8, id & 255, ...mstr(topic), 0])); }
  subscribe(topic) { this.subs.push(topic); if (this.ok) this.sendSub(topic); }
  publish(topic, str) { if (this.ok && this.ws.readyState === 1) this.ws.send(mpkt(0x30, mstr(topic), te.encode(str))); }
  close() { try { this.ws.close(); } catch { } }
}
const relayBase = (code) => 'blackbriar/crew/v1/' + code;
const topicSafe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
function relaySend(mq, topic, from, m) { // chunk anything big
  const j = JSON.stringify(m), CH = 16000;
  if (j.length <= CH) { mq.publish(topic, JSON.stringify({ f: from, m })); return; }
  const id = Math.random().toString(36).slice(2, 8), n = Math.ceil(j.length / CH);
  for (let i = 0; i < n; i++) mq.publish(topic, JSON.stringify({ f: from, c: id, i, n, d: j.slice(i * CH, (i + 1) * CH) }));
}
function relayReader(cb) { // reassembles chunks, then hands over (from, message)
  const parts = new Map();
  return (str) => { let o; try { o = JSON.parse(str); } catch { return; } if (!o || typeof o.f !== 'string') return;
    if (!o.c) { cb(o.f, o.m); return; }
    const k = o.f + ':' + o.c; let e = parts.get(k); if (!e) { e = { n: o.n, got: 0, d: new Array(o.n), t: Date.now() }; parts.set(k, e); }
    if (e.d[o.i] == null) { e.d[o.i] = o.d; e.got++; } if (e.got === e.n) { parts.delete(k); try { cb(o.f, JSON.parse(e.d.join(''))); } catch { } }
    for (const [kk, v] of parts) if (Date.now() - v.t > 30000) parts.delete(kk); };
}

export class PeerHost {
  constructor(pid, name, code) {
    this.pid = pid; this.name = name; this.code = code; this.room = code; this.mode = 'coop'; this.handlers = []; this.conns = new Map(); this.status = 'connecting';
    let save = null; try { save = loadSolo(); } catch { }
    const onSave = (d) => { try { localStorage.setItem(SOLO_KEY, JSON.stringify(d)); } catch { } };
    try { this.sim = new Sim(save, { onSave }); } catch { this.sim = new Sim(null, { onSave }); }
  }
  async connect(tries = 0) {
    const noPeer = RELAY_ONLY;
    let Peer = null; if (!noPeer) try { Peer = await loadPeerJS(); } catch { }
    if (!Peer) { this.startRelay(); return; }
    const peer = this.peer = new Peer(PEER_PREFIX + this.code, peerOpts());
    const fallback = setTimeout(() => this.startRelay(), 6000); // the matchmaker is slow or down: go on with the relay alone
    peer.on('open', () => { clearTimeout(fallback); this.startRelay(); });
    peer.on('connection', (conn) => {
      conn.on('data', (m) => this.onData(conn, m));
      conn.on('close', () => { if (conn.pid && this.conns.get(conn.pid) === conn) { this.conns.delete(conn.pid); this.sim.leave(conn.pid); this.sim.save('disconnect'); this.flush(); } });
      conn.on('error', () => { });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { } }); // lost the matchmaker; players already connected keep playing
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && !this.started && tries < 5) { clearTimeout(fallback); try { peer.destroy(); } catch { } this.code = this.room = newRoomCode(); this.connect(tries + 1); return; }
      if (!this.started) { clearTimeout(fallback); this.startRelay(); }
    });
  }
  async startRelay() {
    if (this.relayStarted) return; this.relayStarted = true;
    this.rconns = new Map(); this.mqs = [];
    if (this.peer && this.peer.open) this.begin(); // the direct route is up: open the crew now, the relays join in the background
    const reader = (mq) => relayReader((from, m) => { from = topicSafe(from); let c = this.rconns.get(from);
      if (!c) { c = { relay: true, open: true, send: (x) => relaySend(c.mq, relayBase(this.code) + '/g/' + from, this.pid, x), close: () => { c.open = false; } }; this.rconns.set(from, c); }
      c.mq = mq; c.last = Date.now(); this.onData(c, m); });
    await Promise.all(RELAYS().map(async (url) => { const mq = new Mqtt(url), read = reader(mq); mq.onmsg = (topic, str) => read(str);
      mq.subscribe(relayBase(this.code) + '/h'); try { await mq.connect(); this.mqs.push(mq); mq.onclose = () => setTimeout(() => mq.connect().catch(() => { }), 2000); } catch { } }));
    // relay guests that go quiet have left
    this.relayTimer = setInterval(() => { const now = Date.now(); for (const [k, c] of this.rconns) if (now - c.last > 40000) { this.rconns.delete(k); if (c.pid && this.conns.get(c.pid) === c) { this.conns.delete(c.pid); this.sim.leave(c.pid); this.sim.save('disconnect'); this.flush(); } } }, 3000);
    if (!this.mqs.length && !(this.peer && this.peer.open)) { this.emit({ t: 'reject', msg: 'Could not open a crew. Check your internet connection and try again.' }); return; }
    this.begin();
  }
  begin() {
      if (this.started) return; this.started = true; this.status = 'online';
      const r = this.sim.join(this.pid, this.name);
      this.emit({ ...r.welcome, room: this.code }); this.emit({ t: 'netstatus', status: 'online' }); this.flush();
      let last = performance.now();
      this.timer = setInterval(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; this.sim.tick(dt); this.flush(); }, 50);
      addEventListener('pagehide', () => this.sim.save('pagehide'));
  }
  onData(conn, m) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (m.t === 'hb') { if (conn.pid) return; m = { ...m, t: 'hello' }; } // a guest we lost track of: let them straight back in
    if (conn.pid && m.t === 'hello') { // a relay guest that reloaded, or whose welcome got lost: send it again
      if (conn.relay && Date.now() - (conn.welT || 0) > 6000) { const res = this.sim.join(conn.pid, String(m.name || 'Worker').slice(0, 16)); if (res.welcome) { conn.welT = Date.now(); conn.send({ ...res.welcome, room: this.code }); this.flush(); } }
      return;
    }
    if (!conn.pid) {
      if (m.t !== 'hello' || typeof m.pid !== 'string' || !m.pid || m.pid.length > 40) return;
      const old = this.conns.get(m.pid); if (old && old !== conn) { this.conns.delete(m.pid); if (old.relay) old.open = false; else try { old.close(); } catch { } } // same worker, new route: no one is kicked
      const res = this.sim.join(m.pid, String(m.name || 'Worker').slice(0, 16));
      if (res.error) { conn.send({ t: 'reject', msg: res.error }); return; }
      conn.pid = m.pid; conn.welT = Date.now(); this.conns.set(m.pid, conn); conn.send({ ...res.welcome, room: this.code }); this.flush(); return;
    }
    this.sim.handle(conn.pid, m); if (m.t !== 'st') this.flush();
  }
  flush() {
    const out = this.sim.out; this.sim.out = [];
    for (const { ev, to, except } of out) {
      if ((!to || to === this.pid) && except !== this.pid) this.emit(ev);
      if (ev.t === 'welcome') continue;
      for (const [pid, c] of this.conns) { if (to && to !== pid) continue; if (except && except === pid) continue; if (c.open) { try { c.send(ev); } catch { } } }
    }
  }
  send(m) { this.sim.handle(this.pid, m); if (m.t !== 'st') this.flush(); }
  on(fn) { this.handlers.push(fn); }
  emit(m) { m = JSON.parse(JSON.stringify(m)); for (const h of this.handlers) h(m); }
  close() { clearInterval(this.timer); clearInterval(this.relayTimer); this.sim.save('close'); try { this.peer && this.peer.destroy(); } catch { } for (const mq of this.mqs || []) mq.close(); }
}

export class PeerGuest {
  constructor(pid, name, code) { this.pid = pid; this.name = name; this.code = code; this.room = code; this.mode = 'coop'; this.handlers = []; this.status = 'connecting'; }
  async connect() {
    this.emit({ t: 'netstatus', status: 'connecting' });
    const fail = (msg) => { if (this.done) return; this.done = true; this.emit({ t: 'reject', msg }); };
    this.fail = fail; this.via = null;
    this.waitT = setTimeout(() => { if (this.status !== 'online') fail(`Could not reach crew ${this.code}. Check the code, and make sure the host still has the game open.`); }, 30000);
    const got = (m, via) => { if (!m || typeof m.t !== 'string' || this.done) return;
      if (m.t === 'welcome') { if (this.status === 'online') return; this.status = 'online'; this.via = via; clearTimeout(this.waitT); clearTimeout(this.relayT); this.lastMsg = Date.now();
        if (via === 'relay') { try { this.peer && this.peer.destroy(); } catch { } } else for (const mq of this.mqs || []) mq.close();
        const back = this.reconnecting; this.reconnecting = false; this.startHeartbeat();
        this.emit(m); if (back) this.emit({ t: 'netstatus', status: 'online' }); else this.emit({ t: 'netstatus', status: 'online' }); return; }
      if (this.via && via !== this.via) return; this.lastMsg = Date.now();
      if (m.t === 'reject') { fail(m.msg); return; } this.emit(m); };
    this.got = got;
    const noPeer = RELAY_ONLY;
    let Peer = null; if (!noPeer) try { Peer = await loadPeerJS(); } catch { }
    this.relayT = setTimeout(() => this.tryRelay(), Peer ? 6000 : 0); // no direct link within a few seconds: use the relay
    if (!Peer) return;
    const peer = this.peer = new Peer(undefined, peerOpts());
    peer.on('open', () => {
      const c = this.conn = peer.connect(PEER_PREFIX + this.code, { reliable: true });
      c.on('open', () => { if (this.relayStarted) { try { c.close(); } catch { } return; } clearTimeout(this.relayT); this.relayT = setTimeout(() => { if (this.status !== 'online') { try { c.close(); } catch { } this.tryRelay(); } }, 7000); c.send({ t: "hello", pid: this.pid, name: this.name }); });
      c.on('data', (m) => got(m, 'peer'));
      c.on('close', () => { if (this.status === 'online' && this.via === 'peer') this.reconnect(); });
      c.on('error', () => { });
    });
    peer.on('error', (e) => { if (this.status !== 'online') { clearTimeout(this.relayT); this.tryRelay(); } }); // not on the matchmaker: maybe the host is relay-only
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { } });
  }
  async tryRelay() {
    if (this.relayStarted || this.status === 'online' || this.done) return;
    if (this.via === 'peer') return; this.relayStarted = true; this.mqs = [];
    const me = topicSafe(this.pid), base = relayBase(this.code), read = relayReader((from, m) => this.got(m, 'relay'));
    for (const url of RELAYS()) {
      const mq = new Mqtt(url); mq.onmsg = (t, s) => read(s); mq.subscribe(base + '/g/' + me);
      try { await mq.connect(); } catch { continue; }
      this.mqs.push(mq); this.mq = mq;
      const hello = () => { if (this.status === 'online' || this.done) return; this.relayHello = true; relaySend(mq, base + '/h', this.pid, { t: 'hello', pid: this.pid, name: this.name }); setTimeout(hello, 2500); };
      hello();
      mq.onclose = () => { if (this.via === 'relay' && !this.done && this.mq === mq) setTimeout(() => mq.connect().catch(() => this.reconnect()), 1000); };
      return;
    }
    if (this.reconnecting) { this.relayStarted = false; this.retryPeer(); setTimeout(() => this.tryRelay(), 4000); return; } // relays unreachable: try the direct link too, and keep trying until the deadline
    if (this.status !== 'online') this.fail('Could not reach the crew. Check your internet connection and try again.');
  }
  // a heartbeat that keeps going in the background, and a watch on the host: if it goes quiet, rejoin
  startHeartbeat() {
    clearInterval(this.hbT); this.lastMsg = Date.now();
    this.hbT = setInterval(() => {
      if (this.done) return clearInterval(this.hbT);
      if (this.status === 'online') { this.send({ t: 'hb', pid: this.pid, name: this.name }); if (Date.now() - this.lastMsg > 9000) this.reconnect(); }
    }, 2000);
    if (!this.visHook) { this.visHook = true; document.addEventListener('visibilitychange', () => { if (!document.hidden && this.status === 'online' && Date.now() - this.lastMsg > 5000) this.reconnect(); }); }
  }
  async retryPeer() {
    if (this.status === 'online' || this.done || RELAY_ONLY) return; let Peer; try { Peer = await loadPeerJS(); } catch { return; }
    try { this.peer && this.peer.destroy(); } catch { }
    const peer = this.peer = new Peer(undefined, peerOpts());
    peer.on('open', () => { const c = this.conn = peer.connect(PEER_PREFIX + this.code, { reliable: true });
      c.on('open', () => c.send({ t: 'hello', pid: this.pid, name: this.name })); c.on('data', (m) => { if (peer === this.peer) this.got(m, 'peer'); });
      c.on('close', () => { if (this.status === 'online' && this.via === 'peer' && peer === this.peer) this.reconnect(); }); c.on('error', () => { }); });
    peer.on('error', () => { });
  }
  reconnect() {
    if (this.done || this.reconnecting) return; this.reconnecting = true; this.status = 'reconnecting';
    this.emit({ t: 'netstatus', status: 'reconnecting' });
    try { this.peer && this.peer.destroy(); } catch { } this.peer = null; this.conn = null;
    for (const mq of this.mqs || []) { mq.onclose = null; mq.close(); } this.mqs = []; this.mq = null; this.via = null; this.relayStarted = false;
    clearTimeout(this.waitT); this.waitT = setTimeout(() => { if (this.status !== 'online') this.fail('Lost the crew. The host may have closed the game.'); }, 120000);
    this.tryRelay();
  }
  send(m) {
    if (this.via === 'relay') { if (this.mq) relaySend(this.mq, relayBase(this.code) + '/h', this.pid, m); return; }
    if (this.conn && this.conn.open) { try { this.conn.send(m); } catch { } }
  }
  on(fn) { this.handlers.push(fn); }
  emit(m) { for (const h of this.handlers) h(m); }
  close() { this.done = true; clearTimeout(this.waitT); clearTimeout(this.relayT); clearInterval(this.hbT); try { this.peer && this.peer.destroy(); } catch { } for (const mq of this.mqs || []) mq.close(); }
}
