// Every sound in the game is synthesised here with WebAudio — no audio files.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  // Browsers only allow audio after a click, so call this from one.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
      // a little echo so howls carry
      this.echo = this.ctx.createDelay(1);
      this.echo.delayTime.value = 0.28;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.35;
      this.echo.connect(fb).connect(this.echo);
      this.echo.connect(this.out);
      this.wind();
    } catch { this.ctx = null; }
  }
  // ---- music: a slow modal theme that picks up drums when you fight. Call music(dt, combat) every frame.
  music(dt, combat) {
    if (!this.ctx || this.muted) return;
    if (!this.mus) {
      this.mus = this.ctx.createGain(); this.mus.gain.value = 0.0; this.mus.connect(this.out);
      const rv = this.ctx.createDelay(1); rv.delayTime.value = 0.37; const fb = this.ctx.createGain(); fb.gain.value = 0.42;
      rv.connect(fb).connect(rv); rv.connect(this.mus); this.musRv = rv;
      this.musT = this.t + 0.5; this.bar = 0; this.combatK = 0;
    }
    this.combatK += ((combat ? 1 : 0) - this.combatK) * Math.min(1, dt * 0.8);
    this.mus.gain.value += (0.32 - this.mus.gain.value) * Math.min(1, dt * 0.3);
    // schedule a bar ahead
    while (this.musT < this.t + 0.6) {
      const D = 0.5, prog = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 61]]; // Dm  Bb  C  A
      const ch = prog[this.bar % 4], fight = this.combatK > 0.5;
      for (const n of ch.slice(0, 3)) this.note(n - 12, this.musT, D * 4, 0.035, 'triangle', true);
      const mel = [ch[3] + 12, ch[2] + 12, ch[3] + 12, ch[1] + 12];
      if (this.bar % 2 === 0 || fight) for (let i = 0; i < 4; i++) if (Math.random() < (fight ? 0.55 : 0.4)) this.note(mel[(i + this.bar) % 4] + (Math.random() < 0.25 ? 2 : 0), this.musT + i * D, D * 1.6, 0.025, 'sine', true);
      if (fight) for (let i = 0; i < 8; i++) this.drum(this.musT + i * D / 2, i % 4 === 0 ? 1 : i % 2 ? 0.35 : 0.6);
      this.musT += D * 4; this.bar++;
    }
  }
  note(midi, at, dur, vol, type = "sine", rv) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.4, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.mus); if (rv) g.connect(this.musRv);
    o.start(at); o.stop(at + dur + 0.05);
  }
  drum(at, k) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110 * (0.7 + k * 0.3), at); o.frequency.exponentialRampToValueAtTime(42, at + 0.25);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.22 * k, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(this.mus); o.start(at); o.stop(at + 0.4);
  }
  crowd() {
    if (!this.ctx) return;
    const n = this.noise(1.4), f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = this.env(0.25, this.t, 0.15, 1.2); n.connect(f).connect(g).connect(this.out); n.start(); n.stop(this.t + 1.5);
  }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.8; }
  get t() { return this.ctx.currentTime; }
  noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
  env(peak, at, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  }
  tone(type, freq, at, attack, decay, peak, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const g = this.env(peak, at, attack, decay);
    o.connect(g).connect(dest || this.out);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
    return o;
  }
  run(fn) { if (this.ctx && !this.muted) { try { fn(this.t + 0.02); } catch { /* audio is optional */ } } }

  wind() {
    const src = this.noise(4);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(this.out);
    src.start();
    lfo.start();
  }
  howl() {
    this.run(t => [0, 7].forEach((cents, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = cents * 5;
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(430 + i * 4, t + 0.7);
      o.frequency.setValueAtTime(430 + i * 4, t + 1.5);
      o.frequency.exponentialRampToValueAtTime(300, t + 2.6);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.5);
      g.gain.setValueAtTime(0.22, t + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(f).connect(g);
      g.connect(this.out);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 3);
    }));
  }
  heartbeat(strength = 1) {
    this.run(t => [0, 0.2].forEach((d, i) => {
      const o = this.tone('sine', 62, t + d, 0.01, 0.22, (i ? 0.5 : 0.8) * strength);
      o.frequency.exponentialRampToValueAtTime(38, t + d + 0.2);
    }));
  }
  slash() {
    this.run(t => {
      const n = this.noise(0.4);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(4200, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
      n.connect(f).connect(this.env(0.9, t, 0.01, 0.32)).connect(this.out);
      n.start(t);
      const o = this.tone('sawtooth', 75, t + 0.05, 0.05, 0.9, 0.35);
      o.frequency.linearRampToValueAtTime(48, t + 0.9);
      const boom = this.tone('sine', 110, t, 0.01, 0.7, 0.9);
      boom.frequency.exponentialRampToValueAtTime(34, t + 0.6);
    });
  }
  boom() {
    this.run(t => {
      const o = this.tone('sine', 100, t, 0.01, 1.1, 0.9);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    });
  }
  drumroll(dur) {
    this.run(t => {
      for (let x = 0; x < dur; x += 0.055) {
        const n = this.noise(0.05);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 240;
        n.connect(f).connect(this.env(0.12 + 0.5 * (x / dur), t + x, 0.004, 0.045)).connect(this.out);
        n.start(t + x);
      }
    });
  }
  tick() { this.run(t => this.tone('square', 880, t, 0.003, 0.05, 0.12)); }
  pop() { this.run(t => { const o = this.tone('sine', 520, t, 0.005, 0.09, 0.1); o.frequency.exponentialRampToValueAtTime(820, t + 0.08); }); }
  bell() {
    this.run(t => [[523, 0.3], [1046, 0.12], [1569, 0.06]].forEach(([f, p]) => {
      const g = this.env(p, t, 0.005, 2.6);
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      g.connect(this.out);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 2.8);
    }));
  }
  chord(notes, type, step, decay, peak) {
    this.run(t => notes.forEach((f, i) => this.tone(type, f, t + i * step, 0.02, decay, peak, i === notes.length - 1 ? this.echo : this.out)));
  }
  sting(kind) {
    if (kind === 'good') this.chord([262, 330, 392, 523, 659], 'triangle', 0.11, 1.2, 0.3);
    else if (kind === 'sad') this.chord([440, 349, 294, 220], 'triangle', 0.3, 1.6, 0.28);
    else if (kind === 'evil') this.chord([98, 139, 165, 233], 'sawtooth', 0.02, 2.4, 0.16);
    else if (kind === 'jester') this.chord([659, 784, 659, 523, 784, 1047], 'square', 0.09, 0.2, 0.12);
    else if (kind === 'calm') this.chord([330, 392, 494], 'sine', 0.14, 1.6, 0.25);
  }
  chime() { this.chord([784, 988, 1175, 1568], 'sine', 0.07, 1.4, 0.2); }
  dice() {
    this.run(t => { for (let i = 0; i < 9; i++) this.tone('square', 500 + Math.random() * 900, t + i * 0.11 + Math.random() * 0.03, 0.002, 0.035, 0.1); });
  }
  hit() {
    this.run(t => {
      const n = this.noise(0.15);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      n.connect(f).connect(this.env(0.8, t, 0.004, 0.13)).connect(this.out);
      n.start(t);
      const o = this.tone('sine', 150, t, 0.004, 0.18, 0.6);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.16);
    });
  }
  swish() {
    this.run(t => {
      const n = this.noise(0.25);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.5;
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
      n.connect(f).connect(this.env(0.35, t, 0.02, 0.2)).connect(this.out);
      n.start(t);
    });
  }
  clang() { this.run(t => [1244, 1865, 2637].forEach((f, i) => this.tone('triangle', f, t, 0.002, 0.5 - i * 0.1, 0.16))); }
  fire() {
    this.run(t => {
      const n = this.noise(0.9);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
      f.frequency.exponentialRampToValueAtTime(200, t + 0.9);
      n.connect(f).connect(this.env(0.9, t, 0.05, 0.8)).connect(this.out);
      n.start(t);
    });
  }
  steps() { this.run(t => { for (let i = 0; i < 6; i++) { const o = this.tone('sine', 90, t + i * 0.3, 0.005, 0.08, 0.25); o.frequency.exponentialRampToValueAtTime(50, t + i * 0.3 + 0.07); } }); }
  crit() { this.run(t => { this.tone('square', 880, t, 0.005, 0.15, 0.18); this.tone('square', 1320, t + 0.06, 0.005, 0.25, 0.16); }); this.hit(); }
  zap() {
    this.run(t => { const o = this.tone('sawtooth', 900, t, 0.005, 0.22, 0.12); o.frequency.exponentialRampToValueAtTime(220, t + 0.2); });
  }
  twang() {
    this.run(t => { const o = this.tone('triangle', 420, t, 0.002, 0.18, 0.25); o.frequency.exponentialRampToValueAtTime(160, t + 0.15); });
    this.swish();
  }
  roar() {
    this.run(t => {
      const n = this.noise(1.2);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(900, t + 0.3);
      f.frequency.linearRampToValueAtTime(200, t + 1.1);
      n.connect(f).connect(this.env(1.0, t, 0.08, 1.0)).connect(this.out);
      n.start(t);
      const o = this.tone('sawtooth', 90, t, 0.1, 1.0, 0.25);
      o.frequency.linearRampToValueAtTime(60, t + 1);
    });
  }
  hoof() { this.run(t => { const o = this.tone('sine', 120, t, 0.002, 0.06, 0.25); o.frequency.exponentialRampToValueAtTime(60, t + 0.05); }); }
  neigh() {
    this.run(t => { const o = this.tone('sawtooth', 700, t, 0.03, 0.7, 0.08); o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1100, t + 0.15); o.frequency.linearRampToValueAtTime(500, t + 0.7); });
  }
  coin() { this.run(t => { this.tone('square', 1568, t, 0.002, 0.08, 0.08); this.tone('square', 2093, t + 0.07, 0.002, 0.18, 0.08); }); }
  hurt() { this.run(t => { const o = this.tone('sawtooth', 220, t, 0.005, 0.16, 0.18); o.frequency.exponentialRampToValueAtTime(110, t + 0.15); }); }
  alarm() { this.run(t => { for (let i = 0; i < 3; i++) { this.tone('square', 880, t + i * 0.3, 0.005, 0.12, 0.1); this.tone('square', 660, t + i * 0.3 + 0.15, 0.005, 0.12, 0.1); } }); }
  whistle() { this.run(t => { const o = this.tone('sine', 1500, t, 0.02, 0.5, 0.15); o.frequency.linearRampToValueAtTime(2300, t + 0.2); o.frequency.linearRampToValueAtTime(1700, t + 0.45); }); }
}
