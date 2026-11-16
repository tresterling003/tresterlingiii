// The HUD and game flow: character creation, dialogue, dice, battle controls.
import { Stage } from './stage.js';
import { Sfx } from './sfx.js';
import { LocalConn, GuestConn, SocketConn, sharedRoom, hasServer } from './net.js';

const DATA = self.EmberfallData;
const { CLASSES, CLASS_ORDER, COMPANIONS, ENEMIES, BATTLES, NODES, STATS, BACKGROUNDS, TINTS, BONUS_POINTS, MOON_DAY } = DATA;
const STAT_ICON = { might: '💪', agility: '🤸', mind: '🧠', charm: '💬' };
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sign = n => (n >= 0 ? `+${n}` : `−${-n}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let S = null, conn = null, info = {}, seenFx = 0, queue = Promise.resolve(), first = true;
let sceneStep = -1, line = 0, lines = [], mode = null, pickFor = null, leaveArmed = 0, lastFeedId = 0, deadline = 0, busyScene = false;
const sfx = new Sfx();

const ui = {
  cinema(on) { document.body.classList.toggle('cine', on); },
  caption(text, cls) { const c = $('caption'); if (!text) return c.classList.remove('on'); c.className = (cls || '') + ' on'; c.textContent = text; },
  title(text, cls) { const c = $('title'); if (!text) return c.classList.remove('on'); c.className = (cls || '') + ' on'; c.textContent = text; },
  fade(on) { $('fade').classList.toggle('on', on); },
  flash(color, ms) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = 0.7;
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; });
  },
  rollChip(e) {
    const c = $('rollchip');
    c.textContent = e.abil === 'rage' ? '🎲 Reckless Blow — cannot miss' : `🎲 ${e.d} ${sign(e.bonus)} = ${e.d + e.bonus} vs armor ${e.need} — ${e.crit ? 'CRITICAL HIT' : e.hit ? 'hit' : 'miss'}`;
    c.className = e.hit ? 'ok' : 'no';
    c.hidden = false;
    clearTimeout(ui.chipT);
    ui.chipT = setTimeout(() => { c.hidden = true; }, 1900);
  },
};
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

const stage = new Stage($('stage'), $('labels'), ui, sfx);
stage.onPick = id => pickTarget(id);
stage.load(f => { $('loadFill').style.width = `${Math.round(f * 100)}%`; }).then(() => {
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 700);
  idleScene();
  if (S) { first = true; queue = queue.then(() => apply(S)); }
});
window.__game = { stage, get state() { return S; } };

function idleScene() {
  stage.clearActors();
  stage.syncHeroes(CLASS_ORDER.slice(0, 4).map((cls, i) => ({ id: 'h' + i, cls, name: '' })), null, true);
  stage.actors.forEach(a => { a.label.hidden = true; });
  stage.shot('party', 0.01);
}

// ------------------------------------------------------------- connection
function onMsg(m) {
  if (m.t === 'joined') { info = m; if (m.online && m.code) location.hash = 't-' + m.code; return; }
  if (m.t === 'error') { if (S) toast(m.msg); else { $('homeErr').textContent = m.msg; conn = null; } return; }
  if (m.t === 'left' || m.t === 'gone') {
    if (m.msg) $('homeErr').textContent = m.msg;
    conn = null; S = null; info = {}; seenFx = 0; first = true; sceneStep = -1; lastFeedId = 0;
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* fine */ }
    $('feed').replaceChildren();
    ui.caption(''); ui.title(''); ui.cinema(false);
    queue = queue.then(async () => { await stage.setScene('village'); stage.setNpc(null); idleScene(); });
    return render();
  }
  if (m.t !== 'state') return;
  const fresh = first ? [] : (m.fx || []).filter(f => f.id > seenFx);
  if (m.fx && m.fx.length) seenFx = Math.max(seenFx, m.fx[m.fx.length - 1].id);
  stage.pendingBattle = m.battle || null;
  fresh.forEach(f => { queue = queue.then(() => playFx(f, m)); });
  queue = queue.then(() => apply(m)).catch(e => console.error(e));
}
const send = m => conn && conn.send(m);

async function playFx(f, st) {
  $('panel').classList.add('quiet');
  if (f.k === 'begin') stage.syncFoes(st.battle, DATA, 'run');
  if (f.k === 'roll') return playRoll(f, st);
  await stage.playFx(f, DATA);
}

// The d20 tumbles, lands, and the sums are shown.
async function playRoll(f, st) {
  const who = st && st.heroes ? st.heroes.find(h => h.id === f.who) : null;
  if (who) stage.rollPose(f.who);
  const box = $('dice'), num = $('dieNum'), die = $('die');
  $('diceLabel').textContent = `${who ? who.name + ' — ' : ''}${STAT_ICON[f.stat]} ${STATS[f.stat]} check`;
  $('diceMath').textContent = `needs ${f.dc}`;
  $('diceVerdict').textContent = '';
  $('diceVerdict').className = '';
  die.className = 'spin';
  box.hidden = false;
  sfx.dice();
  const t0 = performance.now();
  while (performance.now() - t0 < 1150) { num.textContent = 1 + Math.floor(Math.random() * 20); await sleep(60); }
  num.textContent = f.d;
  die.className = f.d === 20 ? 'land crit' : f.d === 1 ? 'land fumble' : 'land';
  const bonus = f.mod + f.assist;
  $('diceMath').textContent = `${f.d} ${bonus < 0 ? '−' : '+'} ${Math.abs(bonus)}${f.assist ? ' (with help)' : ''} = ${f.d + bonus}   ·   needs ${f.dc}`;
  await sleep(450);
  const v = $('diceVerdict');
  v.textContent = f.d === 20 ? 'NATURAL 20!' : f.d === 1 ? 'Natural 1…' : f.ok ? 'Success!' : 'Failure';
  v.className = f.ok ? 'ok' : 'no';
  if (f.ok) { sfx.sting(f.d === 20 ? 'good' : 'calm'); if (f.d === 20) ui.flash('#ffd34d', 500); } else sfx.sting('sad');
  await sleep(1250);
  box.hidden = true;
  stage.shot(st && st.battle ? 'battle' : 'wide', 0.8);
}

// ------------------------------------------------- apply a state to the screen
async function apply(st) {
  S = st;
  deadline = st.left ? Date.now() + st.left : 0;
  $('panel').classList.remove('quiet');
  if (st.phase === 'lobby') {
    if (first || sceneStep !== -1) { sceneStep = -1; await stage.setScene('village'); stage.setNpc(null); stage.setProp(null); stage.shot('creator', 0.6); }
    const party = previewParty();
    stage.syncFoes(null, DATA);
    stage.syncHeroes(party, 'h' + st.players.findIndex(p => p.id === st.you.id), true);
    first = false;
    return render();
  }
  const youHero = st.you.hero;
  stage.syncHeroes(st.heroes.map(h => ({ ...h, tintHex: TINTS[h.tint] || '' })), youHero, first || sceneStep !== st.step);
  if (sceneStep !== st.step) await enterScene(st);
  stage.syncFoes(st.battle || null, DATA);
  stage.setTurn(st.battle ? st.battle.acting : null);
  if (st.phase === 'victory' && apply.cheered !== st.step) { apply.cheered = st.step; stage.cheer(); sfx.sting('good'); stage.shot('party', 1); }
  if (st.phase === 'defeat' && apply.fell !== st.fx[st.fx.length - 1].id) { apply.fell = st.fx[st.fx.length - 1].id; sfx.sting('sad'); ui.flash('#700', 900); }
  if (st.phase !== 'combat' || !st.battle || st.battle.turn !== youHero) { mode = null; pickFor = null; }
  first = false;
  render();
}

function previewParty() {
  const list = S.players.map(p => ({ cls: p.cls, name: p.name, tintHex: TINTS[p.tint] || '' }));
  for (const cls of CLASS_ORDER) { if (list.length >= 4) break; if (!list.some(h => h.cls === cls)) list.push({ cls, name: COMPANIONS[cls] + ' (companion)' }); }
  return list.map((h, i) => ({ ...h, id: 'h' + i }));
}

async function enterScene(st) {
  const node = NODES[st.node];
  sceneStep = st.step;
  busyScene = true;
  render();
  const who = st.heroes.find(h => h.id === st.lastRoller);
  const fmt = t => t.replace(/\{roller\}/g, who ? who.name : 'Someone');
  lines = node.text.map(fmt);
  line = 0;
  const title = node.trail ? `Day ${st.party.day}` : node.title || (node.pace ? `Day ${st.party.day}` : null);
  stage.rest();
  await stage.setScene(node.set, first ? null : title, first, {
    walk: !!node.trail && !first, sky: node.sky,
    onSwap: () => {
      stage.setNpc(node.npc ? { ...node.npc } : null);
      stage.setProp(node.prop || null);
    },
  });
  if (node.scene === 'boss') { const [pos, look] = stage.shotPos('boss'); stage.camCut(pos.clone().add({ x: -3, y: 0.6, z: 2 }), look); stage.camTo(pos, look, 4); sfx.sting('evil'); }
  if (node.ending) {
    if (node.crowned && st.lastRoller) stage.crownHero(st.lastRoller, node.ending === 'dark');
    else stage.cheer();
    if (node.ending === 'dark') { sfx.sting('evil'); ui.flash('#30ff90', 700); } else { sfx.sting('good'); sfx.bell(); stage.burst({ x: -3, y: 0, z: 0.5 }); }
    stage.shot('party', 3);
  }
  busyScene = false;
}

function showLine(i) {
  line = i;
  const node = NODES[S.node];
  if (node.scene === 'boss' && i === 1) stage.bossRise();
  else if (lines[i].startsWith('“') && node.npc) stage.shot('npc', 1.2);
  else stage.shot(i ? 'party' : 'wide', 1.2);
  sfx.pop();
  render();
}

// ------------------------------------------------------------------ home
const nameInput = $('name');
try { nameInput.value = localStorage.getItem('emberfall.name') || ''; } catch { /* storage may be off */ }
const hashCode = () => (/^#t-([a-z]{4})$/i.exec(location.hash) || [])[1];
if (hashCode()) $('code').value = hashCode().toUpperCase();
function myName() {
  const n = nameInput.value.trim();
  if (!n) { $('homeErr').textContent = 'Give your hero a name first.'; nameInput.focus(); return null; }
  try { localStorage.setItem('emberfall.name', n); } catch { /* fine */ }
  $('homeErr').textContent = '';
  sfx.unlock();
  return n;
}
// First time here? Explain how this kind of game works before starting.
async function begin(fn) {
  const name = myName();
  if (!name || conn) return;
  let seen = false;
  try { seen = !!localStorage.getItem('emberfall.rules'); } catch { /* fine */ }
  if (!seen) await openHow(true);
  if (!conn) fn(name);
}
$('solo').onclick = () => begin(name => { conn = new LocalConn(onMsg); conn.create({ name, solo: true }); });
$('create').onclick = () => begin(async name => {
  if (await sharedRoom()) { conn = new LocalConn(onMsg); return conn.create({ name }); }
  conn = new SocketConn(onMsg);
  conn.create({ name });
});
const join = () => begin(async name => {
  const code = $('code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $('homeErr').textContent = 'Enter the 4-letter table code.'; return; }
  conn = (await sharedRoom()) ? new GuestConn(onMsg) : new SocketConn(onMsg);
  conn.join({ name, code });
});
$('join').onclick = join;
$('code').onkeydown = e => { if (e.key === 'Enter') join(); };
nameInput.onkeydown = e => { if (e.key === 'Enter') ($('code').value ? join() : $('solo').click()); };
(async () => {
  const s = SocketConn.session;
  if (!s || (hashCode() && hashCode().toUpperCase() !== s.code) || !(await hasServer()) || conn) return;
  conn = new SocketConn(m => { if (m.t === 'error' && !S) { conn = null; SocketConn.session = null; return; } onMsg(m); });
  conn.rejoin(s);
})();

// ------------------------------------------------------- rules walkthrough
let howPage = 0, howDone = null;
const pages = [...document.querySelectorAll('#how .pages section')];
function howShow(i) {
  howPage = i;
  pages.forEach((p, k) => { p.hidden = k !== i; });
  $('howBack').style.visibility = i ? '' : 'hidden';
  $('howNext').textContent = i === pages.length - 1 ? (howDone ? 'Create my hero' : 'Got it') : 'Next';
  $('howDots').replaceChildren(...pages.map((_, k) => el('i', k === i ? 'on' : '')));
  $('how').scrollTop = 0;
}
function openHow(firstTime) {
  return new Promise(res => { howDone = firstTime ? res : null; howShow(0); $('how').showModal(); if (!firstTime) res(); });
}
$('howBack').onclick = () => howShow(Math.max(0, howPage - 1));
$('howNext').onclick = () => { if (howPage < pages.length - 1) howShow(howPage + 1); else $('how').close(); };
$('how').addEventListener('close', () => {
  try { localStorage.setItem('emberfall.rules', '1'); } catch { /* fine */ }
  if (howDone) { const f = howDone; howDone = null; f(); }
});
$('howLink').onclick = () => openHow(false);
$('help').onclick = () => openHow(false);
$('tryRoll').onclick = async () => {
  sfx.unlock();
  $('how').close();
  const d = 1 + Math.floor(Math.random() * 20);
  await playRoll({ stat: 'agility', d, mod: 4, assist: 0, dc: 13, ok: d === 20 || (d !== 1 && d + 4 >= 13) }, null);
  howShow(2);
  $('how').showModal();
};

// ------------------------------------------------------- shared controls
$('mute').onclick = () => { sfx.unlock(); sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; };
$('logToggle').onclick = () => { $('log').hidden = !$('log').hidden; $('logToggle').classList.remove('unread'); const f = $('feed'); f.scrollTop = f.scrollHeight; };
$('leave').onclick = () => {
  if (S && !['lobby', 'end'].includes(S.phase) && Date.now() - leaveArmed > 3000) { leaveArmed = Date.now(); return toast('Tap ✕ again to abandon the quest'); }
  send({ t: 'leave' });
};
$('chatForm').onsubmit = e => { e.preventDefault(); const text = $('chatInput').value.trim(); if (text) send({ t: 'chat', text }); $('chatInput').value = ''; };

function pickTarget(id) {
  if (!S || !pickFor || !stage.targets.has(id)) return;
  const m = pickFor;
  mode = null; pickFor = null;
  stage.setTargets([], null);
  send({ ...m, target: id });
}

// -------------------------------------------------------------- rendering
const btn = (label, cls, fn, disabled) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.onclick = fn; b.disabled = !!disabled; return b; };
const row = (...kids) => { const r = el('div', 'row'); r.append(...kids); return r; };
const hero = id => S.heroes.find(h => h.id === id);
const mine = () => (S.heroes ? hero(S.you.hero) : null);
const multi = () => S.players.filter(p => p.on).length > 1;

function render() {
  $('home').hidden = !!S;
  $('hud').hidden = !S;
  document.body.dataset.phase = S ? S.phase : 'home';
  if (!S) return;
  renderTop();
  renderFeed();
  const panel = $('panel');
  panel.classList.toggle('wide', S.phase === 'lobby');
  const kids = [];
  if (busyScene) { panel.hidden = true; return; }
  panel.hidden = false;
  const fn = { lobby: pLobby, choice: pChoice, roll: pRoll, rolled: pRoll, fate: pFate, result: pResult, combat: pCombat, victory: pVictory, defeat: pDefeat, end: pEnd }[S.phase];
  fn(kids);
  if (deadline && multi()) kids.push(el('div', 'small timer', ''));
  panel.replaceChildren(...kids);
  tickTimer();
  if (S.phase !== 'combat') stage.setTargets([], null);
}

function renderTop() {
  const node = S.node ? NODES[S.node] : null;
  const B = S.battle && S.phase === 'combat' ? BATTLES[S.battle.id] : null;
  $('place').textContent = S.phase === 'lobby' ? 'Create your hero' : B ? `⚔️ ${B.title}` : placeName(node);
  $('sub').textContent = S.phase === 'lobby' ? (info.online ? `Table code ${S.code}` : 'Solo quest') : B ? `Round ${S.battle.round}` : '';
  const res = $('res');
  if (!S.party) return res.replaceChildren();
  const P = S.party, left = MOON_DAY - P.day;
  const chip = (icon, val, title, warn) => { const c = el('span', 'chip stat' + (warn ? ' warn' : ''), `${icon} ${val}`); c.title = title; return c; };
  res.replaceChildren(
    chip('📅', `Day ${P.day}`, left >= 0 ? `New moon in ${left + 1} day${left ? 's' : ''}` : 'The new moon has risen', left < 1),
    chip('🍖', P.rations, 'Rations: the party eats 4 a day on the trail', P.rations < 4),
    chip('🧪', P.potions, 'Healing potions'), chip('🪙', P.gold, 'Gold'), chip('✨', P.fate, 'Fate: re-roll a failed check'));
}
function placeName(node) {
  if (!node) return '';
  if (node.title) return node.title;
  return { village: 'Emberfall', road: 'The Old Road', bridge: 'The Old Bridge', marsh: 'The Mirefen', meadow: 'The High Meadows', gate: 'The Barrow Gate', crypt: 'The Barrow', throne: 'The Throne of Ash' }[node.set] || '';
}

// ---- character creation ----
function pLobby(kids) {
  const me = S.players.find(p => p.id === S.you.id), host = S.hostId === me.id;
  const C = CLASSES[me.cls];
  const spent = Object.values(me.bonus).reduce((a, b) => a + b, 0), left = BONUS_POINTS - spent;
  const build = patch => send({ t: 'build', ...patch });
  const col = el('div', 'creator');

  const a = el('div', 'col');
  a.append(el('h3', null, '1 · Choose a class'));
  const classes = el('div', 'classes');
  CLASS_ORDER.forEach(k => {
    const c = CLASSES[k];
    const b = el('button', 'cls' + (k === me.cls ? ' on' : ''));
    b.type = 'button';
    b.dataset.cls = k;
    b.append(el('span', 'ico', c.icon), el('b', null, c.name));
    b.onclick = () => build({ cls: k });
    classes.append(b);
  });
  a.append(classes);
  a.append(el('p', 'small', `❤️ ${C.hp + (me.bg === 'soldier' ? 5 : 0)} health · 🛡️ ${C.armor} armor · attacks with ${STATS[C.atk]} (d${C.dmg[1]}${sign(C.dmg[2])})`));
  const ab = el('p', 'abil');
  ab.append(el('b', null, `★ ${C.ability.name}: `), document.createTextNode(C.ability.text));
  a.append(ab);

  const b = el('div', 'col');
  b.append(el('h3', null, `2 · Abilities — ${left} point${left === 1 ? '' : 's'} to spend`));
  const stats = el('div', 'stats');
  Object.keys(STATS).forEach(k => {
    const extra = me.bonus[k] || 0, r = el('div', 'statrow');
    const minus = btn('−', 'tiny', () => build({ bonus: { ...me.bonus, [k]: extra - 1 } }), extra < 1);
    const plus = btn('+', 'tiny', () => build({ bonus: { ...me.bonus, [k]: extra + 1 } }), left < 1 || extra >= 2);
    plus.dataset.plus = k;
    minus.setAttribute('aria-label', `Lower ${STATS[k]}`);
    plus.setAttribute('aria-label', `Raise ${STATS[k]}`);
    r.append(el('span', 'sname', `${STAT_ICON[k]} ${STATS[k]}`), minus, el('b', extra ? 'up' : '', sign(C.stats[k] + extra)), plus);
    stats.append(r);
  });
  b.append(stats);
  b.append(el('h3', null, '3 · Background'));
  const bgs = el('div', 'chips');
  Object.entries(BACKGROUNDS).forEach(([k, g]) => { const c = el('button', 'pick' + (k === me.bg ? ' on' : ''), `${g.icon} ${g.name}`); c.type = 'button'; c.dataset.bg = k; c.onclick = () => build({ bg: k }); bgs.append(c); });
  b.append(bgs, el('p', 'small', BACKGROUNDS[me.bg].text));
  b.append(el('h3', null, '4 · Colours'));
  const sw = el('div', 'chips');
  TINTS.forEach((t, i) => { const c = el('button', 'swatch' + (i === me.tint ? ' on' : '')); c.type = 'button'; c.style.background = t || 'linear-gradient(135deg,#e6e6e6,#9aa)'; c.setAttribute('aria-label', `Outfit colour ${i + 1}`); c.onclick = () => build({ tint: i }); sw.append(c); });
  b.append(sw);
  col.append(a, b);
  kids.push(col);

  const foot = el('div', 'lobbyfoot');
  const who = el('div', 'small');
  const humans = S.players.map(p => `${p.name} the ${CLASSES[p.cls].name}`).join(', ');
  who.textContent = `Party: ${humans}${S.players.length < 4 ? ` + ${4 - S.players.length} companion${S.players.length === 3 ? '' : 's'} who fight alongside you` : ''}.` + (info.online ? ` Friends join with code ${S.code} — keep this tab open, you are the host.` : '');
  foot.append(who);
  if (info.online) foot.append(btn('Copy code', '', async () => { try { await navigator.clipboard.writeText(S.code); toast('Code copied'); } catch { toast(`Your code is ${S.code}`); } }));
  foot.append(host ? btn('Begin the quest', 'primary', () => send({ t: 'start' })) : btn('Waiting for the host…', '', null, true));
  kids.push(foot);
}

// ---- story ----
function story(kids, text, more) {
  if (S.arrive && line === 0 && S.phase === 'choice') kids.push(el('div', 'note', S.arrive.join(' · ')));
  kids.push(el('p', 'story', text));
  if (more) kids.push(row(btn('Continue ▸', 'primary', () => showLine(line + 1))));
}
function pChoice(kids) {
  if (line < lines.length - 1) return story(kids, lines[line], true);
  story(kids, lines[line]);
  const node = NODES[S.node], votes = Object.values(S.votes || {});
  const list = el('div', 'choices');
  S.open.forEach(o => {
    const c = node.choices.find(x => x.id === o.id);
    const b = el('button', 'choice' + (S.votes[S.you.id] === c.id ? ' on' : ''));
    b.type = 'button';
    b.dataset.choice = c.id;
    b.disabled = o.off;
    b.append(el('span', 'lbl', c.label));
    if (c.stat) b.append(el('span', 'tagc', `${STAT_ICON[c.stat]} ${STATS[c.stat]} ${sign(S.odds[c.id])} · needs ${c.dc}`));
    if (c.cost) b.append(el('span', 'tagc cost', Object.entries(c.cost).map(([k, n]) => `${n} ${k}`).join(', ')));
    const n = votes.filter(v => v === c.id).length;
    if (n && multi()) b.append(el('span', 'tagc vote', `${n} vote${n === 1 ? '' : 's'}`));
    b.onclick = () => { sfx.tick(); send({ t: 'vote', choice: c.id }); };
    list.append(b);
  });
  kids.push(list);
  if (multi()) kids.push(el('div', 'small', 'The party votes — most votes wins.'));
}
function pRoll(kids) {
  const r = S.roll, who = hero(r.who), helper = r.helper && hero(r.helper);
  const c = NODES[S.node].choices.find(x => x.id === r.choice);
  kids.push(el('div', 'note', c.label));
  kids.push(el('p', 'story', `${who.id === S.you.hero ? 'You step' : who.name + ' steps'} up. ${STAT_ICON[r.stat]} ${STATS[r.stat]} check: roll the d20, add ${sign(r.mod)}${helper ? `, plus +2 because ${helper.name} is helping` : ''}, and reach ${r.dc}.`));
  if (S.phase === 'roll') kids.push(row(who.id === S.you.hero ? btn('🎲 Roll the d20', 'primary big', () => send({ t: 'roll' })) : btn(`Waiting for ${who.name} to roll…`, '', null, true)));
}
function pFate(kids) {
  const r = S.roll, who = hero(r.who);
  kids.push(el('p', 'story', `${r.d === 1 ? 'A natural 1.' : `${r.total} — just short of ${r.dc}.`} The party has ${S.party.fate} Fate. Spend one to roll again?`));
  if (who.id === S.you.hero) kids.push(row(btn('✨ Spend Fate and re-roll', 'primary', () => send({ t: 'reroll' })), btn('Accept the result', '', () => send({ t: 'accept' }))));
  else kids.push(el('div', 'small', `${who.name} is deciding…`));
}
function nextRow(label) {
  const done = (S.ready || []).includes(S.you.id);
  const b = btn(done ? 'Waiting for the others…' : label, 'primary', () => send({ t: 'next' }), done);
  b.dataset.next = '1';
  return row(b);
}
function pResult(kids) {
  const node = NODES[S.node];
  if (S.out.kind === 'intro') {
    if (line < lines.length - 1) return story(kids, lines[line], true);
    story(kids, lines[line]);
    return kids.push(nextRow('⚔️ Fight!'));
  }
  const c = node.choices.find(x => x.id === S.out.choice), o = c[S.out.kind];
  const who = S.out.roller && hero(S.out.roller);
  if (S.out.kind !== 'auto') kids.push(el('div', 'note ' + (S.out.kind === 'ok' ? 'ok' : 'no'), S.out.kind === 'ok' ? 'Success' : 'Failure'));
  kids.push(el('p', 'story', o.text.replace(/\{roller\}/g, who ? who.name : 'Someone')));
  if (S.out.notes.length) kids.push(notes(S.out.notes));
  kids.push(nextRow('Continue ▸'));
}
function notes(list) { const d = el('div', 'gains'); list.forEach(n => d.append(el('span', /−|no food/i.test(n) ? 'bad' : 'good', n))); return d; }

// ---- battle ----
function pCombat(kids) {
  const B = S.battle, me = mine(), C = me && CLASSES[me.cls];
  const acting = B.acting && (hero(B.acting) || B.enemies.find(e => e.id === B.acting));
  if (!me || B.turn !== me.id) {
    const name = !acting ? '' : acting.name || ENEMIES[acting.key].name;
    kids.push(el('p', 'story dim', me && me.down ? 'You are down! An ally can get you back up with a potion or healing.' : name ? `${name}'s turn…` : '…'));
    stage.setTargets([], null);
    return;
  }
  const foes = B.enemies.filter(e => e.hp > 0);
  if (mode) {
    const allies = mode === 'ally';
    kids.push(el('p', 'story', allies ? 'Who gets it? Tap a hero.' : 'Choose a target — tap an enemy.'));
    const list = el('div', 'chips');
    const opts = allies ? S.heroes.filter(h => h.down || h.hp < h.max) : foes;
    opts.forEach(t => { const b = el('button', 'pick', allies ? `${t.name} ${t.hp}/${t.max}` : `${ENEMIES[t.key].name} ${t.hp}/${t.max}`); b.type = 'button'; b.dataset.target = t.id; b.onclick = () => pickTarget(t.id); list.append(b); });
    kids.push(list, row(btn('Back', '', () => { mode = null; pickFor = null; render(); })));
    stage.setTargets(opts.map(t => t.id), null);
    return;
  }
  stage.setTargets([], null);
  kids.push(el('p', 'story', `Your turn, ${me.name}. ❤️ ${me.hp}/${me.max}`));
  const target = (m, kind) => { pickFor = m; mode = kind; const opts = kind === 'ally' ? S.heroes.filter(h => h.down || h.hp < h.max) : foes; if (opts.length === 1) return pickTarget2(opts[0].id); render(); };
  const pickTarget2 = id => { const m = pickFor; mode = null; pickFor = null; send({ ...m, target: id }); };
  const ab = C.ability, hurt = S.heroes.some(h => h.down || h.hp < h.max);
  const bA = btn(`⚔️ Attack`, 'primary', () => target({ t: 'act', a: 'attack' }, 'foe'));
  bA.dataset.act = 'attack';
  const bS = btn(`★ ${ab.name} (${me.ch})`, '', () => (ab.target ? target({ t: 'act', a: 'ability' }, ab.target === 'ally' ? 'ally' : 'foe') : send({ t: 'act', a: 'ability' })), me.ch < 1 || (ab.target === 'ally' && !hurt));
  bS.title = ab.text;
  bS.dataset.act = 'ability';
  const bP = btn(`🧪 Potion (${S.party.potions})`, '', () => target({ t: 'act', a: 'potion' }, 'ally'), S.party.potions < 1 || !hurt);
  kids.push(row(bA, bS, btn('🛡️ Brace', '', () => send({ t: 'act', a: 'defend' })), bP));
  kids.push(el('div', 'small', `★ ${ab.text}`));
}
function pVictory(kids) {
  const def = BATTLES[S.battle.id];
  kids.push(el('div', 'note ok', 'Victory!'), el('p', 'story', def.win.text));
  if (S.out.notes.length) kids.push(notes(S.out.notes));
  kids.push(nextRow('Continue ▸'));
}
function pDefeat(kids) {
  kids.push(el('div', 'note no', 'The party has fallen'), el('p', 'story', 'Darkness… and then a campfire, and the memory of a fight that has not happened yet. The tale is not over.'));
  kids.push(row(btn('Try the battle again', 'primary', () => send({ t: 'retry' }))));
}
function pEnd(kids) {
  const node = NODES[S.node];
  kids.push(el('div', 'note ' + (node.ending === 'dark' ? 'no' : 'ok'), `The End — ${node.title}`));
  if (line < lines.length - 1) return story(kids, lines[line], true);
  story(kids, lines[line]);
  const st = S.stats, best = S.heroes.slice().sort((a, b) => (st.dmg[b.id] || 0) - (st.dmg[a.id] || 0))[0];
  const g = el('div', 'gains');
  [`${S.party.day} days on the trail`, `${st.rolls} checks rolled`, `${st.nat20} natural 20${st.nat20 === 1 ? '' : 's'}`, `${st.nat1} natural 1${st.nat1 === 1 ? '' : 's'}`,
    `${st.retries} battle${st.retries === 1 ? '' : 's'} retried`, `Hardest hitter: ${best.name} (${st.dmg[best.id] || 0} damage)`].forEach(t => g.append(el('span', 'good', t)));
  kids.push(g, el('div', 'small', 'There are four endings, two roads, and nine things that can happen on the trail. No two quests go the same way.'));
  kids.push(row(S.hostId === S.you.id ? btn('Play again', 'primary', () => send({ t: 'again' })) : btn('Waiting for the host…', '', null, true), btn('Leave', '', () => send({ t: 'leave' }))));
}

function renderFeed() {
  const host = $('feed'), feed = S.feed || [];
  const newest = feed.length ? feed[feed.length - 1].id : 0;
  if (newest < lastFeedId || !feed.length) { host.replaceChildren(); lastFeedId = 0; }
  const fresh = feed.filter(m => m.id > lastFeedId);
  fresh.forEach(m => {
    const d = el('div', 'msg ' + m.ch);
    if (m.ch === 'sys') d.textContent = m.text; else d.append(el('b', null, `${m.name}: `), document.createTextNode(m.text));
    host.append(d);
  });
  if (fresh.some(m => m.from && m.from !== S.you.id) && lastFeedId && $('log').hidden) $('logToggle').classList.add('unread');
  lastFeedId = newest;
  host.scrollTop = host.scrollHeight;
}

function tickTimer() {
  const t = document.querySelector('#panel .timer');
  if (!t) return;
  const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  t.textContent = `⏳ ${s}s`;
}
setInterval(tickTimer, 500);
document.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && S && !['INPUT', 'BUTTON', 'SELECT'].includes(document.activeElement.tagName) && !$('how').open) {
    const b = document.querySelector('#panel .btn.primary:not([disabled])');
    if (b) { e.preventDefault(); b.click(); }
  }
});
render();
