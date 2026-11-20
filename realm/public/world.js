// The shape of the realm: terrain height, river, roads, and where everything stands.
// Pure maths and data — no three.js — so the same world can be rebuilt anywhere.
// Coordinates: x east, z south (north is −z), y up. The overworld spans ±HALF.

export const HALF = 260;
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
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- places
// r: the ground is flattened inside r (blending out over the next 18 units) to height h.
export const SITES = {
  village: { x: 0, z: 62, r: 46, h: 3.2, name: 'Emberfall' },
  keep: { x: -142, z: 122, r: 26, h: 4.5, name: 'The Ruined Keep' },
  warren: { x: 150, z: 56, r: 22, h: 6, name: 'Goblin Warren' },
  tower: { x: 96, z: -106, r: 14, h: 5, name: 'Old Watchtower' },
  peak: { x: 182, z: -176, r: 22, h: 24, name: 'Wyvern Peak' },
  swamp: { x: -186, z: 44, r: 44, h: 0.15, name: 'The Mirefen' },
  glade: { x: -72, z: -122, r: 16, h: 6, name: 'Moonlit Glade' },
  barrow: { x: 20, z: -208, r: 22, h: 6, name: 'The Barrow' },
  farm: { x: 56, z: 106, r: 22, h: 3.6, name: 'Pell\'s Farm' },
  bridge: { x: 0, z: -40, r: 0, name: 'North Bridge' },
  ford: { x: -112, z: -22, r: 0, name: 'The Shallows' },
  mill: { x: 72, z: -52, r: 10, h: 2.2, name: 'The Watermill' },
};
export const RIVER = [[275, -152], [210, -112], [146, -74], [74, -50], [0, -40], [-58, -33], [-112, -22], [-150, -6], [-174, 18], [-186, 40]];
export const RIVER_W = 6.5;
export const ROADS = [
  [[0, 16], [0, -6], [2, -26], [0, -40], [-2, -56], [6, -96], [14, -150], [20, -186]],
  [[0, 108], [2, 140], [10, 180], [4, 255]],
  [[-46, 62], [-82, 72], [-112, 96], [-130, 112]],
  [[46, 62], [82, 62], [118, 58], [136, 56]],
  [[20, 100], [40, 104], [52, 106]],
  [[-2, -56], [-40, -82], [-66, -116]],
  [[6, -96], [50, -100], [88, -104]],
  [[-82, 72], [-122, 56], [-160, 46], [-182, 54]],
  [[88, -104], [140, -142], [168, -166]],
  [[-112, 96], [-118, 40], [-112, -10]],
];
// Fast travel: touch a shrine to unlock it.
export const SHRINES = [
  { id: 'emberfall', name: 'Emberfall', x: 9, z: 82 }, { id: 'crossing', name: 'North Crossing', x: 12, z: -26 },
  { id: 'keep', name: 'Keep Road', x: -112, z: 104 }, { id: 'east', name: 'East Road', x: 124, z: 70 },
  { id: 'fen', name: 'Mirefen', x: -158, z: 30 }, { id: 'barrow', name: 'Barrow Road', x: 34, z: -186 },
  { id: 'peak', name: 'Peak Trail', x: 150, z: -150 },
];
export const SHARDS = [[-58, -62], [112, -24], [-152, -86], [206, 66], [-60, 176], [58, -164]];
export const GLOWCAPS = [[-200, 30], [-176, 62], [-206, 58], [-168, 34], [-192, 18], [-214, 44], [-180, 74]];

// --------------------------------------------------------------- geometry helpers
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}
export function lineDist(px, pz, pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return m;
}
export const riverDist = (x, z) => lineDist(x, z, RIVER);
export function roadDist(x, z) { let m = Infinity; for (const r of ROADS) m = Math.min(m, lineDist(x, z, r)); return m; }

