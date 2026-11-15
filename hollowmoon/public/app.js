// The HUD and game flow: turns game state into panels, chat, and cutscene cues.
import { Stage } from './stage.js';
import { Sfx } from './sfx.js';
import { LocalConn, GuestConn, SocketConn, sharedRoom, hasServer } from './net.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const ROLES = {
  villager: { icon: '🧑‍🌾', name: 'Villager', cls: 'good', a: 'a Villager', text: 'No special power — just your vote and your read on people. Find the werewolves and banish them.' },
  sheriff: { icon: '⭐', name: 'Sheriff', cls: 'good', a: 'the Sheriff', text: 'Each night, investigate one player and learn whether they are a werewolf. Share what you know — but the wolves will come for you.' },
  doctor: { icon: '💉', name: 'Doctor', cls: 'good', a: 'the Doctor', text: 'Each night, protect one player (even yourself) from the wolves. Never the same player twice in a row.' },
  werewolf: { icon: '🐺', name: 'Werewolf', cls: 'werewolf', a: 'a Werewolf', text: 'Each night, choose a villager to kill. Blend in by day. You win when wolves equal the villagers in number.' },
  jester: { icon: '🃏', name: 'Jester', cls: 'jester', a: 'the Jester', text: 'You WANT to be banished. Get the village to vote you out and you win alone. Dying at night doesn\'t count.' },
};
const PHASES = {
  lobby: ['Gathering at the fire', ''],
  reveal: ['Roles dealt', 'Keep yours to yourself.'],
  night: ['🌙 Night', 'The village sleeps.'],
  dawn: ['🌅 Dawn', 'What happened in the night…'],
  day: ['☀️ Day', 'Talk it out. Who is the wolf?'],
  vote: ['🗳️ Vote', 'Who gets banished?'],
  verdict: ['⚖️ Verdict', 'The village has spoken.'],
  over: ['Game over', ''],
};

let S = null, conn = null, sel = null, tab = 'pub', deadline = 0, lastKey = '', lastFeedId = 0, lastBubbleId = 0, info = {}, leaveArmed = 0;
const sfx = new Sfx();
const ui = {
  cinema(on) { document.body.classList.toggle('cine', on); },
  caption(text, cls) {
    const c = $('caption');
    if (!text) { c.classList.remove('on'); return; }
    c.className = (cls || '') + ' on';
    c.textContent = text;
  },
  flash(color, ms) {
    const f = $('flash');
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = 0.75;
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; });
  },
  slash() { const s = $('slash'); s.classList.remove('go'); void s.getBoundingClientRect(); s.classList.add('go'); },
  toast,
};
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3000);
}

const stage = new Stage($('stage'), $('labels'), ui, sfx);
stage.onPick = id => pick(id);
stage.load(f => { $('loadFill').style.width = `${Math.round(f * 100)}%`; }).then(() => {
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 700);
  if (S) stage.sync(S, targetSet(), sel);
});
window.__game = { stage, get state() { return S; } }; // handy when debugging in the console

// ------------------------------------------------------------- connection
function onMsg(m) {
  if (m.t === 'joined') { info = m; if (m.code) location.hash = 't-' + m.code; return; }
  if (m.t === 'error') { if (S) toast(m.msg); else { $('homeErr').textContent = m.msg; conn = null; } return; }
  if (m.t === 'left' || m.t === 'gone') {
    if (m.msg) $('homeErr').textContent = m.msg;
    conn = null; S = null; info = {}; lastKey = ''; lastFeedId = lastBubbleId = 0;
    history.replaceState(null, '', location.pathname + location.search);
    $('feed').replaceChildren();
    stage.reset();
    stage.setPlayers([0, 1, 2, 3, 4, 5].map(i => ({ id: 'extra' + i, name: '', color: '#888', model: i })), null, true);
    stage.setMood('dusk', 1.5);
    return render();
  }
  if (m.t !== 'state') return;
  const prev = S;
  S = m;
  deadline = m.left ? Date.now() + m.left : 0;
  const key = S.phase + S.round;
  if (key !== lastKey) { phaseChanged(prev); lastKey = key; }
  bubbles(!prev);
  stage.sync(S, targetSet(), sel);
  render();
}
const send = m => conn && conn.send(m);

