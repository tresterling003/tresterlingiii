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
  emit(m) { for (const h of this.handlers) h(m); }
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
