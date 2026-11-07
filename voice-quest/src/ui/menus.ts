import type { Game } from '../game';
import type { HeroLook, VoiceMode } from '../types';
import { el, esc } from './dom';
import { MicMonitor } from '../speech/mic';
import { WebSpeechRecognizer } from '../speech/recognizers';

export function overlay(cls: string): HTMLElement {
  const o = el('div', { class: `overlay ${cls}` });
  document.querySelector('.ui')!.append(o);
  return o;
}

// -------------------------------------------------------------- title
export function showTitle(g: Game, onPlay: () => void, onCabin: () => void, onParent: () => void): HTMLElement {
  const o = overlay('title');
  o.innerHTML = `
    <div class="logo">
      <div class="logo-top">VOICE QUEST</div>
      <div class="logo-sub">Christmas Kingdom</div>
    </div>
    <div class="title-btns">
      <button class="big-btn play" aria-label="Play">▶</button>
      <button class="big-btn cabin" aria-label="My cabin">🏡</button>
    </div>
    <button class="corner-parent" aria-label="Grown-ups">⚙️ Grown-ups</button>
    <div class="title-note">A playful speech &amp; adventure game. Not a medical or diagnostic tool.</div>`;
  o.querySelector('.play')!.addEventListener('click', () => { g.audio.unlock(); g.audio.sfx('click'); onPlay(); });
  o.querySelector('.cabin')!.addEventListener('click', () => { g.audio.unlock(); g.audio.sfx('click'); onCabin(); });
  o.querySelector('.corner-parent')!.addEventListener('click', () => { g.audio.unlock(); onParent(); });
  return o;
}

// -------------------------------------------------------------- first-time grown-up setup
export const MODE_INFO: Record<VoiceMode, { title: string; body: string }> = {
  activity: {
    title: 'Voice detection on this device (recommended start)',
    body: 'The microphone listens only when a character asks a question (a glowing mic and chime show this). The game measures loudness on this device to notice that your child spoke. No words are recognized, nothing is recorded or sent anywhere. Every voice attempt counts as practice.',
  },
  recognition: {
    title: 'Word recognition (browser speech service)',
    body: 'Uses your browser\'s built-in speech recognition to turn speech into text and check for the target word. In Chrome and Edge this sends audio to the browser maker\'s online speech service (Google / Microsoft); Safari uses Apple speech services. It does not work offline in those browsers. Firefox does not support it. Recognizers are designed mostly for adult speech and often mishear children — the game never treats this as a judgement of your child, and always offers pictures and help.',
  },
  pictures: {
    title: 'Pictures only (no microphone)',
    body: 'The microphone is never used. Every speaking moment becomes a big picture choice. Your child can still hear every word modelled and say it aloud for fun.',
  },
};