function phaseChanged(prev) {
  sel = null;
  const y = S.you, left = S.left / 1000;
  const P = id => S.players.find(p => p.id === id);
  if (S.phase === 'night') tab = !y.alive ? 'grave' : y.role === 'werewolf' ? 'wolf' : 'pub';
  else if (!y.alive && S.phase !== 'over' && S.phase !== 'lobby') tab = 'grave';
  else tab = 'pub';
  if (S.phase === 'lobby' && prev && prev.phase === 'over') stage.reset();
  // Cutscenes only run when there's time left in the phase to show them.
  if (S.phase === 'reveal' && left > 7.5) stage.cut('intro', { n: S.players.length, wolves: S.wolves });
  else if (S.phase === 'dawn' && S.dawn && left > 14.2) {
    const k = S.dawn.killed && P(S.dawn.killed), b = S.dawn.blessed && P(S.dawn.blessed);
    stage.cut('dawn', { killed: k && k.id, name: k && k.name, role: k && k.role, roleText: k && ROLES[k.role].a, blessed: b && b.alive ? b.id : null, blessedName: b && b.name });
  } else if (S.phase === 'verdict' && S.verdict && left > 12.6) {
    const c = S.verdict.cut && P(S.verdict.cut);
    stage.cut('verdict', {
      cut: c && c.id, name: c && c.name, role: c && c.role, roleText: c && ROLES[c.role].a,
      alive: S.players.filter(p => p.alive || (c && p.id === c.id)).map(p => p.id), voted: Object.keys(S.verdict.tally).length > 0,
    });
  } else if (S.phase === 'over' && prev && prev.phase !== 'over') stage.cut('over', { winner: S.winner });
  else stage.skip();
}

// speech bubbles for new public chat lines
function bubbles(first) {
  const feed = S.feed;
  if (!first) {
    feed.filter(m => m.id > lastBubbleId && m.from && m.ch === 'pub').slice(-3).forEach(m => {
      const low = m.text.toLowerCase();
      const about = S.players.find(p => p.id !== m.from && p.alive && low.includes(p.name.toLowerCase()));
      stage.say(m.from, m.text, about && about.id);
    });
  }
  if (feed.length) lastBubbleId = feed[feed.length - 1].id;
}

// ------------------------------------------------------------------ home
const nameInput = $('name');
try { nameInput.value = localStorage.getItem('hollowmoon.name') || ''; } catch { /* storage may be off */ }
const hashCode = () => (/^#t-([a-z]{4})$/i.exec(location.hash) || [])[1];
if (hashCode()) $('code').value = hashCode().toUpperCase();
function myName() {
  const n = nameInput.value.trim();
  if (!n) { $('homeErr').textContent = 'Enter your name first.'; nameInput.focus(); return null; }
  try { localStorage.setItem('hollowmoon.name', n); } catch { /* fine */ }
  $('homeErr').textContent = '';
  sfx.unlock();
  return n;
}
$('solo').onclick = () => {
  const name = myName();
  if (!name || conn) return;
  conn = new LocalConn(onMsg);
  conn.create({ name, solo: true, size: $('size').value });
};
$('create').onclick = async () => {
  const name = myName();
  if (!name || conn) return;
  if (await sharedRoom()) { conn = new LocalConn(onMsg); return conn.create({ name }); }
  conn = new SocketConn(onMsg);
  conn.create({ name });
};
const join = async () => {
  const name = myName();
  if (!name || conn) return;
  const code = $('code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $('homeErr').textContent = 'Enter the 4-letter table code.'; return; }
  conn = (await sharedRoom()) ? new GuestConn(onMsg) : new SocketConn(onMsg);
  conn.join({ name, code });
};
$('join').onclick = join;
$('code').onkeydown = e => { if (e.key === 'Enter') join(); };
nameInput.onkeydown = e => { if (e.key === 'Enter') ($('code').value ? join() : $('solo').click()); };
// Back after a refresh? Pick up the seat the server kept for us.
(async () => {
  const s = SocketConn.session;
  if (!s || (hashCode() && hashCode().toUpperCase() !== s.code) || !(await hasServer()) || conn) return;
  conn = new SocketConn(m => { if (m.t === 'error' && !S) { conn = null; SocketConn.session = null; return; } onMsg(m); });
  conn.rejoin(s);
})();

// ------------------------------------------------------- shared controls
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (!o) return;
  if (o.dataset.open === 'role') { if (!S || !S.you.role) return; fillRole($('roleCard')); }
  $(o.dataset.open).showModal();
});
$('mute').onclick = () => { sfx.unlock(); sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; };
$('chatToggle').onclick = () => { document.body.classList.toggle('chat-open'); $('chatToggle').classList.remove('unread'); };
$('leave').onclick = () => {
  // no confirm() dialogs here — a second tap confirms instead
  if (S && !['lobby', 'over'].includes(S.phase) && Date.now() - leaveArmed > 3000) { leaveArmed = Date.now(); return toast('Tap ✕ again to leave the game'); }
  send({ t: 'leave' });
};
$('chatForm').onsubmit = e => {
  e.preventDefault();
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || input.disabled) return;
  send({ t: 'chat', ch: ['lobby', 'over'].includes(S.phase) ? 'pub' : tab, text });
  input.value = '';
};
function pick(id) {
  if (!S || !targetSet().has(id)) return;
  sel = id;
  stage.sync(null, targetSet(), sel);
  renderAction();
}

