// HOLLOWMOON — game engine. Pure logic: no sockets, no DOM. Runs in Node
// (server.js) and in the browser (solo play, or a friend hosting a table).
// A transport calls into a Room; the Room calls onChange() when players
// need a fresh view.
(function (root) {
'use strict';

const TIMES = { reveal: 11000, night: 40000, nightMin: 7000, dawn: 16000, day: 90000, vote: 35000, verdict: 14000, idleDay: 10000 };
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const COLORS = ['#ff6b6b', '#ffb629', '#f7e463', '#6fdc8c', '#3ecfcf', '#6aa8ff', '#b48cff', '#ff8ad1', '#c9d1e0', '#ff9457'];
const MODELS = 5;
const BOT_NAMES = ['Agnes', 'Bram', 'Cedric', 'Dalia', 'Edda', 'Finn', 'Greta', 'Hugo', 'Isolde', 'Jasper', 'Kasimir', 'Liesel', 'Mirela', 'Osric'];
const ROLE_NAMES = { villager: 'a Villager', sheriff: 'the Sheriff', doctor: 'the Doctor', werewolf: 'a Werewolf', jester: 'the Jester' };

const LINES = {
  accuse: ['I don\'t like how {X} is acting.', '{X} is far too calm for a night like that.', 'My gut says {X} is a wolf.', 'Did anyone else see {X} slip out after dark?', 'I\'m voting {X} unless someone talks me out of it.', '{X}. That\'s my read.'],
  filler: ['I\'ve got nothing solid yet.', 'One of us howls at the moon. Think.', 'Let\'s not banish one of our own on a hunch.', 'Watch who votes with who.', 'It\'s too quiet around this fire.', 'We lose one more and the village is finished.', 'If the Sheriff knows something, now\'s the time.'],
  deny: ['Me? I\'ve lived here my whole life.', 'I\'m no wolf. {X} is making things up.', 'That\'s exactly what a werewolf would say, {X}.', 'Banish me and you\'ll see you wasted a vote.', 'Not me. Look harder.'],
  claimWolf: ['I\'m the Sheriff. I investigated {X} last night — WEREWOLF.', 'Sheriff here. {X} is a wolf. Banish them.'],
  claimClean: ['Sheriff here. I investigated {X} — innocent.', 'For what it\'s worth, I watched {X} all night. No fangs.'],
  counter: ['{X} is lying. I\'M the Sheriff, and {X} is the wolf.', 'Funny — I\'m the real Sheriff and I caught {X} with blood on their hands.'],
  jester: ['Fine, banish me then. See what happens.', 'Maybe I do have claws. Who\'s to say?', 'You\'ll never guess what I was doing last night.', 'Honestly? I\'d vote for me.', 'Awoooo! ...Just kidding. Or am I?'],
  mourn: ['{X} didn\'t deserve that.', 'They got {X}. We need to move faster.', 'Losing {X} hurts.'],
};

class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.onChange = opts.onChange || (() => {});
    this.instant = !!opts.instant; // test mode: no real timers, drive with step()
    this.rng = opts.rng || Math.random;
    this.players = [];
    this.hostId = null;
    this.phase = 'lobby';
    this.round = 0;
    this.feed = [];
    this.feedSeq = 0;
    this.idSeq = 0;
    this.tick = 0;
    this.queue = [];
    this.phaseFn = null;
    this.phaseTimer = null;
    this.timeouts = new Set();
    this.deadline = 0;
    this.votes = {};
    this.ready = new Set();
    this.night = null;
    this.blessed = null;
    this.claims = [];
    this.winner = null;
    this.lastActive = Date.now();
  }

  // ---------- utilities ----------
  rnd(a, b) { return a + this.rng() * (b - a); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  get(id) { return this.players.find(p => p.id === id); }
  alive() { return this.players.filter(p => p.alive); }
  line(kind, x) { return this.pick(LINES[kind]).replace(/\{X\}/g, x || ''); }
  top(ids) {
    const c = {};
    ids.forEach(id => { c[id] = (c[id] || 0) + 1; });
    const max = Math.max(...Object.values(c));
    return this.pick(Object.keys(c).filter(k => c[k] === max));
  }
  changed() { this.lastActive = Date.now(); this.onChange(this); }

  later(ms, fn) {
    const tick = this.tick;
    const run = () => { if (tick === this.tick) fn(); };
    if (this.instant) { this.queue.push(run); return; }
    const t = setTimeout(() => { this.timeouts.delete(t); run(); }, ms);
    this.timeouts.add(t);
  }
  enter(phase, ms, fn) {
    this.phase = phase;
    this.tick++;
    this.queue = [];
    this.setPhaseTimer(ms, fn);
  }
  setPhaseTimer(ms, fn) {
    clearTimeout(this.phaseTimer);
    this.phaseFn = fn;
    this.deadline = Date.now() + ms;
    if (this.instant) return;
    const tick = this.tick;
    this.phaseTimer = setTimeout(() => { if (tick === this.tick) { this.phaseFn = null; fn(); } }, ms);
  }
  // Test driver: run every queued bot action, then end the phase.
  step() {
    let guard = 0;
    while (this.queue.length && guard++ < 2000) this.queue.shift()();
    const fn = this.phaseFn;
    this.phaseFn = null;
    if (fn) fn();
  }
  destroy() {
    clearTimeout(this.phaseTimer);
    this.timeouts.forEach(clearTimeout);
    this.timeouts.clear();
    this.tick++;
  }

  say(ch, from, text, only) {
    const m = { id: ++this.feedSeq, ch, text, ts: Date.now() };
    if (from) { m.from = from.id; m.name = from.name; m.color = from.color; }
    if (only) m.only = only;
    this.feed.push(m);
    if (this.feed.length > 300) this.feed.splice(0, this.feed.length - 300);
    return m;
  }
  sys(text, only) { return this.say('sys', null, text, only); }

  // ---------- lobby ----------
  addPlayer(name, isBot = false) {
    if (this.phase !== 'lobby') return { error: 'That game is already in progress.' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'That room is full.' };
    const used = new Set(this.players.map(p => p.name.toLowerCase()));
    if (isBot) {
      const free = BOT_NAMES.filter(n => !used.has(n.toLowerCase()));
      name = this.pick(free.length ? free : BOT_NAMES);
    }
    name = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Player';
    let final = name, n = 2;
    while (used.has(final.toLowerCase())) final = `${name}${n++}`;
    const colors = COLORS.filter(c => !this.players.some(p => p.color === c));
    const uses = m => this.players.filter(p => p.model === m).length;
    const model = [...Array(MODELS).keys()].sort((a, b) => uses(a) - uses(b) || this.rng() - 0.5)[0];
    const p = {
      id: 'p' + (++this.idSeq), name: final, color: colors.length ? colors[0] : this.pick(COLORS), model,
      isBot, connected: true, alive: true, role: null, revealed: false, notes: [], lastShield: null, bot: null,
    };
    this.players.push(p);
    if (!isBot && !this.hostId) this.hostId = p.id;
    this.changed();
    return { player: p };
  }
  removePlayer(id) {
    const i = this.players.findIndex(p => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    if (this.hostId === id) {
      const next = this.players.find(p => !p.isBot && p.connected);
      this.hostId = next ? next.id : null;
    }
    this.changed();
  }
  setConnected(p, on) {
    p.connected = on;
    if (!on && this.phase === 'lobby') return this.removePlayer(p.id);
    if (!on && this.hostId === p.id) {
      const next = this.players.find(q => !q.isBot && q.connected);
      if (next) this.hostId = next.id;
    }
    this.changed();
    if (!on) { this.tryEndNight(); this.tryEndDay(); this.tryEndVote(); }
  }
  humansConnected() { return this.players.filter(p => !p.isBot && p.connected); }

  // ---------- setup ----------
  static deck(n) {
    const wolves = n >= 7 ? 2 : 1;
    const deck = ['sheriff', 'doctor'];
    for (let i = 0; i < wolves; i++) deck.push('werewolf');
    if (n === 6 || n >= 8) deck.push('jester');
    while (deck.length < n) deck.push('villager');
    return deck;
  }
  start() {
    if (this.phase !== 'lobby') return { error: 'Already started.' };
    if (this.players.length < MIN_PLAYERS) return { error: `Need at least ${MIN_PLAYERS} players — add some bots.` };
    const deck = Room.deck(this.players.length);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.players.forEach((p, i) => {
      Object.assign(p, { role: deck[i], alive: true, revealed: false, notes: [], lastShield: null });
      p.bot = p.isBot ? { sus: {}, known: {}, told: new Set(), defended: 0 } : null;
    });
    this.players.forEach(p => {
      if (p.bot) this.players.forEach(q => { if (q !== p) p.bot.sus[q.id] = this.rng(); });
    });
    this.round = 1;
    this.dawn = null;
    this.verdict = null;
    this.feed = [];
    this.claims = [];
    this.winner = null;
    this.blessed = null;
    this.votes = {};
    const s = deck.filter(r => r === 'werewolf').length;
    this.wolfCount = s;
    this.sys(`${this.players.length} souls gather at the fire in Hollowmoon. ${s === 1 ? 'One of them is a werewolf.' : s + ' of them are werewolves.'}${deck.includes('jester') ? ' And one is a Jester who wants to be banished.' : ''}`);
    this.enter('reveal', TIMES.reveal, () => this.beginNight());
    this.changed();
    return {};
  }
  backToLobby() {
    this.destroy();
    this.phase = 'lobby';
    this.round = 0;
    this.feed = [];
    this.votes = {};
    this.winner = null;
    this.blessed = null;
    this.night = null;
    this.players = this.players.filter(p => p.isBot || p.connected);
    this.players.forEach(p => Object.assign(p, { alive: true, role: null, revealed: false, notes: [], bot: null }));
    this.changed();
  }

  // ---------- night ----------
  beginNight() {
    this.blessed = null;
    this.votes = {};
    this.verdict = null;
    this.night = { picks: {}, look: null, shield: null, bless: {}, done: new Set(), started: Date.now() };
    this.enter('night', TIMES.night, () => this.resolveNight());
    this.sys(`🌙 Night ${this.round}. The village sleeps.`);
    this.players.filter(p => p.isBot).forEach(b => {
      if (b.alive && ['werewolf', 'sheriff', 'doctor'].includes(b.role)) this.later(this.rnd(2500, 7000), () => this.botNight(b));
      if (!b.alive) this.later(this.rnd(2000, 6000), () => this.botBless(b));
    });
    this.changed();
    this.tryEndNight();
  }
  nightActors() {
    return this.players.filter(p => (p.isBot || p.connected) && (p.alive ? ['werewolf', 'sheriff', 'doctor'].includes(p.role) : true));
  }
  nightAction(p, targetId) {
    if (this.phase !== 'night' || !p.alive) return;
    const t = this.get(targetId);
    if (!t || !t.alive) return;
    const n = this.night;
    if (p.role === 'werewolf') { if (t.role === 'werewolf') return; n.picks[p.id] = t.id; }
    else if (p.role === 'sheriff') { if (t === p) return; n.look = t.id; }
    else if (p.role === 'doctor') { if (t.id === p.lastShield) return; n.shield = t.id; }
    else return;
    n.done.add(p.id);
    this.changed();
    this.tryEndNight();
  }
  bless(p, targetId) {
    if (this.phase !== 'night' || p.alive) return;
    const t = this.get(targetId);
    if (t && t.alive) this.night.bless[p.id] = t.id; else delete this.night.bless[p.id];
    this.night.done.add(p.id);
    this.changed();
    this.tryEndNight();
  }
  tryEndNight() {
    if (this.phase !== 'night' || this.instant) return;
    if (!this.nightActors().every(p => this.night.done.has(p.id))) return;
    // Hold a minimum so a quiet night doesn't reveal which roles are gone.
    const wait = Math.max(0, this.night.started + TIMES.nightMin + this.rnd(0, 2500) - Date.now());
    if (this.night.ending) return;
    this.night.ending = true;
    this.setPhaseTimer(Math.max(wait, 600), () => this.resolveNight());
    // keep the visible countdown honest-ish without leaking the exact end
    this.deadline = this.night.started + TIMES.night;
  }
  resolveNight() {
    const n = this.night;
    const alive = this.alive();
    const wolves = alive.filter(p => p.role === 'werewolf');
    const valid = id => id && this.get(id) && this.get(id).alive;
    let picks = wolves.filter(p => !p.isBot).map(p => n.picks[p.id]).filter(valid);
    if (!picks.length) picks = wolves.map(p => n.picks[p.id]).filter(valid);
    const targetId = picks.length ? this.top(picks) : this.pick(alive.filter(p => p.role !== 'werewolf')).id;
    const target = this.get(targetId);

    const doctor = alive.find(p => p.role === 'doctor');
    const saved = !!(doctor && n.shield === target.id);
    if (doctor) doctor.lastShield = n.shield || null;
    if (!saved) { target.alive = false; target.revealed = true; }

    const sheriff = alive.find(p => p.role === 'sheriff');
    if (sheriff && sheriff.alive && valid(n.look)) {
      const t = this.get(n.look);
      const isWolf = t.role === 'werewolf';
      sheriff.notes.push({ round: this.round, id: t.id, name: t.name, wolf: isWolf });
      if (sheriff.bot) sheriff.bot.known[t.id] = isWolf;
      this.sys(`⭐ You investigated ${t.name}: ${isWolf ? 'WEREWOLF.' : 'innocent.'}`, [sheriff.id]);
    }

    if (saved) {
      this.sys('🌅 The wolves struck in the night — but the Doctor was there. Nobody died.');
      if (doctor) this.sys(`💉 You saved ${target.name} tonight.`, [doctor.id]);
    } else {
      this.sys(`🌅 ${target.name} was killed in the night. They were ${ROLE_NAMES[target.role]}.`);
    }

    const omens = Object.values(n.bless).filter(valid);
    if (omens.length) {
      this.blessed = this.top(omens);
      this.sys(`👻 The spirits bless ${this.get(this.blessed).name}. Their vote counts double today.`);
    }
    this.dawn = { killed: saved ? null : target.id, saved, blessed: this.blessed };
    this.enter('dawn', TIMES.dawn, () => { if (!this.checkWin()) this.beginDay(); });
    this.changed();
  }

  // ---------- day ----------
  livingHumans() { return this.players.filter(p => p.alive && !p.isBot && p.connected); }
  beginDay() {
    this.ready = new Set();
    this.enter('day', this.livingHumans().length ? TIMES.day : TIMES.idleDay, () => this.beginVote());
    this.sys(`☀️ Day ${this.round}. Talk it out, then vote on who to banish.`);
    this.botDayTalk();
    this.changed();
  }
  setReady(p) {
    if (this.phase !== 'day' || !p.alive) return;
    this.ready.add(p.id);
    this.changed();
    this.tryEndDay();
  }
  tryEndDay() {
    if (this.phase !== 'day' || this.instant) return;
    const h = this.livingHumans();
    if (h.length && h.every(p => this.ready.has(p.id))) { this.phaseFn = null; this.beginVote(); }
  }
  beginVote() {
    this.votes = {};
    this.enter('vote', TIMES.vote, () => this.resolveVote());
    this.sys('🗳️ Voting is open. Most votes is banished; a tie banishes no one.');
    this.alive().filter(p => p.isBot).forEach(b => this.later(this.rnd(2000, 11000), () => this.botVote(b)));
    this.changed();
  }
  vote(p, targetId) {
    if (this.phase !== 'vote' || !p.alive) return;
    if (targetId !== 'skip') {
      const t = this.get(targetId);
      if (!t || !t.alive || t === p) return;
    }
    this.votes[p.id] = targetId;
    this.changed();
    this.tryEndVote();
  }
  tryEndVote() {
    if (this.phase !== 'vote' || this.instant) return;
    const need = this.alive().filter(p => p.isBot || p.connected);
    if (need.every(p => this.votes[p.id])) this.setPhaseTimer(1200, () => this.resolveVote());
  }
  resolveVote() {
    const tally = {};
    this.alive().forEach(p => {
      const v = this.votes[p.id];
      if (!v) return;
      tally[v] = (tally[v] || 0) + (p.id === this.blessed ? 2 : 1);
    });
    const max = Math.max(0, ...Object.values(tally));
    const tops = Object.keys(tally).filter(k => tally[k] === max);
    const cut = max > 0 && tops.length === 1 && tops[0] !== 'skip' ? this.get(tops[0]) : null;
    this.verdict = { cut: cut ? cut.id : null, tally };
    if (cut) {
      cut.alive = false;
      cut.revealed = true;
      this.sys(`⚖️ The village banished ${cut.name} (${max} vote${max === 1 ? '' : 's'}). They were ${ROLE_NAMES[cut.role]}.`);
      // Everyone learns from who pushed the vote.
      this.players.forEach(b => {
        if (!b.bot) return;
        Object.entries(this.votes).forEach(([vid, tid]) => {
          if (tid === cut.id && vid !== b.id) b.bot.sus[vid] += cut.role === 'werewolf' ? -1.2 : 0.8;
        });
      });
    } else {
      this.sys(max === 0 ? '⚖️ Nobody voted. The village holds together — for now.' : '⚖️ The vote was split. Nobody is banished today.');
    }
    this.enter('verdict', TIMES.verdict, () => {
      if (cut && cut.role === 'jester') return this.end('jester');
      if (this.checkWin()) return;
      this.round++;
      this.beginNight();
    });
    this.changed();
  }

  // ---------- endgame ----------
  checkWin() {
    const alive = this.alive();
    const s = alive.filter(p => p.role === 'werewolf').length;
    if (s === 0) { this.end('villager'); return true; }
    if (s >= alive.length - s) { this.end('werewolf'); return true; }
    return false;
  }
  end(winner) {
    this.winner = winner;
    this.enter('over', 0, null);
    clearTimeout(this.phaseTimer);
    this.deadline = 0;
    this.sys({
      villager: '☀️ The last werewolf is gone. Hollowmoon is safe. THE VILLAGE WINS.',
      werewolf: '🐺 The wolves outnumber the living. Hollowmoon falls. THE WEREWOLVES WIN.',
      jester: '🃏 You banished the Jester — exactly what they wanted. THE JESTER WINS ALONE.',
    }[winner]);
    this.changed();
  }
  isWinner(p) {
    if (this.winner === 'villager') return ['villager', 'sheriff', 'doctor'].includes(p.role);
    if (this.winner === 'werewolf') return p.role === 'werewolf';
    if (this.winner === 'jester') return p.role === 'jester' && this.verdict && this.verdict.cut === p.id;
    return false;
  }

  // One player's request, from any transport. Returns an error string or nothing.
  command(me, m) {
    const host = this.hostId === me.id;
    let r;
    switch (m.t) {
      case 'addBot': if (host) r = this.addPlayer('', true); break;
      case 'removeBot': { const b = this.get(m.id); if (host && b && b.isBot && this.phase === 'lobby') this.removePlayer(b.id); break; }
      case 'start': if (host) r = this.start(); break;
      case 'again': if (host && this.phase === 'over') this.backToLobby(); break;
      case 'night': this.nightAction(me, m.target); break;
      case 'bless': this.bless(me, m.target); break;
      case 'ready': this.setReady(me); break;
      case 'vote': this.vote(me, m.target); break;
      case 'chat': this.chat(me, m.ch, m.text); break;
    }
    return r && r.error;
  }

  // ---------- chat ----------
  chat(p, ch, text) {
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const playing = !['lobby', 'over'].includes(this.phase);
    if (ch === 'wolf') { if (!playing || p.role !== 'werewolf' || !p.alive) return; }
    else if (ch === 'grave') { if (!playing || p.alive) return; }
    else {
      ch = 'pub';
      if (playing && (!p.alive || this.phase === 'night')) return;
    }
    this.say(ch, p, text);
    if (ch === 'pub' && playing) this.botsHear(p, text);
    this.changed();
  }

  // ---------- bots ----------
  botSay(b, text) {
    if (!b.alive || ['night', 'over', 'lobby'].includes(this.phase)) return;
    this.say('pub', b, text);
    this.changed();
  }
  // A public Lookout claim (true or not) shifts what the bots believe.
  applyClaim(by, target, isWolf, weight) {
    this.claims.push({ by: by.id, target: target.id, werewolf: isWolf, round: this.round });
    this.players.forEach(b => {
      if (!b.bot || b === by) return;
      if (b.role === 'sheriff') { b.bot.sus[by.id] = (b.bot.sus[by.id] || 0) + 4; return; } // the real one knows a fake
      if (b.id !== target.id) b.bot.sus[target.id] += (isWolf ? 3 : -2) * weight;
    });
    if (isWolf && target.isBot && target.alive) {
      this.later(this.rnd(1800, 4500), () => {
        if (target.role === 'werewolf' && this.rng() < 0.5 && !this.claims.some(c => c.by === target.id)) {
          this.botSay(target, this.line('counter', by.name));
          this.applyClaim(target, by, true, 0.6);
        } else {
          this.botSay(target, this.line('deny', by.name));
        }
      });
    }
  }
  botsHear(p, text) {
    const low = ' ' + text.toLowerCase() + ' ';
    const named = this.alive().filter(q => q !== p && new RegExp(`(^|[^a-z0-9])${q.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}([^a-z0-9]|$)`).test(low));
    if (named.length !== 1) return;
    const t = named[0];
    const accuse = /(wolf|sus\b|suspicious|lying|liar|banish|vote|kill|guilty|shady|evil|fangs|claws)/.test(low);
    const clear = /(clean|clear|innocent|trust|legit|solid|not (a|the) (were)?wolf|isn'?t (a|the) (were)?wolf|villager)/.test(low);
    const claim = /sheriff/.test(low) && /\b(i|i'?m|im|my)\b/.test(low);
    if (clear) {
      if (claim) this.applyClaim(p, t, false, 0.8);
      else this.players.forEach(b => { if (b.bot && b !== t) b.bot.sus[t.id] -= 0.3; });
    } else if (accuse) {
      if (claim) this.applyClaim(p, t, true, 0.8);
      else {
        this.players.forEach(b => { if (b.bot && b !== t) b.bot.sus[t.id] += 0.6; });
        if (t.isBot && t.bot.defended < this.round) {
          t.bot.defended = this.round;
          this.later(this.rnd(1500, 4000), () => this.botSay(t, this.line(t.role === 'jester' ? 'jester' : 'deny', p.name)));
        }
      }
    }
  }
  botDayTalk() {
    const busted = this.dawn && this.dawn.killed ? this.get(this.dawn.killed) : null;
    this.alive().filter(p => p.isBot).forEach(b => {
      this.later(this.rnd(1500, 22000), () => {
        const k = b.bot.known;
        if (b.role === 'sheriff') {
          const dirty = Object.keys(k).find(id => k[id] && this.get(id).alive && !b.bot.told.has(id));
          if (dirty) {
            b.bot.told.add(dirty);
            this.botSay(b, this.line('claimWolf', this.get(dirty).name));
            return this.applyClaim(b, this.get(dirty), true, 1);
          }
          const clean = Object.keys(k).find(id => !k[id] && this.get(id).alive && !b.bot.told.has(id));
          if (clean && this.rng() < (this.round >= 2 ? 0.7 : 0.35)) {
            b.bot.told.add(clean);
            this.botSay(b, this.line('claimClean', this.get(clean).name));
            return this.applyClaim(b, this.get(clean), false, 1);
          }
        }
        if (b.role === 'jester' && this.rng() < 0.6) return this.botSay(b, this.line('jester'));
        if (this.rng() > 0.65) return;
        const opts = this.alive().filter(q => q !== b && !(b.role === 'werewolf' && q.role === 'werewolf'));
        const worst = opts.sort((x, y) => b.bot.sus[y.id] - b.bot.sus[x.id])[0];
        if (worst && b.bot.sus[worst.id] > 1.4) this.botSay(b, this.line('accuse', worst.name));
        else if (busted && busted.role !== 'werewolf' && this.rng() < 0.3) this.botSay(b, this.line('mourn', busted.name));
        else this.botSay(b, this.line('filler'));
      });
    });
  }
  botNight(b) {
    if (this.phase !== 'night' || !b.alive) return;
    const others = this.alive().filter(p => p !== b);
    const claimed = this.claims.map(c => this.get(c.by)).filter(p => p && p.alive);
    let t;
    if (b.role === 'werewolf') {
      const marks = others.filter(p => p.role !== 'werewolf');
      const loud = marks.filter(p => claimed.includes(p));
      t = loud.length && this.rng() < 0.7 ? this.pick(loud) : this.pick(marks);
    } else if (b.role === 'sheriff') {
      const fresh = others.filter(p => !(p.id in b.bot.known));
      t = this.pick(fresh.length ? fresh : others);
    } else if (b.role === 'doctor') {
      const ok = this.alive().filter(p => p.id !== b.lastShield);
      const loud = ok.filter(p => claimed.includes(p) && b.bot.sus[p.id] < 3);
      t = loud.length && this.rng() < 0.75 ? this.pick(loud) : this.pick(ok);
    }
    if (t) this.nightAction(b, t.id);
  }
  botBless(b) {
    if (this.phase !== 'night' || b.alive) return;
    const alive = this.alive();
    let t;
    if (b.role === 'werewolf') t = this.pick(alive.filter(p => p.role === 'werewolf'));
    if (!t) t = alive.slice().sort((x, y) => b.bot.sus[x.id] - b.bot.sus[y.id])[0];
    this.bless(b, t ? t.id : null);
  }
  botVote(b) {
    if (this.phase !== 'vote' || !b.alive || this.votes[b.id]) return;
    const count = {};
    Object.values(this.votes).forEach(v => { count[v] = (count[v] || 0) + 1; });
    const others = this.alive().filter(p => p !== b);
    const sus = b.bot.sus;
    let choice;
    if (b.role === 'jester') {
      choice = this.pick(others).id;
    } else if (b.role === 'werewolf') {
      const partner = others.find(p => p.role === 'werewolf' && (count[p.id] || 0) >= Math.ceil(others.length / 2) - 1);
      if (partner && this.rng() < 0.35) choice = partner.id; // bus a doomed partner for cover
      else {
        const marks = others.filter(p => p.role !== 'werewolf');
        const best = marks.map(p => ({ p, s: sus[p.id] * 0.6 + (count[p.id] || 0) * 0.8 + this.rng() })).sort((x, y) => y.s - x.s)[0];
        choice = this.round === 1 && !Object.keys(count).length && this.rng() < 0.3 ? 'skip' : best.p.id;
      }
    } else {
      const known = b.bot.known;
      const scored = others.map(p => ({
        p, s: (known[p.id] === true ? 50 : known[p.id] === false ? -50 : sus[p.id]) + (count[p.id] || 0) * 0.35 + this.rng() * 0.5,
      })).sort((x, y) => y.s - x.s);
      const best = scored[0];
      choice = best.s < 1.5 && this.round === 1 && this.rng() < 0.6 ? 'skip' : best.s < 0.6 ? 'skip' : best.p.id;
    }
    this.vote(b, choice);
  }

  // ---------- what one player is allowed to see ----------
  view(me) {
    const over = this.phase === 'over';
    const playing = !['lobby', 'over'].includes(this.phase);
    const amWolf = me.role === 'werewolf';
    const showVotes = ['vote', 'verdict'].includes(this.phase);
    const n = this.night;
    const state = {
      t: 'state', code: this.code, phase: this.phase, round: this.round,
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      hostId: this.hostId, winner: this.winner, blessed: this.blessed,
      min: MIN_PLAYERS, max: MAX_PLAYERS, wolves: this.wolfCount || 0,
      players: this.players.map(p => ({
        id: p.id, name: p.name, color: p.color, model: p.model, isBot: p.isBot, alive: p.alive, connected: p.connected,
        role: over || p.revealed || p === me || (amWolf && p.role === 'werewolf') ? p.role : null,
        vote: showVotes ? this.votes[p.id] || null : null,
        ready: this.phase === 'day' && this.ready.has(p.id),
        won: over ? this.isWinner(p) : undefined,
      })),
      you: { id: me.id, role: me.role, alive: me.alive, notes: me.notes, lastShield: me.lastShield },
      feed: this.feed.filter(m => {
        if (m.only) return m.only.includes(me.id);
        if (m.ch === 'wolf') return amWolf || over;
        if (m.ch === 'grave') return (playing && !me.alive) || over;
        return true;
      }),
    };
    if (this.phase === 'night' && n) {
      const y = state.you;
      if (!me.alive) y.pick = n.bless[me.id] || null;
      else if (amWolf) {
        y.pick = n.picks[me.id] || null;
        y.teamPicks = this.alive().filter(p => p.role === 'werewolf' && p !== me && n.picks[p.id]).map(p => ({ by: p.id, target: n.picks[p.id] }));
      } else if (me.role === 'sheriff') y.pick = n.look;
      else if (me.role === 'doctor') y.pick = n.shield;
      y.done = n.done.has(me.id);
    }
    if (this.phase === 'verdict' || this.phase === 'over') state.verdict = this.verdict || null;
    if (this.phase === 'dawn') state.dawn = this.dawn;
    return state;
  }
}

const api = { Room, TIMES, MIN_PLAYERS, MAX_PLAYERS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Hollowmoon = api;
})(typeof self !== 'undefined' ? self : this);
