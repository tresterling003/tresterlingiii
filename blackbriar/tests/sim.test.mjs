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

t('mop strokes are exact, order-independent and survive save/load', () => {
  const P = PATCHES.find(p => p.id === 'class_mud');
  const mk = () => { const s = new Sim(); s.join('a', 'A'); s.inv.a.mop = true; const p = s.players.get('a'); p.x = 13; p.z = -4; return s; };
  const s1 = mk(), s2 = mk();
  const A = { t: 'mop', patch: P.id, pts: [[12.5, -4, 120], [12.7, -4.1, 120]] }, B = { t: 'mop', patch: P.id, pts: [[12.6, -4, 200]] };
  s1.handle('a', A); s1.handle('a', B); s2.handle('a', B); s2.handle('a', A);
  assert.deepEqual(s1.masks[P.id], s2.masks[P.id]);
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

t('the Monitor hears a vacuum, investigates, sees, chases and catches', () => {
  const s = new Sim(); s.join('a', 'A'); s.inv.a.vacuum = true; s.shiftT = 400; // past the peaceful opening
  const p = s.players.get('a'); p.x = 30; p.z = 1.8; p.tool = 'vacuum'; p.act = 1;
  s.mon.x = 36; s.mon.z = 1.8; s.mon.yaw = -Math.PI / 2; s.setMon('patrol');
  const seen = new Set();
  for (let i = 0; i < 400 && p.x > 25; i++) { s.tick(0.1); seen.add(s.mon.state); if (drain(s).some(e => e.ev.t === 'caught')) { seen.add('CAUGHT'); break; } }
  assert.ok(seen.has('chase') || seen.has('watch') || seen.has('investigate'), [...seen].join(','));
  // stand still in its path until caught
  for (let i = 0; i < 300 && !seen.has('CAUGHT'); i++) { s.tick(0.1); seen.add(s.mon.state); const ev = drain(s); if (ev.some(e => e.ev.t === 'caught')) { seen.add('CAUGHT'); break; } }
  assert.ok(seen.has('CAUGHT'), [...seen].join(','));
});

t('shift ends after 4:00 when the crew is bolted in; next day keeps the dirt exactly', () => {
  const s = new Sim(); s.join('a', 'A'); s.inv.a.mop = true; const p = s.players.get('a');
  p.x = 13; p.z = -4; s.handle('a', { t: 'mop', patch: 'class_mud', pts: [[13, -4, 255]] });
  const snap = Uint8Array.from(s.masks.class_mud);
  p.x = 23.5; p.z = 7; s.doors.d_office.open = false; s.doors.d_office.bolted = true;
  s.shiftT = CONFIG.shiftSeconds - 0.05;
  for (let i = 0; i < 400 && s.phase !== 'summary'; i++) { s.tick(0.1); drain(s); }
  assert.equal(s.phase, 'summary'); assert.equal(s.summary.failed, false);
  s.handle('a', { t: 'sleep' }); assert.equal(s.day, 2); assert.equal(s.phase, 'shift');
  assert.deepEqual(s.masks.class_mud, snap); assert.ok(s.discoveries.find(d => d.id === 'room014'));
});

t('caught before 4:00 alone: wake in office, cleaning kept', () => {
  const s = new Sim(); s.join('a', 'A'); s.money = 50; const p = s.players.get('a'); p.x = 30; p.z = 1.8;
  s.collected[3] = 1; s.catchPlayer(p); assert.ok(inOffice(p)); assert.equal(s.collected[3], 1); assert.equal(s.money, 40);
});

console.log(`\n${pass} passed`);
