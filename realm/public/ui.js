// Everything on screen that is not the 3D world.
import * as THREE from 'three';
import { CLASSES, CLASS_ORDER, STATS, STAT_ICON, BACKGROUNDS, TINTS, BONUS_POINTS, ITEMS, KEY_ITEMS, QUESTS, NPCS, XP_LEVELS, WEAPONS, MATERIALS } from './data.js';
import { icon, ABILITY_ICON } from './icons.js';
import { HALF, SITES, SHRINES, SHARDS, GLOWCAPS, SETTLEMENTS, NPC_POS } from './world.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sign = n => (n >= 0 ? `+${n}` : `−${-n}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class UI {
  constructor(game) {
    this.g = game;
    this.toastQ = [];
    this.mapImg = null;
    document.body.classList.toggle('touch', isTouch);
    this.bindTouch();
    this.bindMenu();
  }
  // ------------------------------------------------------------ small things
  toast(text, cls = '') {
    if (!text) return;
    const t = el('div', 'toast ' + cls, text);
    $('toasts').append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }
  banner(title, sub = '', cls = '') {
    const b = $('banner');
    b.className = 'on ' + cls;
    $('bannerTitle').textContent = title;
    $('bannerSub').textContent = sub;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.className = ''; }, 3600);
  }
  caption(text, cls = '') { const c = $('caption'); c.textContent = text || ''; c.className = text ? 'on ' + cls : ''; }
  cineTitle(text, sub = '', cls = '') { const c = $('cineTitle'); c.innerHTML = ''; if (text) { c.append(el('div', 'big', text)); if (sub) c.append(el('div', 'sub', sub)); } c.className = text ? 'on ' + cls : ''; }
  cinema(on) { document.body.classList.toggle('cine', on); }
  fade(on) { $('fade').classList.toggle('on', on); }
  flash(color, ms = 300) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = 0.55;
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; });
  }
  flashAbility(i) { const s = document.querySelector(`#slots [data-slot="${i + 1}"]`); if (s) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); } }
  hitMarker(crit) { const c = $('crosshair'); c.classList.remove('hit', 'crit'); void c.offsetWidth; c.classList.add(crit ? 'crit' : 'hit'); }
  prompt(text) { const p = $('prompt'); if (p.textContent !== text) p.textContent = text || ''; p.classList.toggle('on', !!text); }
  show(id, on) { $(id).hidden = !on; }

  // ------------------------------------------------------------ the HUD, every frame
  hud() {
    const g = this.g, h = g.hero, p = g.player;
    if (!h || !p) return;
    const pct = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100)).toFixed(1)}%`;
    $('hpFill').style.width = pct(h.hp, g.maxHp());
    $('hpText').textContent = `${Math.ceil(h.hp)} / ${g.maxHp()}`;
    $('stFill').style.width = pct(p.stamina, 100);
    const lv = h.level, lo = XP_LEVELS[lv - 1], hi = XP_LEVELS[lv] ?? lo;
    $('xpFill').style.width = hi > lo ? pct(h.xp - lo, hi - lo) : '100%';
    $('lvl').textContent = lv;
    $('gold').textContent = h.gold;
    $('fate').textContent = h.fate;
    $('hudPotions').textContent = h.potions;
    document.body.classList.toggle('lowhp', h.hp / g.maxHp() < 0.28);
    const C = CLASSES[h.cls];
    if (this.slotCls !== h.cls) {
      this.slotCls = h.cls;
      C.abilities.forEach((ab, i) => { const s = document.querySelector(`#slots [data-slot="${i + 1}"]`); s.querySelector('.ico').outerHTML = icon(ABILITY_ICON[ab.id] || 'bolt'); s.title = `${ab.name}: ${ab.text}`; const tb = $('tAb' + (i + 1)); if (tb) tb.innerHTML = icon(ABILITY_ICON[ab.id] || 'bolt'); });
    }
    C.abilities.forEach((ab, i) => {
      const s = document.querySelector(`#slots [data-slot="${i + 1}"]`);
      if (!s) return;
      const locked = h.level < ab.lvl;
      s.classList.toggle('locked', locked);
      const cd = p.cds[i];
      s.querySelector('.cd').style.height = locked ? '100%' : `${(cd / ab.cd) * 100}%`;
      s.querySelector('.cdt').textContent = !locked && cd > 0 ? Math.ceil(cd) : locked ? `Lv ${ab.lvl}` : '';
    });
    // wanted stars
    const w = $('wanted');
    const stars = g.bounty;
    w.hidden = stars <= 0;
    if (stars > 0) { const str = '★'.repeat(stars) + '☆'.repeat(5 - stars); if (w.textContent !== str) w.textContent = str; w.classList.toggle('flash', g.unseenT > 2); }
    // boss
    const b = g.bossActive;
    $('boss').hidden = !b;
    if (b) { $('bossName').textContent = b.def.name + (b.def.title ? ' — ' + b.def.title : ''); $('bossFill').style.width = pct(b.hp, b.max); }
    // quest tracker
    const tq = g.trackedQuest();
    const tr = $('tracker');
    if (tq) {
      tr.hidden = false;
      $('trTitle').textContent = QUESTS[tq.id].title;
      const step = QUESTS[tq.id].steps[tq.step];
      const count = step.count ? ` (${h.counters[step.count] || 0}/${step.need})` : '';
      $('trStep').textContent = step.text + count;
      const at = g.questTarget(tq.id);
      $('trDist').textContent = at && at.zone === g.zone ? `${Math.round(Math.hypot(at.x - p.pos.x, at.z - p.pos.z))} m` : at && at.zone !== g.zone ? (g.zone !== 'world' ? 'outside' : 'in the Barrow') : '';
    } else tr.hidden = true;
    const ch = $('crosshair');
    const K = g.kit();
    ch.hidden = !(K.style !== 'melee') || g.cineActive || g.paused || g.talking;
    if (this.slotsDirty || this.wpnShown !== h.weapon + (h.torchOn ? 't' : '')) {
      this.slotsDirty = false; this.wpnShown = h.weapon + (h.torchOn ? 't' : '');
      const w = WEAPONS[h.weapon];
      $('wpnSlot').innerHTML = `${icon(w.icon)}<span>${w.name}</span>${h.torchOn ? icon('torch', 'tq') : ''}`;
    }
    if (!ch.hidden) { if ((this.aimT = (this.aimT || 0) + 1) % 4 === 0) ch.classList.toggle('on', !!p.aim().target); ch.classList.toggle('zoom', !!p.aimMode); }
    this.minimap();
    this.markers();
  }
  minimap() {
    const g = this.g, p = g.player, cv = $('minimap'), c = cv.getContext('2d'), S = cv.width;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.clip();
    if (g.zone !== 'world') { c.fillStyle = g.zone === 'inside' ? '#2a2018' : '#16141a'; c.fillRect(0, 0, S, S); }
    else if (this.mapImg) {
      const ppm = 1.0; // screen pixels per metre on the minimap
      const imgPpm = this.mapImg.width / (HALF * 2);
      c.translate(S / 2, S / 2);
      c.rotate(p.yaw - Math.PI);
      c.scale(ppm / imgPpm, ppm / imgPpm);
      const px = ((p.pos.x + HALF) / (HALF * 2)) * this.mapImg.width, pz = ((p.pos.z + HALF) / (HALF * 2)) * this.mapImg.width;
      c.drawImage(this.mapImg, -px, -pz);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    // things on the minimap
    const scale = 1.0; // pixels per metre
    const toScreen = (x, z) => {
      const dx = x - p.pos.x, dz = z - p.pos.z, a = p.yaw - Math.PI, cs = Math.cos(a), sn = Math.sin(a);
      return [S / 2 + (dx * cs - dz * sn) * scale * (g.zone === 'barrow' ? 2.2 : 1), S / 2 + (dx * sn + dz * cs) * scale * (g.zone === 'barrow' ? 2.2 : 1)];
    };
    const dot = (x, z, col, r = 3) => { const [sx, sy] = toScreen(x, z); c.fillStyle = col; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill(); };
    for (const e of g.entities) {
      if (e.dead || e.zone !== g.zone || e.hidden || e.pos.distanceTo(p.pos) > 90) continue;
      if (e.type === 'mob' && g.isHostile(e)) dot(e.pos.x, e.pos.z, e.def.boss ? '#ff3050' : '#ff7070', e.def.boss ? 4.5 : 2.5);
      else if (e.type === 'npc') dot(e.pos.x, e.pos.z, g.npcHasQuest(e) ? '#ffd34d' : '#e8e8e8', g.npcHasQuest(e) ? 4 : 2.5);
      else if (e.type === 'horse' && e.owned) dot(e.pos.x, e.pos.z, '#c89060', 3.5);
      else if (e.type === 'mob' && e.team === 'town') dot(e.pos.x, e.pos.z, '#8fb3ff', 2.5);
    }
    if (g.zone === 'world') for (const s of SHRINES) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 110) dot(s.x, s.z, g.hero.shrines[s.id] ? '#5fd8ff' : '#2a5a70', 3.5);
    if (g.zone === 'world') for (const sg of g.scenery.signs || []) if (Math.hypot(sg.x - p.pos.x, sg.z - p.pos.z) < 95) dot(sg.x, sg.z, '#e8b14a', 3);
    c.restore();
    // quest arrow
    const tq = g.trackedQuest(), at = tq && g.questTarget(tq.id);
    if (at && at.zone === g.zone) {
      let [sx, sy] = toScreen(at.x, at.z);
      const dx = sx - S / 2, dy = sy - S / 2, dd = Math.hypot(dx, dy), R = S / 2 - 8;
      if (dd > R) { sx = S / 2 + (dx / dd) * R; sy = S / 2 + (dy / dd) * R; }
      c.fillStyle = '#ffd34d'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sx, sy - 6); c.lineTo(sx + 5, sy); c.lineTo(sx, sy + 6); c.lineTo(sx - 5, sy); c.closePath(); c.fill(); c.stroke();
    }
    // you, and north
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(S / 2, S / 2 - 7); c.lineTo(S / 2 + 5, S / 2 + 5); c.lineTo(S / 2, S / 2 + 2); c.lineTo(S / 2 - 5, S / 2 + 5); c.closePath(); c.fill(); c.stroke();
    const na = -(p.yaw - Math.PI) - Math.PI / 2;
    c.fillStyle = '#ff6060'; c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', S / 2 + Math.cos(na) * (S / 2 - 9), S / 2 + Math.sin(na) * (S / 2 - 9));
  }
  // floating markers over the quest target and named people
  markers() {
    const g = this.g, cam = g.camera, w = innerWidth, h = innerHeight;
    const tq = g.trackedQuest(), at = tq && g.questTarget(tq.id), m = $('qmark');
    if (at && at.zone === g.zone && !g.cineActive) {
      const v = new THREE.Vector3(at.x, (at.y ?? g.phys.ground(at.x, at.z)) + 3.6, at.z).project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      m.hidden = !on;
      if (on) { m.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(0)}px) translate(-50%, -100%)`; m.textContent = `◆ ${Math.round(Math.hypot(at.x - g.player.pos.x, at.z - g.player.pos.z))} m`; }
    } else m.hidden = true;
    // name plates for people and hurt or alert monsters near you
    const v = new THREE.Vector3();
    for (const e of g.entities) {
      const show = !g.cineActive && !e.dead && !e.hidden && e.zone === g.zone && e.pos.distanceTo(g.player.pos) < (e.type === 'npc' ? 16 : 26) &&
        (e.type === 'npc' || e.type === 'ally' || (e.type === 'mob' && !e.def.boss && (e.hp < e.max || e.state === 'chase')) || (e.neutral && e.talk));
      if (!show) { if (e.plate) e.plate.hidden = true; continue; }
      if (!e.plate) {
        e.plate = el('div', 'plate ' + e.type);
        e.plate.append(el('span', 'pn', e.name || e.def.name));
        if (e.type === 'mob') { const bar = el('div', 'pb'); bar.append(el('i')); e.plate.append(bar); }
        $('plates').append(e.plate);
      }
      e.plate.hidden = false;
      v.copy(e.pos); v.y += (e.actor.height || 2.4) * (e.def.scale || 1) + 0.5 + (e.flying ? 0 : 0);
      v.project(cam);
      if (v.z > 1) { e.plate.hidden = true; continue; }
      e.plate.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(0)}px) translate(-50%, -100%)`;
      if (e.type === 'mob') { e.plate.querySelector('i').style.width = `${(e.hp / e.max) * 100}%`; e.plate.classList.toggle('town', e.team === 'town'); }
      if (e.type === 'npc') e.plate.classList.toggle('quest', g.npcHasQuest(e));
    }
  }

  // ------------------------------------------------------------ dialogue
  // node: { text, options }. Resolves when the conversation ends.
  async talk(speaker, title, first, api) {
    const box = $('dialog');
    box.hidden = false;
    document.body.classList.add('talking');
    let node = first;
    while (node) {
      if (typeof node === 'string') node = api.node(node);
      if (typeof node === 'function') node = node(api);
      $('dlgWho').textContent = speaker;
      $('dlgTitle').textContent = title || '';
      $('dlgText').textContent = api.fmt(node.text || '');
      const opts = (node.options || [{ t: 'Continue', end: true }]).filter(o => !o.if || o.if(api));
      const list = $('dlgOpts');
      list.replaceChildren();
      const pick = await new Promise(res => {
        opts.forEach((o, i) => {
          const b = el('button', 'opt');
          b.type = 'button';
          b.append(el('span', 'k', `${i + 1}`), el('span', 'ot', api.fmt(o.t)));
          if (o.check) b.append(el('span', 'chk', `🎲 ${STAT_ICON[o.check.stat]} ${STATS[o.check.stat]} ${sign(api.statMod(o.check.stat))} · needs ${o.check.dc}`));
          b.onclick = () => res(o);
          list.append(b);
        });
        this.dlgKeys = e => { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) res(opts[n - 1]); if (e.key === 'Escape') res({ end: true }); };
        addEventListener('keydown', this.dlgKeys);
      });
      removeEventListener('keydown', this.dlgKeys);
      this.g.sfx.tick();
      if (pick.check) {
        list.replaceChildren();
        const ok = await this.check(pick.check.stat, pick.check.dc, api.statMod(pick.check.stat), speaker);
        const out = ok ? pick.ok : pick.fail;
        if (out && out.do) out.do(api);
        node = out ? { text: out.text || (ok ? 'It works.' : 'It does not work.'), options: out.options || (out.next ? undefined : [{ t: 'Continue', end: true }]) } : null;
        if (out && out.next) node = out.next;
        if (this.g.inFight) node = null;
        continue;
      }
      if (pick.do) pick.do(api);
      if (pick.end || this.g.inFight) break;
      node = pick.next || null;
    }
    box.hidden = true;
    document.body.classList.remove('talking');
  }
  // A skill check: roll the big d20. Offers a Fate re-roll on a failure.
  async check(stat, dc, mod, who) {
    const g = this.g;
    let r = await this.dice({ label: `${STAT_ICON[stat]} ${STATS[stat]} check`, mod, dc });
    while (!r.ok && g.hero.fate > 0) {
      const again = await new Promise(res => {
        const row = $('diceAgain');
        row.hidden = false;
        $('diceFate').textContent = `✨ Spend Fate and re-roll (${g.hero.fate} left)`;
        $('diceFate').onclick = () => res(true);
        $('diceAccept').onclick = () => res(false);
      });
      $('diceAgain').hidden = true;
      if (!again) break;
      g.hero.fate--;
      r = await this.dice({ label: `${STAT_ICON[stat]} ${STATS[stat]} check — Fate re-roll`, mod, dc });
    }
    $('dice').hidden = true;
    if (r.d === 20) { g.hero.fate = Math.min(3, g.hero.fate + 1); this.toast('Natural 20! +1 Fate', 'good'); }
    return r.ok;
  }
  async dice({ label, mod, dc }) {
    const box = $('dice'), num = $('dieNum'), die = $('die');
    $('diceLabel').textContent = label;
    $('diceMath').textContent = `needs ${dc}`;
    $('diceVerdict').textContent = '';
    $('diceVerdict').className = '';
    $('diceAgain').hidden = true;
    die.className = 'spin';
    box.hidden = false;
    this.g.sfx.dice();
    const d = 1 + Math.floor(Math.random() * 20);
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) { num.textContent = 1 + Math.floor(Math.random() * 20); await sleep(55); }
    num.textContent = d;
    die.className = d === 20 ? 'land crit' : d === 1 ? 'land fumble' : 'land';
    const ok = d === 20 || (d !== 1 && d + mod >= dc);
    $('diceMath').textContent = `${d} ${mod < 0 ? '−' : '+'} ${Math.abs(mod)} = ${d + mod}   ·   needs ${dc}`;
    await sleep(380);
    $('diceVerdict').textContent = d === 20 ? 'NATURAL 20!' : d === 1 ? 'Natural 1…' : ok ? 'Success!' : 'Failure';
    $('diceVerdict').className = ok ? 'ok' : 'no';
    this.g.sfx.sting(ok ? (d === 20 ? 'good' : 'calm') : 'sad');
    if (d === 20) this.flash('#ffd34d', 500);
    await sleep(ok ? 1100 : 700);
    return { d, ok };
  }

  // ------------------------------------------------------------ level up
  levelUp(level) {
    return new Promise(res => {
      const box = $('levelup');
      box.hidden = false;
      $('banner').className = '';
      $('luTitle').textContent = `Level ${level}!`;
      const C = CLASSES[this.g.hero.cls];
      const unlock = C.abilities.find(a => a.lvl === level);
      $('luText').textContent = `+${C.hpLv} maximum health, fully healed.${unlock ? ` New ability: ${unlock.name} (key 2) — ${unlock.text}` : ''} Raise one ability by 1:`;
      const list = $('luOpts');
      list.replaceChildren();
      Object.keys(STATS).forEach(k => {
        const b = el('button', 'pick', `${STAT_ICON[k]} ${STATS[k]}  ${sign(this.g.stat(k))} → ${sign(this.g.stat(k) + 1)}`);
        b.type = 'button';
        b.dataset.level = k;
        b.onclick = () => { box.hidden = true; res(k); };
        list.append(b);
      });
    });
  }

  // ------------------------------------------------------------ menus
  bindMenu() {
    document.querySelectorAll('#menu [data-tab]').forEach(b => { b.onclick = () => this.menuTab(b.dataset.tab); });
    $('mResume').onclick = () => this.g.resume();
    $('mSave').onclick = () => { this.g.save(); this.toast('Saved'); };
    $('mQuit').onclick = () => { this.g.save(); location.reload(); };
    $('sens').oninput = e => { this.g.input.sens = +e.target.value; try { localStorage.setItem('realm.sens', e.target.value); } catch { /* fine */ } };
    try { const s = localStorage.getItem('realm.sens'); if (s) { $('sens').value = s; } } catch { /* fine */ }
    $('mStick').onclick = () => this.setDpad(!this.dpad);
  }
  // ------------------------------------------------------------ the weapon wheel: hold Tab / Y / the wheel button; time slows while it is open
  wheelItems() {
    const h = this.g.hero, list = h.weapons.map(k => ({ k, name: WEAPONS[k].name, icon: WEAPONS[k].icon, text: WEAPONS[k].text }));
    if (h.flags.torch) list.push({ k: 'torch', name: h.torchOn ? 'Put out the torch' : 'Light a torch', icon: 'torch', text: 'Light in the dark. Takes the off hand.' });
    return list.slice(0, 10);
  }
  wheelOpen(byTouch) {
    const g = this.g, items = this.wheelItems(), W = $('wheel');
    if (g.wheel || g.talking || g.cineActive || g.state !== 'play') return;
    g.wheel = { items, sel: Math.max(0, items.findIndex(i => i.k === g.hero.weapon)), vx: 0, vy: 0, touch: !!byTouch };
    const ring = $('wheelRing'); ring.innerHTML = '';
    items.forEach((it, i) => {
      const a = (i / items.length) * Math.PI * 2 - Math.PI / 2, b = el('button', 'wslot');
      b.style.left = `calc(50% + ${Math.cos(a) * 42}% )`; b.style.top = `calc(50% + ${Math.sin(a) * 42}% )`;
      b.innerHTML = icon(it.icon); b.dataset.i = i;
      const pick = e => { e.preventDefault(); e.stopPropagation(); g.wheel.sel = i; this.wheelClose(true); };
      b.addEventListener('touchstart', pick, { passive: false }); b.addEventListener('mousedown', pick);
      ring.append(b);
    });
    W.hidden = false;
    this.wheelShow();
    g.sfx.swish();
  }
  wheelShow() {
    const g = this.g, w = g.wheel; if (!w) return;
    document.querySelectorAll('#wheelRing .wslot').forEach((b, i) => b.classList.toggle('on', i === w.sel));
    const it = w.items[w.sel], wp = WEAPONS[it.k];
    $('wheelName').textContent = it.name;
    $('wheelInfo').textContent = wp ? `${wp.style === 'melee' ? `${wp.dmg[0]}d${wp.dmg[1]} · reach ${wp.reach} m` : `${wp.dmg[0]}d${wp.dmg[1]} · ${wp.style}`} — ${wp.text}` : it.text;
  }
  wheelClose(apply) {
    const g = this.g, w = g.wheel; if (!w) return;
    g.wheel = null;
    $('wheel').hidden = true;
    if (!apply) return;
    const it = w.items[w.sel];
    if (it.k === 'torch') g.toggleTorch(); else if (it.k !== g.hero.weapon) g.equip(it.k);
  }
  // per tick: open on hold, steer with the mouse or a stick, close on release
  wheelTick() {
    const g = this.g, I = g.input, held = I.down('Tab') || I.padWheel;
    if (!g.wheel) { if (held) this.wheelOpen(); return; }
    const w = g.wheel;
    let x = I.mx * 0.04, y = I.my * 0.04;
    if (I.pad) { const ax = I.pad.axes; const sx = Math.abs(ax[2]) > Math.abs(ax[0]) ? ax[2] : ax[0], sy = Math.abs(ax[2]) > Math.abs(ax[0]) ? ax[3] : ax[1]; if (Math.hypot(sx, sy) > 0.5) { w.vx = sx * 3; w.vy = sy * 3; } }
    w.vx = Math.max(-3, Math.min(3, w.vx + x)); w.vy = Math.max(-3, Math.min(3, w.vy + y));
    if (Math.hypot(w.vx, w.vy) > 1) {
      const a = Math.atan2(w.vy, w.vx) + Math.PI / 2, n = w.items.length;
      const i = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
      if (i !== w.sel) { w.sel = i; this.wheelShow(); g.sfx.tick && g.sfx.tick(); }
    }
    if (!held && !w.touch) this.wheelClose(true);
  }
  // ------------------------------------------------------------ the combo meter
  combo(n, broke) {
    const c = $('combo');
    if (broke || !n) { if (!c.hidden) { c.classList.add('out'); setTimeout(() => { if (!this.g.combo) c.hidden = true; c.classList.remove('out'); }, 400); } return; }
    c.hidden = false; c.classList.remove('out');
    $('comboN').textContent = n;
    $('comboTag').textContent = n >= 8 ? 'TAKEDOWN READY — heavy attack' : n >= 5 ? 'Freeflow' : 'Hits';
    c.classList.toggle('hot', n >= 8);
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  }
  setDpad(on) {
    this.dpad = !!on;
    document.body.classList.toggle('dpad', this.dpad);
    const b = $('mStick'); if (b) b.textContent = this.dpad ? '✚ D-pad' : '🕹️ Joystick';
    try { localStorage.setItem('realm.dpad', this.dpad ? '1' : '0'); } catch { /* fine */ }
  }
  staminaFlash() { const f = $('stFill'); f.classList.remove('low'); void f.offsetWidth; f.classList.add('low'); }

  // ------------------------------------------------------------ game controller: moving a highlight through menus
  get nav() {
    return this._nav || (this._nav = {
      active: () => !!this.navRoot(),
      move: d => this.navMove(d), ok: () => this.navOk(), back: () => this.navBack(), start: () => this.navBack(true), tab: k => this.navTab(k),
    });
  }
  navRoot() {
    const vis = id => { const el = $(id); return el && !el.hidden && el.getClientRects().length ? el : null; };
    const rules = $('rules');
    if (rules && rules.open) return rules;
    return vis('dice') || vis('levelup') || vis('dialog') || vis('menu') || vis('creator') || vis('title') || null;
  }
  navItems(root) {
    return [...root.querySelectorAll('button, .opt, input, select, [data-cls], [data-plus], [data-minus], [data-bg], [data-tint]')]
      .filter(el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'));
  }
  navMove(dir) {
    const root = this.navRoot(); if (!root) return;
    const items = this.navItems(root); if (!items.length) return;
    let cur = items.includes(this.padEl) ? this.padEl : null;
    if (!cur) return this.navFocus(items[0]);
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const across = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
      if (along < 4) continue;
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) this.navFocus(best);
  }
  navFocus(el) {
    if (this.padEl) this.padEl.classList.remove('padfocus');
    this.padEl = el;
    el.classList.add('padfocus');
    el.scrollIntoView && el.scrollIntoView({ block: 'nearest' });
    this.g.sfx.tick && this.g.sfx.tick();
  }
  navOk() {
    const root = this.navRoot(); if (!root) return;
    const items = this.navItems(root);
    if (!items.includes(this.padEl)) return this.navFocus(items[0]);
    const el = this.padEl;
    if (el.tagName === 'INPUT' && el.type === 'range') { el.value = Math.min(+el.max, +el.value + +(el.step || 1)); el.dispatchEvent(new Event('input')); return; }
    if (el.tagName === 'INPUT') { if (!el.value) { el.value = ['Rowan', 'Kestrel', 'Bryn', 'Ash', 'Sable', 'Wren'][Math.floor(Math.random() * 6)]; el.dispatchEvent(new Event('input')); } this.navMove('down'); return; }
    el.click();
  }
  navBack(start) {
    const g = this.g, root = this.navRoot();
    if (!root) return;
    if (root.id === 'menu') return g.resume();
    if (root.id === 'rules') return root.close();
    if (root.id === 'dialog') { const opts = this.navItems(root); const bye = opts.reverse().find(o => /farewell|bye|leave|nothing|not today|just|no\b|later/i.test(o.textContent)); if (bye) bye.click(); return; }
    if (start && root.id === 'creator') {
      const nm = $('crName');
      if (nm && !nm.value.trim()) { nm.value = ['Rowan', 'Kestrel', 'Bryn', 'Ash', 'Sable', 'Wren'][Math.floor(Math.random() * 6)]; nm.dispatchEvent(new Event('input')); }
      const go = $('crGo'); if (go) go.click();
    }
  }
  navTab(k) {
    const root = this.navRoot(); if (!root || root.id !== 'menu') return;
    const tabs = [...root.querySelectorAll('[data-tab]')], i = tabs.findIndex(t => t.classList.contains('on'));
    const n = tabs[(Math.max(0, i) + k + tabs.length) % tabs.length]; if (n) n.click();
  }
  openMenu(tab = 'map') { $('menu').hidden = false; this.menuTab(tab); }
  closeMenu() { $('menu').hidden = true; }
  menuTab(tab) {
    document.querySelectorAll('#menu [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('#menu .pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'map') this.drawMap();
    if (tab === 'quests') this.drawJournal();
    if (tab === 'hero') this.drawSheet();
  }
  drawMap() {
    const g = this.g, cv = $('bigmap'), c = cv.getContext('2d'), S = cv.width;
    const toPx = (x, z) => [((x + HALF) / (HALF * 2)) * S, ((z + HALF) / (HALF * 2)) * S];
    if (this.mapImg) c.drawImage(this.mapImg, 0, 0, S, S);
    c.font = 'bold 13px system-ui'; c.textAlign = 'center';
    c.font = 'bold 15px Georgia, serif';
    for (const s of SETTLEMENTS) { const [x, y] = toPx(s.x, s.z); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(s.name, x + 1, y - (s.kingdom ? 22 : 12)); c.fillStyle = s.kingdom ? '#ffe6a8' : '#fff6dc'; c.fillText(s.name, x, y - (s.kingdom ? 23 : 13)); }
    c.font = 'bold 12px system-ui';
    for (const s of Object.values(SITES)) {
      if (!s.name || s === SITES.lake) continue;
      const [x, y] = toPx(s.x, s.z);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillText(s.name, x + 1, y - 9);
      c.fillStyle = '#fff6dc'; c.fillText(s.name, x, y - 10);
    }
    const hq = g.hero;
    const mark = (x, z, col, r, txt) => { const [px, py] = toPx(x, z); c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill(); c.stroke(); if (txt) { c.fillStyle = '#000'; c.font = 'bold 10px system-ui'; c.fillText(txt, px, py + 3.5); } };
    this.shrineHits = [];
    for (const s of SHRINES) { const on = hq.shrines[s.id]; mark(s.x, s.z, on ? '#5fd8ff' : '#2d5566', 7, '✦'); if (on) this.shrineHits.push({ s, p: toPx(s.x, s.z) }); }
    if (hq.quests.shards !== undefined) SHARDS.forEach(([x, z], i) => { if (!hq.got['shard' + i]) mark(x, z, '#ff9a40', 5); });
    if (hq.quests.glowcaps !== undefined) GLOWCAPS.forEach(([x, z], i) => { if (!hq.got['glow' + i]) mark(x, z, '#7fd8ff', 4); });
    for (const [id, pos] of Object.entries(NPC_POS)) if (g.npcHasQuest({ npcId: id })) mark(pos[0], pos[1], '#ffd34d', 6, '!');
    const tq = g.trackedQuest(), at = tq && g.questTarget(tq.id);
    if (at && at.zone === 'world') { const [x, y] = toPx(at.x, at.z); c.fillStyle = '#ffd34d'; c.strokeStyle = '#000'; c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x + 8, y); c.lineTo(x, y + 10); c.lineTo(x - 8, y); c.closePath(); c.fill(); c.stroke(); }
    const pp = g.zone === 'world' ? g.player.pos : g.zone === 'inside' && g.rooms.door ? { x: g.rooms.door.x, z: g.rooms.door.z } : { x: SITES.barrow.x, z: SITES.barrow.z };
    const [px, py] = toPx(pp.x, pp.z);
    c.save(); c.translate(px, py); c.rotate(-(g.player.yaw - Math.PI) + Math.PI);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 7); c.lineTo(0, 3); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke(); c.restore();
    $('mapHint').textContent = this.shrineHits.length > 1 ? 'Tap a glowing shrine ✦ to fast travel there.' : 'Touch the stone shrines ✦ you find to unlock fast travel.';
    cv.onclick = e => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * S, y = ((e.clientY - r.top) / r.height) * S;
      const hit = this.shrineHits.find(h => Math.hypot(h.p[0] - x, h.p[1] - y) < 16);
      if (hit) g.fastTravel(hit.s);
    };
  }
  drawJournal() {
    const g = this.g, box = $('journal');
    box.replaceChildren();
    const active = Object.entries(g.hero.quests), done = Object.keys(g.hero.done);
    if (!active.length && !done.length) box.append(el('p', 'dim', 'No quests yet. People with a ! over their heads have work for you.'));
    for (const [id, step] of active) {
      const q = QUESTS[id], d = el('div', 'quest' + (g.hero.tracked === id ? ' tracked' : ''));
      d.append(el('div', 'qt', `${q.main ? '👑 ' : ''}${q.title}`));
      q.steps.forEach((s, i) => { if (i <= step) d.append(el('div', 'qs' + (i < step ? ' done' : ''), (i < step ? '✓ ' : '• ') + s.text)); });
      const b = el('button', 'btn small', g.hero.tracked === id ? 'Tracking' : 'Track');
      b.onclick = () => { g.hero.tracked = id; this.drawJournal(); };
      d.append(b);
      box.append(d);
    }
    if (done.length) { box.append(el('h3', null, 'Completed')); done.forEach(id => box.append(el('div', 'qs done', '✓ ' + QUESTS[id].title))); }
  }
  drawSheet() {
    const g = this.g, h = g.hero, C = CLASSES[h.cls], box = $('sheet');
    box.replaceChildren();
    box.append(el('h2', null, `${C.icon} ${h.name}`), el('p', 'dim', `Level ${h.level} ${C.name} · ${BACKGROUNDS[h.bg].name} · ${h.xp} XP`));
    const top = el('div', 'chips');
    [`❤️ ${Math.ceil(h.hp)}/${g.maxHp()} health`, `🛡️ ${g.armor()} armor`, `🎯 attack ${sign(g.attackBonus())}`, `💥 d${C.dmg[1]}${sign(g.stat(C.atk) + g.dmgBonus())} damage`, `🪙 ${h.gold} gold`, `🧪 ${h.potions} potions`, `✨ ${h.fate} Fate`]
      .forEach(t => top.append(el('span', 'chip', t)));
    box.append(top);
    const st = el('div', 'stats4');
    Object.keys(STATS).forEach(k => { const d = el('div'); d.append(el('b', null, sign(g.stat(k))), el('span', null, `${STAT_ICON[k]} ${STATS[k]}`)); st.append(d); });
    box.append(st, el('h3', null, 'Abilities'));
    C.abilities.forEach((a, i) => { const p = el('p', h.level < a.lvl ? 'locked' : ''); p.append(el('b', null, `${a.icon} ${a.name} (key ${i + 1}${h.level < a.lvl ? `, level ${a.lvl}` : ''}): `), document.createTextNode(a.text)); box.append(p); });
    box.append(el('h3', null, 'Magic items'));
    if (!h.items.length) box.append(el('p', 'dim', 'None yet. Bosses, chests and grateful people have them.'));
    h.items.forEach(k => { const p = el('p'); p.append(el('b', null, `${ITEMS[k].icon} ${ITEMS[k].name}: `), document.createTextNode(ITEMS[k].text)); box.append(p); });
    const keys = Object.keys(KEY_ITEMS).filter(k => h.keys[k]);
    if (keys.length) { box.append(el('h3', null, 'Quest items')); box.append(el('p', null, keys.map(k => `${KEY_ITEMS[k].icon} ${KEY_ITEMS[k].name}`).join(' · '))); }
  }

  // ------------------------------------------------------------ character creation
  creator(onDone) {
    const g = this.g;
    const st = { name: '', cls: 'knight', bonus: {}, bg: 'soldier', tint: 0 };
    try { st.name = localStorage.getItem('realm.name') || ''; } catch { /* fine */ }
    $('creator').hidden = false;
    g.framePreview && g.framePreview();
    const draw = () => {
      const C = CLASSES[st.cls], spent = Object.values(st.bonus).reduce((a, b) => a + b, 0), left = BONUS_POINTS - spent;
      const cl = $('crClasses');
      cl.replaceChildren(...CLASS_ORDER.map(k => {
        const b = el('button', 'cls' + (k === st.cls ? ' on' : ''));
        b.type = 'button'; b.dataset.cls = k;
        b.append(el('span', 'ico', CLASSES[k].icon), el('b', null, CLASSES[k].name));
        b.onclick = () => { st.cls = k; draw(); g.previewHero(st); };
        return b;
      }));
      $('crBlurb').textContent = C.blurb;
      $('crNums').textContent = `❤️ ${C.hp + (st.bg === 'soldier' ? 6 : 0)} health · 🛡️ ${C.armor} armor · ${C.style === 'melee' ? '⚔️ close combat' : C.style === 'magic' ? '🔮 spells at range' : '🏹 crossbow at range'} · attacks with ${STATS[C.atk]}`;
      $('crAbil').replaceChildren(...C.abilities.map((a, i) => { const p = el('p'); p.append(el('b', null, `${a.icon} ${a.name}${a.lvl > 1 ? ` (level ${a.lvl})` : ''}: `), document.createTextNode(a.text)); return p; }));
      $('crLeft').textContent = `${left} point${left === 1 ? '' : 's'} to spend`;
      $('crStats').replaceChildren(...Object.keys(STATS).map(k => {
        const extra = st.bonus[k] || 0, r = el('div', 'statrow');
        const minus = el('button', 'btn tiny', '−'), plus = el('button', 'btn tiny', '+');
        minus.disabled = extra < 1; plus.disabled = left < 1 || extra >= 2;
        plus.dataset.plus = k;
        minus.onclick = () => { st.bonus[k] = extra - 1; draw(); };
        plus.onclick = () => { st.bonus[k] = extra + 1; draw(); };
        r.append(el('span', 'sname', `${STAT_ICON[k]} ${STATS[k]}`), minus, el('b', extra ? 'up' : '', sign(C.stats[k] + extra)), plus);
        return r;
      }));
      $('crBgs').replaceChildren(...Object.entries(BACKGROUNDS).map(([k, b]) => { const c = el('button', 'pick' + (k === st.bg ? ' on' : ''), `${b.icon} ${b.name}`); c.type = 'button'; c.dataset.bg = k; c.onclick = () => { st.bg = k; draw(); }; return c; }));
      $('crBgText').textContent = BACKGROUNDS[st.bg].text;
      $('crTints').replaceChildren(...TINTS.map((t, i) => { const c = el('button', 'swatch' + (i === st.tint ? ' on' : '')); c.type = 'button'; c.style.background = t || 'linear-gradient(135deg,#e6e6e6,#9aa)'; c.setAttribute('aria-label', `Colour ${i + 1}`); c.onclick = () => { st.tint = i; draw(); g.previewHero(st); }; return c; }));
    };
    $('crName').value = st.name;
    $('crName').oninput = e => { st.name = e.target.value; };
    $('crGo').onclick = () => {
      st.name = $('crName').value.trim().slice(0, 14);
      if (!st.name) { $('crName').focus(); $('crErr').textContent = 'Give your hero a name.'; return; }
      try { localStorage.setItem('realm.name', st.name); } catch { /* fine */ }
      $('creator').hidden = true;
      g.camera.clearViewOffset();
      onDone(st);
    };
    draw();
    g.previewHero(st);
  }

  // ------------------------------------------------------------ touch controls
  bindTouch() {
    const g = this.g, inp = () => g.input;
    const stick = $('stick'), knob = $('knob');
    let sid = null, sx = 0, sy = 0;
    stick.addEventListener('touchstart', e => {
      const t = e.changedTouches[0]; sid = t.identifier;
      // the D-pad is fixed: direction comes from where you press on it; the joystick floats from your first touch
      if (this.dpad) { const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; move(e); } else { sx = t.clientX; sy = t.clientY; }
      e.preventDefault();
    }, { passive: false });
    const move = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy), R = 50;
          if (this.dpad) {
            // a digital pad: eight directions, always full speed (push far out to sprint)
            if (l < 12) { dx = dy = 0; } else { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); dx = Math.cos(a) * R; dy = Math.sin(a) * R; }
            knob.style.transform = `translate(${dx * 0.7}px, ${dy * 0.7}px)`;
            inp().move = { x: Math.round(dx / R * 100) / 100, y: -Math.round(dy / R * 100) / 100 };
            inp().touch.sprint = l > R * 1.5;
            continue;
          }
          if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          inp().move = { x: dx / R, y: -dy / R };
          inp().touch.sprint = l > R * 1.4;
        } else if (t.identifier === this.lookId) {
          inp().mx += (t.clientX - this.lx) * 2.2 * inp().sens; inp().my += (t.clientY - this.ly) * 2.2 * inp().sens;
          this.lx = t.clientX; this.ly = t.clientY;
        }
      }
    };
    const end = e => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; knob.style.transform = ''; inp().move = { x: 0, y: 0 }; inp().touch.sprint = false; } if (t.identifier === this.lookId) this.lookId = null; } };
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    $('stage').addEventListener('touchstart', e => { const t = e.changedTouches[0]; if (this.lookId == null) { this.lookId = t.identifier; this.lx = t.clientX; this.ly = t.clientY; } }, { passive: true });
    const btn = (id, down, up) => {
      const b = $(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); down(); }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); b.classList.remove('down'); up && up(); }, { passive: false });
      b.addEventListener('mousedown', e => { e.stopPropagation(); down(); });
      b.addEventListener('mouseup', () => up && up());
    };
    btn('tAttack', () => { inp().touch.attack = true; inp().touch.attackHit = true; }, () => { inp().touch.attack = false; });
    btn('tJump', () => { inp().touch.jumpHit = true; });
    btn('tDodge', () => { inp().pressed.KeyQ = true; });
    btn('tAb1', () => { inp().pressed.Digit1 = true; });
    btn('tAb2', () => { inp().pressed.Digit2 = true; });
    btn('tPotion', () => { inp().pressed.KeyR = true; });
    btn('tUse', () => { inp().pressed.KeyE = true; });
    btn('tBlock', () => { inp().touch.block = true; }, () => { inp().touch.block = false; });
    btn('tMenu', () => { g.togglePause(); });
    btn('tHorse', () => { inp().pressed.KeyH = true; });
    btn('tLock', () => { inp().pressed.KeyT = true; });
    btn('tWheel', () => { if (g.wheel) this.wheelClose(false); else this.wheelOpen(true); });
    const ic = { tAttack: 'sword', tJump: 'jump', tDodge: 'dodge', tBlock: 'bolt', tPotion: 'potion', tUse: 'hand', tHorse: 'horse', tLock: 'target', tWheel: 'wheel', tMenu: 'menu' };
    for (const [id, nm] of Object.entries(ic)) { const b = $(id); if (b) b.innerHTML = icon(nm); }
    $('wheel').addEventListener('click', e => { if (e.target.id === 'wheel') this.wheelClose(false); });
    try { this.setDpad(localStorage.getItem('realm.dpad') === '1'); } catch { this.setDpad(false); }
  }
}
