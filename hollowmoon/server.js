'use strict';
// HOLLOWMOON server: serves the client and runs every room over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room, MAX_PLAYERS, MIN_PLAYERS } = require('./public/game');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };

const rooms = new Map(); // code -> Room
const seats = new Map(); // room code -> Map(playerId -> { token, ws })

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\/(vendor|assets)\//.test(url.pathname) ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room) {
  const s = seats.get(room.code);
  if (!s) return;
  for (const [pid, seat] of s) {
    const p = room.get(pid);
    if (p && seat.ws) send(seat.ws, room.view(p));
  }
}
function createRoom() {
  const code = newCode();
  const room = new Room(code, { onChange: broadcast });
  rooms.set(code, room);
  seats.set(code, new Map());
  return room;
}
function seat(ws, room, player) {
  const token = crypto.randomBytes(12).toString('hex');
  seats.get(room.code).set(player.id, { token, ws });
  ws.session = { room, pid: player.id };
  send(ws, { t: 'joined', code: room.code, pid: player.id, token });
  broadcast(room);
}
function leave(ws, forget) {
  const s = ws.session;
  if (!s) return;
  ws.session = null;
  const roomSeats = seats.get(s.room.code);
  const st = roomSeats && roomSeats.get(s.pid);
  if (!st || st.ws !== ws) return;
  st.ws = null;
  const p = s.room.get(s.pid);
  if (forget || s.room.phase === 'lobby') roomSeats.delete(s.pid);
  if (p) s.room.setConnected(p, false);
}

wss.on('connection', ws => {
  ws.alive = true;
  ws.lastChat = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => leave(ws, false));
  ws.on('error', () => {});
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try { handle(ws, m); } catch (e) { console.error(e); send(ws, { t: 'error', msg: 'Something went wrong.' }); }
  });
});

function handle(ws, m) {
  if (m.t === 'create') {
    leave(ws, true);
    const room = createRoom();
    const { player } = room.addPlayer(m.name);
    seat(ws, room, player);
    if (m.solo) {
      const size = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, parseInt(m.size, 10) || 7));
      while (room.players.length < size) room.addPlayer('', true);
      room.start();
    }
    return;
  }
  if (m.t === 'join') {
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'error', msg: 'No room with that code.' });
    leave(ws, true);
    const r = room.addPlayer(m.name);
    if (r.error) return send(ws, { t: 'error', msg: r.error });
    return seat(ws, room, r.player);
  }
  if (m.t === 'rejoin') {
    const room = rooms.get(String(m.code || '').toUpperCase());
    const st = room && seats.get(room.code).get(m.pid);
    const p = room && room.get(m.pid);
    if (!st || !p || st.token !== m.token) return send(ws, { t: 'gone' });
    if (st.ws && st.ws !== ws) { st.ws.session = null; st.ws.close(); }
    st.ws = ws;
    ws.session = { room, pid: p.id };
    send(ws, { t: 'joined', code: room.code, pid: p.id, token: st.token });
    return room.setConnected(p, true);
  }

  const s = ws.session;
  if (!s) return;
  const room = s.room;
  const me = room.get(s.pid);
  if (!me) return;
  if (m.t === 'leave') { leave(ws, true); return send(ws, { t: 'left' }); }
  if (m.t === 'chat') {
    const now = Date.now();
    if (now - ws.lastChat < 350) return;
    ws.lastChat = now;
  }
  const err = room.command(me, m);
  if (err) send(ws, { t: 'error', msg: err });
}

// Drop dead sockets, and rooms nobody has been in for a while.
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false;
    ws.ping();
  });
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = room.humansConnected().length === 0;
    if ((empty && now - room.lastActive > 5 * 60e3) || now - room.lastActive > 3 * 3600e3) {
      room.destroy();
      rooms.delete(code);
      seats.delete(code);
    }
  }
}, 30000).unref();

server.listen(PORT, () => console.log(`HOLLOWMOON running on http://localhost:${PORT}`));
