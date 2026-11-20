// The shape of the realm: terrain, biomes, rivers, roads, kingdoms, villages and what lives where.
// Pure maths and data — no three.js. Coordinates: x east, z south (north is −z), y up.
// One unit is about 0.75 m: a hero is ~2.4 units tall, a house ~7, a castle ~36.

export const HALF = 1100;
export const WATER = 0;

// ---------------------------------------------------------------- noise
function hash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
const ridged = (x, z) => { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += amp * (1 - Math.abs(vnoise(x * f, z * f) * 2 - 1)); f *= 2.1; amp *= 0.5; } return s / 0.9375; };
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- settlements
// Kingdoms are walled cities with a street grid, a plaza and a castle. Villages are small and open.
export const KINGDOMS = [
  { id: 'emberfall', name: 'Emberfall', sub: 'The Ember Crown City', x: 0, z: 420, r: 170, h: 6, color: 'red', ground: [0.56, 0.52, 0.47] },
  { id: 'solmara', name: 'Solmara', sub: 'City of the Golden Sands', x: 780, z: 300, r: 160, h: 9, color: 'yellow', ground: [0.78, 0.68, 0.5] },
  { id: 'frosthold', name: 'Frosthold', sub: 'The Mountain Throne', x: -560, z: -650, r: 150, h: 34, color: 'blue', ground: [0.7, 0.72, 0.78] },
  { id: 'tidewatch', name: 'Tidewatch', sub: 'Harbour of the Western Lake', x: -660, z: 360, r: 160, h: 5, color: 'green', ground: [0.6, 0.58, 0.52] },
];
export const VILLAGES = [
  { id: 'millbrook', name: 'Millbrook', sub: 'A farming village', x: 340, z: 650, r: 64, h: 5, color: 'yellow' },
  { id: 'ashford', name: 'Ashford', sub: 'A river village', x: -330, z: 60, r: 56, h: 6, color: 'green' },
  { id: 'redwater', name: 'Redwater', sub: 'A hill village', x: 430, z: -330, r: 56, h: 9, color: 'red' },
];
export const SETTLEMENTS = [...KINGDOMS.map(k => ({ ...k, kingdom: true })), ...VILLAGES];

// ---------------------------------------------------------------- places of the story
// r: ground is flattened inside r (blending out over the next 24 units) to height h.
export const SITES = {
  keep: { x: -330, z: 580, r: 30, h: 8, name: 'The Ruined Keep' },
  warren: { x: 470, z: 500, r: 26, h: 10, name: 'Goblin Warren' },
  tower: { x: 250, z: -170, r: 16, h: 7, name: 'Old Watchtower' },
  peak: { x: 640, z: -730, r: 26, h: 62, name: 'Wyvern Peak' },
  swamp: { x: -430, z: 860, r: 110, h: 0.15, name: 'The Mirefen' },
  glade: { x: -300, z: -250, r: 18, h: 9, name: 'Moonlit Glade' },
  barrow: { x: 60, z: -900, r: 26, h: 14, name: 'The Barrow' },
  lake: { x: -940, z: 300, r: 180, name: 'The Western Lake' },
  ford: { x: -252, z: 2, r: 0, name: 'The Shallows' },
  ruinsE: { x: 700, z: -40, r: 18, h: 9, name: 'Sunken Ruins' },
  ruinsW: { x: -620, z: 40, r: 16, h: 7, name: 'Old Fort' },
  ruinsS: { x: -120, z: 820, r: 16, h: 6, name: 'Broken Chapel' },
};
export const RIVER = [[1130, -480], [880, -380], [620, -250], [400, -150], [170, -85], [0, -62], [-170, -30], [-252, 2], [-360, 30], [-500, 110], [-640, 210], [-780, 280]];
export const RIVER_W = 9;