// -------------------------------------------------------------- rendering
const me = () => S.players.find(p => p.id === S.you.id);
const byId = id => S.players.find(p => p.id === id);
function canTarget(p) {
  const y = S.you;
  if (S.phase === 'vote') return y.alive && p.alive && p.id !== y.id;
  if (S.phase !== 'night' || !p.alive) return false;
  if (!y.alive) return true;
  if (y.role === 'werewolf') return p.role !== 'werewolf';
  if (y.role === 'sheriff') return p.id !== y.id;
  if (y.role === 'doctor') return p.id !== y.lastShield;
  return false;
}
function targetSet() { return new Set(S ? S.players.filter(canTarget).map(p => p.id) : []); }

function render() {
  $('home').hidden = !!S;
  $('hud').hidden = !S;
  document.body.dataset.phase = S ? S.phase : 'home';
  if (!S) return;
  if (sel && !targetSet().has(sel)) sel = null;
  const y = S.you, [pn, ps] = PHASES[S.phase];
  $('phaseName').textContent = ['night', 'day'].includes(S.phase) ? `${pn} ${S.round}` : pn;
  $('phaseSub').textContent = S.phase === 'lobby' ? (info.online ? `Table ${S.code}` : '') : ps;
  const chip = $('roleChip');
  chip.hidden = !y.role;
  if (y.role) {
    chip.textContent = `${ROLES[y.role].icon} ${ROLES[y.role].name}${y.alive ? '' : ' · ghost'}`;
    chip.className = 'chip' + (y.role === 'werewolf' ? ' wolf' : '');
  }
  renderAction();
  renderTabs();
  renderFeed();
}

function fillRole(box) {
  const r = ROLES[S.you.role];
  const card = el('div', 'rolecard');
  card.append(el('div', 'big', r.icon), el('div', 'small', 'YOU ARE'), el('div', 'rn ' + r.cls, r.name.toUpperCase()), el('p', null, r.text));
  if (S.you.role === 'werewolf') {
    const mates = S.players.filter(p => p.role === 'werewolf' && p.id !== S.you.id).map(p => p.name);
    card.append(el('p', null, mates.length ? `Your pack: ${mates.join(', ')}` : 'You hunt alone.'));
  }
  box.replaceChildren(card);
}

function recap() {
  const sys = S.feed.filter(m => m.ch === 'sys');
  let i = sys.length - 1;
  while (i > 0 && !/^(🌙|🗳️)/.test(sys[i].text)) i--;
  return sys.slice(i + 1).map(m => m.text);
}

