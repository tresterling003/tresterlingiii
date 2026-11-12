// All sound is synthesized with Web Audio and positioned with HRTF panners relative to the camera.
export class Audio3D {
  constructor() { this.ctx = null; this.vol = 0.9; }
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; this.master.connect(comp); comp.connect(ctx.destination);
    // short tiled-corridor reverb
    const len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.5; }
    this.brown = nb;
    const wb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1; this.white = wb;
    const loop = (buf, type, f, q, gain, dest = this.master, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(dest); s.start(); return { s, fl, g }; };
    this.loop = loop;
    // ventilation: a constant low airy rush
    this.vent = loop(nb, 'lowpass', 420, 0.6, 0.06);
    // fluorescent hum: 120 Hz buzz, loudness follows nearby lit fixtures
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 120; const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 360; hf.Q.value = 4;
    this.humG = ctx.createGain(); this.humG.gain.value = 0; hum.connect(hf); hf.connect(this.humG); this.humG.connect(this.master); hum.start();
    // vacuum motor: saw + noise through a sweeping filter; pitch follows the spin
    this.vacOsc = ctx.createOscillator(); this.vacOsc.type = 'sawtooth'; this.vacOsc.frequency.value = 60;
    const vo2 = ctx.createOscillator(); vo2.type = 'square'; vo2.frequency.value = 61.5;
    this.vacFl = ctx.createBiquadFilter(); this.vacFl.type = 'lowpass'; this.vacFl.frequency.value = 300; this.vacFl.Q.value = 2;
    this.vacG = ctx.createGain(); this.vacG.gain.value = 0;
    const og = ctx.createGain(); og.gain.value = 0.25; this.vacOsc.connect(og); vo2.connect(og); og.connect(this.vacFl);
    this.vacAir = loop(wb, 'bandpass', 1800, 0.8, 0.35, this.vacFl);
    this.vacFl.connect(this.vacG); this.vacG.connect(this.master); this.vacG.connect(this.verb);
    this.vacOsc.start(); vo2.start(); this.vo2 = vo2;
    // chase layer: only during a real chase
    this.chaseG = ctx.createGain(); this.chaseG.gain.value = 0; this.chaseG.connect(this.master);
    for (const f of [55, 58.3, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500; const g = ctx.createGain(); g.gain.value = 0.15; o.connect(fl); fl.connect(g); g.connect(this.chaseG); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 2.2; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(this.chaseG.gain); lfo.start();
    // the Monitor's breathing (spatial)
    this.breath = this.spatialLoop(nb, 'bandpass', 700, 3, 0);
    const bl = ctx.createOscillator(); bl.frequency.value = 0.35; const blg = ctx.createGain(); blg.gain.value = 300; bl.connect(blg); blg.connect(this.breath.fl.frequency); bl.start();
    this.wetSwish = loop(wb, 'bandpass', 900, 1.2, 0);
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  listen(cam) {
    if (!this.ctx) return; const L = this.ctx.listener, p = cam.position, f = new (cam.position.constructor)(0, 0, -1).applyQuaternion(cam.quaternion), u = new (cam.position.constructor)(0, 1, 0).applyQuaternion(cam.quaternion), t = this.ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02); L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02); L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02); }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  panner(x, y, z, ref = 1.5, roll = 1.2) { const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60; if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); return p; }
  spatialLoop(buf, type, f, q, gain) { const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = gain; const p = this.panner(0, 0, 0); s.connect(fl); fl.connect(g); g.connect(p); p.connect(this.master); p.connect(this.verb); s.start(); return { fl, g, p, move: (x, y, z) => { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); } }; }
  out(pos, wet = 0.3) { // returns an input node routed (optionally spatially) to master + reverb
    const g = this.ctx.createGain(); let n = g;
    if (pos) { const p = this.panner(pos.x, pos.y ?? 1, pos.z); g.connect(p); n = p; }
    n.connect(this.master); if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; n.connect(w); w.connect(this.verb); }
    return g;
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  noise({ f, f2, q = 1, v, d, a = 0.005, type = 'bandpass', pos, wet = 0.3, delay = 0, rate = 1 }) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.white; s.playbackRate.value = rate; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d); fl.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, a, v, d); s.connect(fl); fl.connect(g); g.connect(this.out(pos, wet)); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }
  tone({ f, f2, v, d, a = 0.005, type = 'sine', pos, wet = 0.3, delay = 0, lp }) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = ctx.createGain(); this.env(g, t, a, v, d); o.connect(g); let n = g; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; g.connect(fl); n = fl; }
    n.connect(this.out(pos, wet)); o.start(t); o.stop(t + a + d + 0.05);
  }
  // ---- sound effects ----
  step(pos, hard = 1, wetFloor = false) { if (wetFloor) this.noise({ f: 900, f2: 400, q: 0.8, v: 0.08 * hard, d: 0.14, pos }); this.noise({ f: 2600 + Math.random() * 900, q: 3, v: 0.06 * hard, d: 0.04, pos, wet: 0.5 }); this.tone({ f: 150, f2: 80, v: 0.05 * hard, d: 0.05, pos }); }
  monStep(pos) { this.tone({ f: 70, f2: 45, v: 0.22, d: 0.12, pos, lp: 300, wet: 0.6 }); this.noise({ f: 3000, q: 2, v: 0.05, d: 0.05, pos, wet: 0.6 }); if (Math.random() < 0.5) this.keys(pos); }
  keys(pos) { for (let i = 0; i < 3; i++) this.tone({ f: 3200 + Math.random() * 1800, v: 0.03, d: 0.06, delay: i * 0.035 + Math.random() * 0.02, pos, wet: 0.5, type: 'triangle' }); }
  tick(pos) { this.tone({ f: 2200 + Math.random() * 1600, f2: 1400, v: 0.025, d: 0.02, pos, wet: 0.1 }); }
  reward() { this.tone({ f: 1320, v: 0.03, d: 0.25, wet: 0.4 }); this.tone({ f: 1760, v: 0.02, d: 0.3, delay: 0.06, wet: 0.4 }); }
  door(pos, open, heavy) { if (heavy) { this.tone({ f: 90, f2: 60, v: 0.25, d: 0.3, pos, lp: 500, wet: 0.6 }); this.noise({ f: 400, q: 1, v: 0.15, d: 0.25, pos }); } else { this.noise({ f: open ? 700 : 300, f2: open ? 1400 : 200, q: 6, v: 0.06, d: 0.4, pos }); this.tone({ f: 110, f2: 70, v: 0.15, d: 0.15, pos, lp: 600, delay: open ? 0 : 0.25 }); } }
  bolt(pos, on) { this.tone({ f: on ? 900 : 700, f2: on ? 500 : 400, type: 'square', v: 0.06, d: 0.06, pos, lp: 3000 }); this.tone({ f: 180, v: 0.12, d: 0.08, delay: 0.07, pos, lp: 800 }); }
  locker(pos, open) { this.noise({ f: 1500, q: 8, v: 0.06, d: 0.3, pos, wet: 0.5 }); this.tone({ f: open ? 320 : 260, f2: 180, type: 'triangle', v: 0.1, d: 0.35, pos, wet: 0.6, delay: open ? 0 : 0.15 }); }
  rattle(pos) { for (let i = 0; i < 4; i++) this.tone({ f: 200 + Math.random() * 60, type: 'square', v: 0.05, d: 0.05, delay: i * 0.07, pos, lp: 1200 }); }
  bang(pos) { for (let i = 0; i < 3; i++) { this.tone({ f: 60, f2: 40, v: 0.5, d: 0.25, delay: i * 0.42, pos, lp: 300, wet: 0.9 }); this.noise({ f: 300, q: 0.8, v: 0.25, d: 0.2, delay: i * 0.42, pos }); } }
  empty(pos) { this.noise({ f: 800, f2: 300, q: 0.7, v: 0.2, d: 0.8, pos, wet: 0.5 }); }
  pickup() { this.tone({ f: 520, v: 0.05, d: 0.2 }); this.tone({ f: 780, v: 0.04, d: 0.25, delay: 0.06 }); }
  ui() { this.tone({ f: 1000, v: 0.03, d: 0.05, type: 'square', lp: 2500, wet: 0 }); }
  sting(pos) { this.tone({ f: 46, f2: 40, type: 'sawtooth', v: 0.28, d: 2.4, a: 0.03, lp: 380, wet: 1.2, pos }); this.noise({ f: 5000, f2: 900, q: 2, v: 0.07, d: 1.8, a: 0.2, wet: 1.4 }); }
  caught() { this.noise({ f: 2400, q: 0.5, v: 0.5, d: 0.9, wet: 0.6 }); for (const f of [300, 317, 452]) this.tone({ f, f2: f * 0.5, type: 'sawtooth', v: 0.16, d: 1.2, lp: 2600, wet: 0.8 }); }
  drag(pos) { this.noise({ f: 300, f2: 180, q: 1.2, v: 0.08, d: 1.6, a: 0.4, pos, wet: 1.0 }); }
  chime() { for (const [f, d] of [[659, 0], [523, 0.4], [392, 0.8]]) this.tone({ f, v: 0.07, d: 1.2, delay: d, wet: 1.5, type: 'triangle' }); }
  ventVoice(pos) { this.noise({ f: 1200, f2: 900, q: 6, v: 0.04, d: 1.2, a: 0.3, pos, wet: 1.2 }); }
  ping(pos) { this.tone({ f: 1500, v: 0.05, d: 0.2, pos, wet: 0.2 }); this.tone({ f: 2000, v: 0.04, d: 0.25, delay: 0.1, pos, wet: 0.2 }); }
}
