// ================= ROAD TO GLORY (career mode) =================
const TIERS = {
  gym: { id: 'gym', label: 'HIGH SCHOOL · GYM CLASS', short: 'GYM CLASS', cap: 68, venue: 'gym', days: 5, needWins: 3 },
  rec: { id: 'rec', label: 'EASTSIDE REC LEAGUE', short: 'REC LEAGUE', cap: 78, venue: 'rec' },
};
const REC_TEAMS = [
  { id: 'cats', city: 'EASTSIDE', name: 'ALLEY CATS', abbr: 'EAC', primary: '#ff7a2f', secondary: '#1b1b1b', accent: '#ffd29c', shape: 'shield', glyph: 'fang', tier: 0.76, style: { speed: 2 } },
  { id: 'knights', city: 'THURSDAY', name: 'KNIGHTS', abbr: 'THK', primary: '#8f9bb5', secondary: '#101827', accent: '#ffffff', shape: 'shield', glyph: 'crown', tier: 0.77, style: { catch: 4 } },
  { id: 'gutter', city: 'THE', name: 'GUTTER BALLERS', abbr: 'GTB', primary: '#2fbf71', secondary: '#0e2a1b', accent: '#e9ffe9', shape: 'hex', glyph: 'bolt', tier: 0.74, style: { pow: 4 } },
  { id: 'plaid', city: 'PLAID', name: 'PANTHERS', abbr: 'PLP', primary: '#b22234', secondary: '#f1e3c6', accent: '#1a0a0a', shape: 'circle', glyph: 'star', tier: 0.79, style: { acc: 3, awr: 3 } },
  { id: 'rejects', city: 'REC ROOM', name: 'REJECTS', abbr: 'RRR', primary: '#8a5cf6', secondary: '#1c1033', accent: '#efe6ff', shape: 'diamond', glyph: 'comet', tier: 0.72, style: { dodge: 4 } },
  { id: 'lunch', city: 'LUNCH BREAK', name: 'LEGENDS', abbr: 'LBL', primary: '#f5c518', secondary: '#2b2b2b', accent: '#ffffff', shape: 'hex', glyph: 'flame', tier: 0.8, style: { pow: 3, clutch: 3 } },
];
const GYM_UNI = [{ p: '#2f6bff', s: '#0d1b3d', a: '#ffffff' }, { p: '#e23b3b', s: '#3d0d0d', a: '#ffffff' }];
const LOOKS = [{ avatar: 0, label: 'LOOK 1' }, { avatar: 1, label: 'LOOK 2' }, { avatar: 2, label: 'LOOK 3' }, { avatar: 3, label: 'LOOK 4' }];

