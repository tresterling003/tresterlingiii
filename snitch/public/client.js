'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const ROLES = {
    crew: { icon: '🧤', name: 'Crew', cls: 'good', text: 'You\'re here for the score. No special power — just your vote and your read on people. Find the Snitches and cut them loose.' },
    lookout: { icon: '🔭', name: 'Lookout', cls: 'good', text: 'Each night, tail one player and learn whether they\'re a Snitch. Share what you know — but the Snitches will come for you.' },
    fixer: { icon: '🧰', name: 'Fixer', cls: 'good', text: 'Each night, give one player (even yourself) an alibi. If the Snitches set them up, the bust fails. Never the same player twice in a row.' },
    snitch: { icon: '🎙️', name: 'Snitch', cls: 'snitch', text: 'You\'re wearing a wire. Each night, choose a crew member to get busted. Blend in by day. You win when Snitches match the crew in numbers.' },
    fallguy: { icon: '🃏', name: 'Fall Guy', cls: 'fallguy', text: 'You WANT to take the fall. Get the crew to vote you out during the day and you win alone. Getting busted at night doesn\'t count.' },
  };
  const PHASES = {
    reveal: ['Roles dealt', 'Check your role. Keep it to yourself.'],
    night: ['🌙 Night', 'The safehouse is dark.'],
    dawn: ['🚨 Dawn', 'Here\'s what happened overnight.'],
    day: ['☀️ Day', 'Talk it out. Who\'s wearing the wire?'],
    vote: ['🗳️ Vote', 'Who gets cut loose?'],
    verdict: ['✂️ Verdict', 'The crew has spoken.'],
    over: ['Game over', ''],
  };

  let ws, S = null, sel = null, tab = 'pub', deadline = 0, retry = 0, lastPhaseKey = '';
  let feedHost = null, lastFeedId = 0, pendingJoin = null;
  const store = {
    get session() { try { return JSON.parse(localStorage.getItem('snitch.session')); } catch { return null; } },
    set session(v) { v ? localStorage.setItem('snitch.session', JSON.stringify(v)) : localStorage.removeItem('snitch.session'); },
  };

  // ---------- connection ----------
  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      retry = 0;
      const s = store.session;
      const want = new URLSearchParams(location.search).get('room');
      if (s && (!want || want.toUpperCase() === s.code)) send({ t: 'rejoin', ...s });
      else if (pendingJoin) { send(pendingJoin); }
      pendingJoin = null;
    };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t === 'joined') {
        store.session = { code: m.code, pid: m.pid, token: m.token };
        history.replaceState(null, '', '?room=' + m.code);
      } else if (m.t === 'state') {
        S = m;
        deadline = m.left ? Date.now() + m.left : 0;
        render();
      } else if (m.t === 'error') {
        const target = S ? $('lobbyErr') : $('homeErr');
        if (S && S.phase !== 'lobby') toast(m.msg); else target.textContent = m.msg;
      } else if (m.t === 'gone' || m.t === 'left') {
        store.session = null;
        S = null;
        if (m.t === 'left') history.replaceState(null, '', location.pathname);
        render();
      }
    };
    ws.onclose = () => { setTimeout(connect, Math.min(5000, 500 * 2 ** retry++)); };
  }
  function send(m) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
    else if (m.t === 'create' || m.t === 'join') pendingJoin = m;
  }
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- home ----------
  const nameInput = $('name');
  nameInput.value = localStorage.getItem('snitch.name') || '';
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('code').value = urlRoom.toUpperCase().slice(0, 4);
  function myName() {
    const n = nameInput.value.trim();
    if (!n) { $('homeErr').textContent = 'Pick a codename first.'; nameInput.focus(); return null; }
    localStorage.setItem('snitch.name', n);
    $('homeErr').textContent = '';
    return n;
  }
  $('solo').onclick = () => { const name = myName(); if (name) send({ t: 'create', name, solo: true, size: $('size').value }); };
  $('create').onclick = () => { const name = myName(); if (name) send({ t: 'create', name }); };
  const join = () => {
    const name = myName();
    if (!name) return;
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) { $('homeErr').textContent = 'Enter the 4-letter room code.'; return; }
    send({ t: 'join', name, code });
  };
  $('join').onclick = join;
  $('code').onkeydown = e => { if (e.key === 'Enter') join(); };
  nameInput.onkeydown = e => { if (e.key === 'Enter') ($('code').value ? join() : $('solo').click()); };

  // ---------- lobby / shared controls ----------
  $('addBot').onclick = () => send({ t: 'addBot' });
  $('start').onclick = () => { $('lobbyErr').textContent = ''; send({ t: 'start' }); };
  $('copy').onclick = async () => {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch { toast(link); }
  };
  const leave = () => { if (!S || S.phase === 'lobby' || S.phase === 'over' || confirm('Leave this game?')) send({ t: 'leave' }); };
  $('leaveLobby').onclick = leave;
  $('leaveGame').onclick = leave;
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (!o) return;
    if (o.dataset.open === 'role') fillRole($('roleCard'), true);
    $(o.dataset.open).showModal();
  });
  document.querySelectorAll('form[data-chat]').forEach(f => {
    f.onsubmit = e => {
      e.preventDefault();
      const input = f.querySelector('input');
      const text = input.value.trim();
      if (!text || input.disabled) return;
      send({ t: 'chat', ch: S && S.phase !== 'lobby' && S.phase !== 'over' ? tab : 'pub', text });
      input.value = '';
    };
  });

  // ---------- rendering ----------
  const me = () => S.players.find(p => p.id === S.you.id);
  const byId = id => S.players.find(p => p.id === id);

  function render() {
    const screen = !S ? 'home' : S.phase === 'lobby' ? 'lobby' : 'game';
    ['home', 'lobby', 'game'].forEach(id => { $(id).hidden = id !== screen; });
    document.body.dataset.phase = S ? S.phase : 'home';
    if (!S) return;
    const key = S.phase + S.round;
    if (key !== lastPhaseKey) {
      sel = null;
      const y = S.you;
      if (S.phase === 'night') tab = !y.alive ? 'lockup' : y.role === 'snitch' ? 'snitch' : 'pub';
      else if (!y.alive && S.phase !== 'over') tab = 'lockup';
      else tab = 'pub';
      if (S.phase === 'reveal') { fillRole($('roleCard'), true); }
      lastPhaseKey = key;
    }
    if (screen === 'lobby') renderLobby(); else renderGame();
    renderFeed(screen === 'lobby' ? $('lobbyFeed') : $('feed'));
  }

  function renderLobby() {
    const host = S.hostId === S.you.id;
    $('lobbyCode').textContent = S.code;
    $('lobbyHint').textContent = `${S.players.length}/${S.max} in the crew · need ${S.min}+ to start · fill empty seats with bots`;
    const list = $('lobbyPlayers');
    list.replaceChildren(...S.players.map(p => {
      const row = el('div', 'lp');
      row.append(el('span', 'ico', p.icon), el('span', 'nm', p.name));
      if (p.id === S.hostId) row.append(el('span', 'badge host', 'host'));
      if (p.isBot) {
        row.append(el('span', 'badge', 'bot'));
        if (host) {
          const x = el('button', 'x', '✕');
          x.title = `Remove ${p.name}`;
          x.setAttribute('aria-label', `Remove ${p.name}`);
          x.onclick = () => send({ t: 'removeBot', id: p.id });
          row.append(x);
        }
      }
      return row;
    }));
    $('addBot').hidden = $('start').hidden = !host;
    $('addBot').disabled = S.players.length >= S.max;
    $('start').disabled = S.players.length < S.min;
    if (!host) $('lobbyErr').textContent = '';
    if (!host) $('lobbyHint').textContent += ' · waiting for the host to start';
  }

  function fillRole(box, full) {
    if (!S || !S.you.role) return;
    const r = ROLES[S.you.role];
    const card = el('div', 'rolecard');
    card.append(el('div', 'big', r.icon), el('div', 'small', 'YOU ARE'), el('div', 'rn ' + r.cls, r.name.toUpperCase()));
    if (full) card.append(el('p', null, r.text));
    if (S.you.role === 'snitch') {
      const mates = S.players.filter(p => p.role === 'snitch' && p.id !== S.you.id).map(p => p.name);
      card.append(el('p', null, mates.length ? `Fellow Snitch: ${mates.join(', ')}` : 'You\'re the only Snitch.'));
    }
    box.replaceChildren(card);
  }

  function canTarget(p) {
    const y = S.you;
    if (S.phase === 'vote') return y.alive && p.alive && p.id !== y.id;
    if (S.phase !== 'night' || !p.alive) return false;
    if (!y.alive) return true;
    if (y.role === 'snitch') return p.role !== 'snitch';
    if (y.role === 'lookout') return p.id !== y.id;
    if (y.role === 'fixer') return p.id !== y.lastShield;
    return false;
  }

  function renderGame() {
    const y = S.you, r = ROLES[y.role];
    const [pn, ps] = PHASES[S.phase];
    $('phaseName').textContent = ['night', 'day'].includes(S.phase) ? `${pn} ${S.round}` : pn;
    $('phaseSub').textContent = ps;
    const chip = $('roleChip');
    chip.textContent = `${r.icon} ${r.name}${y.alive ? '' : ' · Lockup'}`;
    chip.className = 'role-chip' + (y.role === 'snitch' ? ' snitch' : '') + (y.alive ? '' : ' dead');
    $('footCode').textContent = `Room ${S.code}`;

    // players
    const showVotes = S.phase === 'vote' || S.phase === 'verdict';
    const counts = {};
    if (showVotes) S.players.forEach(p => { if (p.alive && p.vote && p.vote !== 'skip') counts[p.vote] = (counts[p.vote] || 0) + (p.id === S.kiteHolder ? 2 : 1); });
    const current = S.phase === 'vote' ? me().vote : y.pick;
    if (sel && !(byId(sel) && canTarget(byId(sel)))) sel = null;
    $('players').replaceChildren(...S.players.map(p => {
      const can = canTarget(p);
      const c = el(can ? 'button' : 'div', 'pc');
      if (p.id === y.id) c.classList.add('me');
      if (!p.alive) c.classList.add('dead');
      if (can) c.classList.add('target');
      if (p.id === (sel || current)) c.classList.add('sel');
      if (p.won) c.classList.add('win');
      const tags = el('div', 'tags');
      if (p.id === S.kiteHolder && p.alive && S.phase !== 'over') tags.append(tag('🪁', 'Has the kite: double vote'));
      if (p.isBot) tags.append(tag('🤖', 'Bot'));
      else if (!p.connected) tags.append(tag('📵', 'Disconnected'));
      if (p.ready) tags.append(tag('✅', 'Ready to vote'));
      if (p.won) tags.append(tag('🏆', 'Winner'));
      c.append(tags);
      if (counts[p.id]) c.append(el('div', 'votes', String(counts[p.id])));
      c.append(el('div', 'ico', p.icon), el('div', 'nm', p.name));
      const role = p.role && (p.id !== y.id || !p.alive || S.phase === 'over') ? ROLES[p.role] : null;
      const meta = el('div', 'meta', role ? `${role.icon} ${role.name}` : p.alive ? '' : 'Lockup');
      if (role && p.role === 'snitch') meta.classList.add('snitch');
      c.append(meta);
      if (showVotes && p.alive) c.append(el('div', 'voted', p.vote ? (p.vote === 'skip' ? 'skipped' : '→ ' + byId(p.vote).name) : S.phase === 'vote' ? '…' : ''));
      if (can) c.onclick = () => { sel = p.id; renderGame(); };
      return c;
    }));

    renderAction();
    renderTabs();
    const t = $('timer');
    t.hidden = S.phase === 'over';
  }
  function tag(icon, title) { const s = el('span', null, icon); s.title = title; s.setAttribute('aria-label', title); return s; }

  function recap() {
    // System lines since the last phase marker ("Night N" / "Voting is open").
    const sys = S.feed.filter(m => m.ch === 'sys');
    let i = sys.length - 1;
    while (i > 0 && !/^(🌙|🗳️)/.test(sys[i].text)) i--;
    return sys.slice(i + 1).map(m => m.text);
  }

  function renderAction() {
    const a = $('action'), y = S.you;
    const kids = [];
    const h = t => kids.push(el('h3', null, t));
    const p = t => kids.push(el('p', null, t));
    const row = (...btns) => { const r = el('div', 'row'); r.append(...btns); kids.push(r); };
    const btn = (label, cls, fn, disabled) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; b.disabled = !!disabled; return b; };
    const target = sel ? byId(sel) : null;
    const pickName = y.pick && byId(y.pick) ? byId(y.pick).name : null;

    if (S.phase === 'reveal') {
      const box = el('div');
      fillRole(box, true);
      kids.push(box);
    } else if (S.phase === 'night') {
      if (!y.alive) {
        h('⛓️ You\'re in Lockup');
        p(y.done ? (pickName ? `Kite addressed to ${pickName}. You can change it until dawn.` : 'You passed on the kite tonight.') : 'Smuggle a kite to a living player — whoever gets the most gets a double vote tomorrow. Tap a player.');
        row(btn(target ? `Send kite to ${target.name}` : 'Send kite', 'primary', () => { send({ t: 'kite', target: sel }); sel = null; }, !target),
          btn('Pass', '', () => send({ t: 'kite', target: null })));
      } else if (y.role === 'snitch') {
        h('🎙️ Who gets busted tonight?');
        const mates = (y.teamPicks || []).map(tp => `${byId(tp.by).name} wants ${byId(tp.target).name}`);
        p(pickName ? `You're setting up ${pickName}. You can change it until dawn.` : 'Tap a crew member, then lock it in.');
        if (mates.length) p(mates.join(' · '));
        row(btn(target ? `Set up ${target.name}` : 'Pick a target', 'danger', () => { send({ t: 'night', target: sel }); sel = null; }, !target));
      } else if (y.role === 'lookout') {
        h('🔭 Who do you tail tonight?');
        p(pickName ? `Tailing ${pickName}. You'll know by dawn.` : 'Tap a player, then lock it in.');
        row(btn(target ? `Tail ${target.name}` : 'Pick a target', 'primary', () => { send({ t: 'night', target: sel }); sel = null; }, !target));
      } else if (y.role === 'fixer') {
        h('🧰 Who gets an alibi tonight?');
        const last = y.lastShield && byId(y.lastShield);
        p(pickName ? `Covering ${pickName} tonight.` : `Tap a player (you can pick yourself)${last ? ` — not ${last.name} again` : ''}.`);
        row(btn(target ? `Cover ${target.name}` : 'Pick a target', 'primary', () => { send({ t: 'night', target: sel }); sel = null; }, !target));
      } else {
        h('🌙 Lie low');
        p('The safehouse is dark. Somewhere, a Snitch is making a call. Nothing to do but wait for dawn.');
      }
    } else if (S.phase === 'dawn' || S.phase === 'verdict') {
      recap().forEach((t, i) => (i ? p(t) : h(t)));
    } else if (S.phase === 'day') {
      if (y.alive) {
        const living = S.players.filter(q => q.alive && !q.isBot && q.connected);
        h('☀️ Talk it out');
        p(me().ready ? `Waiting on the others (${living.filter(q => q.ready).length}/${living.length} ready).` : 'Use the chat to accuse, defend, or bluff. The bots are listening — name names. When you\'re done, go to the vote.');
        row(btn(me().ready ? 'Ready ✓' : 'Ready to vote', 'primary', () => send({ t: 'ready' }), me().ready));
      } else {
        h('⛓️ Watching from Lockup');
        p('You can\'t talk to the crew, but Lockup chat is open — and tonight you get to send another kite.');
      }
    } else if (S.phase === 'vote') {
      if (y.alive) {
        const mine = me().vote;
        h('🗳️ Who gets cut loose?');
        p(mine ? `Your vote: ${mine === 'skip' ? 'skip' : byId(mine).name}. You can change it until everyone has voted.` : `Tap a player, then cast your vote.${S.kiteHolder === y.id ? ' You hold the kite: your vote counts double.' : ''}`);
        row(btn(target ? `Vote to cut ${target.name}` : 'Pick someone', 'primary', () => { send({ t: 'vote', target: sel }); sel = null; }, !target),
          btn('Skip vote', '', () => { send({ t: 'vote', target: 'skip' }); sel = null; }, mine === 'skip'));
      } else {
        h('🗳️ The crew is voting');
        p('Nothing you can do from Lockup but watch.');
      }
    } else if (S.phase === 'over') {
      const won = me().won;
      kids.push(el('div', 'banner ' + (won ? 'win' : 'lose'), won ? 'You win! 🏆' : 'You lose.'));
      p({ crew: 'Every Snitch was exposed. The crew gets away clean.', snitch: 'The Snitches took over the crew. Everyone else goes down.', fallguy: 'The crew cut the Fall Guy — exactly what they wanted.' }[S.winner]);
      const host = S.hostId === y.id;
      row(host ? btn('Play again', 'primary', () => send({ t: 'again' })) : btn('Waiting for host…', '', null, true),
        btn('Leave', '', () => send({ t: 'leave' })));
    }

    if (y.role === 'lookout' && y.notes.length && S.phase !== 'over' && S.phase !== 'reveal') {
      const ul = el('ul', 'notes');
      y.notes.forEach(n => {
        const li = el('li', null, `Night ${n.round}: ${n.name} — `);
        li.append(el('span', n.snitch ? 'bad' : 'ok', n.snitch ? 'SNITCH' : 'clean'));
        ul.append(li);
      });
      kids.push(ul);
    }
    a.replaceChildren(...kids);
  }

  function channels() {
    const y = S.you;
    if (S.phase === 'lobby' || S.phase === 'over') return ['pub'];
    const list = [];
    if (y.alive) list.push('pub');
    if (y.alive && y.role === 'snitch') list.push('snitch');
    if (!y.alive) list.push('lockup');
    return list;
  }
  function renderTabs() {
    const list = channels();
    if (!list.includes(tab)) tab = list[0];
    const names = { pub: 'Crew chat', snitch: '🎙️ Snitch channel', lockup: '⛓️ Lockup' };
    $('tabs').replaceChildren(...(list.length > 1 ? list : []).map(ch => {
      const b = el('button', `tab ${ch}${ch === tab ? ' on' : ''}`, names[ch]);
      b.type = 'button';
      b.onclick = () => { tab = ch; renderTabs(); $('chatInput').focus(); };
      return b;
    }));
    const input = $('chatInput');
    const silent = tab === 'pub' && S.phase === 'night';
    input.disabled = silent;
    input.placeholder = silent ? 'Quiet — it\'s night.' : tab === 'snitch' ? 'Only Snitches see this…' : tab === 'lockup' ? 'Only Lockup sees this…' : 'Accuse, defend, bluff…';
  }

  function renderFeed(host) {
    const feed = S.feed;
    const newest = feed.length ? feed[feed.length - 1].id : 0;
    if (host !== feedHost || newest < lastFeedId || !feed.length) {
      host.replaceChildren();
      feedHost = host;
      lastFeedId = 0;
    }
    const stick = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
    feed.filter(m => m.id > lastFeedId).forEach(m => {
      const d = el('div', 'msg ' + m.ch);
      if (m.ch === 'sys') {
        if (m.only) d.classList.add('private');
        d.textContent = m.text;
      } else {
        if (m.from === S.you.id) d.classList.add('mine');
        d.append(el('span', 'who', `${m.icon} ${m.name}:`), document.createTextNode(m.text));
      }
      host.append(d);
    });
    lastFeedId = newest;
    if (stick) host.scrollTop = host.scrollHeight;
  }

  setInterval(() => {
    const t = $('timer');
    if (!S || !deadline) { t.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    t.classList.toggle('low', s <= 5);
  }, 250);

  render();
  connect();
})();