export function showSetup(g: Game, onDone: () => void): void {
  const o = overlay('setup panel-overlay');
  const s = g.settings;
  const recOK = new WebSpeechRecognizer().available();
  const render = () => {
    o.innerHTML = `
    <div class="panel">
      <h1>Welcome, grown-up! 👋</h1>
      <p>Voice Quest is a playful adventure where speaking helps characters, activates magic and unlocks areas. It is a recreational game — <b>not</b> a medical device, speech assessment, or a replacement for a speech-language pathologist.</p>
      <h2>How should the game use the microphone?</h2>
      ${(['activity', 'recognition', 'pictures'] as VoiceMode[]).map((m) => `
        <label class="mode ${s.voiceMode === m ? 'on' : ''} ${m === 'recognition' && !recOK ? 'disabled' : ''}">
          <input type="radio" name="mode" value="${m}" ${s.voiceMode === m ? 'checked' : ''} ${m === 'recognition' && !recOK ? 'disabled' : ''}/>
          <div><b>${MODE_INFO[m].title}</b><p>${MODE_INFO[m].body}</p>${m === 'recognition' && !recOK ? '<p class="warn">This browser does not provide speech recognition.</p>' : ''}</div>
        </label>`).join('')}
      <label class="consent ${s.voiceMode === 'recognition' ? '' : 'hidden'}"><input type="checkbox" id="consent" ${s.consentExternal ? 'checked' : ''}/> I understand that word recognition may send my child's voice audio to an online speech service run by the browser maker, and I allow it. (You can switch this off any time in the Grown-ups area.)</label>
      <div class="row-btns">
        <button class="btn" id="micTest">🎤 Test microphone</button>
        <span id="micResult" class="muted"></span>
      </div>
      <p class="muted">Privacy: no accounts, no ads, no chat, no analytics. Progress and the practice log stay in this browser only (you can delete them). Raw voice is never stored.</p>
      <div class="row-btns"><button class="btn primary" id="go">Start the adventure ▶</button></div>
    </div>`;
    o.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => r.addEventListener('change', () => { s.voiceMode = r.value as VoiceMode; render(); }));
    o.querySelector<HTMLInputElement>('#consent')?.addEventListener('change', (e) => (s.consentExternal = (e.target as HTMLInputElement).checked));
    o.querySelector('#micTest')!.addEventListener('click', () => void micTest(g, o.querySelector('#micResult')!));
    o.querySelector('#go')!.addEventListener('click', () => {
      if (s.voiceMode === 'recognition' && !s.consentExternal) {
        (o.querySelector('.consent') as HTMLElement).classList.add('shake');
        return;
      }
      s.setupDone = true;
      g.director.resetRuntime();
      g.store.save(true);
      o.remove();
      onDone();
    });
  };
  render();
}

/** Opens the mic for 4 seconds, shows a level meter, then releases it. */
export async function micTest(g: Game, out: HTMLElement): Promise<void> {
  const mic = new MicMonitor(g.audio.getCtx);
  out.innerHTML = 'Requesting microphone…';
  const st = await mic.open();
  if (st !== 'open') {
    const msg: Record<string, string> = {
      denied: 'Microphone permission was declined. You can allow it from the browser address bar, or use Pictures mode.',
      'no-mic': 'No microphone was found.',
      unsupported: 'This browser cannot use a microphone.',
      insecure: 'The microphone needs a secure page (https or localhost).',
      error: `Microphone error: ${esc(mic.lastError)}`,
    };
    out.innerHTML = `<span class="warn">${msg[st] ?? st}</span>`;
    mic.close();
    return;
  }
  out.innerHTML = 'Say something! <span class="meter"><span></span></span>';
  const bar = out.querySelector<HTMLElement>('.meter span')!;
  const end = performance.now() + 4000;
  while (performance.now() < end) {
    bar.style.width = `${Math.round(mic.level * 100)}%`;
    bar.style.background = mic.voicedNow ? '#43a047' : '#90caf9';
    await new Promise((r) => setTimeout(r, 50));
  }
  const rep = mic.close();
  out.innerHTML = rep.speechDetected ? '✅ Voice detected. Microphone released.' : '⚠️ No voice detected (try speaking louder or closer). Microphone released.';
}

// -------------------------------------------------------------- wardrobe
const SWATCH = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#ec407a', '#00acc1', '#ffffff', '#37474f'];
const SKINS = ['#f9d7b9', '#f2c19b', '#d9a066', '#b5774a', '#8d5524', '#5c3a1e'];
const HAIR = ['#2b1b0e', '#5d3a1a', '#a0522d', '#e0b04a', '#d35400', '#222222'];