const CAREER = {
  C: null,
  load() { try { const s = localStorage.getItem('dn_career'); this.C = s ? JSON.parse(s) : null; } catch (e) { this.C = this.C || null; } return this.C; },
  save() { try { localStorage.setItem('dn_career', JSON.stringify(this.C)); } catch (e) { } },
  xpNeed(level) { return 100 + level * 30; },
  cost(v) { return v < 55 ? 1 : v < 65 ? 2 : v < 75 ? 3 : 4; },
  ovr() { return computeOVR(this.C.ratings, this.C.arch); },
  rank() {
    const o = this.ovr(), t = this.C.tier;
    if (t === 'gym') return o < 54 ? 'BENCHWARMER' : o < 60 ? 'GYM CLASS STARTER' : o < 65 ? 'GYM CLASS HERO' : 'HALLWAY LEGEND';
    return o < 62 ? 'REC ROOKIE' : o < 68 ? 'REC REGULAR' : o < 74 ? 'REC STANDOUT' : 'LOCAL LEGEND';
  },
  meData(team) {
    const C = this.C; const av = AVATARS[LOOKS[C.look].avatar];
    return { id: 'me', first: C.first, last: C.last, num: C.num, arch: C.arch, ratings: { ...C.ratings }, ovr: this.ovr(), avatar: av, female: av.female, height: C.height, build: ARCH[C.arch].build };
  },
  myTeamColors() { return this.C.tier === 'gym' ? GYM_UNI[0] : { p: REC_TEAMS[0].primary, s: REC_TEAMS[0].secondary, a: REC_TEAMS[0].accent }; },

  // ---------- generated people ----------
  classmates() {
    const pool = [];
    for (let k = 0; k < 4; k++) {
      const t = { id: 'cm' + k, tier: 0.6 + k * 0.025, style: {} };
      const r = buildRoster(t, 40 + k + (this.C.seed % 1000) * 7);
      r.forEach(p => pool.push(p));
    }
    return pool;
  },
  gymTeams(day) {
    const rnd = seeded(this.C.seed + day * 101 + this.C.gym.semester * 7);
    const pool = this.classmates().sort(() => rnd() - 0.5);
    const mine = pool.slice(0, 5), theirs = pool.slice(5, 11);
    const blue = { id: 'blue', city: 'PERIOD 3', name: 'BLUE TEAM', abbr: 'BLU', primary: GYM_UNI[0].p, secondary: GYM_UNI[0].s, accent: '#fff', shape: 'circle', glyph: 'bolt', roster: null };
    const red = { id: 'red', city: 'PERIOD 3', name: 'RED TEAM', abbr: 'RED', primary: GYM_UNI[1].p, secondary: GYM_UNI[1].s, accent: '#fff', shape: 'circle', glyph: 'star', roster: theirs };
    blue.roster = [this.meData(blue), ...mine];
    return [blue, red];
  },
  recTeam(i) {
    const base = REC_TEAMS[i]; const t = { ...base, roster: buildRoster(base, 300 + i * 13 + (this.C.seed % 1000) + this.C.rec.season * 17) };
    // the league gets a little tougher every season
    t.roster.forEach(p => { for (const k of RATING_KEYS) p.ratings[k] = clamp(p.ratings[k] + (this.C.rec.season - 1) * 2, 40, 99); p.ovr = computeOVR(p.ratings, p.arch); });
    if (i === 0) t.roster = [this.meData(t), ...t.roster.filter(p => p.arch !== this.C.arch).slice(0, 5)];
    t.ovr = Math.round(t.roster.reduce((s, p) => s + p.ovr, 0) / t.roster.length);
    return t;
  },
  teamOvr(i) { return this.recTeam(i).ovr; },

  // ---------- flow ----------
  open() {
    this.load();
    UI.go('career', () => { G.demoMode(); this.C ? this.renderHub() : this.renderCreate(); });
  },
  newCareer(form) {
    const arch = form.arch, r = {};
    for (const k of RATING_KEYS) r[k] = clamp(Math.round(44 + (ARCH[arch].base[k] - 75) * 0.5 + rand(-2, 2)), 38, 62);
    const fem = AVATARS[LOOKS[form.look].avatar].female;
    this.C = {
      v: 1, seed: (Math.random() * 1e9) | 0, first: form.first, last: form.last, num: form.num, look: form.look, arch, height: fem ? 1.74 : 1.86,
      ratings: r, level: 1, xp: 0, sp: 3, tier: 'gym', diff: form.diff,
      gym: { semester: 1, day: 0, results: [] },
      rec: { season: 1, round: 0, results: [], standings: {}, phase: 'regular', order: [], playoff: null },
      totals: { games: 0, wins: 0, hits: 0, catches: 0, dodges: 0, throws: 0, outs: 0, sky: 0 }, log: [], champ: 0,
    };
    this.save();
  },
  initRecSeason() {
    const R = this.C.rec; R.round = 0; R.results = []; R.phase = 'regular'; R.playoff = null; R.standings = {};
    REC_TEAMS.forEach(t => R.standings[t.id] = { w: 0, l: 0 });
    const rnd = seeded(this.C.seed + R.season * 999); R.order = [1, 2, 3, 4, 5].sort(() => rnd() - 0.5);
  },
  nextGame() { // {home, away, opts, label}
    const C = this.C;
    if (C.tier === 'gym') {
      const [blue, red] = this.gymTeams(C.gym.day);
      return { home: blue, away: red, label: `GYM DAY ${C.gym.day + 1} OF ${TIERS.gym.days}`, opts: { diff: C.diff, bestOf: 1, venue: 'gym', lockedId: 'me', career: 'gym', uni: GYM_UNI } };
    }
    const R = C.rec; let oppI, bestOf = 1, label;
    if (R.phase === 'regular') { oppI = R.order[R.round]; label = `WEEK ${R.round + 1} OF 5`; }
    else if (R.phase === 'semi') { oppI = R.playoff.semiOpp; label = 'PLAYOFFS · SEMIFINAL'; }
    else if (R.phase === 'final') { oppI = R.playoff.finalOpp; bestOf = 3; label = 'CHAMPIONSHIP · BEST OF 3'; }
    else return null;
    const home = this.recTeam(0), away = this.recTeam(oppI);
    return { home, away, label, oppI, opts: { diff: C.diff, bestOf, venue: 'rec', lockedId: 'me', career: 'rec' } };
  },
  play() {
    const g = this.nextGame(); if (!g) return;
    this.current = g;
    UI.go('hud', () => startMatchFlow({ home: g.home, away: g.away, opts: g.opts }));
  },
  simGame(a, b) { const oa = this.teamOvr(a), ob = this.teamOvr(b); return Math.random() < 1 / (1 + Math.exp(-(oa - ob) / 4)) ? a : b; },

  // ---------- after a match ----------
  afterMatch() {
    const C = this.C, me = G.locked; if (!C || !me) return UI.go('title', () => G.toTitle());
    const won = G.wins[0] > G.wins[1]; const s = me.stats;
    const lines = [['GAME PLAYED', 20]];
    if (won) lines.push([G.match.bestOf > 1 ? 'SERIES WIN' : 'WIN', G.match.bestOf > 1 ? 120 : 60]);
    if (s.hits) lines.push([`${s.hits} HIT${s.hits > 1 ? 'S' : ''}`, s.hits * 30]);
    if (s.catches) lines.push([`${s.catches} CATCH${s.catches > 1 ? 'ES' : ''}`, s.catches * 45]);
    if (s.dodges) lines.push([`${s.dodges} DODGE${s.dodges > 1 ? 'S' : ''}`, s.dodges * 10]);
    if (s.blocks) lines.push([`${s.blocks} BLOCK${s.blocks > 1 ? 'S' : ''}`, s.blocks * 15]);
    if (s.perfect) lines.push([`${s.perfect} PERFECT RELEASE${s.perfect > 1 ? 'S' : ''}`, s.perfect * 8]);
    if (s.skyShots) lines.push([`${s.skyShots} SKY SHOT${s.skyShots > 1 ? 'S' : ''}`, s.skyShots * 25]);
    const all = G.players.slice(); const sc = (p) => p.stats.hits * 3 + p.stats.catches * 4.5 + p.stats.dodges + p.stats.blocks * 1.5 - p.stats.outs * 1.2;
    const mvp = all.sort((a, b) => sc(b) - sc(a))[0] === me;
    if (mvp) lines.push(['GAME MVP', 40]);
    const score = sc(me) + (won ? 2 : 0);
    const grade = score >= 12 ? 'A+' : score >= 9 ? 'A' : score >= 6.5 ? 'B+' : score >= 4.5 ? 'B' : score >= 2.5 ? 'C' : score >= 0.5 ? 'D' : 'F';
    const gradeMult = { 'A+': 1.25, A: 1.15, 'B+': 1.08, B: 1, C: 0.95, D: 0.9, F: 0.85 }[grade];
    let xp = Math.round(lines.reduce((a, l) => a + l[1], 0) * gradeMult);
    // levels
    const before = C.level; C.xp += xp;
    while (C.xp >= this.xpNeed(C.level)) { C.xp -= this.xpNeed(C.level); C.level++; C.sp += 3; }
    const lvls = C.level - before;
    const T = C.totals; T.games++; if (won) T.wins++; T.hits += s.hits; T.catches += s.catches; T.dodges += s.dodges; T.throws += s.throws; T.outs += s.outs; T.sky += s.skyShots || 0;
    // schedule progression
    let news = null;
    const opp = G.teams[1].data;
    if (C.tier === 'gym') {
      C.gym.results.push({ opp: opp.name, won, grade, line: `${s.hits}H ${s.catches}C ${s.dodges}D` }); C.gym.day++;
      if (C.gym.day >= TIERS.gym.days) {
        const w = C.gym.results.filter(r => r.won).length;
        if (w >= TIERS.gym.needWins) { C.tier = 'rec'; this.initRecSeason(); C.sp += 2; news = { kind: 'promo', title: "YOU'VE BEEN NOTICED", sub: `Coach Reynolds passed your name to the Eastside Rec League. Welcome to the ALLEY CATS. (+2 skill points)` }; }
        else { C.gym.semester++; C.gym.day = 0; C.gym.results = []; news = { kind: 'repeat', title: 'NEW SEMESTER', sub: `${w}-${TIERS.gym.days - w} wasn't enough. You need ${TIERS.gym.needWins} wins in a semester to get invited to the rec league. Your ratings carry over.` }; }
      }
    } else {
      const R = C.rec; const oppI = this.current ? this.current.oppI : R.order[R.round];
      if (R.phase === 'regular') {
        R.results.push({ opp: opp.name, won, grade, line: `${s.hits}H ${s.catches}C ${s.dodges}D` });
        R.standings.cats[won ? 'w' : 'l']++; R.standings[REC_TEAMS[oppI].id][won ? 'l' : 'w']++;
        const others = [1, 2, 3, 4, 5].filter(i => i !== oppI); // two other games this week, one bye
        for (let k = 0; k + 1 < others.length; k += 2) { const a = others[(k + R.round) % 4], b = others[(k + 1 + R.round) % 4]; const wv = this.simGame(a, b); R.standings[REC_TEAMS[wv].id].w++; R.standings[REC_TEAMS[wv === a ? b : a].id].l++; }
        R.round++;
        if (R.round >= 5) {
          const table = this.table(); const seed = table.findIndex(t => t.i === 0);
          if (seed < 4) { R.phase = 'semi'; const opp4 = table[3 - seed].i; const o = table.filter((t, j) => j < 4 && t.i !== 0 && t.i !== opp4).map(t => t.i); R.playoff = { semiOpp: opp4, otherSemi: o, seed: seed + 1 }; news = { kind: 'playoffs', title: 'PLAYOFFS!', sub: `You finished #${seed + 1}. Semifinal vs the ${REC_TEAMS[opp4].name}.` }; }
          else { news = { kind: 'repeat', title: 'MISSED THE PLAYOFFS', sub: `Finished #${seed + 1}. Top 4 make it. New season starts now — keep leveling up.` }; R.season++; this.initRecSeason(); }
        }
      } else if (R.phase === 'semi') {
        R.results.push({ opp: opp.name, won, grade, line: 'SEMIFINAL' });
        if (won) { const [a, b] = R.playoff.otherSemi; R.playoff.finalOpp = this.simGame(a, b); R.phase = 'final'; news = { kind: 'final', title: 'TO THE CHAMPIONSHIP', sub: `The ${REC_TEAMS[R.playoff.finalOpp].name} are waiting. Best of 3 for the rec league title.` }; }
        else { news = { kind: 'repeat', title: 'SEASON OVER', sub: 'Knocked out in the semis. New season — run it back.' }; R.season++; this.initRecSeason(); }
      } else if (R.phase === 'final') {
        R.results.push({ opp: opp.name, won, grade, line: 'CHAMPIONSHIP' });
        if (won) { C.champ++; C.sp += 4; news = { kind: 'champ', title: 'REC LEAGUE CHAMPIONS', sub: `${C.first} ${C.last} and the Alley Cats run the Eastside. The road to glory continues soon (+4 skill points).` }; }
        else news = { kind: 'repeat', title: 'SO CLOSE', sub: 'Lost the championship series. New season — come back stronger.' };
        R.season++; this.initRecSeason();
      }
    }
    C.log.unshift(`${won ? 'W' : 'L'} vs ${opp.name} · ${grade} · +${xp} XP`); C.log = C.log.slice(0, 12);
    this.save();
    this.renderPost({ won, lines, gradeMult, xp, grade, lvls, mvp, news, s });
  },
  table() {
    const R = this.C.rec;
    return REC_TEAMS.map((t, i) => ({ i, t, ...R.standings[t.id] })).sort((a, b) => (b.w - b.l) - (a.w - a.l) || (a.i === 0 ? -1 : b.i === 0 ? 1 : this.teamOvr(b.i) - this.teamOvr(a.i)));
  },

  // ---------- screens ----------
  root() { return $('#career-root'); },
  async renderCreate() {
    const form = { first: 'Jordan', last: 'Rivers', num: 7, look: 0, arch: 'GHOST', diff: 1 };
    const R = this.root();
    const draw = () => {
      const archs = Object.keys(ARCH);
      R.innerHTML = `<header class="scr-head"><button class="back" data-cr="title">‹</button><h2>ROAD TO GLORY · CREATE PLAYER</h2></header>
      <div class="cr-create">
        <div class="cr-looks">${LOOKS.map((l, i) => `<button class="cr-look ${i === form.look ? 'on' : ''}" data-look="${i}"><div class="sil"></div><span>${AVATARS[l.avatar].female ? 'WOMEN\'S' : 'MEN\'S'} · ${l.label}</span></button>`).join('')}</div>
        <div class="cr-form">
          <label>FIRST NAME<input id="cf-first" maxlength="12" value="${form.first}"></label>
          <label>LAST NAME<input id="cf-last" maxlength="14" value="${form.last}"></label>
          <label>NUMBER<input id="cf-num" type="number" min="0" max="99" value="${form.num}"></label>
          <div class="cr-lab">ARCHETYPE</div>
          <div class="seg cr-arch">${archs.map(a => `<button class="${a === form.arch ? 'on' : ''}" data-arch="${a}">${ARCH[a].label}</button>`).join('')}</div>
          <div class="cr-archdesc">${({ CANNON: 'Pure arm strength. Throws that knock people over.', SNIPER: 'Pinpoint accuracy. Rarely misses.', WALL: 'Hands of glue. Catches everything.', GHOST: 'Fast and slippery. Jukes, dives and disappears.', CAPTAIN: 'Leader. Clutch when it matters; rallies the team.', ANCHOR: 'Balanced at everything, elite at nothing — yet.' })[form.arch]}</div>
          <div class="cr-lab">DIFFICULTY</div>
          <div class="seg cr-diff">${DIFFS.slice(0, 3).map((d, i) => `<button class="${i === form.diff ? 'on' : ''}" data-diff="${i}">${d.name}</button>`).join('')}</div>
          <p class="cr-note">You start as a nobody in Period 3 gym class with ratings in the 40s and 50s. Win, play well, earn XP and level up. Get noticed and the rec league comes calling.</p>
          <button class="cta" data-cr="start">START CAREER ›</button>
        </div>
      </div>`;
      for (const b of $$('[data-look]', R)) b.onclick = () => { this.grab(form); form.look = +b.dataset.look; AUDIO.ui(); draw(); };
      for (const b of $$('[data-arch]', R)) b.onclick = () => { this.grab(form); form.arch = b.dataset.arch; AUDIO.ui(); draw(); };
      for (const b of $$('[data-diff]', R)) b.onclick = () => { this.grab(form); form.diff = +b.dataset.diff; AUDIO.ui(); draw(); };
      $('[data-cr="title"]', R).onclick = () => UI.go('title', () => G.toTitle());
      $('[data-cr="start"]', R).onclick = () => { this.grab(form); if (!form.first.trim() || !form.last.trim()) { UI.hint('ENTER A NAME', 'nm' + Math.random()); return; } this.newCareer(form); AUDIO.sting(); UI.go('career', () => this.renderHub(true)); };
      // portraits of each look in gym pinnies
      LOOKS.forEach(async (l, i) => {
        const av = AVATARS[l.avatar]; const d = { id: 'look' + i, first: '', last: '', num: form.num, arch: form.arch, ratings: { ...ARCH[form.arch].base }, ovr: 50, avatar: av, female: av.female, height: av.female ? 1.74 : 1.86, build: 1 };
        const url = await portrait(d, { name: 'BLUE TEAM' }, GYM_UNI[0]); const el = $(`[data-look="${i}"] .sil`, R); if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
      });
    };
    draw();
  },
  grab(form) {
    const f = $('#cf-first'), l = $('#cf-last'), n = $('#cf-num');
    if (f) form.first = f.value.replace(/[^A-Za-z' -]/g, '').slice(0, 12) || form.first;
    if (l) form.last = l.value.replace(/[^A-Za-z' -]/g, '').slice(0, 14) || form.last;
    if (n) form.num = clamp(parseInt(n.value, 10) || 0, 0, 99);
  },
  async renderHub(fresh) {
    const C = this.C, R = this.root(); const T = TIERS[C.tier] || TIERS.rec;
    const team = C.tier === 'gym' ? { name: 'BLUE TEAM', city: 'PERIOD 3', abbr: 'BLU' } : REC_TEAMS[0];
    const uni = this.myTeamColors(); const me = this.meData(team);
    const ng = this.nextGame();
    const xpN = this.xpNeed(C.level);
    let sched = '', objective = '', tierLogo;
    if (C.tier === 'gym') {
      tierLogo = VENUES.gym.logo;
      const w = C.gym.results.filter(r => r.won).length;
      objective = `Win ${TIERS.gym.needWins} of ${TIERS.gym.days} gym days to get invited to the rec league. <b>${w}-${C.gym.results.length - w}</b> so far · semester ${C.gym.semester}.`;
      sched = [...Array(TIERS.gym.days).keys()].map(d => { const r = C.gym.results[d]; return `<div class="cr-row ${d === C.gym.day ? 'next' : ''}"><span>DAY ${d + 1}</span><span>BLUE vs RED</span><span>${r ? `<b class="${r.won ? 'w' : 'l'}">${r.won ? 'W' : 'L'}</b> ${r.grade} · ${r.line}` : d === C.gym.day ? 'NEXT' : ''}</span></div>`; }).join('');
    } else {
      tierLogo = VENUES.rec.logo; const Rr = C.rec;
      objective = Rr.phase === 'regular' ? `Top 4 make the playoffs. Win the semifinal and a best-of-3 final to become rec league champion. Season ${Rr.season}.` : Rr.phase === 'semi' ? `Playoffs! Semifinal as the #${Rr.playoff.seed} seed.` : 'Championship series — best of 3.';
      sched = Rr.order.map((oi, k) => { const r = Rr.results[k]; return `<div class="cr-row ${Rr.phase === 'regular' && k === Rr.round ? 'next' : ''}"><span>WK ${k + 1}</span><span>vs ${REC_TEAMS[oi].name}</span><span>${r ? `<b class="${r.won ? 'w' : 'l'}">${r.won ? 'W' : 'L'}</b> ${r.grade} · ${r.line}` : ''}</span></div>`; }).join('');
      if (Rr.phase !== 'regular') sched += `<div class="cr-row next"><span>${Rr.phase === 'semi' ? 'SEMI' : 'FINAL'}</span><span>vs ${REC_TEAMS[Rr.phase === 'semi' ? Rr.playoff.semiOpp : Rr.playoff.finalOpp].name}</span><span>NEXT</span></div>`;
      sched += `<table class="tbl cr-stand"><tr><th>#</th><th>TEAM</th><th>W</th><th>L</th><th>OVR</th></tr>${this.table().map((t, j) => `<tr class="${t.i === 0 ? 'me' : ''}"><td>${j + 1}</td><td>${t.t.name}</td><td>${t.w}</td><td>${t.l}</td><td>${this.teamOvr(t.i)}</td></tr>`).join('')}</table>`;
    }
    const coach = this.coachLine();
    R.innerHTML = `<header class="scr-head"><button class="back" data-cr="menu">‹</button><h2>ROAD TO GLORY</h2></header>
    <div class="cr-hub">
      <div class="cr-me">
        ${UI.cardHTML(me, team, uni)}
        <div class="cr-id"><div class="cr-name">${C.first.toUpperCase()} ${C.last.toUpperCase()}</div><div class="cr-rank">${this.rank()} · ${ARCH[C.arch].label}</div></div>
        <div class="cr-lvl"><span>LEVEL ${C.level}</span><div class="xpbar"><i style="width:${(C.xp / xpN * 100).toFixed(0)}%"></i></div><span>${C.xp}/${xpN} XP</span></div>
        <button class="btn2 cr-upg" data-cr="upgrade">UPGRADE RATINGS ${C.sp ? `<b class="badge">${C.sp}</b>` : ''}</button>
        <div class="cr-tot">${C.totals.games} GP · ${C.totals.wins} W · ${C.totals.hits} HITS · ${C.totals.catches} CATCHES · ${C.totals.dodges} DODGES${C.champ ? ` · 🏆 x${C.champ}` : ''}</div>
      </div>
      <div class="cr-main">
        <div class="cr-tier"><div class="cr-tlogo">${logoSVG(tierLogo)}</div><div><div class="k">${T.label}</div><div class="t">${ng ? ng.label : ''}</div><div class="o">${objective}</div></div></div>
        <div class="cr-next"><div><div class="k">NEXT UP</div><div class="t">${ng ? `${ng.home.name} <span>vs</span> ${ng.away.name}` : ''}</div><div class="o">${ng ? `${ng.away.city} ${ng.away.name} · ${ng.away.ovr || Math.round(ng.away.roster.reduce((s, p) => s + p.ovr, 0) / 6)} OVR · rating cap this tier: ${T.cap}` : ''}</div></div><button class="cta" data-cr="play">PLAY ›</button></div>
        <div class="cr-coach"><b>${C.tier === 'gym' ? 'COACH REYNOLDS' : 'CAPTAIN DEV (ALLEY CATS)'}:</b> ${coach}</div>
        <div class="cr-sched">${sched}</div>
      </div>
    </div>`;
    $('[data-cr="menu"]', R).onclick = () => UI.go('title', () => G.toTitle());
    $('[data-cr="play"]', R).onclick = () => this.play();
    $('[data-cr="upgrade"]', R).onclick = () => this.renderUpgrade();
    if (fresh) UI.hint('PLAYER CREATED · YOU HAVE 3 SKILL POINTS TO SPEND', 'crfresh');
    const url = await portrait(me, team, uni); const el = $(`[data-pc="me"] .sil`, R); if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
  },
  coachLine() {
    const C = this.C; const last = C.log[0];
    if (!last) return C.tier === 'gym' ? "Alright, new kid. Dodgeball today. Grab a pinny and try not to get hit in the face." : "We play Thursdays at 8. Don't be late, and don't hog the ball.";
    if (last.startsWith('W')) return pick(C.tier === 'gym' ? ['Now THAT is how you play gym class.', "Keep that up and people are going to start talking.", 'Not bad. Not bad at all.'] : ['That is Alley Cats basketball — I mean dodgeball.', 'Pizza is on me tonight.', 'You are carrying us. Keep it going.']);
    return pick(C.tier === 'gym' ? ['Shake it off. Watch the ball, not the thrower.', 'You got cooked out there. Go spend some skill points.', 'Duck. Dive. Do something!'] : ['Tough one. We go again next week.', 'Their arms were better tonight. Work on your catching.', 'Get your ratings up — the playoffs are no joke.']);
  },
  renderUpgrade() {
    const C = this.C, R = this.root(); const cap = (TIERS[C.tier] || TIERS.rec).cap;
    const rows = RATING_KEYS.map(k => { const v = C.ratings[k], c = this.cost(v), ok = C.sp >= c && v < cap; return `<div class="up-row"><span class="nm">${({ pow: 'THROW POWER', acc: 'THROW ACCURACY', catch: 'CATCH', dodge: 'DODGE', speed: 'SPEED', sta: 'STAMINA', awr: 'AWARENESS', clutch: 'CLUTCH' })[k]}</span><div class="bar"><i style="width:${(v - 30) / 69 * 100}%"></i><em style="left:${(cap - 30) / 69 * 100}%"></em></div><b>${v}</b><button class="up-plus" data-k="${k}" ${ok ? '' : 'disabled'}>+<small>${v >= cap ? 'CAP' : c + ' SP'}</small></button></div>`; }).join('');
    R.innerHTML = `<header class="scr-head"><button class="back" data-cr="hub">‹</button><h2>UPGRADE RATINGS</h2></header>
    <div class="up-wrap panel-like"><div class="up-top"><div><span>SKILL POINTS</span><b>${C.sp}</b></div><div><span>OVERALL</span><b>${this.ovr()}</b></div><div><span>TIER CAP</span><b>${cap}</b></div></div>
    ${rows}<p class="cr-note">Costs rise as a rating climbs (1 SP under 55, 2 under 65, 3 under 75, 4 above). Each tier has a rating cap — move up to raise it. Level up by earning XP in games: +3 SP per level.</p>
    <button class="cta" data-cr="hub">DONE ›</button></div>`;
    for (const b of $$('.up-plus', R)) b.onclick = () => { const k = b.dataset.k; const c = this.cost(C.ratings[k]); if (C.sp >= c && C.ratings[k] < cap) { C.sp -= c; C.ratings[k]++; this.save(); AUDIO.ui(); this.renderUpgrade(); } };
    for (const b of $$('[data-cr="hub"]', R)) b.onclick = () => this.renderHub();
  },
  renderPost(r) {
    const C = this.C, R = this.root();
    UI.go('career', () => {
      R.innerHTML = `<div class="post-wrap">
        <div class="post-res ${r.won ? 'w' : 'l'}">${r.won ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="post-grid">
          <div class="post-grade"><span>COACH'S GRADE</span><b>${r.grade}</b>${r.mvp ? '<em>★ GAME MVP</em>' : ''}</div>
          <div class="post-xp">${r.lines.map(l => `<div><span>${l[0]}</span><b>+${l[1]}</b></div>`).join('')}<div class="mult"><span>GRADE BONUS</span><b>×${r.gradeMult.toFixed(2)}</b></div><div class="tot"><span>TOTAL XP</span><b>+${r.xp}</b></div></div>
        </div>
        ${r.lvls ? `<div class="post-lvl">LEVEL UP! · LEVEL ${C.level} · +${r.lvls * 3} SKILL POINTS</div>` : ''}
        ${r.news ? `<div class="post-news ${r.news.kind}"><div class="t">${r.news.title}</div><div class="s">${r.news.sub}</div></div>` : ''}
        <div class="res-actions">${C.sp ? `<button class="btn2" data-cr="upgrade">SPEND ${C.sp} SKILL POINTS</button>` : ''}<button class="cta" data-cr="hub">CONTINUE ›</button></div></div>`;
      $('[data-cr="hub"]', R).onclick = () => this.renderHub();
      const u = $('[data-cr="upgrade"]', R); if (u) u.onclick = () => this.renderUpgrade();
      if (r.news && (r.news.kind === 'promo' || r.news.kind === 'champ')) { AUDIO.horn(); AUDIO.cheer(2); } else if (r.lvls) AUDIO.sting();
      G.demoMode();
    });
  },
};
