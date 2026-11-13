// Pre-rendered sound banks, synthesized once at start-up (pure math, no files).
// The mannequin is hollow lacquered wood on ball joints: its hands slap and knock on tile,
// its knees thud, its joints creak and pop, its nails scrape, and its body drags.

const TAU = Math.PI * 2;

function rnd(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// damped sines (modal synthesis): list of [freq, amp, decay seconds]
function modes(d, SR, at, list, R) {
  const s0 = Math.floor(at * SR);
  for (const [f, a, tau] of list) {
    const w = TAU * f / SR, ph = R() * TAU, n = Math.min(d.length - s0, Math.ceil(tau * 7 * SR));
    for (let i = 0; i < n; i++) d[s0 + i] += a * Math.exp(-i / (tau * SR)) * Math.sin(w * i + ph);
  }
}
// a burst of noise with an exponential tail, run through a resonant band-pass
function burst(d, SR, at, tau, f, q, amp, R) {
  const s0 = Math.floor(at * SR), n = Math.min(d.length - s0, Math.ceil(tau * 8 * SR)), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (R() * 2 - 1) * Math.exp(-i / (tau * SR));
  bandpass(x, SR, f, q); for (let i = 0; i < n; i++) d[s0 + i] += x[i] * amp;
}
function biquad(x, b0, b1, b2, a0, a1, a2) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
}
function bandpass(x, SR, f, q) { const w = TAU * f / SR, al = Math.sin(w) / (2 * q); biquad(x, al, 0, -al, 1 + al, -2 * Math.cos(w), 1 - al); }
function lowpass(x, SR, f, q = 0.7) { const w = TAU * f / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w); biquad(x, (1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al); }
function highpass(x, SR, f, q = 0.7) { const w = TAU * f / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w); biquad(x, (1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al); }
function norm(d, peak = 0.9) { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m; return d; }
function fade(d, SR, out = 0.01) { const n = Math.min(d.length, Math.floor(out * SR)); for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n; return d; }