// Roads between everything. Each is a polyline; bridges appear wherever one crosses the river.
const K = id => SETTLEMENTS.find(s => s.id === id);
const gate = (id, dir) => { const s = K(id), a = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[dir]; return [s.x + Math.cos(a) * (s.r + 6), s.z + Math.sin(a) * (s.r + 6)]; };
export const ROADS = [
  [gate('emberfall', 'n'), [6, 120], [0, -62], [24, -300], [40, -600], [60, -870]],
  [gate('emberfall', 'e'), [360, 400], [520, 330], gate('solmara', 'w')],
  [gate('emberfall', 'w'), [-300, 420], [-420, 380], gate('tidewatch', 'e')],
  [gate('emberfall', 's'), [120, 640], gate('millbrook', 'w')],
  [[-300, 420], [-330, 548]],
  [gate('millbrook', 'n'), [420, 560], [470, 526]],
  [[24, -300], [200, -320], gate('redwater', 'w')],
  [[200, -320], [250, -186]],
  [gate('redwater', 'n'), [500, -480], [600, -660], [636, -704]],
  [[6, 120], [-160, 80], gate('ashford', 'e')],
  [gate('ashford', 'n'), [-252, 2], [-300, -230]],
  [[-300, -230], [-420, -420], gate('frosthold', 's')],
  [gate('tidewatch', 's'), [-560, 600], [-470, 780]],
  [gate('solmara', 'n'), [700, 60], [640, -230], gate('redwater', 'e')],
  [gate('frosthold', 'e'), [-260, -800], [30, -880]],
  [gate('solmara', 's'), [700, 600], gate('millbrook', 'e')],
  [[-420, 380], [-620, 40]],
  [[700, 60], [700, -40]],
  [[-120, 620], [-120, 820]],
  [gate('emberfall', 'w'), [-120, 620]],
].filter(r => r.length);

// Fast travel: every kingdom and village has a shrine, and a few stand in the wilds.
export const SHRINES = [
  ...SETTLEMENTS.map(s => ({ id: s.id, name: s.name, x: s.x + (s.kingdom ? 22 : 14), z: s.z + (s.kingdom ? 22 : 10) })),
  { id: 'crossing', name: 'North Bridge', x: 22, z: -8 }, { id: 'barrowroad', name: 'Barrow Road', x: 52, z: -820 }, { id: 'peaktrail', name: 'Peak Trail', x: 560, z: -560 },
  { id: 'fen', name: 'Mirefen', x: -470, z: 770 }, { id: 'keeproad', name: 'Keep Road', x: -300, z: 450 }, { id: 'glade', name: 'Moonlit Glade', x: -288, z: -238 },
];
export const SHARDS = [[-180, -520], [540, -60], [-640, 40], [880, 560], [-200, 760], [300, -640]];
export const GLOWCAPS = [[-470, 820], [-400, 900], [-520, 880], [-360, 830], [-450, 950], [-540, 800], [-390, 790]];

// --------------------------------------------------------------- geometry helpers
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return [Math.sqrt(x * x + z * z), t];
}
export function lineDist(px, pz, pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])[0]);
  return m;
}
export const riverDist = (x, z) => lineDist(x, z, RIVER);

// ---------------------------------------------------------------- biomes
// 'desert' east, 'snow' north, 'swamp' south-west, 'forest' patches, otherwise 'plains'.
export function biome(x, z) {
  const sw = Math.hypot(x - SITES.swamp.x, z - SITES.swamp.z);
  if (sw < SITES.swamp.r + 20) return 'swamp';
  const n = (fbm(x / 300 + 5, z / 300 + 9, 2) - 0.5) * 160;
  if (x > 470 + n && z > -380 + n * 0.5) return 'desert';
  if (z < -460 + n) return 'snow';
  return fbm(x / 160 + 3, z / 160 - 5, 3) > 0.53 ? 'forest' : 'plains';
}
// 0..1: how much of the desert / snow look a spot has (smooth edges)
export function desertK(x, z) { const n = (fbm(x / 300 + 5, z / 300 + 9, 2) - 0.5) * 160; return smooth(430 + n, 520 + n, x) * smooth(-420 + n * 0.5, -340 + n * 0.5, z); }
export function snowK(x, z) { const n = (fbm(x / 300 + 5, z / 300 + 9, 2) - 0.5) * 160; return smooth(-400 + n, -520 + n, z); }

