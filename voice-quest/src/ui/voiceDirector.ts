// The child-facing voice interaction flow.
//   character speaks -> (model) -> mic opens visibly + chime -> child responds -> mic closes -> supportive reaction
// The child can ALWAYS finish: by voice, by picture, or with "continue with help". Rewards are identical.

import type { AttemptLabel, Settings, VoiceMode, VoiceState } from '../types';
import type { PromptTarget } from '../data/content';
import { iconSVG } from '../data/icons';
import { MicMonitor } from '../speech/mic';
import { SimulatedRecognizer, WebSpeechRecognizer, type SpeechRecognizer } from '../speech/recognizers';
import { listenOnce, SimulatedMic, type MicLike, type TurnResult } from '../speech/voiceTurn';
import { VOICES, type Speaker, type VoiceStyle } from '../core/tts';
import type { AudioEngine } from '../core/audio';
import type { Store } from '../core/storage';
import { el } from './dom';

export interface AskOption {
  key: string;
  target: PromptTarget;
}

export interface AskOptions {
  activity: string;
  speaker: { name: string; voice: VoiceStyle; portrait: string };
  /** What the character says first. */
  question: string;
  /** One or more acceptable answers. With several, any of them is a valid answer (e.g. choose a path). */
  options: AskOption[];
  /** Extra pictures shown only as distractors in picture-choice mode. */
  distractors?: string[];
  /** Line spoken on success. May depend on which option was chosen. */
  success: (key: string) => string;
  /** Override the modelling line, e.g. "Say: blue wheel" */
  modelLine?: string;
}

export interface AskResult {
  key: string;
  label: AttemptLabel;
  via: 'voice' | 'activity' | 'picture' | 'help';
  transcript?: string;
}

export interface TurnLog {
  t: number;
  activity: string;
  expected: string;
  accepted: string[];
  mode: VoiceMode;
  sim: boolean;
  turn: TurnResult;
}

