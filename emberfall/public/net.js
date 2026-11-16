// Three ways to reach a game, all speaking the same messages:
//   LocalConn  — the engine runs in this browser tab (solo, or hosting a table)
//   GuestConn  — joins a friend's hosted table over the page's shared room
//   SocketConn — a Node server runs the game (see server.js)
// Each calls onMsg with {t:'state'|'joined'|'error'|'left'|'gone', ...}.

const { Room } = self.Emberfall;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const tableName = code => 'ef-' + code.toLowerCase();

// The hosting page's shared room, when the page is published somewhere that has one.
let roomPromise;
export function sharedRoom() {
  if (!roomPromise) {
    roomPromise = (async () => {
      try { return window.claude && window.claude.use ? await window.claude.use('room') : null; } catch { return null; }
    })();
  }
  return roomPromise;
}

export class LocalConn {
  constructor(onMsg) { this.onMsg = onMsg; this.remotes = new Map(); }

  async create({ name, solo }) {
    this.room = new Room(newCode(), { onChange: () => this.changed() });
    this.me = this.room.addPlayer(name).player;
    if (!solo) {
      const shared = await sharedRoom();
      if (shared) await this.openTable(shared);
    }
    this.online = !!this.table;
    this.onMsg({ t: 'joined', code: this.room.code, hosting: !solo, online: this.online });
    this.changed();
  }

  // ---- hosting for friends: this tab is the referee ----
  async openTable(shared) {
    try { this.table = await shared.join(tableName(this.room.code)); } catch { this.table = null; return; }
    this.table.on('c2h', msg => this.fromGuest(msg));
    this.table.onPeers(change => change.left.forEach(peer => {
      for (const r of this.remotes.values()) if (r.peer === peer.peer) { const p = this.room.get(r.pid); if (p) this.room.setConnected(p, false); if (!this.room.get(r.pid)) this.remotes.delete(r.cid); }
    }));
    this.beat = setInterval(() => this.flush(true), 3000);
  }
  emit(to, data) { this.table.emit('h2c', { to, ...data }).catch(() => {}); }
  fromGuest(msg) {
    const d = msg.data;
    if (!d || typeof d !== 'object' || typeof d.cid !== 'string' || msg.sameTab) return;
    let r = this.remotes.get(d.cid);
    if (d.t === 'join') {
      if (!r) {
        const res = this.room.addPlayer(d.name);
        if (res.error) return this.emit(d.cid, { t: 'error', msg: res.error });
        r = { cid: d.cid, pid: res.player.id, peer: msg.peer, fid: 0, lastChat: 0 };
        this.remotes.set(d.cid, r);
      }
      r.peer = msg.peer;
      r.fid = 0;
      const p = this.room.get(r.pid);
      if (p && !p.connected) this.room.setConnected(p, true);
      this.emit(d.cid, { t: 'joined', code: this.room.code });
      return this.flush(true);
    }
    const p = r && this.room.get(r.pid);
    if (!p) return;
    if (d.t === 'sync') { r.fid = Math.min(r.fid, Number(d.after) || 0); return this.flush(true); }
    if (d.t === 'leave') { this.remotes.delete(d.cid); return this.room.phase === 'lobby' ? this.room.removePlayer(p.id) : this.room.setConnected(p, false); }
    if (d.t === 'chat') { const now = Date.now(); if (now - r.lastChat < 350) return; r.lastChat = now; }
    const err = this.room.command(p, d);
    if (err) this.emit(d.cid, { t: 'error', msg: err });
  }
  flush(force) {
    if (!this.table || !this.room) return;
    const now = Date.now();
    if (!force && now - (this.lastFlush || 0) < 350) { clearTimeout(this.flushTimer); this.flushTimer = setTimeout(() => this.flush(), 360); return; }
    this.lastFlush = now;
    for (const r of this.remotes.values()) {
      const p = this.room.get(r.pid);
      if (!p) { this.emit(r.cid, { t: 'gone' }); this.remotes.delete(r.cid); continue; }
      const v = this.room.view(p);
      const feed = v.feed.filter(m => m.id > r.fid);
      v.f0 = v.feed.length ? v.feed[0].id : 0;
      v.fid = v.feed.length ? v.feed[v.feed.length - 1].id : 0;
      delete v.feed;
      // a message may carry at most 4 KiB, so chat goes out in small batches
      for (let batch = []; feed.length || batch.length;) {
        const m = feed.shift();
        if (m) { const { only, ts, ...rest } = m; batch.push(rest); }
        if (!m || JSON.stringify(batch).length > 2400) { this.emit(r.cid, { f: batch }); r.fid = batch[batch.length - 1].id; batch = []; }
      }
      this.emit(r.cid, { s: v });
    }
  }