// ---------------------------------------------------------------- terrain
// The raw land, before roads cut their way through it.
function rawHeight(x, z) {
  let h = 10 + (fbm(x / 260 + 11, z / 260 - 7) - 0.5) * 24 + (fbm(x / 55, z / 55) - 0.5) * 4;
  // desert: gentle dunes
  const dk = desertK(x, z);
  if (dk > 0) h = lerp(h, 9 + Math.sin(x / 38 + fbm(x / 90, z / 90) * 6) * 2.4 + (fbm(x / 120, z / 120) - 0.5) * 10, dk);
  // the north rises into mountains
  const sk = snowK(x, z);
  if (sk > 0) h += sk * (12 + ridged(x / 170, z / 170) * 85);
  // a ring of mountains around the realm
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smooth(960, 1070, edge) * (60 + fbm(x / 90, z / 90) * 50);
  // Wyvern Peak
  const pd = Math.hypot(x - SITES.peak.x, z - SITES.peak.z);
  h += 30 * Math.exp(-(pd * pd) / (2 * 90 * 90));
  // the western lake
  const ld = Math.hypot(x - SITES.lake.x, z - SITES.lake.z);
  if (ld < SITES.lake.r + 80) h = lerp(h, Math.min(h, -9), smooth(SITES.lake.r + 80, SITES.lake.r, ld));
  // flattened places
  const flat = (s, pad = 24) => { const d = Math.hypot(x - s.x, z - s.z); const t = smooth(s.r + pad, s.r, d); if (t > 0) h = lerp(h, s.h, t); };
  for (const s of SETTLEMENTS) flat(s, 40);
  for (const k in SITES) if (SITES[k].r && SITES[k].h !== undefined && k !== 'swamp') flat(SITES[k]);
  // swamp: flat and wet
  const sd = Math.hypot(x - SITES.swamp.x, z - SITES.swamp.z);
  if (sd < SITES.swamp.r + 40) h = lerp(h, 0.2 + (fbm(x / 9, z / 9) - 0.48) * 2.2, smooth(SITES.swamp.r + 40, SITES.swamp.r - 20, sd));
  return h;
}
// road vertices get their height from the raw land so roads can level hills along their length
const ROAD_H = ROADS.map(r => r.map(([x, z]) => Math.max(1.6, rawHeight(x, z))));
export function roadInfo(x, z) {
  let best = Infinity, bh = 0;
  for (let i = 0; i < ROADS.length; i++) {
    const r = ROADS[i];
    for (let j = 1; j < r.length; j++) {
      const ax = r[j - 1][0], az = r[j - 1][1], bx = r[j][0], bz = r[j][1];
      // quick reject
      if (x < Math.min(ax, bx) - 30 || x > Math.max(ax, bx) + 30 || z < Math.min(az, bz) - 30 || z > Math.max(az, bz) + 30) continue;
      const [d, t] = segDist(x, z, ax, az, bx, bz);
      if (d < best) { best = d; bh = lerp(ROAD_H[i][j - 1], ROAD_H[i][j], t); }
    }
  }
  return { d: best, h: bh };
}
export const roadDist = (x, z) => roadInfo(x, z).d;
export function height(x, z) {
  let h = rawHeight(x, z);
  // roads level the ground beside them
  const r = roadInfo(x, z);
  if (r.d < 16) h = lerp(h, r.h, smooth(16, 6, r.d));
  // raised banks keep riversides dry, then the river cuts through
  const rd = riverDist(x, z);
  const bank = RIVER_W * 1.7;
  if (rd < bank * 2.4) h = Math.max(h, lerp(h, 2.2, smooth(bank * 2.4, bank, rd)));
  if (rd < bank) {
    const ford = Math.hypot(x - SITES.ford.x, z - SITES.ford.z);
    const bed = ford < 20 ? -0.45 : -3.2;
    h = lerp(h, Math.min(h, bed), smooth(bank, RIVER_W * 0.55, rd));
  }
  return h;
}

