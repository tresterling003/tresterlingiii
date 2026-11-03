// ================= AUDIO (synthesized, no files) =================
const AUDIO = {
  ctx: null, master: null, crowdGain: null, crowdFilter: null, murmurGain: null, noise: null, ready: false, intensity: 0.2, clapTimer: 0, chant: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = SETTINGS.sound ? 0.9 : 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    // noise buffers
    const len = c.sampleRate * 3; const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; } }
    this.noise = buf;
    const wbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const wd = wbuf.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1; this.white = wbuf;
    // crowd bed: two filtered noise layers
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.crowdFilter = c.createBiquadFilter(); this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 700; this.crowdFilter.Q.value = 0.6;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0.0;
    src.connect(this.crowdFilter); this.crowdFilter.connect(this.crowdGain); this.crowdGain.connect(this.master);
    const src2 = c.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.7;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; this.murmurGain = c.createGain(); this.murmurGain.gain.value = 0.0;
    src2.connect(lp); lp.connect(this.murmurGain); this.murmurGain.connect(this.master);
    src.start(); src2.start(0, 1.3);
    this.ready = true;
  },
  setEnabled(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05); },
  update(dt, target) {
    if (!this.ready) return;
    this.intensity = damp(this.intensity, target, 1.5, dt);
    const t = this.ctx.currentTime, i = this.intensity;
    this.crowdGain.gain.setTargetAtTime(0.05 + i * 0.32, t, 0.15);
    this.murmurGain.gain.setTargetAtTime(0.18 + i * 0.12, t, 0.2);
    this.crowdFilter.frequency.setTargetAtTime(600 + i * 700, t, 0.2);
    if (this.chant) { this.clapTimer -= dt; if (this.clapTimer <= 0) { this.clapPattern(); this.clapTimer = 2.4; } }
  },
  env(node, t, a, peak, d) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  noiseHit({ t = 0, freq = 1000, q = 1, type = 'bandpass', peak = 0.5, a = 0.004, d = 0.12, rate = 1, sweepTo = null }) {
    if (!this.ready) return; const c = this.ctx; const t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.white; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + a + d);
    const g = c.createGain(); this.env(g, t0, a, peak, d);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + a + d + 0.05);
  },
  tone({ t = 0, f0 = 200, f1 = null, type = 'sine', peak = 0.4, a = 0.005, d = 0.2, detune = 0 }) {
    if (!this.ready) return; const c = this.ctx; const t0 = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.detune.value = detune; if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + a + d);
    const g = c.createGain(); this.env(g, t0, a, peak, d); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + a + d + 0.05);
  },
  whistle(len = 0.45, t = 0) {
    if (!this.ready) return; const c = this.ctx; const t0 = c.currentTime + t;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.setValueAtTime(0.25, t0 + len - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    const trem = c.createOscillator(); trem.frequency.value = 34; const tg = c.createGain(); tg.gain.value = 0.35; trem.connect(tg);
    const am = c.createGain(); am.gain.value = 0.65; tg.connect(am.gain);
    for (const f of [2750, 2810]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(am); o.start(t0); o.stop(t0 + len + 0.05); }
    am.connect(g); g.connect(this.master); trem.start(t0); trem.stop(t0 + len + 0.05);
  },
  throw(power) { this.noiseHit({ freq: 2400, sweepTo: 500, q: 1.2, peak: 0.12 + power * 0.18, a: 0.02, d: 0.22 }); },
  hit(power) { this.noiseHit({ freq: 1600, type: 'lowpass', q: 0.7, peak: 0.6 + power * 0.3, d: 0.09 }); this.tone({ f0: 150, f1: 48, peak: 0.6, d: 0.16 }); this.noiseHit({ t: 0.01, freq: 3200, q: 2, peak: 0.15, d: 0.05 }); },
  catch() { this.tone({ f0: 120, f1: 60, peak: 0.6, d: 0.12 }); this.noiseHit({ freq: 900, type: 'lowpass', peak: 0.5, d: 0.06 }); this.noiseHit({ t: 0.03, freq: 2600, q: 3, peak: 0.12, d: 0.04 }); },
  block() { this.tone({ f0: 210, f1: 90, peak: 0.45, d: 0.1 }); this.noiseHit({ freq: 1200, type: 'lowpass', peak: 0.55, d: 0.07 }); },
  bounce(v) { const p = clamp(v / 10, 0.05, 0.45); this.tone({ f0: 110, f1: 60, peak: p, d: 0.08 }); this.noiseHit({ freq: 700, type: 'lowpass', peak: p * 0.6, d: 0.04 }); },
  step() { this.noiseHit({ freq: 3000, q: 3, peak: 0.03, d: 0.03 }); },
  squeak() { this.tone({ f0: 1900 + Math.random() * 600, f1: 2600, type: 'sawtooth', peak: 0.025, a: 0.01, d: 0.08 }); },
  cheer(mag = 1, t = 0) { this.noiseHit({ t, freq: 900, q: 0.5, peak: 0.25 + mag * 0.35, a: 0.18, d: 1.4 + mag }); this.noiseHit({ t: t + 0.05, freq: 1900, q: 0.8, peak: 0.08 + mag * 0.12, a: 0.25, d: 1.1 + mag * 0.8 }); },
  ooh(t = 0) { this.noiseHit({ t, freq: 320, sweepTo: 520, q: 3, peak: 0.35, a: 0.15, d: 0.9 }); },
  groan() { this.noiseHit({ freq: 500, sweepTo: 260, q: 2.5, peak: 0.3, a: 0.1, d: 1.0 }); },
  clap(t = 0) { for (let i = 0; i < 4; i++) this.noiseHit({ t: t + Math.random() * 0.03, freq: 1500 + Math.random() * 900, q: 1.4, peak: 0.12, a: 0.002, d: 0.05 }); },
  clapPattern() { [0, 0.3, 0.9, 1.2, 1.5].forEach(t => this.clap(t)); },
  horn() { [174.6, 220, 261.6].forEach((f, i) => this.tone({ f0: f, type: 'sawtooth', peak: 0.1, a: 0.04, d: 1.5, detune: i * 4 })); },
  ui() { this.tone({ f0: 880, f1: 1320, type: 'triangle', peak: 0.06, d: 0.06 }); },
  uiBack() { this.tone({ f0: 660, f1: 440, type: 'triangle', peak: 0.06, d: 0.06 }); },
  sting() { this.tone({ f0: 196, type: 'sawtooth', peak: 0.08, a: 0.01, d: 0.5 }); this.tone({ t: 0.12, f0: 293.7, type: 'sawtooth', peak: 0.08, a: 0.01, d: 0.6 }); this.noiseHit({ freq: 200, type: 'lowpass', peak: 0.5, d: 0.5 }); this.tone({ f0: 80, f1: 40, peak: 0.7, d: 0.5 }); },
};
