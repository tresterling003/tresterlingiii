// Spoken prompts via the browser's speech synthesis (local voices on most systems).
// The game never listens while this is speaking.

export interface VoiceStyle {
  pitch: number;
  rate: number;
}

export const VOICES: Record<string, VoiceStyle> = {
  twinkle: { pitch: 1.45, rate: 0.95 }, // guide fairy
  snowman: { pitch: 0.8, rate: 0.88 },
  robot: { pitch: 1.2, rate: 0.9 },
  reindeer: { pitch: 1.1, rate: 0.95 },
  letter: { pitch: 1.3, rate: 0.9 },
  model: { pitch: 1.1, rate: 0.75 }, // slow, clear word model
  narrator: { pitch: 1.05, rate: 0.92 },
};

export class Speaker {
  speaking = false;
  volume = 1;
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  lang = 'en-US';
  onSpeakingChange?: (s: boolean) => void;
  private seq = 0;

  constructor() {
    if (!('speechSynthesis' in window)) {
      this.enabled = false;
      return;
    }
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      const langPrefix = this.lang.slice(0, 2);
      const prefs = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Karen', 'Moira', 'Tessa', 'Google UK English Female'];
      const local = vs.filter((v) => v.lang.startsWith(langPrefix));
      this.voice = prefs.map((p) => local.find((v) => v.name.includes(p))).find(Boolean) ?? local.find((v) => v.localService) ?? local[0] ?? vs[0] ?? null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  get available(): boolean {
    return this.enabled;
  }

  /** Speak and resolve when finished (with a duration-based safety timeout). */
  speak(text: string, style: VoiceStyle = VOICES.narrator): Promise<void> {
    if (!this.enabled || !text.trim() || this.volume <= 0.001) {
      // still wait a moment so pacing feels natural for captions
      return new Promise((r) => setTimeout(r, Math.min(2500, 400 + text.length * 35)));
    }
    const my = ++this.seq;
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang ?? this.lang;
      u.pitch = style.pitch;
      u.rate = style.rate;
      u.volume = Math.max(0, Math.min(1, this.volume));
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (my === this.seq) this.setSpeaking(false);
        // small gap so the end of TTS never bleeds into the microphone window
        setTimeout(resolve, 250);
      };
      u.onend = finish;
      u.onerror = finish;
      const timer = setTimeout(finish, 2500 + (text.split(/\s+/).length * 520) / style.rate);
      this.setSpeaking(true);
      speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    this.seq++;
    if (this.enabled) speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  private setSpeaking(s: boolean): void {
    this.speaking = s;
    this.onSpeakingChange?.(s);
  }
}
