// EMBERFALL — the rules. Pure logic: no sockets, no DOM. Runs in Node
// (server.js) and in the browser (solo, or a friend hosting a table).
// The whole party is on one side: every human and every companion wins together.
(function (root) {
'use strict';
const D = typeof module !== 'undefined' && module.exports ? require('./quest.js') : root.EmberfallData;
const { CLASSES, CLASS_ORDER, COMPANIONS, ENEMIES, BATTLES, NODES, START, BACKGROUNDS, TINTS, BONUS_POINTS, MOON_DAY } = D;

const MAX_PLAYERS = 4;
const PARTY = 4;
// How long humans get to decide (only enforced when more than one is playing).
const T = { vote: 75000, roll: 25000, next: 30000, turn: 45000, bot: 1100, foe: 900 };
// How long each event takes to play out on screen before the game moves on.
const FX_MS = { roll: 3100, begin: 3000, mod: 2400, atk: 2100, aoe: 2600, heal: 1800, guard: 1400, defend: 1200, summon: 2600, skip: 1400, bossdown: 4200 };

class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.onChange = opts.onChange || (() => {});
    this.instant = !!opts.instant; // tests: no real timers, drive with tick()
    this.rng = opts.rng || Math.random;
    this.players = [];
    this.hostId = null;
    this.phase = 'lobby';
    this.heroes = [];
    this.party = null;
    this.feed = [];
    this.feedSeq = 0;
    this.fx = [];
    this.fxSeq = 0;
    this.idSeq = 0;
    this.pending = null;
    this.deadline = 0;
    this.lastActive = Date.now();
  }

  // ---------- utilities ----------
  d(sides) { return 1 + Math.floor(this.rng() * sides); }
  roll([n, sides, bonus]) { let t = bonus || 0; for (let i = 0; i < n; i++) t += this.d(sides); return Math.max(1, t); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  get(id) { return this.players.find(p => p.id === id); }
  hero(id) { return this.heroes.find(h => h.id === id); }
  humans() { return this.players.filter(p => p.connected); }
  controller(h) { const p = h.owner && this.get(h.owner); return p && p.connected ? p : null; }
  up() { return this.heroes.filter(h => !h.down); }
  foes() { return this.battle ? this.battle.enemies.filter(e => e.hp > 0) : []; }
  changed() { this.lastActive = Date.now(); this.onChange(this); }

  // Run fn after ms. Only one thing is ever pending.
  wait(ms, fn) {
    clearTimeout(this.timer);
    this.deadline = 0;
    this.pending = fn;
    if (this.instant) return;
    this.timer = setTimeout(() => { if (this.pending === fn) { this.pending = null; fn(); } }, ms);
  }
  // A time limit for a human decision. With one human there is no limit.
  gate(ms, fn) {
    if (this.humans().length > 1) { this.wait(ms, fn); this.deadline = Date.now() + ms; } else this.idle();
  }
  idle() { clearTimeout(this.timer); this.pending = null; this.deadline = 0; }
  tick() { const fn = this.pending; this.pending = null; if (fn) fn(); return !!fn; }
  destroy() { this.idle(); }

  log(text) {
    this.feed.push({ id: ++this.feedSeq, ch: 'sys', text });
    if (this.feed.length > 200) this.feed.splice(0, this.feed.length - 200);
  }
  pushFx(e) {
    e.id = ++this.fxSeq;
    e.ms = FX_MS[e.k] || 1500;
    if (e.k === 'atk' && e.bossKo) e.ms = FX_MS.bossdown;
    this.fx.push(e);
    if (this.fx.length > 4) this.fx.shift();
    return e.ms;
  }

  // ---------- lobby ----------
  addPlayer(name) {
    if (this.phase !== 'lobby') return { error: 'That quest is already under way.' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'That table is full.' };
    name = String(name || '').replace(/[\u0000-\u001f<>{}]/g, '').trim().slice(0, 14) || 'Hero';
    const used = new Set(this.players.map(p => p.name.toLowerCase()));
    let final = name, n = 2;
    while (used.has(final.toLowerCase())) final = `${name}${n++}`;
    const cls = CLASS_ORDER.find(c => !this.players.some(p => p.cls === c));
    const p = { id: 'p' + (++this.idSeq), name: final, connected: true, cls, bonus: {}, bg: 'soldier', tint: 0 };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.changed();
    return { player: p };
  }
  removePlayer(id) {
    const i = this.players.findIndex(p => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.passHost(id);
    this.changed();
  }
  passHost(id) {
    if (this.hostId !== id) return;
    const next = this.players.find(p => p.connected && p.id !== id);
    this.hostId = next ? next.id : this.players[0] ? this.players[0].id : null;
  }
  setConnected(p, on) {
    p.connected = on;
    if (!on && this.phase === 'lobby') return this.removePlayer(p.id);
    if (!on) this.passHost(p.id);
    this.changed();
    if (!on) this.nudge();
  }
  // Someone left: don't leave the table waiting on them.
  nudge() {
    if (!this.humans().length) return;
    if (this.phase === 'choice') this.checkVotes();
    else if (this.phase === 'roll' && !this.controller(this.hero(this.rolling.who))) this.doRoll();
    else if (this.phase === 'fate' && !this.controller(this.hero(this.rolling.who))) this.applyOutcome('fail');
    else if (['result', 'victory'].includes(this.phase)) this.checkReady();
    else if (this.phase === 'combat' && this.battle.turn && !this.battle.busy) {
      const h = this.hero(this.battle.turn);
      if (h && !this.controller(h)) this.botAct(h);
    }
  }

  // Character creation: class, where the bonus ability points go, background, outfit colour.
  setBuild(p, m) {
    if (this.phase !== 'lobby') return;
    if (CLASSES[m.cls]) p.cls = m.cls;
    if (BACKGROUNDS[m.bg]) p.bg = m.bg;
    if (Number.isInteger(m.tint) && TINTS[m.tint] !== undefined) p.tint = m.tint;
    if (m.bonus && typeof m.bonus === 'object') {
      const b = {};
      let left = BONUS_POINTS;
      for (const k of Object.keys(D.STATS)) {
        const n = Math.max(0, Math.min(2, left, Math.floor(Number(m.bonus[k]) || 0)));
        if (n) { b[k] = n; left -= n; }
      }
      p.bonus = b;
    }
    if (typeof m.name === 'string') {
      const name = m.name.replace(/[\u0000-\u001f<>{}]/g, '').trim().slice(0, 14);
      if (name && !this.players.some(q => q !== p && q.name.toLowerCase() === name.toLowerCase())) p.name = name;
    }
    this.changed();
  }
  start() {
    if (this.phase !== 'lobby') return { error: 'Already started.' };
    if (!this.players.length) return { error: 'Nobody is here.' };
    this.heroes = this.players.map(p => this.makeHero(p.name, p.cls, p.id, p));
    for (const cls of CLASS_ORDER) {
      if (this.heroes.length >= PARTY) break;
      if (!this.heroes.some(h => h.cls === cls)) this.heroes.push(this.makeHero(COMPANIONS[cls], cls, null));
    }
    this.heroes.forEach((h, i) => { h.id = 'h' + i; });
    this.party = { potions: 2, gold: 40, fate: 1, rations: 12, day: 1, flags: {} };
    const bgs = this.players.map(p => p.bg);
    this.party.fate += bgs.filter(b => b === 'scholar').length;
    this.party.gold += 30 * bgs.filter(b => b === 'merchant').length;
    this.party.potions += 2 * bgs.filter(b => b === 'herbalist').length;
    this.party.rations += 8 * bgs.filter(b => b === 'hunter').length;
    this.party.fate = Math.min(3, this.party.fate);
    this.trail = { left: 0, dest: null, forage: false };
    this.deck = Object.keys(NODES).filter(k => NODES[k].trail).sort(() => this.rng() - 0.5);
    this.stats = { rolls: 0, nat20: 0, nat1: 0, retries: 0, dmg: {}, heals: {}, path: [] };
    this.rollCount = {};
    this.feed = [];
    this.fx = [];
    this.log('The quest begins.');
    this.enterNode(START);
    return {};
  }
  makeHero(name, cls, owner, build) {
    const c = CLASSES[cls], stats = { ...c.stats };
    if (build) for (const k of Object.keys(build.bonus)) stats[k] += build.bonus[k];
    const hp = c.hp + (build && build.bg === 'soldier' ? 5 : 0);
    return { id: '', name, cls, owner, stats, tint: build ? build.tint : 0, hp, max: hp, down: false, charges: 2, guard: false, defend: false };
  }
  backToLobby() {
    this.idle();
    this.phase = 'lobby';
    this.players = this.players.filter(p => p.connected);
    this.heroes = [];
    this.party = this.battle = this.out = this.rolling = null;
    this.node = null;
    this.fx = [];
    this.changed();
  }

  // ---------- story ----------
  enterNode(id) {
    const node = NODES[id];
    this.node = id;
    if (this.rolling) this.lastRoller = this.rolling.who;
    this.out = null;
    this.rolling = null;
    this.battle = null;
    this.votes = {};
    this.ready = new Set();
    this.stats.path.push(id);
    this.arrive = node.enter ? this.applyFx(node.enter, null) : [];
    if (this.dayNotes) { this.arrive.unshift(...this.dayNotes); this.dayNotes = null; }
    if (node.ending) {
      this.phase = 'end';
      this.idle();
      this.log(`THE END — ${node.title}`);
    } else if (!node.choices) {
      this.phase = 'result';
      this.out = { kind: 'intro' };
      this.gate(T.next, () => this.advance());
    } else {
      this.phase = 'choice';
      this.gate(T.vote, () => this.resolveVote());
    }
    this.changed();
  }
  choices() {
    const node = NODES[this.node];
    return (node.choices || []).filter(c => !c.need || this.party.flags[c.need]);
  }
  canPick(c) { return !c.cost || Object.keys(c.cost).every(k => this.party[k] >= c.cost[k]); }
  pay(c) { if (c.cost) for (const k of Object.keys(c.cost)) this.party[k] -= c.cost[k]; }
  // A day on the trail: everyone eats, or goes hungry.
  passDay() {
    const P = this.party, need = this.heroes.length, notes = [];
    P.day++;
    if (P.rations >= need) { P.rations -= need; notes.push(`Day ${P.day} · ate ${need} rations`); }
    else { P.rations = 0; this.heroes.forEach(h => { h.hp = Math.max(1, h.hp - 3); }); notes.push(`Day ${P.day} · no food! Everyone −3`); }
    if (this.trail.forage && this.trail.left >= 0 && NODES[this.node] && !NODES[this.node].enter) {
      P.rations += 2;
      this.heroes.forEach(h => { h.hp = Math.min(h.max, h.hp + 3); });
      notes.push('Foraged +2 rations, rested +3');
    }
    this.log(notes.join(' · '));
    return notes;
  }
  // Carry on down the trail: another day, another event — or arrival.
  goTrail() {
    const T = this.trail;
    if (T.left <= 0) { T.forage = false; return this.enterNode(T.dest); }
    T.left--;
    this.dayNotes = this.passDay();
    if (!this.deck.length) this.deck = Object.keys(NODES).filter(k => NODES[k].trail).sort(() => this.rng() - 0.5);
    this.enterNode(this.deck.pop());
  }
  goto(id) { if (id === '@trail') this.goTrail(); else this.enterNode(id); }
  vote(p, id) {
    if (this.phase !== 'choice') return;
    const c = this.choices().find(x => x.id === id);
    if (!c || !this.canPick(c)) return;
    if (c.quick) { // shopping: happens at once, and you stay at the stall
      this.pay(c);
      this.applyFx(c.auto.fx, null);
      this.log(`${p.name}: ${c.label}`);
      return this.changed();
    }
    this.votes[p.id] = id;
    this.changed();
    this.checkVotes();
  }
  checkVotes() {
    if (this.phase === 'choice' && this.humans().every(p => this.votes[p.id])) this.resolveVote();
  }
  resolveVote() {
    const open = this.choices().filter(c => this.canPick(c) && !c.quick);
    const tally = {};
    this.humans().forEach(p => { const v = this.votes[p.id]; if (v) tally[v] = (tally[v] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    const tops = open.filter(c => max > 0 && tally[c.id] === max);
    const c = this.pick(tops.length ? tops : open);
    this.choice = c;
    this.pay(c);
    this.log(`The party chooses: ${c.label}`);
    this.rolling = null;
    if (!c.stat) return this.applyOutcome('auto');
    const who = this.pickRoller(c.stat);
    const mod = who.stats[c.stat];
    const helper = this.heroes.find(h => h !== who && h.stats[c.stat] >= 3 && h.stats[c.stat] > mod);
    this.rolling = { who: who.id, choice: c.id, stat: c.stat, dc: c.dc, mod, assist: helper ? 2 : 0, helper: helper ? helper.id : null, d: 0 };
    this.phase = 'roll';
    if (this.controller(who)) { this.gate(T.roll, () => this.doRoll()); this.changed(); } else this.doRoll();
  }
  // A human always throws the dice when one is here: whoever is best at it.
  pickRoller(stat) {
    const mine = this.heroes.filter(h => this.controller(h));
    const pool = mine.length ? mine : this.heroes;
    const score = h => h.stats[stat] * 100 - (this.rollCount[h.id] || 0);
    const who = pool.slice().sort((a, b) => score(b) - score(a))[0];
    this.rollCount[who.id] = (this.rollCount[who.id] || 0) + 1;
    return who;
  }
  doRoll() {
    const r = this.rolling;
    if (!r || !['roll', 'fate'].includes(this.phase)) return;
    r.d = this.d(20);
    r.total = r.d + r.mod + r.assist;
    r.ok = r.d === 20 || (r.d !== 1 && r.total >= r.dc);
    this.stats.rolls++;
    if (r.d === 20) { this.stats.nat20++; this.party.fate = Math.min(3, this.party.fate + 1); }
    if (r.d === 1) this.stats.nat1++;
    const who = this.hero(r.who);
    this.log(`${who.name} rolls ${D.STATS[r.stat]}: ${r.d}${r.mod + r.assist ? (r.mod + r.assist > 0 ? ' + ' : ' − ') + Math.abs(r.mod + r.assist) : ''} = ${r.total} vs ${r.dc} — ${r.d === 20 ? 'NATURAL 20!' : r.d === 1 ? 'natural 1…' : r.ok ? 'success' : 'failure'}`);
    this.phase = 'rolled';
    const ms = this.pushFx({ k: 'roll', who: r.who, stat: r.stat, d: r.d, mod: r.mod, assist: r.assist, dc: r.dc, ok: r.ok });
    this.wait(ms, () => {
      if (!r.ok && this.party.fate > 0) {
        this.phase = 'fate';
        if (this.controller(who)) { this.gate(T.roll, () => this.applyOutcome('fail')); this.changed(); } else this.applyOutcome('fail');
      } else this.applyOutcome(r.ok ? 'ok' : 'fail');
    });
    this.changed();
  }
  reroll(p) {
    if (this.phase !== 'fate' || this.party.fate < 1) return;
    if (this.controller(this.hero(this.rolling.who)) !== p) return;
    this.party.fate--;
    this.log('Fate is spent. The dice fly again.');
    this.doRoll();
  }
  acceptRoll(p) {
    if (this.phase === 'fate' && this.controller(this.hero(this.rolling.who)) === p) this.applyOutcome('fail');
  }
  applyOutcome(kind) {
    const c = this.choice, o = c[kind];
    const roller = this.rolling ? this.hero(this.rolling.who) : null;
    this.out = { kind, choice: c.id, roller: roller ? roller.id : null, notes: this.applyFx(o.fx, roller) };
    this.phase = 'result';
    this.ready = new Set();
    this.gate(T.next, () => this.advance());
    this.changed();
  }
  // Apply an outcome's effects; returns short notes for the screen.
  applyFx(fx, roller) {
    const notes = [], P = this.party;
    if (!fx) return notes;
    if (fx.flag) P.flags[fx.flag] = true;
    if (fx.leg) this.trail = { left: fx.leg, dest: NODES[this.node].dest, forage: !!fx.forage };
    if (fx.days) for (let i = 0; i < fx.days; i++) notes.push(...this.passDay());
    if (fx.rations) { const before = P.rations; P.rations = Math.max(0, P.rations + fx.rations); if (P.rations !== before) notes.push(`${P.rations > before ? '+' : '−'}${Math.abs(P.rations - before)} rations`); }
    if (fx.potions) { const before = P.potions; P.potions = Math.max(0, P.potions + fx.potions); if (P.potions !== before) notes.push(`${P.potions > before ? '+' : '−'}${Math.abs(P.potions - before)} potion${Math.abs(P.potions - before) === 1 ? '' : 's'}`); }
    if (fx.gold) { P.gold = Math.max(0, P.gold + fx.gold); notes.push(`${fx.gold > 0 ? '+' : '−'}${Math.abs(fx.gold)} gold`); }
    if (fx.fate) { const before = P.fate; P.fate = Math.min(3, P.fate + fx.fate); if (P.fate > before) notes.push(`+${P.fate - before} Fate`); }
    if (fx.heal) {
      this.heroes.forEach(h => { h.hp = Math.min(h.max, h.hp + (fx.heal === 'half' ? Math.ceil(h.max / 2) : fx.heal)); h.down = false; });
      notes.push(fx.heal === 'half' ? 'The party recovers' : `Everyone heals ${fx.heal}`);
    }
    // Wounds outside a battle hurt but never kill.
    if (fx.dmgAll) this.heroes.forEach(h => { const n = this.roll(fx.dmgAll); h.hp = Math.max(1, h.hp - n); notes.push(`${h.name} −${n}`); });
    if (fx.dmgRoller && roller) { const n = this.roll(fx.dmgRoller); roller.hp = Math.max(1, roller.hp - n); notes.push(`${roller.name} −${n}`); }
    return notes;
  }
  next(p) {
    if (!['result', 'victory'].includes(this.phase)) return;
    this.ready.add(p.id);
    this.changed();
    this.checkReady();
  }
  checkReady() {
    if (['result', 'victory'].includes(this.phase) && this.humans().every(p => this.ready.has(p.id))) this.advance();
  }
  advance() {
    if (this.phase === 'victory') return this.goto(BATTLES[this.battle.id].next);
    if (this.phase !== 'result') return;
    if (this.out.kind === 'intro') return this.startBattle(NODES[this.node].battle);
    const c = this.choice, o = c[this.out.kind];
    const battle = o.battle || (o.next ? null : c.battle);
    if (battle) this.startBattle(battle); else this.goto(o.next || c.next);
  }

  // ---------- battle ----------
  startBattle(id, isRetry) {
    const def = BATTLES[id], flags = this.party.flags;
    if (def.boss) flags.newmoon = this.party.day > MOON_DAY;
    if (!isRetry) this.snapshot = JSON.stringify({ heroes: this.heroes, party: this.party });
    const mods = (def.mods || []).filter(m => flags[m.flag]);
    let keys = def.enemies.slice();
    mods.forEach(m => { if (m.remove) keys = keys.slice(0, Math.max(1, keys.length - m.remove)); if (m.add) keys.push(...m.add); });
    this.battle = { id, enemies: [], round: 1, turn: null, idx: -1, busy: true, stun: false, mods };
    keys.forEach(k => this.spawn(k));
    this.heroes.forEach(h => { h.charges = 2; h.guard = h.defend = false; });
    this.phase = 'combat';
    this.out = null;
    this.log(`⚔️ ${def.title}`);
    this.wait(this.pushFx({ k: 'begin', title: def.title, boss: !!def.boss }), () => this.runMods());
    this.changed();
  }
  spawn(key) {
    const def = ENEMIES[key];
    const e = { id: 'e' + (++this.idSeq), key, hp: def.hp, max: def.hp, armor: def.armor, turns: 0, summoned: false };
    this.battle.enemies.push(e);
    return e;
  }
  runMods() {
    const B = this.battle, m = B.mods.shift();
    if (!m) { B.busy = false; return this.nextTurn(); }
    const hits = [];
    const targets = this.foes().filter(e => !m.only || ENEMIES[e.key].boss);
    if (m.strike) targets.forEach(e => hits.push(this.hurtFoe(e, this.roll(m.strike))));
    if (m.hurt) this.up().forEach(h => hits.push(this.hurtHero(h, this.roll(m.hurt))));
    if (m.armor) targets.forEach(e => { e.armor += m.armor; });
    if (m.stun) B.stun = true;
    if (m.heal) this.foes().filter(e => ENEMIES[e.key].boss).forEach(e => { e.hp += m.heal; e.max += m.heal; });
    this.log(m.text);
    this.wait(this.pushFx({ k: 'mod', text: m.text, hits, good: !m.hurt && !m.add }), () => this.runMods());
    this.changed();
  }
  hurtFoe(e, dmg, by) {
    e.hp = Math.max(0, e.hp - dmg);
    if (by) this.stats.dmg[by.id] = (this.stats.dmg[by.id] || 0) + dmg;
    return { to: e.id, dmg, ko: e.hp === 0 };
  }
  hurtHero(h, dmg) {
    if (h.guard) dmg = Math.ceil(dmg / 2);
    h.hp = Math.max(0, h.hp - dmg);
    if (h.hp === 0) { h.down = true; h.guard = h.defend = false; }
    return { to: h.id, dmg, ko: h.down };
  }
  healHero(h, amt, by) {
    const before = h.hp;
    h.hp = Math.min(h.max, h.hp + amt);
    h.down = false;
    if (by) this.stats.heals[by.id] = (this.stats.heals[by.id] || 0) + (h.hp - before);
    return h.hp - before;
  }
  checkEnd() {
    if (!this.foes().length) { this.victory(); return true; }
    if (!this.up().length) { this.defeat(); return true; }
    return false;
  }
  nextTurn() {
    const B = this.battle;
    if (this.checkEnd()) return;
    for (let guard = 0; guard < 40; guard++) {
      const list = [...this.heroes, ...B.enemies];
      B.idx++;
      if (B.idx >= list.length) { B.idx = 0; B.round++; }
      const a = list[B.idx];
      const isHero = a.id[0] === 'h';
      if (isHero ? a.down : a.hp <= 0) continue;
      B.turn = a.id;
      B.busy = false;
      if (!isHero) {
        if (B.stun && B.round === 1) continue;
        B.busy = true;
        this.wait(T.foe, () => this.foeAct(a));
      } else {
        a.guard = a.defend = false;
        if (this.controller(a)) this.gate(T.turn, () => this.botAct(a, true));
        else { B.busy = true; this.wait(T.bot, () => this.botAct(a)); }
      }
      return this.changed();
    }
  }
  // After an action plays out on screen, move on.
  after(e) {
    this.battle.busy = true;
    this.wait(this.pushFx(e), () => this.nextTurn());
    this.changed();
  }
  act(p, m) {
    const B = this.battle;
    if (this.phase !== 'combat' || !B || B.busy) return;
    const h = this.hero(B.turn);
    if (!h || this.controller(h) !== p) return;
    this.heroAct(h, m);
  }
  heroAct(h, m) {
    const C = CLASSES[h.cls], foe = this.foes().find(e => e.id === m.target), ally = this.heroes.find(x => x.id === m.target);
    if (m.a === 'attack') { if (foe) this.heroAttack(h, foe, null); return; }
    if (m.a === 'defend') { h.defend = true; this.log(`${h.name} braces.`); return this.after({ k: 'defend', from: h.id }); }
    if (m.a === 'potion') {
      const t = ally || h;
      if (this.party.potions < 1 || (t.hp >= t.max && !t.down)) return;
      this.party.potions--;
      const amt = this.healHero(t, this.roll([2, 4, 4]), h);
      this.log(`${h.name} ${t === h ? 'drinks a potion' : `gives ${t.name} a potion`}: +${amt}.`);
      return this.after({ k: 'heal', from: h.id, to: t.id, amt, kind: 'potion' });
    }
    if (m.a !== 'ability' || h.charges < 1) return;
    const id = C.ability.id;
    if (id === 'guard') { h.charges--; h.guard = true; this.log(`${h.name} raises a Shield Wall.`); return this.after({ k: 'guard', from: h.id }); }
    if (id === 'fireball') {
      h.charges--;
      const hits = this.foes().map(e => this.hurtFoe(e, this.roll([2, 6, 0]), h));
      this.log(`${h.name} hurls a Fireball for ${hits.reduce((s, x) => s + x.dmg, 0)} total.`);
      return this.after({ k: 'aoe', from: h.id, name: 'Fireball', hits });
    }
    if (id === 'mend') {
      if (!ally || (ally.hp >= ally.max && !ally.down)) return;
      h.charges--;
      const amt = this.healHero(ally, this.roll([2, 6, 3]), h);
      this.log(`${h.name} mends ${ally === h ? 'their own wounds' : ally.name}: +${amt}.`);
      return this.after({ k: 'heal', from: h.id, to: ally.id, amt, kind: 'mend' });
    }
    if ((id === 'rage' || id === 'backstab') && foe) { h.charges--; return this.heroAttack(h, foe, id); }
  }
  heroAttack(h, e, abil) {
    const C = CLASSES[h.cls];
    const d = this.d(20), bonus = h.stats[C.atk] + 2 + (abil === 'backstab' ? 5 : 0);
    const crit = d === 20;
    const hit = abil === 'rage' || crit || (d !== 1 && d + bonus >= e.armor);
    let dmg = 0;
    if (hit) {
      dmg = this.roll([C.dmg[0] * (abil === 'backstab' ? 3 : 1), C.dmg[1], C.dmg[2]]);
      if (abil === 'rage') dmg *= 2;
      if (crit) dmg *= 2;
    }
    const res = hit ? this.hurtFoe(e, dmg, h) : { to: e.id, dmg: 0, ko: false };
    const name = ENEMIES[e.key].name;
    this.log(`${h.name}${abil ? ` uses ${C.ability.name} on` : ' attacks'} ${name}: ${d}${crit ? ' — CRITICAL!' : ''} ${hit ? `hits for ${dmg}${res.ko ? ' and fells it' : ''}` : 'misses'}.`);
    this.after({ k: 'atk', from: h.id, to: e.id, d, bonus, need: e.armor, hit, crit, dmg, ko: res.ko, abil, style: C.style, bossKo: res.ko && !!ENEMIES[e.key].boss });
  }
  // Companions (and humans who run out of time) fight sensibly.
  botAct(h, simple) {
    const C = CLASSES[h.cls], foes = this.foes();
    if (!foes.length || h.down) return this.nextTurn();
    const weakest = foes.slice().sort((a, b) => a.hp - b.hp)[0];
    const toughest = foes.slice().sort((a, b) => b.hp - a.hp)[0];
    if (simple) return this.heroAct(h, { a: 'attack', target: weakest.id });
    const hurt = this.heroes.slice().sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
    const id = C.ability.id, can = h.charges > 0;
    if (id === 'mend' && can && (hurt.down || hurt.hp / hurt.max <= 0.45)) return this.heroAct(h, { a: 'ability', target: hurt.id });
    if (this.party.potions > 0 && (hurt.down || hurt.hp / hurt.max <= 0.3) && (hurt === h || hurt.down)) return this.heroAct(h, { a: 'potion', target: hurt.id });
    if (id === 'fireball' && can && foes.length >= 2) return this.heroAct(h, { a: 'ability' });
    if (id === 'guard' && can && this.up().some(x => x !== h && x.hp / x.max <= 0.5)) return this.heroAct(h, { a: 'ability' });
    if ((id === 'rage' || id === 'backstab') && can && toughest.hp >= 10) return this.heroAct(h, { a: 'ability', target: toughest.id });
    this.heroAct(h, { a: 'attack', target: weakest.id });
  }
  foeAct(e) {
    const def = ENEMIES[e.key], ups = this.up();
    if (e.hp <= 0 || !ups.length) return this.nextTurn();
    e.turns++;
    if (def.summon && !e.summoned && e.hp <= e.max / 2) {
      e.summoned = true;
      const ids = def.summon.map(k => this.spawn(k).id);
      this.log(`${def.name} raises more dead from the floor!`);
      return this.after({ k: 'summon', from: e.id, ids });
    }
    if (def.chill && e.turns % 3 === 0) {
      const hits = ups.map(h => this.hurtHero(h, this.roll(def.chill)));
      this.log(`${def.name} breathes Grave Chill over the whole party.`);
      return this.after({ k: 'aoe', from: e.id, name: 'Grave Chill', hits });
    }
    const wall = ups.find(h => h.guard);
    const t = wall || this.pick(ups);
    const d = this.d(20), crit = d === 20;
    const armor = CLASSES[t.cls].armor + (t.defend ? 4 : 0);
    const hit = crit || (d !== 1 && d + def.hit >= armor);
    let res = { to: t.id, dmg: 0, ko: false };
    if (hit) res = this.hurtHero(t, this.roll(def.dmg) * (crit ? 2 : 1));
    this.log(`${def.name} attacks ${t.name}: ${d}${crit ? ' — CRITICAL!' : ''} ${hit ? `hits for ${res.dmg}${res.ko ? ' — they fall!' : ''}` : 'misses'}.`);
    this.after({ k: 'atk', from: e.id, to: t.id, d, bonus: def.hit, need: armor, hit, crit, dmg: res.dmg, ko: res.ko, style: def.style || 'melee', blocked: hit && !!wall });
  }
  victory() {
    const def = BATTLES[this.battle.id];
    this.heroes.forEach(h => { if (h.down) { h.down = false; h.hp = Math.ceil(h.max / 4); } h.guard = h.defend = false; });
    this.battle.turn = null;
    this.phase = 'victory';
    this.out = { kind: 'win', notes: this.applyFx(def.win.fx, null) };
    this.ready = new Set();
    this.log(`Victory! ${def.win.text}`);
    this.gate(T.next, () => this.advance());
    this.changed();
  }
  defeat() {
    this.battle.turn = null;
    this.phase = 'defeat';
    this.idle();
    this.log('The party has fallen…');
    this.changed();
  }
  retry() {
    if (this.phase !== 'defeat') return;
    const s = JSON.parse(this.snapshot);
    this.heroes = s.heroes;
    this.party = s.party;
    this.stats.retries++;
    // A second wind, stronger each time, so no party can get stuck at a battle it cannot win.
    this.heroes.forEach(h => { h.hp = h.max; h.down = false; });
    this.party.potions += this.stats.retries;
    this.log('…but the tale is not over. You catch your breath, find a spare potion, and try again.');
    this.startBattle(this.battle.id, true);
  }

  // ---------- one player's request, from any transport ----------
  command(me, m) {
    const host = this.hostId === me.id;
    let r;
    switch (m.t) {
      case 'build': this.setBuild(me, m); break;
      case 'start': if (host) r = this.start(); break;
      case 'vote': this.vote(me, m.choice); break;
      case 'roll': if (this.phase === 'roll' && this.controller(this.hero(this.rolling.who)) === me) this.doRoll(); break;
      case 'reroll': this.reroll(me); break;
      case 'accept': this.acceptRoll(me); break;
      case 'next': this.next(me); break;
      case 'act': this.act(me, m); break;
      case 'retry': this.retry(); break;
      case 'again': if (host && this.phase === 'end') this.backToLobby(); break;
      case 'chat': {
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
        if (text) { this.feed.push({ id: ++this.feedSeq, ch: 'pub', from: me.id, name: me.name, text }); this.changed(); }
        break;
      }
    }
    return r && r.error;
  }

  // ---------- what one player sees (nothing is secret in a co-op game) ----------
  view(me) {
    const B = this.battle, lobby = this.phase === 'lobby';
    const mine = this.heroes.find(h => h.owner === me.id);
    const s = {
      t: 'state', code: this.code, phase: this.phase, hostId: this.hostId,
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      you: { id: me.id, hero: mine ? mine.id : null },
      players: this.players.map(p => ({ id: p.id, name: p.name, on: p.connected, cls: p.cls, bonus: p.bonus, bg: p.bg, tint: p.tint })),
      feed: this.feed,
    };
    if (lobby) return s;
    s.party = { potions: this.party.potions, gold: this.party.gold, fate: this.party.fate, rations: this.party.rations, day: this.party.day };
    if (this.arrive && this.arrive.length) s.arrive = this.arrive;
    s.heroes = this.heroes.map(h => ({ id: h.id, name: h.name, cls: h.cls, hp: h.hp, max: h.max, st: h.stats, tint: h.tint, down: h.down, ch: h.charges, guard: h.guard, def: h.defend, owner: h.owner, bot: !this.controller(h) }));
    s.node = this.node;
    s.step = this.stats.path.length;
    if (this.lastRoller) s.lastRoller = this.lastRoller;
    s.fx = this.fx;
    if (this.phase === 'choice') {
      s.open = this.choices().map(c => ({ id: c.id, off: !this.canPick(c) }));
      s.votes = this.votes;
      // show each choice's would-be roller and bonus up front
      s.odds = {};
      this.choices().forEach(c => { if (c.stat) s.odds[c.id] = Math.max(...this.heroes.filter(h => this.controller(h)).map(h => h.stats[c.stat]), -9); });
    }
    if (['roll', 'rolled', 'fate', 'result'].includes(this.phase) && this.rolling) s.roll = this.rolling;
    if (this.out) s.out = this.out;
    if (['result', 'victory'].includes(this.phase)) s.ready = [...this.ready];
    if (B) s.battle = { id: B.id, round: B.round, turn: B.busy ? null : B.turn, acting: B.turn, enemies: B.enemies.map(e => ({ id: e.id, key: e.key, hp: e.hp, max: e.max })) };
    if (this.phase === 'end') s.stats = this.stats;
    return s;
  }
}

const api = { Room, MAX_PLAYERS, FX_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Emberfall = api;
})(typeof self !== 'undefined' ? self : this);