// ---------------------------------------------------------------- terrain
export function height(x, z) {
  let h = 4.0 + (fbm(x / 95 + 11, z / 95 - 7) - 0.5) * 15 + (fbm(x / 22, z / 22) - 0.5) * 2.2;
  // the realm is ringed by mountains
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smooth(196, 252, edge) * (42 + fbm(x / 40, z / 40) * 30);
  // Wyvern Peak: a broad hill with a flat top
  const pd = Math.hypot(x - SITES.peak.x, z - SITES.peak.z);
  h += 22 * Math.exp(-(pd * pd) / (2 * 46 * 46));
  // flattened places
  for (const k in SITES) {
    const s = SITES[k];
    if (!s.r) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    const t = smooth(s.r + 18, s.r, d);
    if (t > 0) h = lerp(h, s.h, t);
  }
  // swamp puddles
  const sd = Math.hypot(x - SITES.swamp.x, z - SITES.swamp.z);
  if (sd < SITES.swamp.r + 6) h += (fbm(x / 7, z / 7) - 0.48) * 1.8 * smooth(SITES.swamp.r + 6, SITES.swamp.r - 10, sd);
  // the river cuts through everything; at the shallows it is only knee deep
  const rd = riverDist(x, z);
  const bank = RIVER_W * 1.75;
  // raised banks so the land beside the river stays dry
  if (rd < bank * 2.2) h = Math.max(h, lerp(h, 1.8, smooth(bank * 2.2, bank, rd)));
  if (rd < bank) {
    const ford = Math.hypot(x - SITES.ford.x, z - SITES.ford.z);
    const bed = ford < 14 ? -0.45 : -2.6;
    h = lerp(h, Math.min(h, bed), smooth(bank, RIVER_W * 0.55, rd));
  }
  return h;
}

// What colour the ground is at a point (r, g, b in 0..1).
export function groundColor(x, z, h, slope) {
  const n = fbm(x / 14, z / 14, 3);
  let c = [0.33 + n * 0.1, 0.5 + n * 0.12, 0.22 + n * 0.05]; // grass
  const sd = Math.hypot(x - SITES.swamp.x, z - SITES.swamp.z);
  if (sd < SITES.swamp.r + 8) { const t = smooth(SITES.swamp.r + 8, SITES.swamp.r - 6, sd); c = c.map((v, i) => lerp(v, [0.27, 0.33, 0.18][i], t)); }
  if (h < 0.9) c = c.map((v, i) => lerp(v, [0.62, 0.56, 0.4][i], smooth(0.9, 0.1, h)));
  if (slope > 0.55 || h > 26) { const t = Math.max(smooth(0.55, 0.95, slope), smooth(26, 34, h)); c = c.map((v, i) => lerp(v, [0.45 + n * 0.08, 0.44 + n * 0.08, 0.42 + n * 0.08][i], t)); }
  if (h > 46) c = c.map((v, i) => lerp(v, [0.92, 0.94, 0.97][i], smooth(46, 54, h)));
  const rd = roadDist(x, z);
  if (rd < 3.6) { const t = smooth(3.6, 2.2, rd); c = c.map((v, i) => lerp(v, [0.55 + n * 0.06, 0.45 + n * 0.05, 0.31][i], t)); }
  const vd = Math.hypot(x - SITES.village.x, z - SITES.village.z);
  if (vd < 15) c = c.map((v, i) => lerp(v, [0.56, 0.52, 0.47][i], smooth(15, 12, vd)));
  return c;
}