function renderAction() {
  const a = $('action'), y = S.you, kids = [];
  const h = t => kids.push(el('h3', null, t));
  const p = t => kids.push(el('p', null, t));
  const row = (...btns) => { const r = el('div', 'row'); r.append(...btns); kids.push(r); };
  const btn = (label, cls, fn, disabled) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; b.disabled = !!disabled; return b; };
  const chips = () => {
    const box = el('div', 'targets');
    S.players.filter(canTarget).forEach(q => {
      const c = el('button', 'tchip' + (q.id === sel ? ' sel' : ''));
      const dot = el('i');
      dot.style.background = q.color;
      c.append(dot, document.createTextNode(q.name));
      c.dataset.pid = q.id;
      c.onclick = () => pick(q.id);
      box.append(c);
    });
    kids.push(box);
  };
  const target = sel ? byId(sel) : null;
  const pickName = y.pick && byId(y.pick) ? byId(y.pick).name : null;
  const act = (t, extra) => () => { send({ t, target: sel, ...extra }); sel = null; };

  if (S.phase === 'lobby') {
    const host = S.hostId === y.id;
    if (info.online) {
      const box = el('div', 'codebox');
      const left = el('div');
      left.append(el('div', 'small', 'TABLE CODE'), el('div', 'code', S.code));
      box.append(left, btn('Copy code', '', async () => { try { await navigator.clipboard.writeText(S.code); toast('Code copied — friends open this same page and enter it'); } catch { toast(`Your code is ${S.code}`); } }));
      kids.push(box);
      p('Friends open this same page, type the code, and join. Keep this tab open — you\'re the host.');
    } else if (info.hosting) {
      h('Your table');
      p('Friends can\'t join from this page, so fill the seats with bots.');
    }
    const list = el('div', 'plist');
    S.players.forEach(q => {
      const c = el('div', 'pchip');
      const dot = el('i');
      dot.style.background = q.color;
      c.append(dot, document.createTextNode(q.name));
      if (q.id === S.hostId) c.append(el('small', null, 'host'));
      if (q.isBot) {
        c.append(el('small', null, 'bot'));
        if (host) { const x = el('button', null, '✕'); x.setAttribute('aria-label', `Remove ${q.name}`); x.onclick = () => send({ t: 'removeBot', id: q.id }); c.append(x); }
      }
      list.append(c);
    });
    kids.push(list);
    p(`${S.players.length}/${S.max} players · ${S.min} or more to start`);
    if (host) row(btn('+ Add bot', '', () => send({ t: 'addBot' }), S.players.length >= S.max), btn('Start the game', 'primary', () => send({ t: 'start' }), S.players.length < S.min));
    else p('Waiting for the host to start…');
  } else if (S.phase === 'reveal') {
    const box = el('div');
    fillRole(box);
    kids.push(box);
  } else if (S.phase === 'night') {
    if (!y.alive) {
      h('👻 You are a ghost');
      p(y.done ? (pickName ? `Your blessing goes to ${pickName}. You can change it until dawn.` : 'You gave no blessing tonight.') : 'Bless one of the living. Whoever the spirits favour gets a double vote tomorrow.');
      chips();
      row(btn(target ? `Bless ${target.name}` : 'Choose someone', 'primary', () => { send({ t: 'bless', target: sel }); sel = null; }, !target), btn('Pass', '', () => send({ t: 'bless', target: null })));
    } else if (y.role === 'werewolf') {
      h('🐺 Who dies tonight?');
      const mates = (y.teamPicks || []).map(tp => `${byId(tp.by).name} wants ${byId(tp.target).name}`);
      p(pickName ? `You chose ${pickName}. You can change it until dawn.` : 'Choose a villager.');
      if (mates.length) p(mates.join(' · '));
      chips();
      row(btn(target ? `Kill ${target.name}` : 'Choose a victim', 'danger', act('night'), !target));
    } else if (y.role === 'sheriff') {
      h('⭐ Who do you investigate?');
      p(pickName ? `Investigating ${pickName}. You'll know by dawn.` : 'Choose a player.');
      chips();
      row(btn(target ? `Investigate ${target.name}` : 'Choose someone', 'primary', act('night'), !target));
    } else if (y.role === 'doctor') {
      h('💉 Who do you protect?');
      const last = y.lastShield && byId(y.lastShield);
      p(pickName ? `Protecting ${pickName} tonight.` : `Choose a player — you can pick yourself${last ? `, but not ${last.name} again` : ''}.`);
      chips();
      row(btn(target ? `Protect ${target.name}` : 'Choose someone', 'primary', act('night'), !target));
    } else {
      h('🌙 You are asleep');
      p('Somewhere in the dark, the wolves are choosing. Nothing to do but wait for dawn.');
    }
  } else if (S.phase === 'dawn' || S.phase === 'verdict') {
    recap().forEach((t, i) => (i ? p(t) : h(t)));
  } else if (S.phase === 'day') {
    if (y.alive) {
      const living = S.players.filter(q => q.alive && !q.isBot && q.connected);
      h('☀️ Talk it out');
      p(me().ready ? `Waiting on the others (${living.filter(q => q.ready).length}/${living.length} ready).` : 'Use the chat to accuse, defend or bluff. The bots are listening — name names. When you\'re done, go to the vote.');
      row(btn(me().ready ? 'Ready ✓' : 'Ready to vote', 'primary', () => send({ t: 'ready' }), me().ready));
    } else {
      h('👻 Watching from the graveyard');
      p('The living can\'t hear you, but ghost chat is open — and tonight you can give another blessing.');
    }
  } else if (S.phase === 'vote') {
    if (y.alive) {
      const mine = me().vote;
      h('🗳️ Who gets banished?');
      p(mine ? `Your vote: ${mine === 'skip' ? 'nobody' : byId(mine).name}. You can change it until everyone has voted.` : `Choose a player.${S.blessed === y.id ? ' The spirits blessed you: your vote counts double.' : ''}`);
      chips();
      row(btn(target ? `Vote for ${target.name}` : 'Choose someone', 'primary', act('vote'), !target), btn('Vote for nobody', '', () => { send({ t: 'vote', target: 'skip' }); sel = null; }, mine === 'skip'));
    } else {
      h('🗳️ The village is voting');
      p('All you can do from the graveyard is watch.');
    }
  } else if (S.phase === 'over') {
    const won = me().won;
    kids.push(el('div', 'banner ' + (won ? 'win' : 'lose'), won ? 'You win! 🏆' : 'You lose.'));
    p({ villager: 'Every werewolf is gone. Hollowmoon is safe.', werewolf: 'The wolves outnumber the living. Hollowmoon falls.', jester: 'The village banished the Jester — exactly what they wanted.' }[S.winner]);
    const list = el('div', 'plist');
    S.players.forEach(q => {
      const c = el('div', 'pchip');
      const dot = el('i');
      dot.style.background = q.color;
      c.append(dot, document.createTextNode(`${q.name} `), el('small', null, `${ROLES[q.role].icon} ${ROLES[q.role].name}${q.won ? ' 🏆' : ''}`));
      list.append(c);
    });
    kids.push(list);
    row(S.hostId === y.id ? btn('Play again', 'primary', () => send({ t: 'again' })) : btn('Waiting for host…', '', null, true), btn('Leave', '', () => send({ t: 'leave' })));
  }
  if (y.role === 'sheriff' && y.notes.length && !['over', 'reveal', 'lobby'].includes(S.phase)) {
    const ul = el('ul', 'notes');
    y.notes.forEach(n => {
      const li = el('li', null, `Night ${n.round}: ${n.name} — `);
      li.append(el('span', n.wolf ? 'bad' : 'ok', n.wolf ? 'WEREWOLF' : 'innocent'));
      ul.append(li);
    });
    kids.push(ul);
  }
  a.replaceChildren(...kids);
}

