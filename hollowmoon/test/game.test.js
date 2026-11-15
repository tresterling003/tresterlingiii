'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Room } = require('../public/game');

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function make(n, seed = 1, bots = true) {
  const room = new Room('TEST', { instant: true, rng: seeded(seed) });
  for (let i = 0; i < n; i++) room.addPlayer('P' + i, bots);
  return room;
}
function setRoles(room, roles) { room.players.forEach((p, i) => { p.role = roles[i]; }); }

test('all-bot games always finish, at every size', () => {
  const wins = {};
  for (let n = 5; n <= 10; n++) {
    wins[n] = { villager: 0, werewolf: 0, jester: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const room = make(n, seed * 7 + n);
      assert.deepStrictEqual(room.start(), {});
      let steps = 0;
      while (room.phase !== 'over') { room.step(); assert.ok(++steps < 400, 'game did not terminate'); }
      wins[n][room.winner]++;
      assert.ok(room.players.some(p => room.isWinner(p)));
    }
  }
  console.log(wins);
});

test('deck sizes', () => {
  for (let n = 5; n <= 10; n++) assert.strictEqual(Room.deck(n).length, n);
  assert.strictEqual(Room.deck(10).filter(r => r === 'werewolf').length, 2);
});

test('doctor blocks the kill; sheriff learns the truth', () => {
  const room = make(5, 3, false);
  room.start();
  setRoles(room, ['werewolf', 'sheriff', 'doctor', 'villager', 'villager']);
  const [s, l, f, c] = room.players;
  room.step(); // reveal -> night
  room.nightAction(s, c.id);
  room.nightAction(f, c.id);
  room.nightAction(l, s.id);
  room.step();
  assert.strictEqual(room.phase, 'dawn');
  assert.ok(c.alive);
  assert.deepStrictEqual(l.notes.map(n => [n.id, n.wolf]), [[s.id, true]]);
  // fixer can't cover the same player twice running
  room.step(); room.step(); room.step(); room.step(); // day, vote, verdict, night 2
  assert.strictEqual(room.phase, 'night');
  room.nightAction(f, c.id);
  assert.strictEqual(room.night.shield, null);
});

test('blessing doubles a vote; ties cut nobody; jester wins when cut', () => {
  const room = make(6, 5, false);
  room.start();
  setRoles(room, ['werewolf', 'sheriff', 'doctor', 'villager', 'villager', 'jester']);
  const [s, l, f, c1, c2, fg] = room.players;
  room.step();
  room.nightAction(s, c2.id);
  room.step(); // dawn: c2 busted
  assert.ok(!c2.alive);
  room.step(); room.step(); // day -> vote
  room.vote(s, l.id); room.vote(l, s.id);
  room.step();
  assert.strictEqual(room.verdict.cut, null, 'tie cuts nobody');
  room.step(); // night 2
  room.nightAction(s, c1.id);
  room.bless(c2, l.id);
  room.step();
  assert.strictEqual(room.blessed, l.id);
  room.step(); room.step();
  room.vote(l, fg.id); room.vote(s, l.id); room.vote(f, l.id);
  room.vote(fg, s.id);
  room.vote(l, fg.id);
  // l(2) on fg vs 2 on l vs 1 on s -> tie
  room.step();
  assert.strictEqual(room.verdict.cut, null);
  room.step(); // night 3
  room.nightAction(s, f.id);
  room.bless(c2, l.id); room.bless(c1, l.id);
  room.step(); room.step(); room.step();
  room.vote(l, fg.id); room.vote(s, l.id);
  room.step();
  assert.strictEqual(room.verdict.cut, fg.id, 'blessing breaks the tie');
  room.step();
  assert.strictEqual(room.winner, 'jester');
  assert.ok(room.isWinner(fg) && !room.isWinner(l) && !room.isWinner(s));
});

test('views never leak hidden roles or private channels', () => {
  const room = make(7, 9, false);
  room.start();
  setRoles(room, ['werewolf', 'werewolf', 'sheriff', 'doctor', 'villager', 'villager', 'villager']);
  const [s1, s2, l, , c] = room.players;
  room.step();
  room.chat(s1, 'wolf', 'hit the sheriff');
  room.nightAction(s1, c.id);
  room.nightAction(l, s2.id);
  const cv = room.view(c);
  assert.deepStrictEqual(cv.players.filter(p => p.role).map(p => p.id), [c.id]);
  assert.ok(!cv.feed.some(m => m.ch === 'wolf'));
  assert.strictEqual(cv.you.teamPicks, undefined);
  const sv = room.view(s2);
  assert.deepStrictEqual(sv.players.filter(p => p.role).map(p => p.id), [s1.id, s2.id]);
  assert.ok(sv.feed.some(m => m.ch === 'wolf'));
  assert.deepStrictEqual(sv.you.teamPicks, [{ by: s1.id, target: c.id }]);
  room.step();
  assert.ok(room.view(l).feed.some(m => /investigated/.test(m.text)));
  assert.ok(!room.view(s1).feed.some(m => /investigated/.test(m.text)));
  assert.ok(!JSON.stringify(room.view(c)).includes('"bot"'));
});
