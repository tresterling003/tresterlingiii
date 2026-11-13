// The score. Generated live with Web Audio and driven by the game:
//  - a low drone bed that is always there, breathing
//  - dissonant string clusters that swell as dread rises and drift from chord to chord
//  - a lone, slightly detuned piano in the empty halls: single notes, a broken lullaby
//  - during a hunt: a slow heartbeat drum, screeching high strings and an endless rising Shepard tone
//  - stingers for scares
// Fear level scales how much of it you get.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[38, 39, 45, 46, 51], [37, 38, 44, 50, 51], [33, 34, 40, 46, 47], [35, 36, 42, 43, 49], [32, 38, 39, 45, 50], [36, 37, 43, 48, 49]];
const LULLABY = [[74, 0], [72, 0.55], [71, 1.1], [67, 1.65], [68, 2.6]]; // a nursery tune that ends on the wrong note

export class Score {
  constructor(audio) { this.a = audio; this.ok = false; this.vol = 0.7; this.fear = 1; this.t = 0; this.chordT = 6; this.pianoT = 9; this.beatT = 0; this.huntK = 0; this.tension = 0; this.sh = 0; }
  init() {
    const a = this.a, ctx = a.ctx; if (!ctx || this.ok) return; this.ok = true;
    this.bus = ctx.createGain(); this.bus.gain.value = this.vol; this.bus.connect(a.master);
    // a long, dark hall reverb of its own
    const len = ctx.sampleRate * 5, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * Math.pow(1 - i / len, 2.4); } }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.9; this.verb.connect(vg); vg.connect(this.bus);
    const now = ctx.currentTime;
    // drone bed
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0; this.droneG.connect(this.bus);
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 160; dlp.Q.value = 2; dlp.connect(this.droneG);
    for (const [f, type, g] of [[36.71, 'sawtooth', 0.22], [36.95, 'sawtooth', 0.2], [55.0, 'triangle', 0.25], [77.78, 'sine', 0.08]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(dlp); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(dlp.frequency); lfo.start();
    { const s = ctx.createBufferSource(); s.buffer = a.brown; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 1.5; const g = ctx.createGain(); g.gain.value = 0.5; s.connect(f); f.connect(g); g.connect(this.droneG); s.start();
      const br = ctx.createOscillator(); br.frequency.value = 0.09; const bg = ctx.createGain(); bg.gain.value = 0.35; br.connect(bg); bg.connect(g.gain); br.start(); } // it breathes
    // string cluster: five bowed voices
    this.strG = ctx.createGain(); this.strG.gain.value = 0; this.strG.connect(this.bus); const sv = ctx.createGain(); sv.gain.value = 0.7; this.strG.connect(sv); sv.connect(this.verb);
    this.strF = ctx.createBiquadFilter(); this.strF.type = 'lowpass'; this.strF.frequency.value = 900; this.strF.Q.value = 0.8; this.strF.connect(this.strG);
    this.voices = CHORDS[0].map((m, i) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = o2.type = 'sawtooth'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 1.004;
      const vib = ctx.createOscillator(); vib.frequency.value = 4.4 + Math.random() * 1.2; const vg2 = ctx.createGain(); vg2.gain.value = mtof(m) * 0.004; vib.connect(vg2); vg2.connect(o.frequency); vg2.connect(o2.frequency);
      const g = ctx.createGain(); g.gain.value = 0.11; const swell = ctx.createOscillator(); swell.frequency.value = 0.03 + Math.random() * 0.05; const sg = ctx.createGain(); sg.gain.value = 0.07; swell.connect(sg); sg.connect(g.gain);
      o.connect(g); o2.connect(g); g.connect(this.strF); o.start(now + i * 0.01); o2.start(); vib.start(); swell.start();
      return { o, o2, vg2 };
    });
    // high harmonics, bowed near the bridge: only when it is close
    this.hiG = ctx.createGain(); this.hiG.gain.value = 0; this.hiG.connect(this.bus); const hv = ctx.createGain(); hv.gain.value = 0.8; this.hiG.connect(hv); hv.connect(this.verb);
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2600; hf.Q.value = 1.2; hf.connect(this.hiG);
    for (const f of [1174.7, 1244.5, 1318.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.05; const tr = ctx.createOscillator(); tr.frequency.value = 11 + Math.random() * 3; const tg = ctx.createGain(); tg.gain.value = 0.05; tr.connect(tg); tg.connect(g.gain); o.connect(g); g.connect(hf); o.start(); tr.start(); }
    // hunt: an endless rising Shepard tone
    this.shepG = ctx.createGain(); this.shepG.gain.value = 0; this.shepG.connect(this.bus); const shv = ctx.createGain(); shv.gain.value = 0.5; this.shepG.connect(shv); shv.connect(this.verb);
    this.shep = Array.from({ length: 7 }, () => { const o = ctx.createOscillator(); o.type = 'sine'; const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.shepG); o.start(); return { o, g }; });
  }
  setVolume(v) { this.vol = v; if (this.bus) this.bus.gain.setTargetAtTime(v, this.a.ctx.currentTime, 0.1); }
  // a struck piano string: partials with a little inharmonicity, two strings slightly out of tune
  piano(m, vel = 0.5, delay = 0, wet = 0.85) {
    const ctx = this.a.ctx; if (!ctx || !this.ok) return; const t = ctx.currentTime + delay, f0 = mtof(m), out = ctx.createGain(); out.gain.value = vel * 0.22 * this.vol;
    const dry = ctx.createGain(); dry.gain.value = 1 - wet * 0.5; out.connect(dry); dry.connect(this.a.master); const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(this.verb);
    for (let n = 1; n <= 7; n++) for (const det of [1, 1.0016]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = f0 * n * Math.sqrt(1 + 0.0004 * n * n) * det, dec = 3.2 / Math.pow(n, 0.6);
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 / Math.pow(n, 1.25), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.1);
    }
    const s = ctx.createBufferSource(); s.buffer = this.a.white; const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = f0 * 4; hf.Q.value = 1; const hg = ctx.createGain(); hg.gain.setValueAtTime(0.06, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(hf); hf.connect(hg); hg.connect(out); s.start(t, Math.random()); s.stop(t + 0.08);
  }
  // a music box somewhere in the dark, winding down
  musicBox(pos, slow = 1) {
    const ctx = this.a.ctx; if (!ctx) return; const tune = [76, 79, 81, 79, 76, 74, 72, 74, 76, 76, 74, 71];
    let t = 0.2; tune.forEach((m, i) => {
      const at = t, det = 1 + (i / tune.length) * 0.03 * slow; t += 0.34 * (1 + i * 0.07 * slow);
      for (const [mul, amp, dec] of [[1, 0.5, 1.6], [3.9, 0.18, 0.5], [9.6, 0.08, 0.18]]) this.a.tone({ f: mtof(m) * mul / det, v: amp * 0.16, d: dec, a: 0.002, pos, wet: 0.7, delay: at });
    });
  }
  // stingers: 'scare' (an orchestral stab), 'hit' (low impact), 'swell' (something is coming)
  sting(kind = 'scare', k = 1) {
    const a = this.a, ctx = a.ctx; if (!ctx || !this.ok) return; k *= ([0.55, 1, 1.3][this.fear] ?? 1) * Math.min(1.2, this.vol * 1.4);
    if (kind === 'swell') { for (const f of [146.8, 155.6, 207.7, 220]) a.tone({ f, f2: f * 1.06, type: 'sawtooth', v: 0.05 * k, a: 2.2, d: 0.6, lp: 1400, wet: 1.3 }); a.noise({ f: 300, f2: 5000, q: 0.7, v: 0.06 * k, a: 2.4, d: 0.3, wet: 1.2 }); return; }
    a.tone({ f: 55, f2: 30, v: 0.6 * k, d: 1.4, lp: 260, wet: 0.9 }); a.noise({ f: 180, q: 0.6, v: 0.3 * k, d: 0.6, wet: 1 });
    if (kind === 'scare') { for (const f of [233.1, 246.9, 349.2, 370, 493.9, 523.3]) a.tone({ f, f2: f * 0.97, type: 'sawtooth', v: 0.075 * k, a: 0.01, d: 1.6, lp: 3200, wet: 1.4 }); a.noise({ f: 3000, f2: 800, q: 0.6, v: 0.2 * k, a: 0.005, d: 0.9, wet: 1.2 }); }
  }
  // per frame: tension 0..1 (how close it is / how scared you should be), hunt on/off, near 0..1
  update(dt, tension, hunt, near, calm) {
    if (!this.ok) return; const ctx = this.a.ctx, now = ctx.currentTime, F = this.fear, lvl = [0.6, 1, 1.25][F] ?? 1;
    this.t += dt; this.tension += ((calm ? 0 : tension) - this.tension) * Math.min(1, dt * 0.6);
    this.huntK += ((hunt && !calm ? 1 : 0) - this.huntK) * Math.min(1, dt * (hunt ? 0.7 : 0.25));
    const T = this.tension, H = this.huntK;
    this.droneG.gain.setTargetAtTime(calm ? 0.05 : (0.16 + T * 0.22 + H * 0.1) * lvl, now, 0.5);
    this.strG.gain.setTargetAtTime(calm ? 0 : Math.max(0, T - 0.12) * 0.55 * lvl + H * 0.2, now, 1.2);
    this.strF.frequency.setTargetAtTime(700 + T * 1400 + H * 900, now, 1.5);
    this.hiG.gain.setTargetAtTime(calm ? 0 : Math.max(0, near - 0.55) * 0.5 * lvl + H * 0.06 * F, now, 0.4);
    // the chord drifts, each voice sliding to its new note
    if ((this.chordT -= dt) <= 0) { this.chordT = 14 + Math.random() * 16 - T * 6; const ch = CHORDS[(Math.random() * CHORDS.length) | 0], up = T > 0.6 ? 12 : 0;
      this.voices.forEach((v, i) => { const f = mtof(ch[i] + up); v.o.frequency.setTargetAtTime(f, now, 2.5 + Math.random() * 2); v.o2.frequency.setTargetAtTime(f * 1.004, now, 2.5 + Math.random() * 2); v.vg2.gain.setTargetAtTime(f * 0.004, now, 2); }); }
    // the lone piano: only when it is quiet
    if ((this.pianoT -= dt) <= 0) { this.pianoT = 7 + Math.random() * 14;
      if (!calm && H < 0.2) { const r = Math.random();
        if (r < 0.18) LULLABY.forEach(([m, d]) => this.piano(m - 12, 0.32, d * 1.2));
        else if (r < 0.55) { const m = 38 + ((Math.random() * 14) | 0); this.piano(m, 0.5); this.piano(m + 1, 0.4, 0.02); }
        else this.piano(50 + ((Math.random() * 20) | 0), 0.42); } }
    // hunt: heartbeat drum and the Shepard tone
    this.shepG.gain.setTargetAtTime(H * 0.09 * lvl, now, 0.6);
    if (H > 0.02) { this.sh = (this.sh + dt * 0.035) % 1;
      this.shep.forEach((s, i) => { const x = (i / this.shep.length + this.sh) % 1, f = 55 * Math.pow(2, x * 7), g = Math.exp(-Math.pow((x - 0.5) / 0.22, 2) / 2); s.o.frequency.setTargetAtTime(f, now, 0.02); s.g.gain.setTargetAtTime(g * 0.3, now, 0.05); });
      if ((this.beatT -= dt) <= 0) { const bpm = 64 + H * 26 + near * 30; this.beatT = 60 / bpm;
        const v = H * lvl * this.vol * 1.4; this.a.tone({ f: 58, f2: 34, v: 0.45 * v, d: 0.32, lp: 220, wet: 0.4 }); this.a.tone({ f: 52, f2: 32, v: 0.3 * v, d: 0.28, lp: 200, wet: 0.4, delay: 0.17 }); } }
  }
}
