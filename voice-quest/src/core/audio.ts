// Web Audio engine: synthesized sound effects + an original procedural music sequencer.
// All music here is composed for this game (original melodies), synthesized live — no samples.

import type { Volumes } from '../types';

type SongName = 'village' | 'factory' | 'dash' | 'cabin' | 'none';

interface Song {
  bpm: number;
  melody: string; // tokens per 8th note: note name, '-' hold, '.' rest, '|' ignored
  chords: string[]; // one per bar (8 eighths)
  drums: 'soft' | 'bounce' | 'drive' | 'none';
  lead: 'bell' | 'flute' | 'pluck';
}

const SONGS: Record<Exclude<SongName, 'none'>, Song> = {
  village: {
    bpm: 96,
    melody:
      'E5 - G5 - C6 - B5 A5 | G5 - - - E5 - . . | F5 - A5 - D6 - C6 B5 | A5 - - - G5 - . . | E5 - G5 - C6 - D6 E6 | D6 - C6 - A5 - G5 - | F5 E5 D5 - G5 - B4 - | C5 - - - . . . .',
    chords: ['C', 'Am', 'Dm', 'G', 'C', 'F', 'G', 'C'],
    drums: 'soft',
    lead: 'bell',
  },
  factory: {
    bpm: 118,
    melody:
      'G4 . G4 . C5 . E5 . | D5 . B4 . G4 - - . | A4 . A4 . D5 . F5 . | E5 . C5 . G4 - - . | C5 . E5 . G5 . E5 . | F5 . D5 . B4 - - . | C5 D5 E5 F5 G5 . E5 . | C5 - - - . . . .',
    chords: ['C', 'G', 'Dm', 'C', 'C', 'G', 'G', 'C'],
    drums: 'bounce',
    lead: 'pluck',
  },
  dash: {
    bpm: 132,
    melody: 'C5 E5 G5 C6 . G5 E5 . | D5 F5 A5 D6 . A5 F5 . | E5 G5 B5 E6 . B5 G5 . | C6 . G5 . E5 . G5 . | A5 - G5 - F5 - E5 - | D5 - E5 - F5 - G5 - | E5 C5 E5 G5 C6 - B5 - | C6 - - - . . . .',
    chords: ['C', 'Dm', 'Em', 'C', 'F', 'G', 'C', 'C'],
    drums: 'drive',
    lead: 'bell',
  },
  cabin: {
    bpm: 76,
    melody: 'G4 - C5 - E5 - - - | D5 - C5 - A4 - - - | F4 - A4 - C5 - - - | B4 - - - G4 - - - | E5 - D5 - C5 - - - | A4 - C5 - F5 - - - | E5 - D5 - B4 - G4 - | C5 - - - - - - -',
    chords: ['C', 'Am', 'F', 'G', 'C', 'F', 'G', 'C'],
    drums: 'none',
    lead: 'flute',
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export function noteToMidi(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 60;
  return NOTE_INDEX[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS: Record<string, number[]> = {
  C: [0, 4, 7], Dm: [2, 5, 9], Em: [4, 7, 11], F: [5, 9, 12], G: [7, 11, 14], Am: [9, 12, 16],
};

interface ParsedNote { step: number; len: number; midi: number }

export function parseMelody(s: string): { notes: ParsedNote[]; steps: number } {
  const toks = s.split(/\s+/).filter((t) => t && t !== '|');
  const notes: ParsedNote[] = [];
  toks.forEach((t, i) => {
    if (t === '-') {
      if (notes.length && notes[notes.length - 1].step + notes[notes.length - 1].len === i) notes[notes.length - 1].len++;
    } else if (t !== '.') notes.push({ step: i, len: 1, midi: noteToMidi(t) });
  });
  return { notes, steps: toks.length };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private vols: Volumes = { master: 0.8, music: 0.5, voice: 1, sfx: 0.7 };
  private song: SongName = 'none';
  private wanted: SongName = 'none';
  private nextStep = 0;
  private nextTime = 0;
  private parsed: ReturnType<typeof parseMelody> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private duck = 1;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.timer = setInterval(() => this.schedule(), 50);
      if (this.wanted !== 'none') this.playSong(this.wanted);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  getCtx = (): AudioContext => this.unlock();

  setVolumes(v: Volumes): void {
    this.vols = { ...v };
    this.applyVolumes();
  }
  get volumes(): Volumes {
    return this.vols;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vols.music * 0.55 * this.duck, t, 0.15);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, t, 0.05);
  }

  /** Lower the music while characters speak or the child is answering. */
  setDuck(on: boolean): void {
    this.duck = on ? 0.25 : 1;
    this.applyVolumes();
  }

  playSong(name: SongName): void {
    this.wanted = name;
    if (!this.ctx) return;
    if (this.song === name) return;
    this.song = name;
    this.parsed = name === 'none' ? null : parseMelody(SONGS[name].melody);
    this.nextStep = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
  }

  private schedule(): void {
    if (!this.ctx || !this.parsed || this.song === 'none') return;
    const song = SONGS[this.song as Exclude<SongName, 'none'>];
    const stepDur = 60 / song.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const step = this.nextStep % this.parsed.steps;
      const t = this.nextTime;
      for (const n of this.parsed.notes) if (n.step === step) this.lead(song.lead, midiToHz(n.midi), t, n.len * stepDur);
      const bar = Math.floor(step / 8) % song.chords.length;
      const chord = CHORDS[song.chords[bar]] ?? CHORDS.C;
      const inBar = step % 8;
      if (inBar === 0) {
        this.pad(chord, t, stepDur * 8);
        this.bass(midiToHz(36 + chord[0]), t, stepDur * 3);
      }
      if (inBar === 4) this.bass(midiToHz(36 + chord[song.drums === 'none' ? 0 : 2] - (song.drums === 'none' ? 0 : 12)), t, stepDur * 3);
      if (song.drums !== 'none') this.drums(song.drums, inBar, t);
      this.nextStep++;
      this.nextTime += stepDur;
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.02, dur));
  }

  private lead(kind: Song['lead'], hz: number, t: number, dur: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.connect(this.musicBus);
    if (kind === 'bell') {
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      o1.type = 'sine';
      o2.type = 'sine';
      o1.frequency.value = hz;
      o2.frequency.value = hz * 2.01;
      const g2 = c.createGain();
      g2.gain.value = 0.3;
      o1.connect(g);
      o2.connect(g2).connect(g);
      this.env(g, t, 0.005, 0.16, Math.max(0.5, dur * 1.4));
      o1.start(t); o2.start(t); o1.stop(t + dur * 1.5 + 0.6); o2.stop(t + dur * 1.5 + 0.6);
    } else if (kind === 'flute') {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 5;
      lg.gain.value = hz * 0.006;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.08);
      g.gain.setValueAtTime(0.11, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.3); lfo.stop(t + dur + 0.3);
    } else {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = hz;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(600, t + 0.2);
      o.connect(f).connect(g);
      this.env(g, t, 0.004, 0.07, Math.max(0.18, dur));
      o.start(t); o.stop(t + dur + 0.3);
    }
  }

  private pad(chord: number[], t: number, dur: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.connect(this.musicBus);
    f.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.4);
    g.gain.setValueAtTime(0.035, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    for (const n of chord) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToHz(60 + n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
  }

  private bass(hz: number, t: number, dur: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz;
    const g = c.createGain();
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.01, 0.22, dur);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private noise(t: number, dur: number, freq: number, gain: number, bus: GainNode, type: BiquadFilterType = 'highpass'): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    s.connect(f).connect(g).connect(bus);
    this.env(g, t, 0.003, gain, dur);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  private drums(kind: Song['drums'], inBar: number, t: number): void {
    if (inBar % 2 === 1) this.noise(t, 0.05, 7000, kind === 'drive' ? 0.05 : 0.03, this.musicBus);
    if (kind === 'soft') return;
    if (inBar === 0 || inBar === 4 || (kind === 'drive' && (inBar === 2 || inBar === 6))) {
      const c = this.ctx!;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = c.createGain();
      o.connect(g).connect(this.musicBus);
      this.env(g, t, 0.003, 0.3, 0.16);
      o.start(t);
      o.stop(t + 0.2);
    }
    if (inBar === 2 || inBar === 6) this.noise(t, 0.09, 1800, 0.06, this.musicBus, 'bandpass');
  }

  // ---------------- sound effects ----------------
  private tone(hz: number, t: number, dur: number, type: OscillatorType, gain: number, glideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = c.createGain();
    o.connect(g).connect(this.sfxBus);
    this.env(g, t, 0.005, gain, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  sfx(name: 'jump' | 'coin' | 'star' | 'listenOn' | 'listenOff' | 'cheer' | 'pop' | 'whoosh' | 'step' | 'click' | 'soft' | 'thump' | 'bell' | 'build' | 'magic' | 'land', p = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'jump': this.tone(330, t, 0.18, 'triangle', 0.2, 660); break;
      case 'land': this.noise(t, 0.08, 500, 0.12, this.sfxBus, 'lowpass'); break;
      case 'coin': this.tone(988, t, 0.08, 'square', 0.06); this.tone(1319, t + 0.07, 0.18, 'square', 0.06); break;
      case 'star':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midiToHz(76 + s), t + i * 0.06, 0.35, 'sine', 0.13));
        break;
      case 'listenOn': this.tone(660, t, 0.12, 'sine', 0.18); this.tone(990, t + 0.11, 0.2, 'sine', 0.18); break;
      case 'listenOff': this.tone(880, t, 0.12, 'sine', 0.14); this.tone(587, t + 0.1, 0.2, 'sine', 0.14); break;
      case 'cheer':
        [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(midiToHz(67 + s), t + i * 0.09, 0.3, 'triangle', 0.14));
        this.noise(t + 0.55, 0.6, 5000, 0.04, this.sfxBus);
        break;
      case 'pop': this.tone(500 + p * 200, t, 0.09, 'sine', 0.2, 1200 + p * 300); break;
      case 'whoosh': this.noise(t, 0.35, 1200, 0.1, this.sfxBus, 'bandpass'); break;
      case 'step': this.noise(t, 0.05, 900 + Math.random() * 400, 0.025, this.sfxBus, 'lowpass'); break;
      case 'click': this.tone(1200, t, 0.04, 'sine', 0.08); break;
      case 'soft': this.tone(523, t, 0.25, 'sine', 0.1); this.tone(659, t + 0.12, 0.3, 'sine', 0.1); break;
      case 'thump': this.tone(160, t, 0.15, 'sine', 0.25, 70); this.noise(t, 0.12, 700, 0.08, this.sfxBus, 'lowpass'); break;
      case 'bell': {
        const hz = p || 880;
        this.tone(hz, t, 1.2, 'sine', 0.16);
        this.tone(hz * 2.76, t, 0.6, 'sine', 0.05);
        this.tone(hz * 5.4, t, 0.25, 'sine', 0.02);
        break;
      }
      case 'build': this.tone(220, t, 0.06, 'square', 0.06); this.tone(330, t + 0.06, 0.06, 'square', 0.06); this.noise(t, 0.06, 2500, 0.05, this.sfxBus, 'bandpass'); break;
      case 'magic':
        for (let i = 0; i < 8; i++) this.tone(midiToHz(84 + ((i * 5) % 12)), t + i * 0.035, 0.25, 'sine', 0.05);
        break;
    }
  }

  /** Play a short melodic phrase (used by the Bell Tower and alphabet friends). Returns seconds. */
  phrase(notes: string[], beat = 0.32, kind: 'bell' | 'flute' = 'bell'): number {
    if (!this.ctx) return 0;
    const t = this.ctx.currentTime + 0.05;
    notes.forEach((n, i) => {
      if (n === '.') return;
      const hz = midiToHz(noteToMidi(n));
      if (kind === 'bell') this.sfxBell(hz, t + i * beat);
      else this.lead('flute', hz, t + i * beat, beat * 0.9);
    });
    return notes.length * beat;
  }
  private sfxBell(hz: number, t: number): void {
    this.tone(hz, t, 1.0, 'sine', 0.15);
    this.tone(hz * 2.76, t, 0.5, 'sine', 0.04);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
