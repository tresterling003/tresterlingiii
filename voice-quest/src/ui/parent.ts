import type { Game } from '../game';
import type { PracticeLevel, PromptingStyle, VoiceMode, GameplayChallenge } from '../types';
import { UNLOCKS, VOCAB } from '../data/content';
import { summarizeAttempts } from '../core/storage';
import { el, esc } from './dom';
import { overlay, MODE_INFO, micTest } from './menus';
import { WebSpeechRecognizer } from '../speech/recognizers';

/** Simple adult gate: hold a button, then solve a multiplication. Not security — just keeps little hands out. */
export function adultGate(onPass: () => void, onCancel?: () => void): void {
  const o = overlay('gate panel-overlay');
  const a = 3 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 7);
  o.innerHTML = `<div class="panel small">
    <h2>Grown-ups only</h2>
    <p>Press and hold the button, then answer.</p>
    <button class="btn hold" id="hold">Hold me <span class="fill"></span></button>
    <div class="q hidden" id="q"><label>What is ${a} × ${b}? <input id="ans" inputmode="numeric" autocomplete="off" size="4"/></label> <button class="btn primary" id="ok">Enter</button></div>
    <p class="warn hidden" id="err">Not quite — try again.</p>
    <div class="row-btns"><button class="btn" id="cancel">Back to game</button></div></div>`;
  const hold = o.querySelector<HTMLElement>('#hold')!;
  const fill = hold.querySelector<HTMLElement>('.fill')!;
  let t0 = 0, raf = 0;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1500);
    fill.style.width = `${k * 100}%`;
    if (k >= 1) {
      o.querySelector('#q')!.classList.remove('hidden');
      o.querySelector<HTMLInputElement>('#ans')!.focus();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  hold.addEventListener('pointerdown', () => { t0 = performance.now(); raf = requestAnimationFrame(tick); });
  const stop = () => { cancelAnimationFrame(raf); if (o.querySelector('#q')!.classList.contains('hidden')) fill.style.width = '0'; };
  hold.addEventListener('pointerup', stop);
  hold.addEventListener('pointerleave', stop);
  const check = () => {
    if (parseInt(o.querySelector<HTMLInputElement>('#ans')!.value, 10) === a * b) { o.remove(); onPass(); }
    else o.querySelector('#err')!.classList.remove('hidden');
  };
  o.querySelector('#ok')!.addEventListener('click', check);
  o.querySelector('#ans')!.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') check(); });
  o.querySelector('#cancel')!.addEventListener('click', () => { o.remove(); onCancel?.(); });
}

type Tab = 'voice' | 'practice' | 'play' | 'progress' | 'notes' | 'data' | 'about';

