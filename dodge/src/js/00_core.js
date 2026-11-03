import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------- utils ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const r01 = (rating) => clamp((rating - 40) / 59, 0, 1); // 40..99 -> 0..1
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function colorDist(a, b) { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function lum(h) { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

// ---------- court constants (meters) ----------
const COURT = { L: 18, W: 9, HX: 9, HZ: 4.5, ATTACK: 3 };
const GRAV = 7.2;          // gameplay gravity for balls
const BALL_R = 0.105;

// ---------- settings ----------
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const SETTINGS = Object.assign({ quality: 'auto', sound: true, difficulty: 1, replays: true, shake: true },
  (() => { try { return JSON.parse(localStorage.getItem('dn_settings') || '{}'); } catch (e) { return {}; } })());
function saveSettings() { try { localStorage.setItem('dn_settings', JSON.stringify(SETTINGS)); } catch (e) { } }
const DIFFS = [
  { name: 'ROOKIE', react: 1.4, acc: 0.6, perfect: 0.04, catchSkill: 0.7, aggression: 0.75 },
  { name: 'PRO', react: 1.05, acc: 0.8, perfect: 0.13, catchSkill: 0.88, aggression: 0.9 },
  { name: 'ALL-PRO', react: 0.9, acc: 0.95, perfect: 0.26, catchSkill: 1.0, aggression: 1.0 },
  { name: 'LEGEND', react: 0.75, acc: 1.08, perfect: 0.42, catchSkill: 1.1, aggression: 1.12 },
];

// ---------- teams ----------
const TEAMS = [
  { id: 'rip', city: 'HARBOR CITY', name: 'RIPTIDE', abbr: 'HCR', primary: '#0aa5b5', secondary: '#0b2545', accent: '#e8f6f7', shape: 'circle', glyph: 'wave', tier: 0.98, style: { acc: 4, dodge: 3 }, rec: [11, 5] },
  { id: 'frg', city: 'IRONVALE', name: 'FORGE', abbr: 'IRV', primary: '#ff6b1a', secondary: '#24262b', accent: '#ffd29c', shape: 'shield', glyph: 'flame', tier: 1.0, style: { pow: 6, catch: -2 }, rec: [12, 4] },
  { id: 'vip', city: 'SIERRA VISTA', name: 'VIPERS', abbr: 'SVV', primary: '#8fdc2a', secondary: '#101410', accent: '#f4ffe0', shape: 'diamond', glyph: 'fang', tier: 0.95, style: { speed: 5, dodge: 4, catch: -3 }, rec: [9, 7] },
  { id: 'mon', city: 'NORTHGATE', name: 'MONARCHS', abbr: 'NGM', primary: '#5b2a86', secondary: '#f2c14e', accent: '#ffffff', shape: 'shield', glyph: 'crown', tier: 1.02, style: { catch: 5, awr: 4 }, rec: [13, 3] },
  { id: 'vlt', city: 'BAYPORT', name: 'VOLTS', abbr: 'BPV', primary: '#ffd400', secondary: '#1d3fbf', accent: '#0b1440', shape: 'hex', glyph: 'bolt', tier: 0.96, style: { pow: 3, speed: 4 }, rec: [10, 6] },
  { id: 'out', city: 'RED MESA', name: 'OUTLAWS', abbr: 'RMO', primary: '#c8102e', secondary: '#e9d3a6', accent: '#2a0a10', shape: 'circle', glyph: 'star', tier: 0.97, style: { pow: 4, clutch: 4 }, rec: [8, 8] },
  { id: 'yet', city: 'FROSTLINE', name: 'YETIS', abbr: 'FRY', primary: '#7fd4ff', secondary: '#0d1b2a', accent: '#ffffff', shape: 'hex', glyph: 'peak', tier: 0.94, style: { catch: 6, speed: -3, sta: 4 }, rec: [7, 9] },
  { id: 'cmt', city: 'NEON COAST', name: 'COMETS', abbr: 'NCC', primary: '#ff2e88', secondary: '#19e3ff', accent: '#1a0630', shape: 'diamond', glyph: 'comet', tier: 0.99, style: { acc: 5, awr: 2 }, rec: [11, 5] },
];

function logoSVG(t, opts = {}) {
  const p = t.primary, s = t.secondary, a = t.accent;
  const shapes = {
    circle: `<circle cx="50" cy="50" r="46" fill="${s}" stroke="${p}" stroke-width="6"/><circle cx="50" cy="50" r="36" fill="none" stroke="${a}" stroke-opacity=".35" stroke-width="2"/>`,
    shield: `<path d="M50 4 L92 16 L88 58 Q80 84 50 96 Q20 84 12 58 L8 16 Z" fill="${s}" stroke="${p}" stroke-width="6" stroke-linejoin="round"/>`,
    diamond: `<path d="M50 3 L97 50 L50 97 L3 50 Z" fill="${s}" stroke="${p}" stroke-width="6" stroke-linejoin="round"/>`,
    hex: `<path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z" fill="${s}" stroke="${p}" stroke-width="6" stroke-linejoin="round"/>`,
  };
  const glyphs = {
    wave: `<path d="M18 58 Q28 40 40 52 T62 50 T84 42 L84 70 L18 70 Z" fill="${p}"/><path d="M22 46 Q34 30 48 42 Q58 52 70 38" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round"/>`,
    flame: `<path d="M50 18 Q66 38 60 50 Q70 46 70 36 Q82 56 70 72 Q62 82 50 82 Q34 82 28 68 Q22 52 36 40 Q36 52 44 54 Q38 34 50 18 Z" fill="${p}"/><path d="M50 50 Q58 60 54 70 Q50 76 46 70 Q42 62 50 50Z" fill="${a}"/>`,
    fang: `<path d="M24 26 L76 26 Q76 40 66 44 L58 80 L52 48 L48 48 L42 80 L34 44 Q24 40 24 26 Z" fill="${p}"/><circle cx="38" cy="34" r="3" fill="${a}"/><circle cx="62" cy="34" r="3" fill="${a}"/>`,
    crown: `<path d="M20 70 L16 32 L34 48 L50 24 L66 48 L84 32 L80 70 Z" fill="${p}"/><rect x="20" y="70" width="60" height="9" fill="${p}"/><circle cx="50" cy="24" r="4" fill="${a}"/><circle cx="16" cy="32" r="3.5" fill="${a}"/><circle cx="84" cy="32" r="3.5" fill="${a}"/>`,
    bolt: `<path d="M58 12 L26 56 L46 56 L38 88 L74 40 L54 40 Z" fill="${p}" stroke="${a}" stroke-width="2.5" stroke-linejoin="round"/>`,
    star: `<path d="M50 14 L59 40 L86 40 L64 56 L72 82 L50 66 L28 82 L36 56 L14 40 L41 40 Z" fill="${p}"/><circle cx="50" cy="50" r="7" fill="${a}"/>`,
    peak: `<path d="M12 76 L40 30 L52 48 L62 36 L88 76 Z" fill="${p}"/><path d="M40 30 L48 43 L42 42 L36 48 L33 41 Z M62 36 L70 48 L64 47 L59 52 L57 45Z" fill="${a}"/>`,
    comet: `<circle cx="62" cy="40" r="15" fill="${p}"/><path d="M50 50 L16 80 M54 56 L28 86 M46 46 L12 66" stroke="${p}" stroke-width="6" stroke-linecap="round" opacity=".8"/><circle cx="66" cy="36" r="5" fill="${a}"/>`,
  };
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" ${opts.attrs || ''}>${shapes[t.shape]}${glyphs[t.glyph]}</svg>`;
}
function svgToImage(svg, size = 256) {
  return new Promise((res) => {
    const img = new Image(size, size);
    img.onload = () => res(img); img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${size}" height="${size}" `));
  });
}

// ---------- players / ratings ----------
const RATING_KEYS = ['pow', 'acc', 'catch', 'dodge', 'speed', 'sta', 'awr', 'clutch'];
const RATING_LABEL = { pow: 'THP', acc: 'THA', catch: 'CTH', dodge: 'DOD', speed: 'SPD', sta: 'STA', awr: 'AWR', clutch: 'CLU' };
const ARCH = {
  CANNON: { label: 'CANNON', base: { pow: 93, acc: 72, catch: 62, dodge: 64, speed: 72, sta: 80, awr: 72, clutch: 74 }, w: { pow: .34, acc: .18, catch: .08, dodge: .08, speed: .1, sta: .06, awr: .08, clutch: .08 }, build: 1.07 },
  SNIPER: { label: 'SNIPER', base: { pow: 76, acc: 94, catch: 66, dodge: 70, speed: 74, sta: 76, awr: 86, clutch: 80 }, w: { pow: .16, acc: .34, catch: .08, dodge: .08, speed: .08, sta: .06, awr: .12, clutch: .08 }, build: 1.0 },
  WALL: { label: 'BRICK WALL', base: { pow: 72, acc: 70, catch: 95, dodge: 55, speed: 62, sta: 86, awr: 82, clutch: 76 }, w: { pow: .08, acc: .08, catch: .38, dodge: .08, speed: .06, sta: .1, awr: .14, clutch: .08 }, build: 1.1 },
  GHOST: { label: 'GHOST', base: { pow: 66, acc: 75, catch: 70, dodge: 96, speed: 93, sta: 84, awr: 82, clutch: 72 }, w: { pow: .06, acc: .1, catch: .1, dodge: .34, speed: .2, sta: .06, awr: .08, clutch: .06 }, build: 0.95 },
  CAPTAIN: { label: 'CAPTAIN', base: { pow: 81, acc: 81, catch: 81, dodge: 78, speed: 78, sta: 82, awr: 91, clutch: 95 }, w: { pow: .13, acc: .13, catch: .13, dodge: .12, speed: .1, sta: .07, awr: .14, clutch: .18 }, build: 1.03 },
  ANCHOR: { label: 'TWO-WAY', base: { pow: 80, acc: 79, catch: 80, dodge: 76, speed: 77, sta: 82, awr: 78, clutch: 76 }, w: { pow: .14, acc: .14, catch: .14, dodge: .14, speed: .12, sta: .08, awr: .12, clutch: .12 }, build: 1.02 },
};
const FIRST_M = ['Marcus', 'Dante', 'Theo', 'Jalen', 'Rafael', 'Kenji', 'Silas', 'Andre', 'Mateo', 'Darius', 'Owen', 'Tobias', 'Isaiah', 'Nico', 'Brody', 'Malik', 'Cyrus', 'Elliot', 'Dmitri', 'Kofi', 'Luca', 'Emeka', 'Rhys', 'Jonah', 'Tariq', 'Wes', 'Caleb', 'Hector', 'Arlo', 'Dex'];
const FIRST_F = ['Avery', 'Nia', 'Sasha', 'Imani', 'Rosa', 'Kira', 'Talia', 'Jade', 'Maya', 'Elena', 'Brielle', 'Zoe', 'Priya', 'Leah', 'Noor', 'Quinn'];
const LAST = ['Okafor', 'Reyes', 'Vance', 'Holloway', 'Stroud', 'Kowalski', 'Ashby', 'Delacroix', 'Mbeki', 'Tanaka', 'Calloway', 'Rourke', 'Pruitt', 'Valdez', 'Lindqvist', 'Abara', 'Fontaine', 'Mercer', 'Haldane', 'Osei', 'Brannigan', 'Castellanos', 'Whitlock', 'Nakamura', 'Fairbanks', 'Ibarra', 'Kincaid', 'Achebe', 'Draper', 'Sorensen', 'Moreau', 'Barlowe', 'Quarles', 'Ferro', 'Adeyemi', 'Lockhart', 'Petrakis', 'Gallo', 'Winslow', 'Duarte'];
const AVATARS = [ // id, file, female, kit layout (number/wordmark painting)
  { id: 'm301', file: 'Sports_Male_02', female: false, kit: 'soccer' },
  { id: 'm300', file: 'Sports_Male_03', female: false, kit: 'soccer' },
  { id: 'm026', file: 'Sports_Male_04', female: false, kit: 'tank' },
  { id: 'f013', file: 'Sports_Female_02', female: true, kit: 'female' },
];

function computeOVR(r, arch) {
  const w = ARCH[arch].w; let s = 0;
  for (const k of RATING_KEYS) s += r[k] * w[k];
  return clamp(Math.round(s + 2), 40, 99);
}
function buildRoster(team, ti) {
  const rnd = seeded(9001 + ti * 7919);
  const archs = ['CAPTAIN', 'CANNON', 'SNIPER', 'WALL', 'GHOST', 'ANCHOR'];
  const used = new Set(), nums = new Set();
  const out = [];
  // 1-2 women per team (co-ed league)
  const fSlots = new Set([(ti * 3 + 1) % 6]); if (ti % 2 === 0) fSlots.add((ti + 4) % 6);
  archs.forEach((arch, i) => {
    const female = fSlots.has(i);
    let first, last;
    do { first = female ? FIRST_F[(rnd() * FIRST_F.length) | 0] : FIRST_M[(rnd() * FIRST_M.length) | 0]; last = LAST[(rnd() * LAST.length) | 0]; } while (used.has(last));
    used.add(last);
    let num; do { num = 1 + ((rnd() * 98) | 0); } while (nums.has(num)); nums.add(num);
    const r = {};
    for (const k of RATING_KEYS) {
      const st = team.style[k] || 0;
      r[k] = clamp(Math.round((ARCH[arch].base[k] + st + (rnd() - 0.5) * 16) * team.tier), 40, 99);
    }
    const avatar = female ? AVATARS[3] : AVATARS[[0, 1, 2][(rnd() * 3) | 0]];
    const height = female ? 1.68 + rnd() * 0.14 : 1.8 + rnd() * 0.2;
    out.push({ id: team.id + i, first, last, num, arch, ratings: r, ovr: computeOVR(r, arch), avatar, female, height: height * (arch === 'WALL' ? 1.02 : 1), build: ARCH[arch].build });
  });
  return out;
}
TEAMS.forEach((t, i) => { t.roster = buildRoster(t, i); t.ovr = Math.round(t.roster.reduce((s, p) => s + p.ovr, 0) / t.roster.length); });
function teamUnitRatings(t) {
  const avg = (k) => t.roster.reduce((s, p) => s + p.ratings[k], 0) / t.roster.length;
  return { OFF: Math.round((avg('pow') + avg('acc')) / 2), DEF: Math.round((avg('catch') + avg('dodge')) / 2), ATH: Math.round((avg('speed') + avg('sta')) / 2), IQ: Math.round((avg('awr') + avg('clutch')) / 2) };
}
// pick uniforms so the two teams contrast: returns {p,s,a} per side
function uniformsFor(home, away) {
  const h = { p: home.primary, s: home.secondary, a: home.accent };
  let a = { p: away.primary, s: away.secondary, a: away.accent };
  if (colorDist(h.p, a.p) < 140) a = { p: away.secondary, s: away.primary, a: away.accent, alt: true };
  return [h, a];
}