// What colour the ground is at a point (r, g, b in 0..1).
export function groundColor(x, z, h, slope) {
  const n = fbm(x / 14, z / 14, 3);
  const b = biome(x, z);
  let c = b === 'forest' ? [0.26 + n * 0.08, 0.43 + n * 0.1, 0.19 + n * 0.05] : [0.34 + n * 0.1, 0.52 + n * 0.12, 0.23 + n * 0.05];
  const mix = (to, t) => { if (t > 0) c = c.map((v, i) => lerp(v, to[i], Math.min(1, t))); };
  mix([0.86 + n * 0.06, 0.74 + n * 0.06, 0.5 + n * 0.04], desertK(x, z));
  const sk = snowK(x, z);
  mix([0.92, 0.94, 0.98], sk * smooth(18, 30, h));
  mix([0.5 + n * 0.08, 0.55 + n * 0.08, 0.5], sk * (1 - smooth(18, 30, h)) * 0.7);
  const sd = Math.hypot(x - SITES.swamp.x, z - SITES.swamp.z);
  mix([0.27, 0.32, 0.18], smooth(SITES.swamp.r + 30, SITES.swamp.r - 10, sd));
  mix([0.66, 0.6, 0.44], smooth(1.2, 0.2, h));
  if (slope > 0.6) mix([0.46 + n * 0.08, 0.44 + n * 0.08, 0.42 + n * 0.08], smooth(0.6, 1.0, slope) * (1 - sk * 0.5));
  if (h > 70) mix([0.95, 0.96, 0.99], smooth(70, 90, h));
  const rd = roadDist(x, z);
  if (rd < 5) mix([0.55 + n * 0.06, 0.46 + n * 0.05, 0.32], smooth(5, 3, rd));
  for (const s of SETTLEMENTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d > s.r + 8) continue;
    // paved streets inside kingdoms, a trodden green in villages
    if (s.kingdom) { if (isStreet(s, x, z)) mix(s.ground, 0.92); else mix(s.ground.map(v => v * 0.82 + 0.06), 0.25); }
    else if (d < 18) mix([0.56, 0.5, 0.4], smooth(18, 14, d));
  }
  return c;
}

