// Co-op server: serves the game and runs one authoritative Sim per crew room. `npm start`, then open http://host:PORT
// Env: PORT (default 8080), ROOMS_DIR (default ./rooms), LAG_MS (artificial one-way latency for testing).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Sim } from './shared/sim.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8080;
const ROOMS_DIR = path.resolve(process.env.ROOMS_DIR || path.join(ROOT, 'rooms'));
const LAG = +process.env.LAG_MS || 0;
fs.mkdirSync(ROOMS_DIR, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const PUBLIC = ['index.html', 'client/', 'shared/', 'assets/'];
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  if (u === 'healthz') { res.writeHead(200); return res.end('ok'); }
  if (!PUBLIC.some(p => u === p || u.startsWith(p)) || u.includes('..')) { res.writeHead(404); return res.end('not found'); }
  const f = path.join(ROOT, u);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': u.startsWith('assets/') ? 'max-age=86400' : 'no-cache' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();
const codeOk = (c) => /^[A-Z]{4}$/.test(c);
function newCode() { const A = 'BCDFGHJKLMNPQRSTVWXZ'; let c; do { c = Array.from({ length: 4 }, () => A[Math.random() * A.length | 0]).join(''); } while (rooms.has(c) || fs.existsSync(saveFile(c))); return c; }
const saveFile = (code) => path.join(ROOMS_DIR, code + '.json');
function writeAtomic(code, data) { // write to a temp file then rename, so a crash never leaves a half-written save
  const f = saveFile(code), tmp = f + '.' + process.pid + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, f); } catch (e) { console.error('save failed', code, e.message); }
}
function getRoom(code) {
  let r = rooms.get(code); if (r) return r;
  let save = null;
  if (fs.existsSync(saveFile(code))) { try { save = JSON.parse(fs.readFileSync(saveFile(code), 'utf8')); } catch (e) { console.error('corrupt save, starting fresh copy', code, e.message); fs.copyFileSync(saveFile(code), saveFile(code) + '.corrupt'); } }
  const sim = new Sim(save, { allowTeleport: !!process.env.DEBUG_TP, onSave: (data) => writeAtomic(code, data) });
  r = { code, sim, clients: new Map(), empty: 0 };
  r.timer = setInterval(() => step(r, 0.05), 50);
  rooms.set(code, r); return r;
}
function send(ws, obj) { if (ws.readyState !== 1) return; const s = JSON.stringify(obj); LAG ? setTimeout(() => ws.readyState === 1 && ws.send(s), LAG) : ws.send(s); }
function flush(r) {
  for (const { ev, to, except } of r.sim.out) for (const [pid, ws] of r.clients) { if (to && to !== pid) continue; if (except && except === pid) continue; send(ws, ev); }
  r.sim.out = [];
}
function step(r, dt) {
  r.sim.tick(dt); flush(r);
  if (!r.clients.size) { r.empty += dt; if (r.empty > 600) { r.sim.save('unload'); clearInterval(r.timer); rooms.delete(r.code); } } else r.empty = 0;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  let room = null, pid = null;
  ws.on('message', (raw) => {
    const handle = () => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!room) {
        if (m.t !== 'hello' || typeof m.pid !== 'string' || m.pid.length > 40) return;
        let code = String(m.room || '').toUpperCase();
        if (code === 'NEW') code = newCode();
        if (!codeOk(code)) return send(ws, { t: 'reject', msg: 'That crew code does not exist.' });
        if (m.join && !rooms.has(code) && !fs.existsSync(saveFile(code))) return send(ws, { t: 'reject', msg: `No crew called ${code}. Check the code.` });
        const r = getRoom(code);
        const old = r.clients.get(m.pid); if (old && old !== ws) { try { old.close(4000, 'replaced'); } catch { } r.clients.delete(m.pid); r.sim.leave(m.pid); }
        const res = r.sim.join(m.pid, String(m.name || 'Worker').slice(0, 16));
        if (res.error) return send(ws, { t: 'reject', msg: res.error });
        room = r; pid = m.pid; r.clients.set(pid, ws);
        send(ws, { ...res.welcome, room: code });
        flush(r);
        return;
      }
      room.sim.handle(pid, m);
      if (m.t !== 'st') flush(room);
    };
    LAG ? setTimeout(handle, LAG) : handle();
  });
  ws.on('close', () => { if (room && room.clients.get(pid) === ws) { room.clients.delete(pid); room.sim.leave(pid); room.sim.save('disconnect'); flush(room); } });
});
// keep-alive so idle proxies do not drop the socket
setInterval(() => { for (const ws of wss.clients) if (ws.readyState === 1) ws.ping(); }, 20000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const r of rooms.values()) r.sim.save('shutdown'); process.exit(0); });
server.listen(PORT, () => console.log(`Blackbriar server on http://localhost:${PORT}  (saves in ${ROOMS_DIR})`));
