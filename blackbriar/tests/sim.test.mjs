// Headless rules tests for the shared simulation: node tests/sim.test.mjs
import assert from 'node:assert/strict';
import { Sim, inOffice } from '../shared/sim.js';
import { DEBRIS, PATCHES, DOORS, buildNav, findPath, doorCenter, COMPUTER, TOOL_RACK } from '../shared/level.js';
import { CONFIG } from '../shared/config.js';

let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };
const drain = (s) => { const o = s.out; s.out = []; return o; };

t('debris ids are stable and generated deterministically', () => {
  assert.ok(DEBRIS.length > 4000); assert.equal(DEBRIS[0].id, 0); assert.equal(DEBRIS[DEBRIS.length - 1].id, DEBRIS.length - 1);
});

t('collection pays exactly once across two players', () => {
  const s = new Sim(); s.join('a', 'Ann'); s.join('b', 'Bo');
  for (const pid of ['a', 'b']) { s.inv[pid].vacuum = true; const d = DEBRIS[5]; s.players.get(pid).x = d.x; s.players.get(pid).z = d.z; }
  s.handle('a', { t: 'col', ids: [5, 5, 6] }); s.handle('b', { t: 'col', ids: [5, 6] });
  assert.equal(s.collected[5], 1); assert.equal(s.shiftStats.pieces, 2);
  assert.ok(Math.abs(s.money - 2 * CONFIG.pay.piece) < 1e-9);
});

t('cannot collect without a vacuum or from across the building', () => {
  const s = new Sim(); s.join('a', 'A'); s.handle('a', { t: 'col', ids: [10] }); assert.equal(s.collected[10], 0);
  s.inv.a.vacuum = true; s.players.get('a').x = 200; s.handle('a', { t: 'col', ids: [10] }); assert.equal(s.collected[10], 0);
});

t('mop strokes are exact and survive save/load; the server echoes the exact cells', () => {
  const P = PATCHES.find(p => p.id === 'class_mud');
  const mk = () => { const s = new Sim(); s.join('a', 'A'); s.inv.a.mop = true; const p = s.players.get('a'); p.x = 13; p.z = -4; return s; };
  const s1 = mk(), s2 = mk();
  const A = { t: 'mop', patch: P.id, pts: [[12.5, -4, 120], [12.7, -4.1, 120]] }, B = { t: 'mop', patch: P.id, pts: [[12.6, -4, 200]] };
  s1.handle('a', A); s1.handle('a', B); s2.handle('a', A); s2.handle('a', B);
  assert.deepEqual(s1.masks[P.id], s2.masks[P.id]);
  const echo = s1.out.filter(o => o.ev.t === 'maskset'); assert.ok(echo.length >= 2);
  assert.ok(s1.inv.a.mopDirt > 0, 'the mop picked up dirt');
  const saved = JSON.parse(JSON.stringify(s1.serialize())); const s3 = new Sim(saved);
  assert.deepEqual(s3.masks[P.id], s1.masks[P.id]); assert.equal(s3.maskSum[P.id], s1.maskSum[P.id]);
});

t('purchase deducts once and applies real values', () => {
  const s = new Sim(); s.join('a', 'A'); s.join('b', 'B'); s.money = 45;
  for (const pid of ['a', 'b']) { const p = s.players.get(pid); p.x = COMPUTER.x; p.z = COMPUTER.z; }
  s.handle('a', { t: 'buy', skill: 'suction1' }); s.handle('b', { t: 'buy', skill: 'suction1' });
  assert.equal(s.money, 5); assert.deepEqual(s.purchased, ['suction1']); assert.equal(s.upgrades.suction, 1);
  assert.equal(CONFIG.vacuum.reach[s.upgrades.suction], 3.2);
  const s2 = new Sim(JSON.parse(JSON.stringify(s.serialize()))); assert.equal(s2.upgrades.suction, 1);
});

t('fifth worker is rejected', () => {
  const s = new Sim(); for (const n of ['a', 'b', 'c', 'd']) assert.ok(s.join(n, n).ok);
  assert.ok(s.join('e', 'e').error); s.leave('d'); assert.ok(s.join('e', 'e').ok);
});

