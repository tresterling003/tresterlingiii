'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Room } = require('../public/engine');
const D = require('../public/quest');

function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

// Plays a whole quest: `humans` players making random choices and fighting sensibly.
function play(seed, humans = 1, classes = []) {
  const rng = seeded(seed);
  const room = new Room('TEST', { instant: true, rng });
  const ps = [];
  for (let i = 0; i < humans; i++) ps.push(room.addPlayer('P' + i).player);
  classes.forEach((c, i) => room.command(ps[i], { t: 'build', cls: c, bonus: { might: 2, mind: 1, charm: 5 }, bg: 'hunter', tint: 3 }));
  assert.strictEqual(room.command(ps[0], { t: 'start' }), undefined);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  let steps = 0, defeats = 0, maxView = 0;
  while (room.phase !== 'end') {
    assert.ok(++steps < 5000, `stuck in ${room.phase} at ${room.node}`);
    const v = room.view(ps[0]);
    maxView = Math.max(maxView, JSON.stringify({ ...v, feed: undefined }).length);
    if (room.phase === 'choice') ps.forEach(p => { if (room.phase === 'choice' && !room.votes[p.id]) room.command(p, { t: 'vote', choice: pick(room.view(p).open.filter(c => !c.off)).id }); });
    else if (room.phase === 'roll') ps.forEach(p => room.command(p, { t: 'roll' }));
    else if (room.phase === 'fate') ps.forEach(p => room.command(p, { t: 'reroll' }));
    else if (room.phase === 'result' || room.phase === 'victory') ps.forEach(p => room.command(p, { t: 'next' }));
    else if (room.phase === 'defeat') { defeats++; room.command(ps[0], { t: 'retry' }); }
    else if (room.phase === 'combat' && !room.battle.busy && room.battle.turn) room.botAct(room.hero(room.battle.turn));
    else assert.ok(room.tick(), `nothing pending in ${room.phase}`);
  }
  return { room, defeats, maxView, ending: room.node, steps };
}

test('every quest reaches an ending, solo with each class', () => {
  const endings = {}, lost = {};
  let games = 0, clean = 0, maxView = 0;
  for (const cls of D.CLASS_ORDER) {
    for (let seed = 1; seed <= 120; seed++) {
      const r = play(seed * 13 + cls.length, 1, [cls]);
      games++;
      if (!r.defeats) clean++;
      endings[r.ending] = (endings[r.ending] || 0) + 1;
      maxView = Math.max(maxView, r.maxView);
      r.room.stats.path.forEach(n => { if (!D.NODES[n]) assert.fail('unknown scene ' + n); });
      lost[cls] = (lost[cls] || 0) + r.defeats;
    }
  }
  console.log({ games, wonWithoutRetry: clean, endings, defeatsByClass: lost, maxView });
  assert.ok(Object.keys(endings).length === 4, 'all four endings are reachable');
  const h = play(3, 1, ['knight']).room.heroes[0];
  assert.deepStrictEqual(h.stats, { might: 5, agility: 0, mind: 1, charm: 1 }, 'bonus points are capped at 2 per ability and 3 in total');
  assert.ok(maxView < 3500, 'a view fits in one shared-room message');
});

test('quests finish with 2–4 humans too', () => {
  for (let humans = 2; humans <= 4; humans++) for (let seed = 1; seed <= 40; seed++) play(seed * 7 + humans, humans);
});

test('every scene and battle in the script is wired up', () => {
  const seen = new Set();
  for (const [id, n] of Object.entries(D.NODES)) {
    assert.ok(n.text && n.text.length, id + ' has text');
    assert.ok(n.ending || n.choices || n.battle, id + ' leads somewhere');
    if (n.battle) { assert.ok(D.BATTLES[n.battle]); seen.add(D.BATTLES[n.battle].next); }
    for (const c of n.choices || []) {
      for (const o of [c.ok, c.fail, c.auto].filter(Boolean)) {
        const battle = o.battle || (o.next ? null : c.battle), next = o.next || c.next;
        if (c.quick) continue;
        assert.ok(battle ? D.BATTLES[battle] : next === '@trail' || D.NODES[next], `${id}.${c.id} leads somewhere`);
        seen.add(battle ? D.BATTLES[battle].next : next);
      }
      assert.ok(c.stat ? c.ok && c.fail && c.dc : c.auto, `${id}.${c.id} has outcomes`);
    }
  }
  for (const id of Object.keys(D.NODES)) assert.ok(id === D.START || seen.has(id) || D.NODES[id].trail || Object.values(D.NODES).some(n => n.dest === id), id + ' is reachable');
  for (const b of Object.values(D.BATTLES)) { assert.ok(b.next === '@trail' || D.NODES[b.next]); b.enemies.forEach(k => assert.ok(D.ENEMIES[k])); }
});

test('a player who leaves mid-quest does not stall the table', () => {
  const room = new Room('T', { instant: true, rng: seeded(5) });
  const a = room.addPlayer('A').player, b = room.addPlayer('B').player;
  room.command(a, { t: 'start' });
  [a, b].forEach(p => room.command(p, { t: 'vote', choice: 'chapel' }));
  [a, b].forEach(p => room.command(p, { t: 'next' }));
  assert.strictEqual(room.node, 'store');
  room.command(b, { t: 'vote', choice: 'food' }); // shopping is instant and is not a vote
  assert.deepStrictEqual([room.party.rations, room.party.gold, room.phase], [20, 30, 'choice']);
  room.command(a, { t: 'vote', choice: 'go' });
  assert.strictEqual(room.phase, 'choice');
  room.setConnected(b, false);
  assert.strictEqual(room.phase, 'result');
  assert.ok(room.view(a).heroes.find(h => h.owner === b.id).bot);
});

test('defeat restores the party and retries the same battle', () => {
  const room = new Room('T', { instant: true, rng: seeded(9) });
  const a = room.addPlayer('A').player;
  room.command(a, { t: 'start' });
  room.startBattle('king');
  const before = JSON.parse(room.snapshot);
  room.heroes.forEach(h => { h.hp = 0; h.down = true; });
  room.checkEnd();
  assert.strictEqual(room.phase, 'defeat');
  room.command(a, { t: 'retry' });
  assert.strictEqual(room.phase, 'combat');
  assert.deepStrictEqual(room.heroes.map(h => h.hp), before.heroes.map(h => h.max), 'the party returns at full health');
  assert.strictEqual(room.party.potions, before.party.potions + 1);
});