function channels() {
  const y = S.you;
  if (['lobby', 'over'].includes(S.phase)) return ['pub'];
  const list = [];
  if (y.alive) list.push('pub');
  if (y.alive && y.role === 'werewolf') list.push('wolf');
  if (!y.alive) list.push('grave');
  return list;
}
function renderTabs() {
  const list = channels();
  if (!list.includes(tab)) tab = list[0];
  const names = { pub: 'Village', wolf: '🐺 Pack', grave: '👻 Ghosts' };
  $('tabs').replaceChildren(...(list.length > 1 ? list : []).map(ch => {
    const b = el('button', `tab ${ch}${ch === tab ? ' on' : ''}`, names[ch]);
    b.type = 'button';
    b.onclick = () => { tab = ch; renderTabs(); $('chatInput').focus(); };
    return b;
  }));
  const input = $('chatInput');
  const silent = tab === 'pub' && S.phase === 'night';
  input.disabled = silent;
  input.placeholder = silent ? 'Shh — it\'s night.' : tab === 'wolf' ? 'Only wolves see this…' : tab === 'grave' ? 'Only ghosts see this…' : 'Accuse, defend, bluff…';
}

function renderFeed() {
  const host = $('feed'), feed = S.feed;
  const newest = feed.length ? feed[feed.length - 1].id : 0;
  if (newest < lastFeedId || !feed.length) { host.replaceChildren(); lastFeedId = 0; }
  const stick = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
  const fresh = feed.filter(m => m.id > lastFeedId);
  fresh.forEach(m => {
    const d = el('div', 'msg ' + m.ch);
    if (m.ch === 'sys') {
      if (/^(⭐|💉)/.test(m.text)) d.classList.add('private');
      d.textContent = m.text;
    } else {
      const who = el('span', 'who', `${m.name}:`);
      who.style.color = m.color;
      d.append(who, document.createTextNode(m.text));
    }
    host.append(d);
  });
  if (fresh.some(m => m.from && m.from !== S.you.id) && lastFeedId && !document.body.classList.contains('chat-open')) $('chatToggle').classList.add('unread');
  lastFeedId = newest;
  if (stick) host.scrollTop = host.scrollHeight;
}

setInterval(() => {
  const t = $('timer');
  if (!S || !deadline || S.phase === 'over') { t.textContent = ''; return; }
  const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  t.classList.toggle('low', s <= 5);
}, 250);

// Cutscenes pause while the tab is hidden; don't replay a stale one on return.
document.addEventListener('visibilitychange', () => { if (!document.hidden) stage.skip(); });

render();