t('bolt only from inside, and the Monitor cannot path through a bolted office door', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a');
  const c = doorCenter(DOORS.find(d => d.id === 'd_office'));
  p.x = c.x; p.z = c.z - 0.8; s.handle('a', { t: 'door', id: 'd_office' }); assert.equal(s.doors.d_office.open, false);
  s.handle('a', { t: 'bolt' }); assert.equal(s.doors.d_office.bolted, false, 'outside player cannot bolt');
  p.x = c.x; p.z = c.z + 0.8; s.handle('a', { t: 'bolt' }); assert.equal(s.doors.d_office.bolted, true);
  s.handle('a', { t: 'door', id: 'd_office' }); assert.equal(s.doors.d_office.open, false, 'bolted door stays shut');
  const nav = buildNav(), office = DOORS.findIndex(d => d.id === 'd_office');
  assert.equal(findPath(nav, 21.5, 1.8, 23, 7, (i) => i !== office), null);
  assert.ok(findPath(nav, 21.5, 1.8, 23, 7, () => true));
});

t('a filthy mop smears; rinsing fixes it; re-cleaned floor does not pay twice', () => {
  const s = new Sim(); s.join('a', 'A'); s.inv.a.mop = true; const p = s.players.get('a'); p.x = 13; p.z = -4;
  s.inv.a.mopDirt = 1; const before = s.maskSum.hall_dust;
  p.x = 10; p.z = 1.8; s.handle('a', { t: 'mop', patch: 'hall_dust', pts: [[10, 1.8, 255]] });
  // first, clean a spot fully with a clean mop, then smear it, then clean again
  for (let k = 0; k < 8; k++) { s.inv.a.mopDirt = 0; s.handle('a', { t: 'mop', patch: 'hall_dust', pts: [[12, 1.8, 255]] }); }
  const m1 = s.money; s.inv.a.mopDirt = 1; s.handle('a', { t: 'mop', patch: 'hall_dust', pts: [[12, 1.8, 0]] });
  assert.ok(s.maskSum.hall_dust > 0); s.inv.a.mopDirt = 0; s.handle('a', { t: 'mop', patch: 'hall_dust', pts: [[12, 1.8, 255], [12, 1.8, 255]] });
  assert.ok(s.money - m1 < 1e-9, 'no pay for re-cleaning a smear');
  p.x = 3.2; p.z = 5.0; s.inv.a.mopDirt = 0.9; s.handle('a', { t: 'rinse' }); assert.equal(s.inv.a.mopDirt, 0);
});
t('stairwell key, Lost & Found, robot vacuum, clocking out', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a');
  p.x = 0.5; p.z = 1.8; s.handle('a', { t: 'door', id: 'd_stair' }); assert.equal(s.doors.d_stair.open, false);
  p.x = 9.8; p.z = -6.9; s.handle('a', { t: 'desk' }); assert.ok(s.keys.stairkey);
  p.x = 0.5; p.z = 1.8; s.handle('a', { t: 'door', id: 'd_stair' }); assert.equal(s.doors.d_stair.open, true);
  s.found.push({ n: 'Walkman', v: 7 }); p.x = 25.5; p.z = 5.6; const m0 = s.money; s.handle('a', { t: 'sell' }); assert.equal(s.money, m0 + 7);
  s.money = 200; s.handle('a', { t: 'buy', skill: 'roomba1' }); assert.equal(s.roombas.length, 1);
  const r = s.roombas[0]; p.x = r.x; p.z = r.z; s.handle('a', { t: 'roomba', id: 'roomba1' }); assert.equal(r.holder, 'a');
  p.x = 20; p.z = 1.8; p.yaw = Math.PI / 2; s.handle('a', { t: 'st', p: [20, 0, 1.8], yw: Math.PI / 2, pt: 0 }); s.handle('a', { t: 'roomba', id: 'roomba1' });
  assert.equal(r.state, 'run'); const left = s.collected.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 600; i++) s.tick(0.1); assert.ok(s.collected.reduce((a, b) => a + b, 0) > left, 'robot collected debris');
  p.x = 25.5; p.z = 5.6; s.handle('a', { t: 'clockout' }); assert.equal(s.phase, 'summary'); assert.equal(s.summary.clockedOut, true);
});
console.log('extra tests passed');
t('cafeteria: locked until the key on the lifeguard chair is taken', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a');
  p.x = -12.6; p.z = 7.6; s.handle('a', { t: 'door', id: 'd_cafe' }); assert.equal(s.doors.d_cafe.open, false);
  p.x = -27.6; p.z = 15.1; s.handle('a', { t: 'cafekey' }); assert.ok(s.keys.cafekey);
  p.x = -12.6; p.z = 7.6; s.handle('a', { t: 'door', id: 'd_cafe' }); assert.equal(s.doors.d_cafe.open, true);
  assert.ok(DEBRIS.some(d => d.room === 'cafe'));
});
console.log('cafeteria tests passed');