// ---------------------------------------------------------------- placements
// [kit part, x, z, rotation, scale]. Kit parts are named after the KayKit model files.
const V = SITES.village;
export const BUILDINGS = [
  ['building_tavern_red', -20, 47, 0.6, 7.2], ['building_blacksmith_blue', 21, 47, -0.6, 7], ['building_church_yellow', 0, 88, Math.PI, 7.2],
  ['building_market_red', -12, 66, Math.PI / 2, 4.4], ['building_market_blue', 12, 66, -Math.PI / 2, 4.4], ['building_well_blue', 0, 60, 0, 4.6],
  ['building_barracks_blue', 26, 28, -0.9, 6.6], ['building_tower_A_blue', -8, 19, 0, 5], ['building_tower_A_blue', 8, 19, 0, 5],
  ['building_home_A_red', -32, 70, 1.3, 7], ['building_home_B_yellow', -28, 86, 2.2, 6.6], ['building_home_A_blue', 32, 72, -1.3, 7],
  ['building_home_B_green', 27, 87, -2.3, 6.6], ['building_home_A_red', -15, 98, 2.9, 6.8], ['building_home_B_yellow', 15, 99, -2.9, 6.6],
  ['building_home_A_blue', -36, 52, 1.0, 6.8], ['building_home_B_green', 36, 55, -1.1, 6.6],
  ['building_windmill_red', 64, 98, -0.6, 8], ['building_home_B_yellow', 46, 118, -2.4, 6.4],
  ['building_watermill_yellow', 78, -64, 0.3, 7], ['building_lumbermill_green', -72, 12, 0.8, 6.5],
  // the Ruined Keep
  ['building_castle_red', -150, 110, 0.4, 5.2], ['building_destroyed', -128, 128, 1.2, 7], ['building_destroyed', -158, 134, -0.6, 6],
  // goblin warren
  ['building_mine_yellow', 156, 44, -2.6, 7],
  // old watchtower
  ['building_tower_B_red', 100, -112, 0.3, 6], ['building_destroyed', 88, -98, 2.0, 5],
  // swamp hut
  ['building_home_B_green', -196, 64, 0.5, 6],
  // ruined outposts out in the wilds
  ['building_destroyed', -150, -84, 0.8, 6], ['building_destroyed', 206, 72, -1.2, 6], ['building_destroyed', 60, -168, 2.2, 6],
];
export const PROPS = [
  // village
  ['tent', -4, 70, 0, 5.5], ['barrel', -8, 72, 0, 6], ['crate_A_big', 8, 72, 0.4, 6], ['sack', 6, 70.5, 0, 7], ['wheelbarrow', 16, 74, 1.4, 6],
  ['weaponrack', 30, 36, -0.9, 7], ['target', 34, 22, -1.6, 7], ['target', 38, 30, -1.6, 7], ['flag_blue', 26, 18, 0, 8], ['flag_blue', -26, 18, 0, 8],
  ['barrel', -26, 52, 0, 6], ['barrel', -25, 54, 0, 6], ['crate_B_small', 24, 51, 0.3, 7], ['resource_lumber', -24, 40, 0.3, 6], ['bucket_water', -2, 57, 0, 6],
  // keep
  ['tent', -134, 112, 0.5, 6], ['tent', -146, 130, -0.4, 6], ['tent', -126, 118, 1.2, 6], ['barrel', -138, 116, 0, 6], ['crate_A_big', -140, 118, 0.6, 6],
  ['weaponrack', -144, 120, 0.4, 7], ['flag_red', -152, 104, 0, 9], ['resource_lumber', -136, 126, 1, 6],
  // warren
  ['sack', 150, 50, 0, 7], ['barrel', 146, 52, 0, 6], ['crate_B_small', 148, 60, 0, 7], ['tent', 160, 60, 2, 5], ['wheelbarrow', 152, 62, 0.6, 6],
  // farm
  ['wheelbarrow', 50, 102, 0, 6], ['sack', 58, 110, 0, 7], ['resource_lumber', 62, 112, 0.5, 6],
];
// Fences: [x1, z1, x2, z2] runs of the wooden fence.
export const FENCES = [
  [-32, 26, -16, 26], [-32, 26, -32, 38], [-32, 38, -26, 38], [-16, 26, -16, 34], // paddock
  [40, 96, 70, 92], [70, 92, 72, 116], [40, 96, 40, 112],
];
// The village wall is a ring with four gates.
export const PALISADE = { x: V.x, z: V.z, r: 44, gates: [-Math.PI / 2, 0, Math.PI / 2, Math.PI] };