export function showWardrobe(g: Game, onClose: () => void): void {
  const o = overlay('wardrobe');
  const s = g.settings;
  const styles: { id: HeroLook['hatStyle']; icon: string; unlock?: string }[] = [
    { id: 'beanie', icon: '🧢' },
    { id: 'elf', icon: '🧝', unlock: 'outfit-elf' },
    { id: 'antlers', icon: '🦌', unlock: 'outfit-antlers' },
    { id: 'earmuffs', icon: '🎧', unlock: 'outfit-earmuffs' },
    { id: 'crown', icon: '👑', unlock: 'outfit-crown' },
  ];
  const row = (label: string, key: 'coat' | 'hat' | 'scarf' | 'skin' | 'hair', list: string[]) => `
    <div class="w-row"><div class="w-label">${label}</div>${list.map((c) => `<button class="sw ${s.hero[key] === c ? 'on' : ''}" data-k="${key}" data-c="${c}" style="background:${c}" aria-label="${key} ${c}"></button>`).join('')}</div>`;
  const render = () => {
    o.innerHTML = `<div class="w-card">
      ${row('🧥', 'coat', SWATCH)}${row('🎩', 'hat', SWATCH)}${row('🧣', 'scarf', SWATCH)}${row('🙂', 'skin', SKINS)}${row('💇', 'hair', HAIR)}
      <div class="w-row"><div class="w-label">👒</div>${styles.map((st) => {
        const locked = st.unlock && !g.has(st.unlock);
        return `<button class="sty ${s.hero.hatStyle === st.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-s="${st.id}" ${locked ? 'disabled' : ''} aria-label="${st.id}">${locked ? '🔒' : st.icon}</button>`;
      }).join('')}</div>
      <div class="w-row"><div class="w-label">🦌</div>
        ${['#1e88e5', '#e53935', '#43a047', '#8e24aa', '#fdd835'].map((c) => `<button class="sw ${s.reindeer.blanket === c ? 'on' : ''}" data-r="blanket" data-c="${c}" style="background:${c}" aria-label="blanket ${c}"></button>`).join('')}
        ${([['redNose', '🔴', 'rd-nose'], ['bellCollar', '🔔', 'rd-bells'], ['antlerLights', '✨', 'rd-lights']] as const).map(([k, ic, u]) => {
          const locked = !g.has(u);
          return `<button class="sty ${s.reindeer[k] ? 'on' : ''} ${locked ? 'locked' : ''}" data-t="${k}" ${locked ? 'disabled' : ''} aria-label="${k}">${locked ? '🔒' : ic}</button>`;
        }).join('')}
      </div>
      <button class="big-btn done" aria-label="Done">✅</button>
    </div>`;
    o.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => b.addEventListener('click', () => { s.hero[b.dataset.k as 'coat'] = b.dataset.c!; apply(); }));
    o.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.addEventListener('click', () => { s.hero.hatStyle = b.dataset.s as HeroLook['hatStyle']; apply(); }));
    o.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.addEventListener('click', () => { s.reindeer.blanket = b.dataset.c!; apply(); }));
    o.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.t as 'redNose'; s.reindeer[k] = !s.reindeer[k]; apply(); }));
    o.querySelector('.done')!.addEventListener('click', () => { g.audio.sfx('cheer'); o.remove(); onClose(); });
  };
  const apply = () => {
    g.audio.sfx('pop', 1);
    g.applySettings();
    render();
  };
  render();
}

// -------------------------------------------------------------- break reminder
export function showBreak(g: Game, onRest: () => void, onKeepPlaying: () => void): void {
  const o = overlay('break');
  o.innerHTML = `<div class="break-card"><div class="big-emoji">⭐🏡☕</div><div class="break-text">Great adventure today!</div>
    <div class="title-btns"><button class="big-btn rest" aria-label="Rest">🛌</button></div>
    <button class="corner-parent keep">Grown-up: keep playing</button></div>`;
  void g.director.tell('Twinkle', 'star', 'What a great adventure! Time for a cozy break. See you next time!');
  o.querySelector('.rest')!.addEventListener('click', () => { o.remove(); onRest(); });
  o.querySelector('.keep')!.addEventListener('click', () => { o.remove(); onKeepPlaying(); });
}