  changed() {
    if (this.pending || !this.room) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (!this.room) return;
      const me = this.room.get(this.me.id);
      if (me) this.onMsg(this.room.view(me));
      this.flush();
    });
  }
  send(m) {
    if (!this.room) return;
    if (m.t === 'leave') return this.close(true);
    const err = this.room.command(this.me, m);
    if (err) this.onMsg({ t: 'error', msg: err });
  }
  close(tell) {
    clearInterval(this.beat);
    clearTimeout(this.flushTimer);
    if (this.table) { for (const r of this.remotes.values()) this.emit(r.cid, { t: 'gone' }); this.table.leave().catch(() => {}); }
    if (this.room) this.room.destroy();
    this.room = this.table = null;
    if (tell) this.onMsg({ t: 'left' });
  }
}

export class GuestConn {
  constructor(onMsg) { this.onMsg = onMsg; this.cid = Math.random().toString(36).slice(2, 12); this.feed = []; this.heard = 0; }
  async join({ name, code }) {
    const shared = await sharedRoom();
    if (!shared) return this.onMsg({ t: 'error', msg: 'Joining a friend\'s table isn\'t available here.' });
    try { this.table = await shared.join(tableName(code)); } catch { return this.onMsg({ t: 'error', msg: 'Couldn\'t reach that table.' }); }
    this.table.on('h2c', msg => this.fromHost(msg.data));
    let tries = 0;
    const knock = () => {
      if (this.joined || !this.table) return;
      if (tries++ >= 6) { this.close(); return this.onMsg({ t: 'error', msg: 'No table with that code is open right now.' }); }
      this.emit({ t: 'join', name });
      this.knockTimer = setTimeout(knock, 1400);
    };
    knock();
    this.watch = setInterval(() => {
      if (this.joined && Date.now() - this.heard > 12000) { this.close(); this.onMsg({ t: 'gone', msg: 'Lost contact with the host.' }); }
    }, 4000);
  }
  emit(data) { if (this.table) this.table.emit('c2h', { cid: this.cid, ...data }).catch(() => {}); }
  fromHost(d) {
    if (!d || d.to !== this.cid) return;
    this.heard = Date.now();
    if (d.t === 'joined') { this.joined = true; return this.onMsg({ t: 'joined', code: d.code, online: true }); }
    if (d.t === 'error') { if (!this.joined) this.close(); return this.onMsg(d); }
    if (d.t === 'gone') { this.close(); return this.onMsg({ t: 'gone', msg: 'The host closed the table.' }); }
    if (Array.isArray(d.f)) {
      const last = this.feed.length ? this.feed[this.feed.length - 1].id : 0;
      d.f.forEach(m => { if (m && m.id > (this.feed.length ? this.feed[this.feed.length - 1].id : last)) this.feed.push(m); });
    }
    if (d.s) {
      const s = d.s;
      this.feed = this.feed.filter(m => m.id >= s.f0 && s.f0 > 0);
      const last = this.feed.length ? this.feed[this.feed.length - 1].id : 0;
      if (s.fid > last) this.emit({ t: 'sync', after: last });
      this.onMsg({ ...s, feed: this.feed.slice() });
    }
  }
  send(m) {
    if (m.t === 'leave') { this.emit({ t: 'leave' }); this.close(); return this.onMsg({ t: 'left' }); }
    this.emit(m);
  }
  close() {
    clearTimeout(this.knockTimer);
    clearInterval(this.watch);
    if (this.table) this.table.leave().catch(() => {});
    this.table = null;
  }
}

export class SocketConn {
  constructor(onMsg) { this.onMsg = onMsg; this.retry = 0; }
  static get session() { try { return JSON.parse(localStorage.getItem('emberfall.session')); } catch { return null; } }
  static set session(v) { try { v ? localStorage.setItem('emberfall.session', JSON.stringify(v)) : localStorage.removeItem('emberfall.session'); } catch { /* private mode */ } }
  open(first) {
    this.first = first;
    let ws;
    try { ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch { return this.fail(); }
    ws.onopen = () => { this.wasOpen = true; this.retry = 0; ws.send(JSON.stringify(this.first)); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t === 'joined') { SocketConn.session = { code: m.code, pid: m.pid, token: m.token }; this.first = { t: 'rejoin', code: m.code, pid: m.pid, token: m.token }; m.online = true; }
      if (m.t === 'gone' || m.t === 'left') { SocketConn.session = null; this.closed = true; }
      this.onMsg(m);
    };
    ws.onclose = () => {
      if (this.closed) return;
      if (!this.wasOpen) return this.fail();
      setTimeout(() => this.open(this.first), Math.min(5000, 500 * 2 ** this.retry++));
    };
  }
  fail() { this.closed = true; this.onMsg({ t: 'error', msg: 'Online tables need the game server, which isn\'t running here. Solo play still works.' }); }
  create(m) { this.open({ t: 'create', name: m.name }); }
  join(m) { this.open({ t: 'join', name: m.name, code: m.code }); }
  rejoin(s) { this.open({ t: 'rejoin', ...s }); }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closed = true; if (this.ws) this.ws.close(); }
}

// True when this page is served by server.js (it answers /healthz).
export async function hasServer() {
  try { const r = await fetch('healthz', { cache: 'no-store' }); return r.ok && (await r.text()) === 'ok'; } catch { return false; }
}