// ---------------------------------------------------------------- city planning
// Streets: two avenues through the middle, a grid every BLOCK units, and a ring road inside the wall.
const BLOCK = 46;
export function isStreet(s, x, z) {
  const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
  if (d < 34) return true; // the plaza
  if (Math.abs(dx) < 7 || Math.abs(dz) < 7) return true; // avenues
  if (Math.abs(d - (s.r - 16)) < 5) return true; // ring road
  const gx = ((dx % BLOCK) + BLOCK) % BLOCK, gz = ((dz % BLOCK) + BLOCK) % BLOCK;
  return gx < 4.5 || gx > BLOCK - 4.5 || gz < 4.5 || gz > BLOCK - 4.5;
}
const C = (t, col) => `building_${t}_${col}`;
// Everything that makes a settlement: buildings, lamps, walls, people, guards, stalls.
export function planSettlement(s) {
  const R = rng(Math.abs(Math.round(s.x * 7 + s.z * 13)) + 1);
  const out = { buildings: [], props: [], lamps: [], walls: [], towers: [], spots: [], patrols: [], stalls: [], stable: null, landmarks: {} };
  const col = s.color, others = ['red', 'blue', 'green', 'yellow'].filter(c => c !== col);
  const add = (kind, x, z, rot, sc, tag) => { out.buildings.push([kind, x, z, rot, sc]); if (tag) out.landmarks[tag] = { x, z, rot }; };
  const face = (x, z) => { // turn a building to face the nearest street
    const dx = x - s.x, dz = z - s.z, gx = ((dx % BLOCK) + BLOCK) % BLOCK - BLOCK / 2, gz = ((dz % BLOCK) + BLOCK) % BLOCK - BLOCK / 2;
    return Math.abs(gx) > Math.abs(gz) ? (gx > 0 ? Math.PI / 2 : -Math.PI / 2) : (gz > 0 ? 0 : Math.PI);
  };
  if (s.kingdom) {
    const r = s.r;
    // the castle north of the plaza, landmarks around it
    add(C('castle', col), s.x, s.z - 58, 0, 9.5, 'castle');
    add(C('church', col), s.x + 58, s.z + 6, -Math.PI / 2, 9, 'church');
    add(C('tavern', col), s.x - 58, s.z + 6, Math.PI / 2, 8.5, 'tavern');
    add(C('blacksmith', col), s.x + 52, s.z + 56, Math.PI, 8, 'smith');
    add(C('barracks', col), s.x + 30, s.z - r + 44, Math.PI, 8, 'barracks');
    add(C('market', col), s.x - 14, s.z + 14, Math.PI, 5, 'market');
    add(C('market', others[0]), s.x + 14, s.z + 14, Math.PI, 5, 'market2');
    add(C('well', col), s.x, s.z, 0, 5.5, 'well');
    out.stalls.push([s.x - 14, s.z + 20], [s.x + 14, s.z + 20]);
    out.stable = { x: s.x - r + 46, z: s.z + 24, w: 18, d: 14 };
    // fill the city blocks: denser and taller toward the middle, like a downtown
    for (let gx = -r; gx <= r; gx += BLOCK) for (let gz = -r; gz <= r; gz += BLOCK) {
      for (const [ox, oz] of [[-13, -12], [0, -12], [13, -12], [-13, 12], [0, 12], [13, 12]]) {
        const x = s.x + gx + BLOCK / 2 + ox, z = s.z + gz + BLOCK / 2 + oz;
        const d = Math.hypot(x - s.x, z - s.z);
        if (d > r - 26 || d < 44) continue;
        if (Math.abs(x - s.x) < 18 || Math.abs(z - s.z) < 18) continue;
        if (Math.abs(x - s.x) < 30 && z < s.z - 34 && z > s.z - 84) continue; // castle grounds
        if (Math.hypot(x - out.stable.x, z - out.stable.z) < 22) continue;
        if (out.buildings.some(b => Math.hypot(b[1] - x, b[2] - z) < 11.5)) continue;
        const centre = 1 - d / r, roll = R();
        let kind, sc = 6.6 + centre * 2.4 + R() * 0.5;
        if (roll < centre * 0.35) { kind = C(R() < 0.5 ? 'tower_A' : 'tower_B', R() < 0.7 ? col : others[Math.floor(R() * 3)]); sc += 1; }
        else if (roll < 0.1) kind = C('tavern', R() < 0.5 ? col : others[0]);
        else if (roll < 0.17) kind = C('market', others[Math.floor(R() * 3)]);
        else if (roll < 0.22) kind = C('blacksmith', col);
        else if (roll < 0.26) kind = C('archeryrange', col);
        else kind = C(R() < 0.5 ? 'home_A' : 'home_B', R() < 0.65 ? col : others[Math.floor(R() * 3)]);
        add(kind, x, z, face(x, z) + (R() - 0.5) * 0.1, sc);
      }
    }
    // the wall, with gates north, south, east and west, and a tower every so often
    const segs = Math.round((2 * Math.PI * r) / 12.5);
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      const gateNear = [0, Math.PI / 2, Math.PI, -Math.PI / 2].some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.05);
      out.walls.push({ x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, rot: -a + Math.PI / 2, gate: gateNear });
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; out.towers.push([C('tower_A', col), s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, -a, 7.5]); }
    // lamps along the avenues and around the plaza
    for (let k = 40; k < r - 10; k += 34) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.lamps.push([s.x + dx * k + dz * 8, s.z + dz * k + dx * 8]);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.lamps.push([s.x + Math.cos(a) * 30, s.z + Math.sin(a) * 30]); }
    // where people stand and walk
    for (let i = 0; i < 16; i++) {
      if (i < 6) { const a = R() * Math.PI * 2, d = 12 + R() * 18; out.spots.push([s.x + Math.cos(a) * d, s.z + Math.sin(a) * d]); continue; }
      const along = 40 + R() * (r - 70), side = (R() - 0.5) * 8, sg = R() < 0.5 ? -1 : 1;
      out.spots.push(R() < 0.5 ? [s.x + along * sg, s.z + side] : [s.x + side, s.z + along * sg]);
    }
    out.patrols.push([[s.x, s.z - r + 8], [s.x, s.z - 36], [s.x + 36, s.z], [s.x, s.z + 36], [s.x - 36, s.z], [s.x, s.z - 36]]);
    out.patrols.push([...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2; return [s.x + Math.cos(a) * (r - 16), s.z + Math.sin(a) * (r - 16)]; }));
    out.patrols.push([[s.x - r + 8, s.z], [s.x + r - 8, s.z]]);
    out.patrols.push([[s.x, s.z + r - 8], [s.x, s.z + 40]]);
    out.gates = [[s.x, s.z - r], [s.x, s.z + r], [s.x + r, s.z], [s.x - r, s.z]];
  } else {
    // a village: houses round a green, a windmill, fields and fences
    add(C('well', col), s.x, s.z, 0, 4.6, 'well');
    add(C('tavern', col), s.x - 22, s.z - 14, 0.8, 7.2, 'tavern');
    add(C('market', col), s.x + 16, s.z - 16, -0.6, 4.4, 'market');
    add(C('windmill', col), s.x + s.r - 6, s.z + s.r * 0.5, -0.6, 8.5, 'windmill');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + R() * 0.2, d = 30 + R() * (s.r - 34);
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      if (out.buildings.some(b => Math.hypot(b[1] - x, b[2] - z) < 13)) continue;
      add(C(R() < 0.5 ? 'home_A' : 'home_B', R() < 0.6 ? col : others[Math.floor(R() * 3)]), x, z, -a - Math.PI / 2, 6.8 + R() * 0.6);
    }
    out.stalls.push([s.x + 16, s.z - 10]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; out.lamps.push([s.x + Math.cos(a) * 18, s.z + Math.sin(a) * 18]); }
    for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, d = 6 + R() * 18; out.spots.push([s.x + Math.cos(a) * d, s.z + Math.sin(a) * d]); }
    out.patrols.push([...Array(6)].map((_, i) => { const a = (i / 6) * Math.PI * 2; return [s.x + Math.cos(a) * 26, s.z + Math.sin(a) * 26]; }));
    out.fields = [[s.x + s.r + 10, s.z + 10, 30, 22], [s.x - s.r - 6, s.z + 24, 26, 30]];
  }
  return out;
}
export const PLANS = Object.fromEntries(SETTLEMENTS.map(s => [s.id, planSettlement(s)]));