export const CHESTS = [
  { id: 'keep1', x: -152, z: 118, dc: 13, gold: 60, potions: 1 }, { id: 'keep2', x: -122, z: 132, dc: 12, gold: 30, item: 'luckycoin' },
  { id: 'warren', x: 158, z: 50, dc: 11, gold: 25, potions: 2 }, { id: 'peak', x: 188, z: -182, dc: 14, gold: 80, potions: 1 },
  { id: 'fen', x: -204, z: 36, dc: 12, gold: 30, potions: 1 }, { id: 'glade', x: -76, z: -126, dc: 13, gold: 40, fate: 1 },
  { id: 'ruinNW', x: -148, z: -90, dc: 12, gold: 35, potions: 1 }, { id: 'ruinE', x: 210, z: 76, dc: 13, gold: 50 },
  { id: 'ruinN', x: 56, z: -172, dc: 12, gold: 30, potions: 1 }, { id: 'tavern', x: -27, z: 44, dc: 15, gold: 45, owned: true },
];

// Who lives where. Spawn groups: [monster, count, x, z, spread, extra]
export const SPAWNS = [
  ['bandit', 3, -136, 118, 12], ['archer', 2, -144, 126, 10], ['varg', 1, -148, 112, 0, { talk: 'varg', id: 'varg', neutral: true }],
  ['goblin', 6, 150, 54, 12], ['shaman', 2, 154, 48, 6], ['grub', 1, 156, 50, 0, { id: 'grub' }],
  ['troll', 1, 0, -50, 0, { talk: 'troll', id: 'troll', neutral: true }],
  ['mimic', 1, 103, -104, 0, { id: 'mimic', hidden: true }],
  ['wyvern', 1, 184, -178, 0, { id: 'wyvern' }],
  ['bandit', 2, 60, -70, 8], ['bandit', 2, -60, 130, 8], ['archer', 1, -64, 134, 4],
  ['wolf', 3, -90, -60, 10, { night: true }], ['wolf', 3, 120, -40, 10, { night: true }], ['wolf', 3, -60, 170, 10, { night: true }],
  ['wolf', 2, -160, 84, 8], ['wolf', 3, 170, 120, 10], ['wolf', 3, 40, -140, 10, { night: true }],
  ['bones', 3, 24, -196, 10, { night: true }], ['bones', 2, -148, -80, 6, { night: true }],
  ['goblin', 3, 200, 70, 8],
];
// Town guards patrol these loops.
export const PATROLS = [
  [[0, 22], [0, 40], [14, 56], [0, 74], [-14, 56], [0, 40]],
  [[-30, 62], [-20, 80], [0, 96], [20, 80], [30, 62], [20, 44], [-20, 44]],
  [[-6, 16], [6, 16]],
  [[-42, 62], [-30, 30], [0, 18], [30, 30], [42, 62], [30, 94], [0, 106], [-30, 94]],
];
export const VILLAGER_SPOTS = [[-6, 64], [6, 64], [-18, 58], [16, 58], [-8, 78], [8, 82], [-24, 72], [24, 72], [0, 50], [-12, 90], [12, 92], [-4, 40]];

// ---------------------------------------------------------------- the Barrow (a dungeon off the map)
// Each character is a 4×4 tile. # rock, . floor, S spikes, T throne room floor, c coffin, C chapel.
export const DUNGEON = {
  x: 1000, z: 0, tile: 4,
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
// world position of a dungeon tile's centre
export const dTile = (col, row) => [DUNGEON.x + (col - 11) * DUNGEON.tile, DUNGEON.z + (row - 12) * DUNGEON.tile];
export const DUNGEON_START = dTile(10, 23);
export const DUNGEON_SPAWNS = [
  ['bones', 2, ...dTile(9, 18), 4, { rise: true }], ['bones', 2, ...dTile(12, 19), 4, { rise: true }], ['guardian', 1, ...dTile(11, 18), 0, { rise: true }],
  ['stalker', 1, ...dTile(8, 20), 0, { rise: true }], ['chanter', 1, ...dTile(13, 17), 0, { rise: true }],
  ['guardian', 1, ...dTile(14, 10), 0], ['bones', 2, ...dTile(14, 9), 2], ['stalker', 1, ...dTile(14, 8), 0],
  ['boneking', 1, ...dTile(14, 3), 0, { id: 'boneking', talk: 'boneking', neutral: true }],
];