type Panel = {
  root: HTMLElement;
  portrait: HTMLElement;
  name: HTMLElement;
  bubble: HTMLElement;
  pics: HTMLElement;
  model: HTMLElement;
  mic: HTMLElement;
  micRing: HTMLElement;
  status: HTMLElement;
  actions: HTMLElement;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class VoiceDirector {
  busy = false;
  /** runtime mode may be downgraded during the session (e.g. permission declined) */
  runtimeMode: VoiceMode;
  runtimeNote = '';
  sim = false;
  simRec = new SimulatedRecognizer();
  private simMic = new SimulatedMic(() => {
    const r = this.simRec.peek(this.expected);
    return r.kind === 'say' || r.kind === 'mumble';
  });
  private realRec = new WebSpeechRecognizer();
  private mic: MicMonitor;
  private panel: Panel;
  private expected = '';
  log: TurnLog[] = [];
  onTurn?: (l: TurnLog) => void;
  onStatus?: (s: string) => void;
  onBurst?: () => void;
  private resolveAction: ((a: string) => void) | null = null;

  constructor(
    private store: Store,
    private speaker: Speaker,
    private audio: AudioEngine,
    root: HTMLElement,
  ) {
    this.mic = new MicMonitor(audio.getCtx);
    this.runtimeMode = store.settings.voiceMode;
    this.panel = this.build(root);
  }

  get settings(): Settings {
    return this.store.settings;
  }

  /** Effective mode for this session. */
  get mode(): VoiceMode {
    const s = this.settings;
    if (this.sim) return s.voiceMode;
    if (s.voiceMode === 'pictures' || this.runtimeMode === 'pictures') return 'pictures';
    if (s.voiceMode === 'recognition') {
      // recognition needs explicit parental consent, browser support, and a working service
      if (!s.consentExternal || !this.realRec.available() || this.runtimeMode === 'activity') return 'activity';
      return 'recognition';
    }
    return 'activity';
  }

  /** Called when the parent changes settings. Clears runtime downgrades. */
  resetRuntime(): void {
    this.runtimeMode = this.settings.voiceMode;
    this.runtimeNote = '';
  }

  recognitionSupported(): boolean {
    return this.realRec.available();
  }

  private get recognizer(): SpeechRecognizer {
    return this.sim ? this.simRec : this.realRec;
  }
  private get micDev(): MicLike {
    return this.sim ? this.simMic : this.mic;
  }

  private build(root: HTMLElement): Panel {
    const p: Panel = {
      root: el('div', { class: 'vd hidden', role: 'dialog', 'aria-live': 'polite' }),
      portrait: el('div', { class: 'vd-portrait' }),
      name: el('div', { class: 'vd-name' }),
      bubble: el('div', { class: 'vd-bubble' }),
      pics: el('div', { class: 'vd-pics' }),
      model: el('div', { class: 'vd-model' }),
      mic: el('button', { class: 'vd-mic', 'aria-label': 'Microphone' }),
      micRing: el('div', { class: 'vd-mic-ring' }),
      status: el('div', { class: 'vd-status' }),
      actions: el('div', { class: 'vd-actions' }),
    };
    p.mic.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z"/></svg>`;
    p.mic.prepend(p.micRing);
    const head = el('div', { class: 'vd-head' }, [p.portrait, p.name]);
    const left = el('div', { class: 'vd-left' }, [head, p.bubble]);
    const center = el('div', { class: 'vd-center' }, [p.pics, p.model]);
    const right = el('div', { class: 'vd-right' }, [p.mic, p.status]);
    const card = el('div', { class: 'vd-card' }, [left, center, right]);
    p.root.append(card, p.actions);
    root.append(p.root);
    p.mic.addEventListener('click', () => this.resolveAction?.('mic'));
    return p;
  }

  private show(o: AskOptions): void {
    const p = this.panel;
    p.root.classList.remove('hidden');
    p.portrait.innerHTML = iconSVG(o.speaker.portrait);
    p.name.textContent = o.speaker.name;
    p.actions.innerHTML = '';
    p.status.textContent = '';
    this.setMic('off');
  }

  private hide(): void {
    this.panel.root.classList.add('hidden');
    this.panel.actions.innerHTML = '';
  }

  private caption(text: string): void {
    this.panel.bubble.textContent = text;
    this.panel.bubble.style.visibility = this.settings.captions ? 'visible' : 'hidden';
  }

  private async say(text: string, voice: VoiceStyle, speakerTalking = true): Promise<void> {
    this.caption(text);
    this.panel.portrait.classList.toggle('talking', speakerTalking);
    this.audio.setDuck(true);
    await this.speaker.speak(text, voice);
    this.panel.portrait.classList.remove('talking');
  }

  private setMic(state: 'off' | 'listening' | 'ready' | 'blocked'): void {
    const m = this.panel.mic;
    m.className = `vd-mic ${state}`;
    m.setAttribute('aria-label', state === 'listening' ? 'Listening' : 'Microphone');
    this.panel.status.innerHTML = state === 'listening' ? '<span class="dot"></span> Listening' : '';
    this.onStatus?.(state);
  }

  private renderPictures(o: AskOptions, mode: 'targets' | 'choice'): HTMLElement[] {
    const p = this.panel;
    p.pics.innerHTML = '';
    const cards: HTMLElement[] = [];
    let keys: { key: string; pic: string }[] = o.options.map((op) => ({ key: op.key, pic: op.target.picture }));
    if (mode === 'choice' && o.options.length === 1 && o.distractors?.length) {
      keys = [...keys, ...o.distractors.slice(0, 2).map((d) => ({ key: `x:${d}`, pic: d }))];
      keys.sort(() => Math.random() - 0.5);
    }
    for (const k of keys) {
      const c = el('button', { class: `vd-pic ${mode}`, 'data-key': k.key });
      c.innerHTML = iconSVG(k.pic);
      if (mode === 'choice') c.addEventListener('click', () => this.resolveAction?.(`pick:${k.key}`));
      else c.addEventListener('click', () => this.resolveAction?.(`hear:${k.key}`));
      p.pics.append(c);
      cards.push(c);
    }
    p.pics.classList.toggle('single', keys.length === 1);
    return cards;
  }

  private showModel(o: AskOptions): void {
    const showText = this.settings.prompting !== 'picture-cue';
    this.panel.model.textContent = showText ? o.options.map((op) => op.target.model).join('  ·  ') : '';
  }

  private actionButtons(list: { id: string; icon: string; label: string; glow?: boolean }[]): void {
    const a = this.panel.actions;
    a.innerHTML = '';
    for (const b of list) {
      const btn = el('button', { class: `vd-act${b.glow ? ' glow' : ''}`, 'aria-label': b.label, title: b.label });
      btn.innerHTML = `<span class="ico">${b.icon}</span><span class="lbl">${b.label}</span>`;
      btn.addEventListener('click', () => {
        this.audio.sfx('click');
        this.resolveAction?.(b.id);
      });
      a.append(btn);
    }
  }

  private waitAction(): Promise<string> {
    return new Promise((r) => (this.resolveAction = (a) => { this.resolveAction = null; r(a); }));
  }

  private async model(o: AskOptions): Promise<void> {
    const t = o.options[0].target;
    if (o.options.length > 1) {
      await this.say(o.modelLine ?? `You can say: ${o.options.map((x) => x.target.modelSpoken).join(', or ')}.`, VOICES.model, false);
    } else if (t.mode === 'activity') {
      await this.say(o.modelLine ?? `Let's make the sound: ${t.modelSpoken}... ${t.modelSpoken}!`, VOICES.model, false);
    } else {
      await this.say(o.modelLine ?? `Say: ${t.modelSpoken}`, VOICES.model, false);
    }
  }

  private async listen(o: AskOptions): Promise<TurnResult> {
    const mode = this.mode;
    // combined spec over all options; we figure out which option matched afterwards
    const t0 = o.options[0].target;
    this.expected = t0.modelSpoken;
    this.audio.setDuck(true);
    this.speaker.cancel(); // never listen while the game is speaking
    this.audio.sfx('listenOn');
    await sleep(350); // let the chime finish before opening the mic
    this.setMic('listening');
    this.caption('🎤 …');
    const optionResults: TurnResult[] = [];
    const turn = await listenOnce({
      mic: this.micDev,
      recognizer: mode === 'recognition' ? this.recognizer : null,
      mode,
      lang: this.settings.lang,
      listenMs: this.settings.listenSeconds * 1000,
      spec: {
        accept: o.options.flatMap((x) => x.target.accept),
        keywords: o.options.flatMap((x) => x.target.keywords),
        mode: o.options.every((x) => x.target.mode === 'activity') ? 'activity' : o.options.some((x) => x.target.mode === 'phrase') ? 'phrase' : 'keywords',
        generous: this.settings.generousMatching,
      },
      expected: this.expected,
      onLevel: (lv) => {
        this.panel.micRing.style.transform = `scale(${1 + lv * 1.6})`;
        this.panel.micRing.style.opacity = String(0.35 + lv);
      },
    });
    void optionResults;
    if (this.sim && mode !== 'recognition') this.simRec.queue.shift(); // keep the simulated queue in step
    this.setMic('off');
    this.audio.sfx('listenOff');
    const log: TurnLog = { t: Date.now(), activity: o.activity, expected: o.options.map((x) => x.target.model).join(' | '), accepted: o.options.flatMap((x) => x.target.accept), mode, sim: this.sim, turn };
    this.log.push(log);
    if (this.log.length > 200) this.log.shift();
    this.onTurn?.(log);

    // Runtime downgrades so the child is never stuck retrying something that cannot work.
    if (!this.sim) {
      if (turn.micStatus === 'denied' || turn.micStatus === 'no-mic' || turn.micStatus === 'unsupported' || turn.micStatus === 'insecure') {
        this.runtimeMode = 'pictures';
        this.runtimeNote = `Microphone unavailable (${turn.micStatus}). Using pictures for this session.`;
      } else if (mode === 'recognition' && turn.recognizerError && ['network', 'service-not-allowed', 'not-allowed', 'language-not-supported', 'not-supported'].includes(turn.recognizerError)) {
        this.runtimeMode = 'activity';
        this.runtimeNote = `Speech recognition unavailable (${turn.recognizerError}). Using local voice detection for this session.`;
      }
    }
    return turn;
  }

  /** Which option a turn matched (by checking each option's own target). */
  private matchedKey(o: AskOptions, turn: TurnResult): string {
    if (o.options.length === 1 || !turn.match?.matched) return o.options[0].key;
    const said = (turn.match.transcript ?? '').toLowerCase();
    for (const op of o.options) {
      if (op.target.keywords.some((k) => said.includes(k.toLowerCase()))) return op.key;
    }
    return o.options[0].key;
  }

  private record(o: AskOptions, key: string, label: AttemptLabel, state: VoiceState, tries: number, transcripts: string[], matched?: string): void {
    const t = (o.options.find((x) => x.key === key) ?? o.options[0]).target;
    this.store.logAttempt({ t: Date.now(), activity: o.activity, target: t.model, level: t.level, mode: this.mode, state, label, tries, transcripts: this.mode === 'recognition' ? transcripts.slice(0, 3) : [], matchedText: matched });
  }

  /** Voice moments are serialized so two characters never talk (or listen) at once. */
  private chain: Promise<unknown> = Promise.resolve();
  /** Bumped on scene change; queued narration from an old scene is dropped. */
  generation = 0;
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Run one complete communication moment. Always resolves with a completion. */
  ask(o: AskOptions): Promise<AskResult> {
    return this.enqueue(() => this.askNow(o));
  }

  private async askNow(o: AskOptions): Promise<AskResult> {
    this.busy = true;
    this.show(o);
    this.renderPictures(o, 'targets');
    this.showModel(o);
    const prompting = this.settings.prompting;
    try {
      await this.say(o.question, o.speaker.voice);
      if (this.mode !== 'pictures' && prompting === 'model-first') await this.model(o);

      let tries = 0;
      const transcripts: string[] = [];
      let lastState: VoiceState = 'unavailable';
      let next: 'listen' | 'menu' | 'choice' = this.mode === 'pictures' ? 'choice' : 'listen';

      while (true) {
        if (next === 'listen') {
          if (this.mode === 'pictures') { next = 'choice'; continue; }
          tries++;
          const turn = await this.listen(o);
          transcripts.push(...turn.transcripts);
          lastState = turn.state;
          if (turn.success) {
            const key = this.matchedKey(o, turn);
            const label: AttemptLabel = turn.activityOnly ? 'Practiced' : 'Recognized';
            this.record(o, key, label, turn.state, tries, transcripts, turn.match?.matchedText);
            this.audio.sfx('cheer');
            this.onBurst?.();
            this.panel.root.classList.add('yay');
            await this.say(turn.activityOnly ? `I heard you! ${o.success(key)}` : o.success(key), o.speaker.voice);
            this.panel.root.classList.remove('yay');
            return { key, label, via: turn.activityOnly ? 'activity' : 'voice', transcript: turn.match?.transcript };
          }
          this.record(o, o.options[0].key, 'Tried again', turn.state, tries, transcripts);
          if (turn.state === 'unavailable') {
            await this.say("Let's use pictures! Tap the right one.", VOICES.twinkle);
            next = 'choice';
            continue;
          }
          if (turn.state === 'heard') {
            this.audio.sfx('soft');
            await this.say("I heard you! Let's try it together!", o.speaker.voice);
            if (prompting !== 'picture-cue') await this.model(o);
          } else {
            await this.say('Ready when you are!', o.speaker.voice);
          }
          next = 'menu';
          continue;
        }

        if (next === 'menu') {
          const glowHelp = tries >= this.settings.maxTries;
          this.setMic('ready');
          this.actionButtons([
            { id: 'hear', icon: '🔊', label: 'Hear it' },
            { id: 'mic', icon: '🎤', label: 'Try again', glow: !glowHelp },
            { id: 'choice', icon: '🖼️', label: 'Pictures' },
            { id: 'help', icon: '➡️', label: 'Keep going', glow: glowHelp },
          ]);
          const a = await this.waitAction();
          this.panel.actions.innerHTML = '';
          if (a === 'hear' || a.startsWith('hear:')) {
            await this.say(o.question, o.speaker.voice);
            await this.model(o);
            continue; // back to menu
          }
          if (a === 'mic') { next = 'listen'; continue; }
          if (a === 'choice') { next = 'choice'; continue; }
          if (a === 'help') {
            const key = o.options[0].key;
            this.record(o, key, 'Completed with help', lastState, tries, transcripts);
            this.audio.sfx('cheer');
            this.onBurst?.();
            await this.say(`We did it together! ${o.success(key)}`, o.speaker.voice);
            return { key, label: 'Completed with help', via: 'help' };
          }
          continue;
        }

        // picture choice
        this.setMic(this.mode === 'pictures' ? 'blocked' : 'ready');
        const cards = this.renderPictures(o, 'choice');
        this.caption(o.options.length > 1 ? 'Tap a picture!' : 'Tap the right picture!');
        this.actionButtons(this.mode === 'pictures' ? [{ id: 'hear', icon: '🔊', label: 'Hear it' }] : [
          { id: 'hear', icon: '🔊', label: 'Hear it' },
          { id: 'mic', icon: '🎤', label: 'Say it' },
        ]);
        if (this.mode === 'pictures') await this.say(o.options.length > 1 ? 'Tap a picture!' : `Tap the ${o.options[0].target.model}!`, VOICES.twinkle);
        let misses = 0;
        while (true) {
          const a = await this.waitAction();
          if (a === 'hear') {
            await this.say(o.question, o.speaker.voice);
            await this.model(o);
            continue;
          }
          if (a === 'mic') { next = 'listen'; break; }
          if (a.startsWith('pick:')) {
            const key = a.slice(5);
            if (key.startsWith('x:')) {
              misses++;
              this.audio.sfx('soft');
              const right = cards.find((c) => !c.dataset.key?.startsWith('x:'));
              right?.classList.add('hint');
              await this.say(`Ooh, that's a fun one! Let's find the ${o.options[0].target.model}.`, o.speaker.voice);
              if (misses >= 2) right?.classList.add('hint-strong');
              continue;
            }
            const label: AttemptLabel = tries > 0 ? 'Completed with help' : 'Picture choice';
            this.record(o, key, label, lastState, tries, transcripts);
            this.audio.sfx('cheer');
            this.onBurst?.();
            await this.say(o.success(key), o.speaker.voice);
            return { key, label, via: 'picture' };
          }
        }
        this.renderPictures(o, 'targets');
        this.panel.actions.innerHTML = '';
      }
    } finally {
      this.audio.setDuck(false);
      this.hide();
      this.busy = false;
    }
  }

  /** Simple line from a character with no response needed (narration). */
  tell(name: string, portrait: string, text: string, voice: VoiceStyle = VOICES.twinkle): Promise<void> {
    const gen = this.generation;
    return this.enqueue(() => (gen === this.generation ? this.tellNow(name, portrait, text, voice) : Promise.resolve()));
  }

  private async tellNow(name: string, portrait: string, text: string, voice: VoiceStyle): Promise<void> {
    this.busy = true;
    const p = this.panel;
    p.root.classList.remove('hidden');
    p.root.classList.add('tell');
    p.portrait.innerHTML = iconSVG(portrait);
    p.name.textContent = name;
    p.pics.innerHTML = '';
    p.model.textContent = '';
    p.actions.innerHTML = '';
    this.setMic('off');
    try {
      await this.say(text, voice);
    } finally {
      p.root.classList.remove('tell');
      this.audio.setDuck(false);
      this.hide();
      this.busy = false;
    }
  }

  /**
   * Free voice moment (music corner): open the mic for a few seconds and report live loudness.
   * Local activity detection only — nothing is recognised or stored.
   */
  voicePlay(seconds: number, onLevel: (lv: number, voiced: boolean) => void): Promise<boolean> {
    return this.enqueue(() => this.voicePlayNow(seconds, onLevel));
  }

  private async voicePlayNow(seconds: number, onLevel: (lv: number, voiced: boolean) => void): Promise<boolean> {
    if (this.mode === 'pictures') return false;
    const dev = this.micDev;
    this.audio.sfx('listenOn');
    await sleep(350);
    const st = await dev.open();
    if (st !== 'open') {
      dev.close();
      if (!this.sim) { this.runtimeMode = 'pictures'; this.runtimeNote = `Microphone unavailable (${st}).`; }
      return false;
    }
    this.onStatus?.('listening');
    const end = performance.now() + seconds * 1000;
    let any = false;
    while (performance.now() < end) {
      await sleep(40);
      onLevel(dev.level, dev.voicedNow);
      if (dev.voicedNow) any = true;
    }
    const r = dev.close();
    this.onStatus?.('off');
    this.audio.sfx('listenOff');
    return any || r.speechDetected;
  }
}