export function showDashboard(g: Game, onClose: () => void): void {
  const o = overlay('dash panel-overlay');
  let tab: Tab = 'voice';
  const s = g.settings;
  const rec = new WebSpeechRecognizer();

  const save = () => {
    g.director.resetRuntime();
    g.applySettings();
    g.store.save(true);
  };

  const tabs: [Tab, string][] = [['voice', '🎤 Voice & privacy'], ['practice', '🗣️ Practice'], ['play', '🎮 Play & comfort'], ['progress', '📈 Progress'], ['notes', '📝 Notes'], ['data', '🗂️ Data'], ['about', 'ℹ️ About']];

  const render = () => {
    o.innerHTML = '';
    const panel = el('div', { class: 'panel wide' });
    const nav = el('div', { class: 'tabs' });
    for (const [id, label] of tabs) {
      const b = el('button', { class: `tab ${tab === id ? 'on' : ''}`, text: label });
      b.addEventListener('click', () => { tab = id; render(); });
      nav.append(b);
    }
    const close = el('button', { class: 'btn primary close', text: 'Back to game ▶' });
    close.addEventListener('click', () => { save(); o.remove(); onClose(); });
    const body = el('div', { class: 'tab-body' });
    panel.append(el('div', { class: 'dash-head' }, [el('h1', { text: 'Grown-ups area' }), close]), nav, body);
    o.append(panel);
    ({ voice: voiceTab, practice: practiceTab, play: playTab, progress: progressTab, notes: notesTab, data: dataTab, about: aboutTab })[tab](body);
  };

  const bind = (root: HTMLElement) => {
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const path = inp.dataset.set!.split('.');
        let target: Record<string, unknown> = s as unknown as Record<string, unknown>;
        for (const p of path.slice(0, -1)) target = target[p] as Record<string, unknown>;
        const k = path[path.length - 1];
        const cur = target[k];
        if (inp instanceof HTMLInputElement && inp.type === 'checkbox') target[k] = inp.checked;
        else if (typeof cur === 'number') target[k] = parseFloat(inp.value);
        else target[k] = inp.value;
        save();
        if (inp.dataset.rerender) render();
      });
    });
  };

  const voiceTab = (b: HTMLElement) => {
    const status = g.director.runtimeNote;
    b.innerHTML = `
      <h2>Microphone mode</h2>
      ${(['activity', 'recognition', 'pictures'] as VoiceMode[]).map((m) => `
        <label class="mode ${s.voiceMode === m ? 'on' : ''}"><input type="radio" name="vm" data-set="voiceMode" data-rerender="1" value="${m}" ${s.voiceMode === m ? 'checked' : ''} ${m === 'recognition' && !rec.available() ? 'disabled' : ''}/>
        <div><b>${MODE_INFO[m].title}</b><p>${MODE_INFO[m].body}</p></div></label>`).join('')}
      <label class="consent ${s.voiceMode === 'recognition' ? '' : 'hidden'}"><input type="checkbox" data-set="consentExternal" data-rerender="1" ${s.consentExternal ? 'checked' : ''}/> I allow word recognition to use the browser's online speech service.</label>
      ${s.voiceMode === 'recognition' && !s.consentExternal ? '<p class="warn">Until you tick the box above, the game uses on-device voice detection only.</p>' : ''}
      <p><b>Currently active:</b> ${({ activity: 'On-device voice detection', recognition: 'Word recognition', pictures: 'Pictures only' } as const)[g.director.mode]}${status ? ` — <span class="warn">${esc(status)}</span>` : ''}</p>
      <p><b>Browser speech recognition available:</b> ${rec.available() ? 'yes' : 'no'} · <b>Secure page:</b> ${window.isSecureContext ? 'yes' : 'no (microphone blocked)'}</p>
      <div class="row-btns"><button class="btn" id="mt">🎤 Test microphone</button><span id="mr" class="muted"></span></div>
      ${rec.available() ? '<div class="row-btns"><button class="btn" id="rt">🗣️ Test word recognition</button><span id="rr" class="muted"></span></div>' : ''}
      <h2>Language</h2>
      <select data-set="lang">${['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN', 'en-IE', 'en-NZ'].map((l) => `<option ${s.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <p class="muted">Game content is in English. The microphone is opened only while the on-screen mic is glowing, and released straight after each answer. No audio is ever saved.</p>`;
    bind(b);
    b.querySelector('#mt')!.addEventListener('click', () => void micTest(g, b.querySelector('#mr')!));
    b.querySelector('#rt')?.addEventListener('click', async () => {
      const out = b.querySelector<HTMLElement>('#rr')!;
      if (!s.consentExternal) { out.innerHTML = '<span class="warn">Tick the consent box first (recognition mode).</span>'; return; }
      out.textContent = 'Listening… say "snowman"';
      const r = await rec.recognize({ lang: s.lang, maxMs: 5000 });
      out.textContent = r.alternatives.length ? `Heard: ${r.alternatives.map((a) => `"${a.transcript}"${a.confidence ? ` (${Math.round(a.confidence * 100)}%)` : ''}`).join(', ')}` : `No words recognized${r.error ? ` (${r.error})` : ''}.`;
    });
  };

  const practiceTab = (b: HTMLElement) => {
    const levels: [PracticeLevel, string, string][] = [
      ['A', 'Sounds & syllables', 'e.g. "ba", "ma". Any voice attempt counts as practice (recognizers cannot judge single sounds).'],
      ['B', 'Single words', 'e.g. "hat", "ball", "blue".'],
      ['C', 'Short phrases', 'e.g. "my hat", "blue wheel". Saying the key word also counts.'],
      ['D', 'Sentences', 'e.g. "I found your hat." Saying the key word also counts.'],
      ['E', 'Open responses', 'Open questions like "What did you bring me?" — any answer containing an accepted word counts.'],
    ];
    const words = Object.values(VOCAB);
    b.innerHTML = `
      <h2>Practice level <span class="muted">(separate from game difficulty)</span></h2>
      ${levels.map(([l, t, d]) => `<label class="mode ${s.practiceLevel === l ? 'on' : ''}"><input type="radio" name="pl" data-set="practiceLevel" data-rerender="1" value="${l}" ${s.practiceLevel === l ? 'checked' : ''}/><div><b>${l} · ${t}</b><p>${d}</p></div></label>`).join('')}
      <h2>Prompting</h2>
      <select data-set="prompting">
        ${([['model-first', 'Model the word first, then listen'], ['model-after-try', 'Let my child try first, model after'], ['picture-cue', 'Picture cue only (no written/spoken model unless asked)']] as [PromptingStyle, string][]).map(([v, t]) => `<option value="${v}" ${s.prompting === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <div class="grid2">
        <label>Listening time: <b id="lsv">${s.listenSeconds}s</b><input type="range" min="4" max="15" step="1" value="${s.listenSeconds}" data-set="listenSeconds" id="ls"/></label>
        <label>Voice tries before "keep going" is highlighted: <select data-set="maxTries">${[1, 2, 3].map((n) => `<option ${s.maxTries === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label><input type="checkbox" data-set="generousMatching" ${s.generousMatching ? 'checked' : ''}/> Generous matching (accept near-misses such as "had" for "hat")</label>
      </div>
      <h2>Target sounds <span class="muted">(optional, e.g. from your SLP)</span></h2>
      <input id="ts" placeholder="e.g. b, m, s" value="${esc(s.targetSounds.join(', '))}"/>
      <p class="muted">Used to prefer matching words at the Wish Tree. This is a simple letter match, not a phonetic analysis.</p>
      <h2>Custom practice words</h2>
      <p class="muted">Custom words appear at the Wish Tree in the plaza. Add a picture (an emoji) so your child doesn't need to read.</p>
      <div class="row-btns"><input id="cw" placeholder="word or phrase"/><input id="cp" placeholder="picture emoji" size="6"/><input id="ca" placeholder="also accept (comma separated)"/><button class="btn" id="add">Add</button></div>
      <ul class="list">${s.customWords.map((w) => `<li><span class="emoji-sm">${esc(w.picture)}</span> <b>${esc(w.word)}</b> ${w.accept.length ? `<span class="muted">also: ${esc(w.accept.join(', '))}</span>` : ''} <button class="btn tiny" data-del="${w.id}">remove</button></li>`).join('') || '<li class="muted">None yet.</li>'}</ul>
      <h2>Accepted answers for game words</h2>
      <p class="muted">Add how your child usually says a word (e.g. "dod" for "dog") so the game accepts it. Built-in answers are shown in grey.</p>
      <table class="tbl"><tr><th>Word</th><th>Built-in</th><th>Extra accepted (comma separated)</th></tr>
      ${[...words.map((w) => [w.word, w.accept.join(', ')]), ...['red', 'blue', 'yellow', 'green'].map((c) => [c, ''])].map(([w, acc]) => `<tr><td><b>${w}</b></td><td class="muted">${esc(acc)}</td><td><input data-acc="${w}" value="${esc((s.acceptedExtra[w] ?? []).join(', '))}"/></td></tr>`).join('')}
      </table>`;
    bind(b);
    b.querySelector<HTMLInputElement>('#ls')!.addEventListener('input', (e) => (b.querySelector('#lsv')!.textContent = `${(e.target as HTMLInputElement).value}s`));
    b.querySelector<HTMLInputElement>('#ts')!.addEventListener('change', (e) => { s.targetSounds = (e.target as HTMLInputElement).value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); save(); });
    b.querySelector('#add')!.addEventListener('click', () => {
      const w = b.querySelector<HTMLInputElement>('#cw')!.value.trim();
      if (!w) return;
      s.customWords.push({ id: `cw${Date.now()}`, word: w, picture: b.querySelector<HTMLInputElement>('#cp')!.value.trim() || '⭐', accept: b.querySelector<HTMLInputElement>('#ca')!.value.split(',').map((x) => x.trim()).filter(Boolean) });
      save();
      render();
    });
    b.querySelectorAll<HTMLElement>('[data-del]').forEach((x) => x.addEventListener('click', () => { s.customWords = s.customWords.filter((w) => w.id !== x.dataset.del); save(); render(); }));
    b.querySelectorAll<HTMLInputElement>('[data-acc]').forEach((inp) => inp.addEventListener('change', () => {
      const v = inp.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (v.length) s.acceptedExtra[inp.dataset.acc!] = v; else delete s.acceptedExtra[inp.dataset.acc!];
      save();
    }));
  };

  const playTab = (b: HTMLElement) => {
    const vol = (k: keyof typeof s.volumes, label: string) => `<label>${label} <input type="range" min="0" max="1" step="0.05" value="${s.volumes[k]}" data-set="volumes.${k}"/></label>`;
    b.innerHTML = `
      <h2>Game challenge <span class="muted">(movement speed, obstacles — independent of practice level)</span></h2>
      <select data-set="gameplay">${([['gentle', 'Gentle'], ['normal', 'Normal'], ['zippy', 'Zippy']] as [GameplayChallenge, string][]).map(([v, t]) => `<option value="${v}" ${s.gameplay === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <h2>Session length</h2>
      <select data-set="sessionMinutes">${[0, 10, 15, 20, 30].map((m) => `<option value="${m}" ${s.sessionMinutes === m ? 'selected' : ''}>${m ? `Suggest a break after ${m} minutes` : 'No break reminder'}</option>`).join('')}</select>
      <h2>Volume</h2>
      <div class="grid2">${vol('master', 'Master')}${vol('music', 'Music')}${vol('voice', 'Voices')}${vol('sfx', 'Sound effects')}</div>
      <h2>Comfort & accessibility</h2>
      <div class="grid2">
        <label><input type="checkbox" data-set="reducedMotion" ${s.reducedMotion ? 'checked' : ''}/> Reduced motion (less spinning, bouncing and twinkling)</label>
        <label><input type="checkbox" data-set="reducedEffects" ${s.reducedEffects ? 'checked' : ''}/> Reduced effects (fewer particles, no shadows — also faster)</label>
        <label><input type="checkbox" data-set="captions" ${s.captions ? 'checked' : ''}/> Show captions in speech bubbles</label>
      </div>
      <h2>Controls</h2>
      <p>Move: arrow keys / WASD, or click the ground to walk there · Jump: Space (double-jump allowed) · Talk: E / Enter or the big hand button · Look around: drag the mouse · Gamepad: left stick + A.</p>`;
    bind(b);
  };

  const progressTab = (b: HTMLElement) => {
    const p = g.progress;
    const att = g.store.data.attempts;
    const sum = summarizeAttempts(att);
    const comp = Object.entries(p.completions);
    b.innerHTML = `
      <p class="note">These numbers count <b>practice opportunities</b>. "Recognized" only means the browser's speech recognizer produced matching text — recognizers often mishear children, so this is <b>not</b> a measure of speech clarity or progress. Please share observations, not these numbers, with your child's SLP.</p>
      <div class="stats"><div>⭐ ${p.stars} stars</div><div>🪙 ${p.coins} coins</div><div>🔔 ${p.bells} bells</div><div>🎁 ${p.unlocks.length}/${UNLOCKS.length} rewards</div><div>🥇 ${p.medals.dash.length} dash medals${p.bestDashTime ? ` (best ${p.bestDashTime}s)` : ''}</div></div>
      <h2>Completed activities</h2>
      <p>${comp.length ? comp.map(([k, v]) => `${esc(k)}: ${v}×`).join(' · ') : '<span class="muted">None yet.</span>'}</p>
      <h2>Words practiced</h2>
      <table class="tbl"><tr><th>Target</th><th>Opportunities</th><th>Recognized</th><th>Practiced / tried again</th><th>Completed with help</th><th>Picture choice</th><th>Last</th></tr>
      ${sum.byTarget.map((r) => `<tr><td><b>${esc(r.target)}</b></td><td>${r.total}</td><td>${r.recognized}</td><td>${r.practiced}</td><td>${r.helped}</td><td>${r.picture}</td><td>${new Date(r.last).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No voice moments yet.</td></tr>'}
      </table>
      <h2>Practice moments per day</h2>
      <div class="bars">${sum.days.slice(-14).map(([d, n]) => `<div class="bar" title="${d}: ${n}"><span style="height:${Math.min(100, n * 4)}%"></span><em>${d.slice(5)}</em></div>`).join('') || '<span class="muted">—</span>'}</div>
      <h2>Recent voice moments</h2>
      <table class="tbl small"><tr><th>When</th><th>Activity</th><th>Target</th><th>Level</th><th>Mode</th><th>Result</th><th>Tries</th><th>Recognizer heard</th></tr>
      ${att.slice(-40).reverse().map((a) => `<tr><td>${new Date(a.t).toLocaleString()}</td><td>${esc(a.activity)}</td><td>${esc(a.target)}</td><td>${a.level}</td><td>${a.mode}</td><td><span class="lbl lbl-${a.label.replace(/\s/g, '-').toLowerCase()}">${a.label}</span></td><td>${a.tries}</td><td class="muted">${esc(a.transcripts.join(' / '))}</td></tr>`).join('')}
      </table>
      <h2>Sessions</h2>
      <p>${p.sessions.slice(-10).map((x) => `${new Date(x.start).toLocaleDateString()}: ${x.minutes} min`).join(' · ') || '<span class="muted">—</span>'}</p>`;
  };

  const notesTab = (b: HTMLElement) => {
    const notes = g.store.data.notes;
    b.innerHTML = `<h2>Your observations</h2><p class="muted">Write what you noticed (e.g. "said 'ba' for ball with a big smile"). Stored only in this browser.</p>
      <textarea id="nt" rows="4" placeholder="Today I noticed…"></textarea><div class="row-btns"><button class="btn primary" id="add">Save note</button></div>
      <ul class="list">${notes.slice().reverse().map((n, i) => `<li><span class="muted">${new Date(n.t).toLocaleString()}</span><br>${esc(n.text)} <button class="btn tiny" data-i="${notes.length - 1 - i}">delete</button></li>`).join('') || '<li class="muted">No notes yet.</li>'}</ul>`;
    b.querySelector('#add')!.addEventListener('click', () => {
      const v = b.querySelector<HTMLTextAreaElement>('#nt')!.value.trim();
      if (!v) return;
      notes.push({ t: Date.now(), text: v });
      g.store.save(true);
      render();
    });
    b.querySelectorAll<HTMLElement>('[data-i]').forEach((x) => x.addEventListener('click', () => { notes.splice(parseInt(x.dataset.i!, 10), 1); g.store.save(true); render(); }));
  };

  const dataTab = (b: HTMLElement) => {
    b.innerHTML = `<h2>Your data</h2>
      <p>Everything is stored in this browser's local storage: settings, rewards, the practice log (targets, results and — only in word-recognition mode — the recognizer's text), and your notes. No audio is stored. Nothing is uploaded by this game.</p>
      <div class="row-btns"><button class="btn" id="exp">⬇️ Export my data (JSON)</button></div>
      <div class="row-btns"><button class="btn" id="clr">🧹 Clear the practice log</button><button class="btn" id="rst">🔄 Reset game progress</button><button class="btn danger" id="del">🗑️ Delete everything</button></div>
      <h2>Developer tools</h2>
      <label><input type="checkbox" data-set="devPanel" ${s.devPanel ? 'checked' : ''}/> Show the voice testing panel (press the <kbd>\`</kbd> key in game to toggle)</label>`;
    bind(b);
    b.querySelector('#exp')!.addEventListener('click', () => {
      const blob = new Blob([g.store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `voice-quest-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    b.querySelector('#clr')!.addEventListener('click', () => { if (confirm('Clear the practice log?')) { g.store.data.attempts = []; g.store.save(true); render(); } });
    b.querySelector('#rst')!.addEventListener('click', () => { if (confirm('Reset stars, rewards and quests? Settings and notes are kept.')) { g.store.resetProgress(); location.reload(); } });
    b.querySelector('#del')!.addEventListener('click', () => { if (confirm('Delete ALL Voice Quest data from this browser, including settings and notes?')) { g.store.deleteAll(); location.reload(); } });
  };

  const aboutTab = (b: HTMLElement) => {
    b.innerHTML = `<h2>About Voice Quest</h2>
      <p>A recreational, educational game that gives children playful reasons to communicate. It is <b>not</b> a medical device, does not diagnose or assess speech, and does not replace a speech-language pathologist.</p>
      <h3>What the voice features really do</h3>
      <ul>
        <li><b>Voice detection</b> (on device): measures microphone loudness to notice a spoken attempt. Works offline. Cannot tell what was said.</li>
        <li><b>Word recognition</b> (optional): the browser's speech-to-text service. Usually online. Often less accurate for young children. The game compares the text to accepted answers — generously — and never penalizes a miss.</li>
        <li><b>No articulation assessment</b>: the game does not judge pronunciation, sounds, or clarity, and shows no clarity scores.</li>
      </ul>
      <h3>Always winnable</h3>
      <p>Every speaking moment can be finished by voice, by tapping a picture, or with "keep going". Rewards are the same either way.</p>
      <h3>Privacy</h3>
      <p>No accounts, ads, chat, social features, analytics, or tracking. If you later share this game with other families, review children's privacy rules (such as COPPA) first.</p>`;
  };

  render();
}