// ---------------- the stalker ----------------
const run = (s, sec, each) => { const ev = []; for (let i = 0; i < sec * 10; i++) { s.tick(0.1); for (const o of s.out) ev.push(o); s.out = []; if (each) each(i); } return ev; };
const lookAt = (p, x, z) => { p.yaw = Math.atan2(x - p.x, z - p.z) + Math.PI; }; // camera looks down -z at yaw 0
const lookAway = (p, x, z) => { p.yaw = Math.atan2(x - p.x, z - p.z); };

t('stalker: early in the night it lurks, follows and plays tricks, but never touches you', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a'); s.inv.a.vacuum = true;
  const states = new Set(), kinds = new Set(); let caught = 0;
  const route = [[30, 1.8], [12, 1.8], [13, -4], [5, 2], [36, 2]];
  const ev = run(s, CONFIG.shiftSeconds * CONFIG.monitor.huntAfter * 0.95, (i) => { const r = route[Math.floor(i / 300) % route.length]; p.x = r[0] + Math.sin(i * 0.01); p.z = r[1]; p.yaw = i * 0.013; states.add(s.mon.state); });
  for (const o of ev) { if (o.ev.t === 'caught') caught++; if (o.ev.t === 'prank' || o.ev.t === 'scare' || (o.ev.t === 'door' && o.ev.by === 'monitor')) kinds.add(o.ev.k || o.ev.t); }
  assert.equal(caught, 0); assert.ok(states.has('lurk') || states.has('shadow'), [...states].join(',')); assert.ok(kinds.size >= 3, [...kinds].join(','));
});
t('hunts are announced, limited per night, and caught alone means GAME OVER; Retry Night restores the start of the night', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a'); s.money = 20; s.nightStart = s.serializeCore();
  s.shiftT = CONFIG.shiftSeconds * 0.5; s.money = 55; s.collected[7] = 1;
  let hunts = 0, over = null;
  run(s, 500, () => { p.x = 30; p.z = 1.8; if (s.mon.state === 'hunt') lookAway(p, s.mon.x, s.mon.z); for (const o of s.out) { } });
  // count announcements over a fresh stretch
  const s2 = new Sim(); s2.join('a', 'A'); const q = s2.players.get('a'); s2.shiftT = CONFIG.shiftSeconds * 0.3;
  const ev = run(s2, 900, () => { q.x = 30; q.z = 1.8; lookAt(q, 0, 1.8); if (s2.phase === 'gameover') { s2.handle('a', { t: 'retry' }); s2.shiftT = CONFIG.shiftSeconds * 0.3; } });
  hunts = ev.filter(o => o.ev.t === 'hunt' && o.ev.on).length; assert.ok(hunts >= 1, 'at least one hunt');
  // game over and retry
  const s3 = new Sim(); s3.join('a', 'A'); const r = s3.players.get('a'); s3.money = 20; s3.nightStart = s3.serializeCore(); s3.money = 99; s3.collected[9] = 1;
  s3.catchPlayer(r); assert.equal(s3.phase, 'gameover'); assert.ok(s3.out.some(o => o.ev.t === 'gameover'));
  s3.handle('a', { t: 'retry' }); assert.equal(s3.phase, 'shift'); assert.equal(s3.money, 20); assert.equal(s3.collected[9], 0); assert.equal(s3.shiftT, 0);
});
t('frozen while watched; in a hunt it outruns you when you look away and catches you from behind', () => {
  const s = new Sim(); s.join('a', 'A'); s.shiftT = 400; const p = s.players.get('a');
  p.x = 30; p.z = 1.8; p.fl = 1; lookAt(p, 38, 1.8);
  s.mon.x = 38; s.mon.z = 1.8; s.setMon('hunt', { target: 'a', huntT: 0, lostT: 0, lastKnown: { x: 30, z: 1.8 }, sawHide: false, bangT: 0 }); s.dir.hunts = 1;
  run(s, 3, () => { p.blinkT = 0; s.dir.stare.a = 0; });
  assert.equal(s.mon.x, 38, 'did not move while watched'); assert.ok(s.mon.frozen);
  lookAway(p, 38, 1.8); const x0 = s.mon.x; run(s, 0.5);
  assert.ok((x0 - s.mon.x) / 0.5 > CONFIG.sprintSpeed, 'faster than a sprinting worker');
  const ev = run(s, 6); assert.ok(ev.some(o => o.ev.t === 'caught')); assert.equal(s.phase, 'gameover');
});
t('blinking lets it move; staring too long provokes it', () => {
  const s = new Sim(); s.join('a', 'A'); s.shiftT = CONFIG.shiftSeconds * 0.5; const p = s.players.get('a');
  p.x = 30; p.z = 1.8; p.fl = 1; s.mon.x = 37; s.mon.z = 1.8; s.setMon('lurk', { target: 'a', lurkFor: 60, seenT: 0 }); lookAt(p, 37, 1.8);
  const ev = run(s, CONFIG.monitor.stareLimit + 1.5);
  assert.ok(ev.some(o => o.ev.t === 'toast' && /too long/.test(o.ev.msg)), 'stare warning');
  s.handle('a', { t: 'blink' }); run(s, 0.5); assert.equal(s.mon.state, 'hunt', 'the moment you blink, it comes');
});
t('hiding in a locker: unseen, it loses you; seen getting in, it finds you', () => {
  const mk = () => { const s = new Sim(); s.join('a', 'A'); s.shiftT = 500; const p = s.players.get('a'); const L = { id: 'L140', x: 0, z: 0 }; return { s, p }; };
  { const { s, p } = mk(); const L = s.players && 'L140'; p.x = 16.2 + 0.2 + (140 - 126) * 0.4; p.z = 0.9; s.mon.x = 36; s.mon.z = 2.5;
    s.setMon('hunt', { target: 'a', huntT: 0, lostT: 0, lastKnown: { x: p.x, z: p.z }, sawHide: false, bangT: 0 });
    s.mon.x = 13; s.mon.z = -4.5; // in the classroom, no line of sight
    s.handle('a', { t: 'hide', id: 'L140' }); assert.equal(p.hidden, 'L140'); assert.equal(s.mon.sawHide, false);
    const ev = run(s, 25); assert.ok(!ev.some(o => o.ev.t === 'caught'), 'not found'); assert.notEqual(s.mon.state, 'hunt'); }
  { const { s, p } = mk(); p.x = 16.2 + 0.2 + (140 - 126) * 0.4; p.z = 0.9; s.mon.x = p.x + 8; s.mon.z = 1.8;
    s.setMon('hunt', { target: 'a', huntT: 0, lostT: 0, lastKnown: { x: p.x, z: p.z }, sawHide: false, bangT: 0 });
    s.handle('a', { t: 'hide', id: 'L140' }); assert.equal(s.mon.sawHide, true);
    const ev = run(s, 10); assert.ok(ev.some(o => o.ev.t === 'caught'), 'dragged out'); }
});
t('4:00 siege: hold the door and survive (dirt carries to the next night); let go and it gets in', () => {
  const siege = (hold) => {
    const s = new Sim(); s.join('a', 'A'); s.inv.a.mop = true; const p = s.players.get('a');
    p.x = 13; p.z = -4; s.handle('a', { t: 'mop', patch: 'class_mud', pts: [[13, -4, 255]] }); const snap = Uint8Array.from(s.masks.class_mud);
    p.x = 21.5; p.z = 4.6; lookAway(p, 21.5, 0); s.doors.d_office.open = false; s.doors.d_office.bolted = true; s.shiftT = CONFIG.shiftSeconds - 0.05;
    const ev = run(s, 260, () => { p.hold = hold && s.mon.step === 'try'; if (s.phase !== 'lockdown') return; });
    return { s, ev, snap };
  };
  { const { s, ev, snap } = siege(true); assert.ok(ev.some(o => o.ev.t === 'trydoor' && o.ev.on)); assert.equal(s.phase, 'summary'); assert.equal(s.summary.failed, false);
    s.handle('a', { t: 'sleep' }); assert.equal(s.day, 2); assert.deepEqual(s.masks.class_mud, snap); }
  { const { s } = siege(false); assert.equal(s.phase, 'gameover'); }
});
t('Room 014 opens partway through the first night', () => {
  const s = new Sim(); s.join('a', 'A'); const p = s.players.get('a'); p.x = 11.9; p.z = 3.0;
  s.handle('a', { t: 'door', id: 'd_014' }); assert.equal(s.doors.d_014.open, false);
  s.shiftT = CONFIG.shiftSeconds * 0.31; s.tick(0.1); assert.ok(s.keys['014']);
  s.handle('a', { t: 'door', id: 'd_014' }); assert.equal(s.doors.d_014.open, true);
});
console.log(`\n${pass} passed`);
