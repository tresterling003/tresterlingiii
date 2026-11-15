'use strict';
// SNITCH — game engine. Pure logic: no sockets, no HTTP. The server owns
// transport and calls into a Room; the Room calls onChange() when clients
// need a fresh view.

const TIMES = { reveal: 9000, night: 40000, nightMin: 6000, dawn: 8000, day: 90000, vote: 35000, verdict: 8000, idleDay: 9000 };
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const ICONS = ['🦊', '🦉', '🐺', '🦝', '🐍', '🦇', '🐻', '🐸', '🦅', '🐱', '🦈', '🐙'];
const BOT_NAMES = ['Vex', 'Domino', 'Sable', 'Knuckles', 'Marlowe', 'Pix', 'Duchess', 'Ratchet', 'Juno', 'Fig', 'Echo', 'Brick', 'Lux', 'Moth'];
const ROLE_NAMES = { crew: 'Crew', lookout: 'the Lookout', fixer: 'the Fixer', snitch: 'a Snitch', fallguy: 'the Fall Guy' };

const LINES = {
  accuse: ['I don\'t like how {X} is acting.', '{X} is way too calm for someone in this crew.', 'My gut says {X} is wired.', 'Anyone else notice {X} dodging questions?', 'I\'m voting {X} unless someone talks me out of it.', '{X}. That\'s my read.'],
  filler: ['I\'ve got nothing solid yet.', 'Somebody here is talking to the cops. Think.', 'Let\'s not cut one of our own on a hunch.', 'Watch who votes with who.', 'Too quiet in here.', 'We lose one more and this job is cooked.', 'If the Lookout has something, now\'s the time.'],
  deny: ['Me? I\'ve been on this crew longer than you.', 'I\'m clean. {X} is making things up.', 'That\'s exactly what a snitch would say, {X}.', 'Cut me and you\'ll see you wasted a vote.', 'Not me. Look harder.'],
  claimSnitch: ['I\'m the Lookout. I tailed {X} last night — they\'re wearing a wire.', 'Lookout here. {X} met with the cops. Cut them.'],
  claimClean: ['Lookout here. I tailed {X} — they\'re clean.', 'For what it\'s worth, I watched {X} all night. Solid.'],
  counter: ['{X} is lying. I\'M the Lookout, and {X} is the one wearing a wire.', 'Funny — I\'m the real Lookout and I caught {X} with the cops.'],
  fallguy: ['Fine, cut me then. See what happens.', 'Maybe I did talk to somebody. So what?', 'You\'ll never guess what I was doing last night.', 'Honestly? I\'d vote for me.', 'I\'m not saying I\'m the snitch. I\'m not saying I\'m not.'],
  mourn: ['{X} was one of ours. Damn.', 'They got {X}. We need to move faster.', 'Losing {X} hurts.'],
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
    this.kiteHolder = null;
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
    if (from) { m.from = from.id; m.name = from.name; m.icon = from.icon; }
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
    const icons = ICONS.filter(i => !this.players.some(p => p.icon === i));
    const p = {
      id: 'p' + (++this.idSeq), name: final, icon: this.pick(icons.length ? icons : ICONS),
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
    const snitches = n >= 7 ? 2 : 1;
    const deck = ['lookout', 'fixer'];
    for (let i = 0; i < snitches; i++) deck.push('snitch');
    if (n === 6 || n >= 8) deck.push('fallguy');
    while (deck.length < n) deck.push('crew');
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
    this.feed = [];
    this.claims = [];
    this.winner = null;
    this.kiteHolder = null;
    this.votes = {};
    const s = deck.filter(r => r === 'snitch').length;
    this.sys(`The crew is assembled: ${this.players.length} of you, and ${s === 1 ? 'one is' : s + ' are'} wearing a wire.${deck.includes('fallguy') ? ' There\'s also a Fall Guy who wants to be voted out.' : ''}`);
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
    this.kiteHolder = null;
    this.night = null;
    this.players = this.players.filter(p => p.isBot || p.connected);
    this.players.forEach(p => Object.assign(p, { alive: true, role: null, revealed: false, notes: [], bot: null }));
    this.changed();
  }

  // ---------- night ----------
  beginNight() {
    this.kiteHolder = null;
    this.votes = {};
    this.night = { picks: {}, look: null, shield: null, kite: {}, done: new Set(), started: Date.now() };
    this.enter('night', TIMES.night, () => this.resolveNight());
    this.sys(`🌙 Night ${this.round}. The safehouse goes dark.`);
    this.players.filter(p => p.isBot).forEach(b => {
      if (b.alive && ['snitch', 'lookout', 'fixer'].includes(b.role)) this.later(this.rnd(2500, 7000), () => this.botNight(b));
      if (!b.alive) this.later(this.rnd(2000, 6000), () => this.botKite(b));
    });
    this.changed();
    this.tryEndNight();
  }
  nightActors() {
    return this.players.filter(p => (p.isBot || p.connected) && (p.alive ? ['snitch', 'lookout', 'fixer'].includes(p.role) : true));
  }
  nightAction(p, targetId) {
    if (this.phase !== 'night' || !p.alive) return;
    const t = this.get(targetId);
    if (!t || !t.alive) return;
    const n = this.night;
    if (p.role === 'snitch') { if (t.role === 'snitch') return; n.picks[p.id] = t.id; }
    else if (p.role === 'lookout') { if (t === p) return; n.look = t.id; }
    else if (p.role === 'fixer') { if (t.id === p.lastShield) return; n.shield = t.id; }
    else return;
    n.done.add(p.id);
    this.changed();
    this.tryEndNight();
  }
  kite(p, targetId) {
    if (this.phase !== 'night' || p.alive) return;
    const t = this.get(targetId);
    if (t && t.alive) this.night.kite[p.id] = t.id; else delete this.night.kite[p.id];
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
    const snitches = alive.filter(p => p.role === 'snitch');
    const valid = id => id && this.get(id) && this.get(id).alive;
    let picks = snitches.filter(p => !p.isBot).map(p => n.picks[p.id]).filter(valid);
    if (!picks.length) picks = snitches.map(p => n.picks[p.id]).filter(valid);
    const targetId = picks.length ? this.top(picks) : this.pick(alive.filter(p => p.role !== 'snitch')).id;
    const target = this.get(targetId);

    const fixer = alive.find(p => p.role === 'fixer');
    const saved = !!(fixer && n.shield === target.id);
    if (fixer) fixer.lastShield = n.shield || null;
    if (!saved) { target.alive = false; target.revealed = true; }

    const lookout = alive.find(p => p.role === 'lookout');
    if (lookout && lookout.alive && valid(n.look)) {
      const t = this.get(n.look);
      const isSnitch = t.role === 'snitch';
      lookout.notes.push({ round: this.round, id: t.id, name: t.name, snitch: isSnitch });
      if (lookout.bot) lookout.bot.known[t.id] = isSnitch;
      this.sys(`🔭 You tailed ${t.name}: ${isSnitch ? 'they met with the cops. SNITCH.' : 'nothing shady. Clean.'}`, [lookout.id]);
    }

    if (saved) {
      this.sys('🚨 The cops kicked in a door overnight — but somebody\'s alibi held. Nobody was busted.');
      if (fixer) this.sys(`🧰 Your alibi saved ${target.name} tonight.`, [fixer.id]);
    } else {
      this.sys(`🚨 Sirens at dawn. ${target.icon} ${target.name} got busted. They were ${ROLE_NAMES[target.role]}.`);
    }

    const kites = Object.values(n.kite).filter(valid);
    if (kites.length) {
      this.kiteHolder = this.top(kites);
      this.sys(`🪁 Lockup smuggled a kite to ${this.get(this.kiteHolder).name}. Their vote counts double today.`);
    }
    this.dawn = { busted: saved ? null : target.id, saved };
    this.enter('dawn', TIMES.dawn, () => { if (!this.checkWin()) this.beginDay(); });
    this.changed();
  }

  // ---------- day ----------
  livingHumans() { return this.players.filter(p => p.alive && !p.isBot && p.connected); }
  beginDay() {
    this.ready = new Set();
    this.enter('day', this.livingHumans().length ? TIMES.day : TIMES.idleDay, () => this.beginVote());
    this.sys(`☀️ Day ${this.round}. Talk it out, then vote on who to cut loose.`);
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
    this.sys('🗳️ Voting is open. Majority cuts someone loose; a tie cuts no one.');
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
      tally[v] = (tally[v] || 0) + (p.id === this.kiteHolder ? 2 : 1);
    });
    const max = Math.max(0, ...Object.values(tally));
    const tops = Object.keys(tally).filter(k => tally[k] === max);
    const cut = max > 0 && tops.length === 1 && tops[0] !== 'skip' ? this.get(tops[0]) : null;
    this.verdict = { cut: cut ? cut.id : null, tally };
    if (cut) {
      cut.alive = false;
      cut.revealed = true;
      this.sys(`✂️ The crew cut ${cut.icon} ${cut.name} loose (${max} vote${max === 1 ? '' : 's'}). They were ${ROLE_NAMES[cut.role]}.`);
      // Everyone learns from who pushed the vote.
      this.players.forEach(b => {
        if (!b.bot) return;
        Object.entries(this.votes).forEach(([vid, tid]) => {
          if (tid === cut.id && vid !== b.id) b.bot.sus[vid] += cut.role === 'snitch' ? -1.2 : 0.8;
        });
      });
    } else {
      this.sys(max === 0 ? '✂️ Nobody voted. The crew holds together — for now.' : '✂️ The vote was split. Nobody gets cut today.');
    }
    this.enter('verdict', TIMES.verdict, () => {
      if (cut && cut.role === 'fallguy') return this.end('fallguy');
      if (this.checkWin()) return;
      this.round++;
      this.beginNight();
    });
    this.changed();
  }

  // ---------- endgame ----------
  checkWin() {
    const alive = this.alive();
    const s = alive.filter(p => p.role === 'snitch').length;
    if (s === 0) { this.end('crew'); return true; }
    if (s >= alive.length - s) { this.end('snitch'); return true; }
    return false;
  }
  end(winner) {
    this.winner = winner;
    this.enter('over', 0, null);
    clearTimeout(this.phaseTimer);
    this.deadline = 0;
    this.sys({
      crew: '💰 Every wire is out. The crew cracks the vault and vanishes. CREW WINS.',
      snitch: '🚔 The snitches own the room. Everyone left goes down. SNITCHES WIN.',
      fallguy: '🃏 You cut the Fall Guy — exactly what they wanted. THE FALL GUY WINS ALONE.',
    }[winner]);
    this.changed();
  }
  isWinner(p) {
    if (this.winner === 'crew') return ['crew', 'lookout', 'fixer'].includes(p.role);
    if (this.winner === 'snitch') return p.role === 'snitch';
    if (this.winner === 'fallguy') return p.role === 'fallguy' && this.verdict && this.verdict.cut === p.id;
    return false;
  }

  // ---------- chat ----------
  chat(p, ch, text) {
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const playing = !['lobby', 'over'].includes(this.phase);
    if (ch === 'snitch') { if (!playing || p.role !== 'snitch' || !p.alive) return; }
    else if (ch === 'lockup') { if (!playing || p.alive) return; }
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
  applyClaim(by, target, isSnitch, weight) {
    this.claims.push({ by: by.id, target: target.id, snitch: isSnitch, round: this.round });
    this.players.forEach(b => {
      if (!b.bot || b === by) return;
      if (b.role === 'lookout') { b.bot.sus[by.id] = (b.bot.sus[by.id] || 0) + 4; return; } // the real one knows a fake
      if (b.id !== target.id) b.bot.sus[target.id] += (isSnitch ? 3 : -2) * weight;
    });
    if (isSnitch && target.isBot && target.alive) {
      this.later(this.rnd(1800, 4500), () => {
        if (target.role === 'snitch' && this.rng() < 0.5 && !this.claims.some(c => c.by === target.id)) {
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
    const accuse = /(snitch|rat\b|wire|sus\b|suspicious|lying|liar|\bcut\b|vote|dirty|\bcop|guilty|shady)/.test(low);
    const clear = /(clean|clear|innocent|trust|legit|solid|not the snitch|isn'?t the snitch)/.test(low);
    const claim = /lookout/.test(low) && /\b(i|i'?m|im|my)\b/.test(low);
    if (clear) {
      if (claim) this.applyClaim(p, t, false, 0.8);
      else this.players.forEach(b => { if (b.bot && b !== t) b.bot.sus[t.id] -= 0.3; });
    } else if (accuse) {
      if (claim) this.applyClaim(p, t, true, 0.8);
      else {
        this.players.forEach(b => { if (b.bot && b !== t) b.bot.sus[t.id] += 0.6; });
        if (t.isBot && t.bot.defended < this.round) {
          t.bot.defended = this.round;
          this.later(this.rnd(1500, 4000), () => this.botSay(t, this.line(t.role === 'fallguy' ? 'fallguy' : 'deny', p.name)));
        }
      }
    }
  }
  botDayTalk() {
    const busted = this.dawn && this.dawn.busted ? this.get(this.dawn.busted) : null;
    this.alive().filter(p => p.isBot).forEach(b => {
      this.later(this.rnd(1500, 22000), () => {
        const k = b.bot.known;
        if (b.role === 'lookout') {
          const dirty = Object.keys(k).find(id => k[id] && this.get(id).alive && !b.bot.told.has(id));
          if (dirty) {
            b.bot.told.add(dirty);
            this.botSay(b, this.line('claimSnitch', this.get(dirty).name));
            return this.applyClaim(b, this.get(dirty), true, 1);
          }
          const clean = Object.keys(k).find(id => !k[id] && this.get(id).alive && !b.bot.told.has(id));
          if (clean && this.rng() < (this.round >= 2 ? 0.7 : 0.35)) {
            b.bot.told.add(clean);
            this.botSay(b, this.line('claimClean', this.get(clean).name));
            return this.applyClaim(b, this.get(clean), false, 1);
          }
        }
        if (b.role === 'fallguy' && this.rng() < 0.6) return this.botSay(b, this.line('fallguy'));
        if (this.rng() > 0.65) return;
        const opts = this.alive().filter(q => q !== b && !(b.role === 'snitch' && q.role === 'snitch'));
        const worst = opts.sort((x, y) => b.bot.sus[y.id] - b.bot.sus[x.id])[0];
        if (worst && b.bot.sus[worst.id] > 1.4) this.botSay(b, this.line('accuse', worst.name));
        else if (busted && busted.role !== 'snitch' && this.rng() < 0.3) this.botSay(b, this.line('mourn', busted.name));
        else this.botSay(b, this.line('filler'));
      });
    });
  }
  botNight(b) {
    if (this.phase !== 'night' || !b.alive) return;
    const others = this.alive().filter(p => p !== b);
    const claimed = this.claims.map(c => this.get(c.by)).filter(p => p && p.alive);
    let t;
    if (b.role === 'snitch') {
      const marks = others.filter(p => p.role !== 'snitch');
      const loud = marks.filter(p => claimed.includes(p));
      t = loud.length && this.rng() < 0.7 ? this.pick(loud) : this.pick(marks);
    } else if (b.role === 'lookout') {
      const fresh = others.filter(p => !(p.id in b.bot.known));
      t = this.pick(fresh.length ? fresh : others);
    } else if (b.role === 'fixer') {
      const ok = this.alive().filter(p => p.id !== b.lastShield);
      const loud = ok.filter(p => claimed.includes(p) && b.bot.sus[p.id] < 3);
      t = loud.length && this.rng() < 0.75 ? this.pick(loud) : this.pick(ok);
    }
    if (t) this.nightAction(b, t.id);
  }
  botKite(b) {
    if (this.phase !== 'night' || b.alive) return;
    const alive = this.alive();
    let t;
    if (b.role === 'snitch') t = this.pick(alive.filter(p => p.role === 'snitch'));
    if (!t) t = alive.slice().sort((x, y) => b.bot.sus[x.id] - b.bot.sus[y.id])[0];
    this.kite(b, t ? t.id : null);
  }
  botVote(b) {
    if (this.phase !== 'vote' || !b.alive || this.votes[b.id]) return;
    const count = {};
    Object.values(this.votes).forEach(v => { count[v] = (count[v] || 0) + 1; });
    const others = this.alive().filter(p => p !== b);
    const sus = b.bot.sus;
    let choice;
    if (b.role === 'fallguy') {
      choice = this.pick(others).id;
    } else if (b.role === 'snitch') {
      const partner = others.find(p => p.role === 'snitch' && (count[p.id] || 0) >= Math.ceil(others.length / 2) - 1);
      if (partner && this.rng() < 0.35) choice = partner.id; // bus a doomed partner for cover
      else {
        const marks = others.filter(p => p.role !== 'snitch');
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
    const amSnitch = me.role === 'snitch';
    const showVotes = ['vote', 'verdict'].includes(this.phase);
    const n = this.night;
    const state = {
      t: 'state', code: this.code, phase: this.phase, round: this.round,
      left: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      hostId: this.hostId, winner: this.winner, kiteHolder: this.kiteHolder,
      min: MIN_PLAYERS, max: MAX_PLAYERS,
      players: this.players.map(p => ({
        id: p.id, name: p.name, icon: p.icon, isBot: p.isBot, alive: p.alive, connected: p.connected,
        role: over || p.revealed || p === me || (amSnitch && p.role === 'snitch') ? p.role : null,
        vote: showVotes ? this.votes[p.id] || null : null,
        ready: this.phase === 'day' && this.ready.has(p.id),
        won: over ? this.isWinner(p) : undefined,
      })),
      you: { id: me.id, role: me.role, alive: me.alive, notes: me.notes, lastShield: me.lastShield },
      feed: this.feed.filter(m => {
        if (m.only) return m.only.includes(me.id);
        if (m.ch === 'snitch') return amSnitch || over;
        if (m.ch === 'lockup') return (playing && !me.alive) || over;
        return true;
      }),
    };
    if (this.phase === 'night' && n) {
      const y = state.you;
      if (!me.alive) y.pick = n.kite[me.id] || null;
      else if (amSnitch) {
        y.pick = n.picks[me.id] || null;
        y.teamPicks = this.alive().filter(p => p.role === 'snitch' && p !== me && n.picks[p.id]).map(p => ({ by: p.id, target: n.picks[p.id] }));
      } else if (me.role === 'lookout') y.pick = n.look;
      else if (me.role === 'fixer') y.pick = n.shield;
      y.done = n.done.has(me.id);
    }
    if (showVotes && this.phase === 'verdict') state.verdict = this.verdict;
    return state;
  }
}

module.exports = { Room, TIMES, MIN_PLAYERS, MAX_PLAYERS };