// Where the named people of the story stand.
const E = PLANS.emberfall.landmarks, EK = KINGDOMS[0];
const before = (l, d = 10) => [l.x + Math.sin(l.rot) * d, l.z + Math.cos(l.rot) * d];
export const NPC_POS = {
  maren: before(E.church, 10), hale: before(E.barracks, 12), brida: [E.market.x, E.market.z + 7], doran: before(E.smith, 10),
  tom: [PLANS.emberfall.stable.x + 12, PLANS.emberfall.stable.z - 10], lirel: before(E.tavern, 9),
  pell: [VILLAGES[0].x + 8, VILLAGES[0].z + 8], morwen: [SITES.swamp.x - 6, SITES.swamp.z + 24],
};
export const START = [EK.x + 4, EK.z + 46];

// ---------------------------------------------------------------- the wilds
export const BUILDINGS = [
  // the Ruined Keep
  ['building_castle_red', SITES.keep.x - 10, SITES.keep.z - 14, 0.4, 6], ['building_destroyed', SITES.keep.x + 16, SITES.keep.z + 8, 1.2, 8], ['building_destroyed', SITES.keep.x - 18, SITES.keep.z + 20, -0.6, 7],
  ['building_mine_yellow', SITES.warren.x + 8, SITES.warren.z - 10, -2.6, 8],
  ['building_tower_B_red', SITES.tower.x + 4, SITES.tower.z - 6, 0.3, 7], ['building_destroyed', SITES.tower.x - 10, SITES.tower.z + 8, 2.0, 6],
  ['building_home_B_green', NPC_POS.morwen[0] + 4, NPC_POS.morwen[1] + 8, 0.5, 6.5],
  ['building_destroyed', SITES.ruinsE.x, SITES.ruinsE.z, 0.8, 8], ['building_destroyed', SITES.ruinsE.x + 18, SITES.ruinsE.z - 8, 2.4, 6],
  ['building_castle_green', SITES.ruinsW.x, SITES.ruinsW.z, 1.0, 5], ['building_destroyed', SITES.ruinsS.x, SITES.ruinsS.z, -1.2, 7], ['building_church_yellow', SITES.ruinsS.x + 14, SITES.ruinsS.z - 6, 2.6, 6],
  ['building_watermill_yellow', 300, -128, 0.3, 7.5], ['building_lumbermill_green', -200, 220, 0.8, 7],
];
export const PROPS = [
  ['tent', SITES.keep.x + 6, SITES.keep.z - 4, 0.5, 6], ['tent', SITES.keep.x - 4, SITES.keep.z + 14, -0.4, 6], ['tent', SITES.keep.x + 14, SITES.keep.z - 12, 1.2, 6],
  ['barrel', SITES.keep.x + 2, SITES.keep.z, 0, 6], ['crate_A_big', SITES.keep.x, SITES.keep.z + 2, 0.6, 6], ['weaponrack', SITES.keep.x - 4, SITES.keep.z + 4, 0.4, 7], ['flag_red', SITES.keep.x - 12, SITES.keep.z - 22, 0, 9],
  ['sack', SITES.warren.x, SITES.warren.z - 6, 0, 7], ['barrel', SITES.warren.x - 4, SITES.warren.z - 4, 0, 6], ['tent', SITES.warren.x + 10, SITES.warren.z + 6, 2, 5], ['wheelbarrow', SITES.warren.x + 2, SITES.warren.z + 8, 0.6, 6],
];
export const CHESTS = [
  { id: 'keep1', x: SITES.keep.x - 12, z: SITES.keep.z - 2, dc: 13, gold: 60, potions: 1 }, { id: 'keep2', x: SITES.keep.x + 18, z: SITES.keep.z + 14, dc: 12, gold: 30, item: 'luckycoin' },
  { id: 'warren', x: SITES.warren.x + 8, z: SITES.warren.z - 4, dc: 11, gold: 25, potions: 2 }, { id: 'peak', x: SITES.peak.x + 8, z: SITES.peak.z - 8, dc: 14, gold: 80, potions: 1 },
  { id: 'fen', x: SITES.swamp.x - 30, z: SITES.swamp.z - 20, dc: 12, gold: 30, potions: 1 }, { id: 'glade', x: SITES.glade.x - 4, z: SITES.glade.z - 4, dc: 13, gold: 40, fate: 1 },
  { id: 'ruinE', x: SITES.ruinsE.x + 6, z: SITES.ruinsE.z + 6, dc: 13, gold: 70, potions: 1 }, { id: 'ruinW', x: SITES.ruinsW.x + 8, z: SITES.ruinsW.z + 8, dc: 12, gold: 40, potions: 1 },
  { id: 'ruinS', x: SITES.ruinsS.x + 6, z: SITES.ruinsS.z + 6, dc: 12, gold: 35, potions: 1 }, { id: 'tavern', x: E.tavern.x - 4, z: E.tavern.z + 12, dc: 15, gold: 45, owned: true },
];
// Monster groups: [monster, count, x, z, spread, extra]
const S2 = SITES;
export const SPAWNS = [
  ['bandit', 3, S2.keep.x + 6, S2.keep.z + 4, 12], ['archer', 2, S2.keep.x - 4, S2.keep.z + 10, 10], ['varg', 1, S2.keep.x - 8, S2.keep.z - 6, 0, { talk: 'varg', id: 'varg', neutral: true }],
  ['goblin', 6, S2.warren.x, S2.warren.z, 14], ['shaman', 2, S2.warren.x + 4, S2.warren.z - 6, 6], ['grub', 1, S2.warren.x + 6, S2.warren.z - 4, 0, { id: 'grub' }],
  ['troll', 1, 0, -82, 0, { talk: 'troll', id: 'troll', neutral: true }],
  ['mimic', 1, S2.tower.x + 7, S2.tower.z + 2, 0, { id: 'mimic', hidden: true }],
  ['wyvern', 1, S2.peak.x, S2.peak.z, 0, { id: 'wyvern' }],
  // the roads are not safe
  ['bandit', 2, 300, 380, 10], ['archer', 1, 306, 386, 4], ['bandit', 3, -440, 400, 10], ['bandit', 2, 30, -440, 10],
  ['raider', 3, 640, 420, 12], ['raider', 3, 900, 120, 12], ['archer', 2, 820, 520, 8, { tint: '#d8b070' }],
  ['bones', 3, S2.ruinsE.x, S2.ruinsE.z, 10], ['stalker', 2, S2.ruinsE.x + 10, S2.ruinsE.z, 6], ['chanter', 1, S2.ruinsE.x - 6, S2.ruinsE.z + 6, 0],
  ['bandit', 3, S2.ruinsW.x, S2.ruinsW.z + 10, 10], ['bones', 3, S2.ruinsS.x, S2.ruinsS.z, 8, { night: true }],
  // forests: wolves at night
  ['wolf', 3, -120, 260, 14, { night: true }], ['wolf', 3, 180, 200, 14, { night: true }], ['wolf', 3, -460, 140, 14, { night: true }], ['wolf', 3, 160, 760, 14, { night: true }],
  ['wolf', 3, -200, -120, 14], ['wolf', 2, -500, 560, 10], ['wolf', 3, 120, -500, 12, { night: true }],
  // the snowy north
  ['icewolf', 3, -400, -560, 14], ['icewolf', 3, -720, -480, 14], ['icewolf', 3, 280, -700, 14], ['frosttroll', 1, -300, -720, 0], ['frosttroll', 1, 420, -620, 0],
  ['bones', 3, S2.barrow.x - 20, S2.barrow.z + 40, 12, { night: true }],
  ['goblin', 3, 600, 640, 10], ['goblin', 3, -60, 700, 10],
];
export const VILLAGER_SPOTS = PLANS.emberfall.spots;