// a palm comes down flat: a fleshy slap, the knock of the hollow wooden hand, the tile thud, fingers settling
function handPlant(SR, R) {
  const d = new Float32Array(Math.floor(0.32 * SR)), f0 = 330 + R() * 160;
  burst(d, SR, 0, 0.0022, 1400 + R() * 900, 0.7, 0.9, R);                               // skin slap
  modes(d, SR, 0.001, [[78 + R() * 18, 0.85, 0.03], [128 + R() * 20, 0.35, 0.02]], R);  // floor thud
  modes(d, SR, 0.0015, [[f0, 0.38, 0.05], [f0 * 2.31, 0.24, 0.032], [f0 * 3.93, 0.12, 0.02], [f0 * 5.71, 0.06, 0.012]], R); // hollow wood
  const t2 = 0.016 + R() * 0.02; // the fingers come down a beat later
  burst(d, SR, t2, 0.0012, 2400 + R() * 1200, 1.2, 0.28, R); modes(d, SR, t2, [[f0 * 1.6, 0.12, 0.025], [f0 * 3.3, 0.06, 0.015]], R);
  if (R() < 0.35) burst(d, SR, t2 + 0.012 + R() * 0.02, 0.001, 3200, 2, 0.15, R);
  return fade(norm(d, 0.9), SR);
}
// a knee or a foot: heavier, duller, a ball joint clacks in its socket
function kneePlant(SR, R) {
  const d = new Float32Array(Math.floor(0.36 * SR)), f0 = 230 + R() * 90;
  modes(d, SR, 0, [[62 + R() * 14, 1.0, 0.045], [104 + R() * 16, 0.45, 0.03]], R);
  modes(d, SR, 0.001, [[f0, 0.42, 0.06], [f0 * 2.18, 0.22, 0.04], [f0 * 3.6, 0.1, 0.025]], R);
  burst(d, SR, 0, 0.0016, 900 + R() * 500, 0.8, 0.45, R);
  const tc = 0.008 + R() * 0.03; burst(d, SR, tc, 0.0007, 3000 + R() * 1500, 3, 0.3, R); modes(d, SR, tc, [[1700 + R() * 600, 0.08, 0.01]], R); // joint clack
  return fade(norm(d, 0.9), SR);
}
// stick-slip: a wooden ball joint grinding in its socket
function creak(SR, R) {
  const dur = 0.28 + R() * 0.55, n = Math.floor(dur * SR), x = new Float32Array(n);
  let next = 0, per = 1 / (35 + R() * 50); const drift = (R() - 0.5) * 0.6;
  for (let i = 0; i < n; i++) {
    const t = i / n, env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7);
    if (i >= next) { x[i] = env * (0.6 + R() * 0.8); per *= 1 + drift / (dur * SR) * 40 + (R() - 0.5) * 0.12; per = Math.min(1 / 22, Math.max(1 / 140, per)); next = i + per * SR; }
  }
  const a = Float32Array.from(x), b = Float32Array.from(x), c = Float32Array.from(x);
  bandpass(a, SR, 650 + R() * 500, 14); bandpass(b, SR, 1500 + R() * 900, 11); bandpass(c, SR, 3200 + R() * 1200, 6);
  const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = a[i] + b[i] * 0.7 + c[i] * 0.25;
  return fade(norm(d, 0.8), SR, 0.03);
}
// joints popping: a quick cluster of sharp cracks with a little body
function crack(SR, R) {
  const d = new Float32Array(Math.floor(0.25 * SR)), k = 2 + Math.floor(R() * 4); let t = 0;
  for (let i = 0; i < k; i++) {
    const a = i === 0 ? 1 : 0.4 + R() * 0.5;
    const x = new Float32Array(Math.floor(0.012 * SR)); for (let j = 0; j < x.length; j++) x[j] = (R() * 2 - 1) * Math.exp(-j / (0.0005 * SR)); highpass(x, SR, 1800);
    const s0 = Math.floor(t * SR); for (let j = 0; j < x.length && s0 + j < d.length; j++) d[s0 + j] += x[j] * a;
    burst(d, SR, t, 0.0012, 2200 + R() * 2600, 5, 0.35 * a, R);
    if (i === 0) modes(d, SR, t, [[70 + R() * 30, 0.35, 0.02], [480 + R() * 200, 0.12, 0.015]], R);
    t += 0.006 + R() * 0.022;
  }
  return fade(norm(d, 0.95), SR);
}
// fingernails dragged across tile
function scrape(SR, R) {
  const dur = 0.09 + R() * 0.16, n = Math.floor(dur * SR), d = new Float32Array(n); let g = 0;
  for (let i = 0; i < n; i++) { if (R() < 280 / SR) g = 0.4 + R() * 0.6; g *= 0.9985; const t = i / n; d[i] = (R() * 2 - 1) * g * Math.sin(Math.PI * t); }
  const b = Float32Array.from(d); bandpass(d, SR, 4200 + R() * 1500, 2.5); bandpass(b, SR, 1700 + R() * 500, 4);
  for (let i = 0; i < n; i++) d[i] += b[i] * 0.5;
  return fade(norm(d, 0.7), SR, 0.02);
}
// a body hauled over a smooth floor: low scuffing with stick-slip grain (loops)
function drag(SR, R) {
  const n = Math.floor(3 * SR), d = new Float32Array(n); let last = 0, g = 0.5, tgt = 0.5;
  for (let i = 0; i < n; i++) { if (R() < 12 / SR) tgt = 0.25 + R() * 0.75; g += (tgt - g) * 0.0009; const w = R() * 2 - 1; last = (last + 0.06 * w) / 1.06; d[i] = last * g * (1 + 0.5 * Math.sin(i / SR * TAU * (9 + 4 * Math.sin(i / SR * 1.3)))); }
  const b = Float32Array.from(d); bandpass(d, SR, 420, 1.1); bandpass(b, SR, 1500, 2.2); for (let i = 0; i < n; i++) d[i] += b[i] * 0.35;
  const x = Math.floor(0.08 * SR); for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); } // seamless loop
  return norm(d.subarray(0, n - x), 0.8);
}

export function buildBanks(SR, seed = 1234) {
  const R = rnd(seed), many = (f, k) => Array.from({ length: k }, () => f(SR, R));
  return { hand: many(handPlant, 10), knee: many(kneePlant, 8), creak: many(creak, 7), crack: many(crack, 6), scrape: many(scrape, 6), drag: [drag(SR, R)] };
}