// ---------------------------------------------------------------- the Barrow (a dungeon far off the map)
// Each character is a 4×4 tile. # rock, . floor, S spikes, T throne room floor, c coffin, C chapel.
export const DUNGEON = {
  x: 3000, z: 0, tile: 4,
  map: [
    '#######################',
    '#######################',
    '###########TTTTTTT#####',
    '###########TTTTTTT#####',
    '###########TTTTTTT#####',
    '###########TTTTTTT#####',
    '###########TTTTTTT#####',
    '##############.########',
    '##############.##CCC###',
    '##############.##CCC###',
    '##############....CC###',
    '##############S########',
    '##############S########',
    '##############.########',
    '##############S########',
    '##############S########',
    '##############.########',
    '#######.c.c.c..########',
    '#######.......#########',
    '#######.c.c.c.#########',
    '#######.......#########',
    '##########.############',
    '##########.############',
    '##########.############',
    '#######################',
  ],
};
export const dTile = (col, row) => [DUNGEON.x + (col - 11) * DUNGEON.tile, DUNGEON.z + (row - 12) * DUNGEON.tile];
export const DUNGEON_START = dTile(10, 23);
export const DUNGEON_SPAWNS = [
  ['bones', 2, ...dTile(9, 18), 4, { rise: true }], ['bones', 2, ...dTile(12, 19), 4, { rise: true }], ['guardian', 1, ...dTile(11, 18), 0, { rise: true }],
  ['stalker', 1, ...dTile(8, 20), 0, { rise: true }], ['chanter', 1, ...dTile(13, 17), 0, { rise: true }],
  ['guardian', 1, ...dTile(14, 10), 0], ['bones', 2, ...dTile(14, 9), 2], ['stalker', 1, ...dTile(14, 8), 0],
  ['boneking', 1, ...dTile(14, 3), 0, { id: 'boneking', talk: 'boneking', neutral: true }],
];
export const INSIDE_X = 2000; // anything east of this is inside the Barrow
