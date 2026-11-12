// The first vertical slice of Blackbriar High: hallway, classroom, janitor closet, maintenance office, service corridor.
// Units are metres. x runs east, z runs south, y is up. Floor is y=0.
// Everything gameplay-relevant (walls, doors, colliders, debris, dirt masks, clues) is defined here so the
// server, the in-browser solo sim, and the renderer all agree exactly.

export function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const T = 0.2; // wall thickness
export const ROOMS = {
  hall: { name: 'East Hallway', x0: 0, z0: 0, x1: 40, z1: 3.6, ceil: 2.95 },
  class: { name: 'Room 112', x0: 8, z0: -9, x1: 18, z1: 0, ceil: 2.95 },
  closet: { name: 'Janitor Closet', x0: 2, z0: 3.6, x1: 6, z1: 6.8, ceil: 2.6 },
  office: { name: 'Maintenance Office', x0: 20, z0: 3.6, x1: 27, z1: 10, ceil: 2.7 },
  service: { name: 'Service Corridor', x0: 40, z0: -6, x1: 44, z1: 12, ceil: 2.7 },
  storage: { name: 'Storage', x0: 44, z0: 6, x1: 50, z1: 12, ceil: 2.7 },
  stair: { name: 'West Stairwell', x0: -12, z0: 0.4, x1: 0, z1: 3.2, ceil: 3.0, y: 0, stair: true },
  lcorr: { name: 'Athletics Corridor', x0: -16, z0: -6, x1: -12, z1: 12, ceil: 3.0, y: -4 },
  gym: { name: 'Gymnasium', x0: -40, z0: -14, x1: -16, z1: 6.25, ceil: 7.5, y: -4 },
  lockers: { name: 'Locker Room', x0: -26, z0: 6.25, x1: -16, z1: 16, ceil: 2.8, y: -4 },
  pool: { name: 'Natatorium', x0: -46, z0: 6.25, x1: -26, z1: 24, ceil: 6.5, y: -4 },
};
for (const r of Object.values(ROOMS)) if (r.y == null) r.y = 0;
export const FLOORS = { upper: ['hall', 'class', 'closet', 'office', 'service', 'storage', 'stair'], athletics: ['lcorr', 'gym', 'lockers', 'pool'] };
// walking height: the stairwell descends 4 m over 8 m of steps (x -2 -> -10)
export function groundY(x, z) {
  const r = roomAt(x, z); if (!r) return x < -0.05 && z > 0 && z < 3.6 ? 0 : (x < -12 ? -4 : 0);
  const R = ROOMS[r]; if (!R.stair) return R.y;
  return x >= -2 ? 0 : x <= -10 ? -4 : (x + 2) / 2;
}
export const POOL_BASIN = { x0: -41, z0: 10, x1: -31, z1: 21, depth: 1.8, water: -4.35 };
export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  return null;
}
export function progressRoom(id) { return id === 'storage' ? 'service' : id === 'stair' ? 'lcorr' : id; }

// ---------- doors ----------
// axis 'x': the door lies in a wall of constant z, spanning x0..x1. axis 'z': wall of constant x, spanning z0..z1.
export const DOORS = [
  { id: 'd_class', axis: 'x', z: 0, a0: 9.0, a1: 10.0, hinge: 0, swing: -1, kind: 'classroom', label: '112' },
  { id: 'd_closet', axis: 'x', z: 3.6, a0: 3.5, a1: 4.5, hinge: 0, swing: 1, kind: 'closet', label: 'JANITOR' },
  { id: 'd_office', axis: 'x', z: 3.6, a0: 21.0, a1: 22.0, hinge: 0, swing: 1, kind: 'steel', label: 'MAINTENANCE', bolt: true },
  { id: 'd_service', axis: 'z', x: 40, a0: 1.3, a1: 2.3, hinge: 0, swing: 1, kind: 'service', label: 'SERVICE' },
  { id: 'd_stair', axis: 'z', x: 0, a0: 1.2, a1: 2.4, hinge: 0, swing: -1, kind: 'steel', label: 'STAIRS', lock: 'stairkey' },
  { id: 'd_gym', axis: 'z', x: -16, a0: -2.0, a1: -0.8, hinge: 0, swing: 1, kind: 'classroom', label: 'GYM', y: -4 },
  { id: 'd_lockers', axis: 'z', x: -16, a0: 9.0, a1: 10.0, hinge: 0, swing: 1, kind: 'closet', label: 'LOCKERS', y: -4 },
  { id: 'd_pool', axis: 'z', x: -26, a0: 10.0, a1: 11.0, hinge: 0, swing: 1, kind: 'service', label: 'POOL', y: -4 },
];
for (const d of DOORS) if (d.y == null) d.y = 0;
export const WINDOWS = [
  { axis: 'x', z: 0, a0: 12.0, a1: 16.0, y0: 1.05, y1: 2.15 }, // classroom interior glass onto the hallway
];

// ---------- walls (axis-aligned boxes) ----------
function hwall(z, x0, x1, gaps, h, y0 = 0) { // wall along x at constant z
  const out = []; let x = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > x) out.push({ x0: x, z0: z - T / 2, x1: g0, z1: z + T / 2, h, y0 }); x = g1; }
  if (x < x1) out.push({ x0: x, z0: z - T / 2, x1, z1: z + T / 2, h, y0 });
  return out;
}
function vwall(x, z0, z1, gaps, h, y0 = 0) {
  const out = []; let z = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > z) out.push({ x0: x - T / 2, z0: z, x1: x + T / 2, z1: g0, h, y0 }); z = g1; }
  if (z < z1) out.push({ x0: x - T / 2, z0: z, x1: x + T / 2, z1, h, y0 });
  return out;
}
export const WALLS = [
  // hallway
  ...hwall(0, -0.1, 40.1, [[9, 10], [12, 16]], 2.95),
  { x0: 12, z0: -T / 2, x1: 16, z1: T / 2, h: 2.95, glass: true },
  ...hwall(3.6, -0.1, 40.1, [[3.5, 4.5], [21, 22]], 2.95),
  ...vwall(0, 0, 3.6, [[1.2, 2.4]], 2.95),
  ...vwall(40, -6, 12, [[1.3, 2.3]], 2.95),
  // classroom
  ...vwall(8, -9.1, 0, [], 2.95), ...vwall(18, -9.1, 0, [], 2.95), ...hwall(-9, 7.9, 18.1, [], 2.95),
  // closet
  ...vwall(2, 3.6, 6.9, [], 2.6), ...vwall(6, 3.6, 6.9, [], 2.6), ...hwall(6.8, 1.9, 6.1, [], 2.6),
  // office
  ...vwall(20, 3.6, 10.1, [], 2.7), ...vwall(27, 3.6, 10.1, [], 2.7), ...hwall(10, 19.9, 27.1, [], 2.7),
  // service corridor + storage
  ...hwall(-6, 39.9, 44.1, [], 2.7), ...vwall(44, -6, 6, [], 2.7), ...hwall(6, 44, 50.1, [], 2.7),
  ...vwall(50, 6, 12.1, [], 2.7), ...hwall(12, 39.9, 50.1, [], 2.7),
  // west stairwell: 7 m tall shaft from the athletics floor (-4) up past the hallway ceiling
  ...hwall(0.4, -12, 0, [], 7, -4), ...hwall(3.2, -12, 0, [], 7, -4),
  // athletics floor (base -4)
  ...vwall(-12, -6.1, 12.1, [[0.4, 3.2]], 3, -4), ...hwall(-6, -16.1, -11.9, [], 3, -4), ...hwall(12, -16.1, -11.9, [], 3, -4),
  ...vwall(-16, -14.1, 16.1, [[-2.0, -0.8], [9.0, 10.0]], 7.5, -4),
  ...hwall(-14, -40.1, -15.9, [], 7.5, -4), ...vwall(-40, -14.1, 6.25, [], 7.5, -4),
  ...hwall(6.25, -46.1, -15.9, [], 7.5, -4),
  ...vwall(-26, 6.25, 24.1, [[10.0, 11.0]], 6.5, -4), ...hwall(16, -26.1, -15.9, [], 2.8, -4),
  ...vwall(-46, 6.25, 24.1, [], 6.5, -4), ...hwall(24, -46.1, -25.9, [], 6.5, -4),
];
for (const w of WALLS) if (w.y0 == null) w.y0 = 0;

// ---------- furniture and fixtures with collision ----------
export const LOCKER_W = 0.4, LOCKER_D = 0.45, LOCKER_H = 1.86;
export const LOCKER_RUNS = [ // [side, a0, a1]  side n = against north wall (z=0), s = south wall (z=3.6)
  ['n', 0.4, 8.8], ['n', 10.2, 11.8], ['n', 16.2, 39.6], ['s', 0.4, 3.2], ['s', 4.8, 20.8], ['s', 22.2, 39.6],
];
export const LOCKERS = (() => {
  const out = []; let num = 101;
  for (const [side, a0, a1] of LOCKER_RUNS) {
    const n = Math.floor((a1 - a0) / LOCKER_W);
    for (let i = 0; i < n; i++) {
      const x = a0 + i * LOCKER_W + LOCKER_W / 2;
      out.push({ id: 'L' + num, num, side, x, z: side === 'n' ? T / 2 + LOCKER_D / 2 : 3.6 - T / 2 - LOCKER_D / 2 });
      num++;
    }
  }
  return out;
})();
// a few lockers can actually be opened and searched (upper tier). Contents are fixed by design.
export const SEARCHABLE = {
  L104: { item: null, note: 'Empty. A pencil rolls in the bottom.' },
  L109: { item: 'supplies', note: 'Cleaning wipes. Someone left them for you.' },
  L113: { item: null, note: 'Empty. Smells of chlorine.' },
  L117: { item: 'clue:attendance', note: 'A folded attendance sheet.' },
  L126: { item: null, note: 'A gym sock. Nothing else.' },
  L140: { item: 'supplies', note: 'A pack of bin liners.' },
  L152: { item: null, note: 'Empty. The coat hook is bent upward.' },
  L161: { item: null, note: 'Taped inside the door: a 1998 class schedule. Period 7 is blank.' },
};
// lost property worth something at the Lost & Found terminal
export const LOOT_ITEMS = [['Yo-yo', 1], ['Calculator', 4], ['Walkman', 7], ['Pager', 5], ['Class ring', 12], ['Varsity patch', 3], ['Trading cards', 6], ['Mood ring', 2], ['Disposable camera', 4], ['Discman', 9], ['Virtual pet', 8], ['Gold chain', 15]];
// many more lockers can be opened: loose change, lost property, or nothing (deterministic)
(() => {
  const R = rng(4242);
  const notes = ['Empty.', 'Empty, apart from old gum.', 'A crumpled hall pass.', 'Textbooks, swollen with damp.', 'A photo strip, faces scratched out.'];
  for (const L of LOCKERS) {
    if (SEARCHABLE[L.id] || R() > 0.3) continue;
    const t = R();
    if (t < 0.55) { const c = [0.25, 0.5, 0.75, 1, 1.35, 2, 3.1][R() * 7 | 0]; SEARCHABLE[L.id] = { item: 'coins:' + c, note: `Loose change: $${c.toFixed(2)}.` }; }
    else if (t < 0.82) { const [n, v] = LOOT_ITEMS[R() * LOOT_ITEMS.length | 0]; SEARCHABLE[L.id] = { item: 'loot:' + n + ':' + v, note: `${n}. Lost & Found pays $${v}.` }; }
    else SEARCHABLE[L.id] = { item: null, note: notes[R() * notes.length | 0] };
  }
})();
export const TEACHER_DESK = { x: 9.8, z: -7.55 };
export const FURNITURE = (() => {
  const f = [];
  for (const [side, a0, a1] of LOCKER_RUNS) {
    const z0 = side === 'n' ? T / 2 : 3.6 - T / 2 - LOCKER_D, z1 = z0 + LOCKER_D;
    f.push({ kind: 'lockers', x0: a0, z0, x1: a0 + Math.floor((a1 - a0) / LOCKER_W) * LOCKER_W, z1, h: LOCKER_H });
  }
  // classroom: 4x4 desks with chairs
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = 10.6 + c * 1.6, z = -7.0 + r * 1.55;
    f.push({ kind: 'desk', x0: x - 0.32, z0: z - 0.24, x1: x + 0.32, z1: z + 0.24, h: 0.74, cx: x, cz: z, rot: (Math.sin(r * 7 + c * 3) * 0.08) });
  }
  f.push({ kind: 'teacher', x0: 9.0, z0: -8.5, x1: 10.6, z1: -7.75, h: 0.76 });
  f.push({ kind: 'cabinet', x0: 8.1, z0: -6.4, x1: 8.6, z1: -4.2, h: 1.2 });
  f.push({ kind: 'cabinet', x0: 17.4, z0: -8.9, x1: 17.9, z1: -6.9, h: 1.9 });
  // closet
  f.push({ kind: 'shelf', x0: 2.15, z0: 6.25, x1: 5.85, z1: 6.7, h: 2.0 });
  f.push({ kind: 'rack', x0: 5.45, z0: 4.2, x1: 5.9, z1: 6.0, h: 1.8 });
  f.push({ kind: 'sink', x0: 2.1, z0: 4.0, x1: 2.6, z1: 4.8, h: 0.9 });
  // office
  f.push({ kind: 'pcdesk', x0: 25.6, z0: 4.6, x1: 26.9, z1: 6.6, h: 0.75 });
  f.push({ kind: 'bench', x0: 22.0, z0: 9.25, x1: 25.4, z1: 9.9, h: 0.92 });
  f.push({ kind: 'cot', x0: 20.1, z0: 6.6, x1: 20.95, z1: 8.7, h: 0.45 });
  f.push({ kind: 'oshelf', x0: 26.45, z0: 7.2, x1: 26.9, z1: 9.7, h: 2.0 });
  // service corridor and storage
  f.push({ kind: 'chairs', x0: 42.6, z0: -2.4, x1: 43.8, z1: -1.4, h: 1.3 });
  f.push({ kind: 'sshelf', x0: 45.0, z0: 7.4, x1: 49.0, z1: 7.85, h: 2.1 });
  f.push({ kind: 'sshelf', x0: 45.0, z0: 9.7, x1: 49.0, z1: 10.15, h: 2.1 });
  f.push({ kind: 'boxes', x0: 40.2, z0: 8.4, x1: 41.0, z1: 9.6, h: 1.0 });
  // athletics floor
  f.push({ kind: 'bleachers', x0: -38.5, z0: -13.8, x1: -17.5, z1: -11.0, h: 1.9, y0: -4 });
  f.push({ kind: 'mats', x0: -38.0, z0: 2.5, x1: -34.0, z1: 5.8, h: 0.6, y0: -4 });
  f.push({ kind: 'ballcart', x0: -18.6, z0: 3.6, x1: -17.4, z1: 4.4, h: 1.0, y0: -4 });
  f.push({ kind: 'benchL', x0: -24.0, z0: 10.0, x1: -18.0, z1: 10.4, h: 0.45, y0: -4 });
  f.push({ kind: 'benchL', x0: -24.0, z0: 13.0, x1: -18.0, z1: 13.4, h: 0.45, y0: -4 });
  f.push({ kind: 'blockers', x0: -25.9, z0: 6.45, x1: -16.4, z1: 6.95, h: 1.9, y0: -4 });
  f.push({ kind: 'blockers', x0: -25.9, z0: 15.3, x1: -18.5, z1: 15.85, h: 1.9, y0: -4 });
  f.push({ kind: 'pool', x0: -41, z0: 10, x1: -31, z1: 21, h: 0.05, y0: -4 });
  f.push({ kind: 'lifeguard', x0: -29.3, z0: 14.6, x1: -28.4, z1: 15.6, h: 2.2, y0: -4 });
  for (const f0 of f) if (f0.y0 == null) f0.y0 = 0;
  return f;
})();
export const BINS = [ // emptying points
  { id: 'bin_closet', x: 2.5, z: 5.6, room: 'closet' },
  { id: 'bin_office', x: 20.45, z: 4.3, room: 'office' },
  { id: 'bin_hall', x: 39.2, z: 3.0, room: 'hall' },
];
export const TOOL_RACK = { x: 5.4, z: 5.1 };
export const BUCKET = { x: 3.2, z: 5.0 };
export const CART_HOME = { x: 4.0, z: 2.6, yaw: Math.PI / 2 };
export const ROOMBA_DOCK = { x: 24.2, z: 9.0 };
export const COMPUTER = { x: 26.1, z: 5.6 };
export const COT = { x: 20.6, z: 7.6 };
export const VENT = { x: 42.0, z: -5.85, y: 0.45 };
export const SPAWN = { x: 23.5, z: 7.2, yaw: 0 };

// ---------- lights (ceiling fixtures) ----------
export const LIGHTS = (() => {
  const L = [];
  for (let k = 0; k < 13; k++) {
    const x = 1.5 + k * 3; let state = 'on';
    if (x > 16 && x < 31) state = ['on', 'flicker', 'on', 'off', 'on'][k % 5];
    if (x >= 31) state = x > 32 && x < 34 ? 'flicker' : 'off';
    L.push({ x, z: 1.8, y: 2.93, state, room: 'hall', color: 0xf4f6ff, i: 1 });
  }
  for (const [x, z, s] of [[10.5, -6, 'on'], [13, -6, 'off'], [15.5, -6, 'on'], [10.5, -3, 'on'], [13, -3, 'flicker'], [15.5, -3, 'on']]) L.push({ x, z, y: 2.93, state: s, room: 'class', color: 0xf6f3e8, i: 1 });
  L.push({ x: 4, z: 5.2, y: 2.55, state: 'on', room: 'closet', color: 0xffd9a0, i: 0.8, bulb: true });
  L.push({ x: 22.5, z: 6.6, y: 2.68, state: 'on', room: 'office', color: 0xfff0d8, i: 0.9 });
  L.push({ x: 25.2, z: 6.6, y: 2.68, state: 'on', room: 'office', color: 0xfff0d8, i: 0.9 });
  L.push({ x: 42, z: -4.5, y: 2.6, state: 'on', room: 'service', color: 0xff3020, i: 0.35, emergency: true });
  L.push({ x: 42, z: 5.5, y: 2.68, state: 'flicker', room: 'service', color: 0xe8f0ff, i: 0.8 });
  L.push({ x: 47, z: 9, y: 2.68, state: 'off', room: 'storage', color: 0xe8f0ff, i: 0.8 });
  // stairwell + athletics floor
  L.push({ x: -1, z: 1.8, y: 2.95, state: 'on', room: 'stair', color: 0xf0f2ff, i: 0.8 });
  L.push({ x: -11, z: 1.8, y: -1.05, state: 'flicker', room: 'stair', color: 0xf0f2ff, i: 0.8 });
  for (const z of [-3, 4, 10]) L.push({ x: -14, z, y: -1.05, state: z === 4 ? 'off' : 'on', room: 'lcorr', color: 0xf2f4ff, i: 0.9 });
  for (const x of [-35, -28, -21]) for (const z of [-8, 1]) L.push({ x, z, y: 3.4, state: x === -28 && z === 1 ? 'flicker' : 'on', room: 'gym', color: 0xfff4e0, i: 2.2, high: true });
  for (const x of [-23, -19]) L.push({ x, z: 11.5, y: -1.25, state: x === -19 ? 'flicker' : 'on', room: 'lockers', color: 0xe8f4ff, i: 0.8 });
  for (const x of [-42, -34]) for (const z of [11, 19]) L.push({ x, z, y: 2.4, state: x === -42 && z === 19 ? 'off' : 'on', room: 'pool', color: 0xe8f8ff, i: 1.6, high: true });
  return L;
})();

// ---------- the Monitor's waypoints ----------
export const PATROL = [[-14, 4], [-24, -4], [-30, 8.5], [-22, 11.5], [47.5, 11.0], [42, -3.5], [42, 7.5], [36, 1.8], [27, 1.8], [17, 1.8], [6, 1.8], [13, -4.5], [4, 2.2], [24, 1.8]];
export const WATCH_POINTS = [
  { x: 14, z: -0.9, yaw: 0, note: 'classroom glass' },        // inside 112, looking out through the glass
  { x: 14, z: 1.0, yaw: Math.PI, note: 'hall at glass' },     // hallway, looking in
  { x: 39.0, z: 1.8, yaw: -Math.PI / 2, note: 'service junction' },
  { x: 42, z: 0.5, yaw: -Math.PI / 2, note: 'service door' },
  { x: 21.5, z: 2.2, yaw: 0, note: 'outside office' },
];
export const LAIR = { x: 47.5, z: 11.0 };

// ---------- clues ----------
export const CLUES = {
  scratched_name: { title: 'Scratched into the floor', where: 'Room 112, under the mud', text: 'M. ARDEN 3B  PRESENT  6/11/98\nThe official evacuation list says Margaret Arden was signed out at 9:42 PM.' },
  attendance: { title: 'Attendance sheet, Period 7', where: 'Locker 117', text: 'Room 014, 11 June 1998. Fourteen names, every one marked ABSENT in a different pen from the register.\nEach mark is initialled R.V.' },
  vent_voice: { title: 'A voice in the vent', where: 'Service corridor grille', text: 'Through the grille, very faint, someone is reading a register. "Arden. Bell. Castellano. Dorsey..." Each name is followed by a pause, as if waiting for an answer.' },
  room014: { title: 'Work order: Room 014', where: 'contracts.exe', text: 'New assignment: Room 014, deep clean, priority. The floor plan has no Room 014.' },
  key: { title: 'Stairwell key', where: "Teacher's desk, Room 112", text: 'A key ring tagged STAIRWELL W - ATHLETICS. It fits the chained doors at the west end of the hall.' },
  plate014: { title: 'Painted-over room plate', where: 'Hallway, west end', text: 'Under a coat of wall paint, the outline of a brass plate: 014. Beside the chained doors.' },
};

// ---------- debris (deterministic, stable ids) ----------
export const DEBRIS_KINDS = ['dust', 'crumb', 'scrap', 'confetti', 'lint', 'coin'];
const insideFurnitureLow = () => false;
export function insideFurniture(x, z, pad = 0.05) {
  for (const f of FURNITURE) if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return true;
  for (const w of WALLS) if (x > w.x0 - pad && x < w.x1 + pad && z > w.z0 - pad && z < w.z1 + pad) return true;
  return false;
}
export const DEBRIS = (() => {
  const R = rng(1998);
  const out = [];
  const areas = [
    { room: 'hall', x0: 0.4, z0: 0.6, x1: 39.6, z1: 3.0, n: 2700, edge: true },
    { room: 'class', x0: 8.25, z0: -8.75, x1: 17.75, z1: -0.25, n: 1400 },
    { room: 'service', x0: 40.25, z0: -5.75, x1: 43.75, z1: 11.75, n: 520 },
    { room: 'service', x0: 44.1, z0: 6.25, x1: 49.75, z1: 11.75, n: 260 },
    { room: 'closet', x0: 2.25, z0: 3.85, x1: 5.75, z1: 6.55, n: 140 },
    { room: 'lcorr', x0: -15.75, z0: -5.75, x1: -12.25, z1: 11.75, n: 380 },
    { room: 'gym', x0: -39.6, z0: -10.8, x1: -16.4, z1: 5.9, n: 1500 },
    { room: 'lockers', x0: -25.7, z0: 7.1, x1: -16.3, z1: 15.1, n: 520 },
    { room: 'pool', x0: -45.6, z0: 6.6, x1: -26.4, z1: 9.8, n: 260 },
    { room: 'pool', x0: -45.6, z0: 21.2, x1: -26.4, z1: 23.6, n: 220 },
    { room: 'pool', x0: -30.8, z0: 9.8, x1: -26.4, z1: 21.2, n: 200 },
  ];
  for (const a of areas) {
    // clumps make satisfying drifts; the rest is scattered
    const clumps = Array.from({ length: Math.ceil(a.n / 90) }, () => [a.x0 + R() * (a.x1 - a.x0), a.z0 + R() * (a.z1 - a.z0), 0.25 + R() * 0.6]);
    let made = 0, guard = 0;
    while (made < a.n && guard++ < a.n * 20) {
      let x, z;
      const t = R();
      if (t < 0.55) { const c = clumps[R() * clumps.length | 0]; const ang = R() * 6.283, rr = Math.sqrt(R()) * c[2]; x = c[0] + Math.cos(ang) * rr; z = c[1] + Math.sin(ang) * rr; }
      else if (a.edge && t < 0.8) { x = a.x0 + R() * (a.x1 - a.x0); z = R() < 0.5 ? a.z0 + R() * 0.3 : a.z1 - R() * 0.3; }
      else { x = a.x0 + R() * (a.x1 - a.x0); z = a.z0 + R() * (a.z1 - a.z0); }
      if (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1) continue;
      if (insideFurniture(x, z, 0.04)) continue;
      const k = R();
      const kind = k < 0.012 ? 5 : k < 0.42 ? 0 : k < 0.62 ? 1 : k < 0.8 ? 2 : k < 0.9 ? 3 : 4; // 5 = a dropped coin
      out.push({ id: out.length, x, z, kind, rot: R() * 6.283, s: 0.7 + R() * 0.7, c: R(), room: a.room });
      made++;
    }
  }
  return out;
})();
export const DEBRIS_TOTAL_BY_ROOM = DEBRIS.reduce((m, d) => (m[d.room] = (m[d.room] || 0) + 1, m), {});

// ---------- dirt masks (persistent, exact) ----------
export const PATCHES = [
  { id: 'hall_dust', type: 'dust', room: 'hall', x0: 0.4, z0: 0.55, x1: 39.6, z1: 3.05, res: 4 },
  { id: 'hall_mud', type: 'mud', room: 'hall', x0: 26, z0: 0.9, x1: 37, z1: 2.7, res: 10 },
  { id: 'class_mud', type: 'mud', room: 'class', x0: 10.2, z0: -7.3, x1: 16.9, z1: -1.4, res: 10 },
  { id: 'service_dust', type: 'dust', room: 'service', x0: 40.2, z0: -5.8, x1: 43.8, z1: 11.8, res: 4 },
  { id: 'class_dust', type: 'dust', room: 'class', x0: 8.2, z0: -8.8, x1: 17.8, z1: -0.2, res: 4 },
  { id: 'gym_dust', type: 'dust', room: 'gym', x0: -39.8, z0: -10.9, x1: -16.2, z1: 6.05, res: 3 },
  { id: 'gym_mud', type: 'mud', room: 'gym', x0: -31, z0: -6, x1: -24, z1: 1, res: 8 },
  { id: 'lockers_mud', type: 'mud', room: 'lockers', x0: -24.5, z0: 10.6, x1: -17.5, z1: 12.8, res: 10 },
  { id: 'pool_mud', type: 'mud', room: 'pool', x0: -45.6, z0: 6.5, x1: -26.4, z1: 9.8, res: 6 },
];
for (const p of PATCHES) { p.w = Math.round((p.x1 - p.x0) * p.res); p.h = Math.round((p.z1 - p.z0) * p.res); }
function vnoise(R) { // tiny value-noise generator for blob shapes
  const g = new Float32Array(64 * 64); for (let i = 0; i < g.length; i++) g[i] = R();
  const s = (x, y) => g[((y & 63) * 64 + (x & 63))];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (s(xi, yi) * (1 - u) + s(xi + 1, yi) * u) * (1 - v) + (s(xi, yi + 1) * (1 - u) + s(xi + 1, yi + 1) * u) * v; };
}
export function initialMask(p) {
  const R = rng(p.id.length * 977 + p.w * 31), n = vnoise(R), m = new Uint8Array(p.w * p.h);
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const x = p.x0 + (i + 0.5) / p.res, z = p.z0 + (j + 0.5) / p.res;
    if (insideFurniture(x, z, -0.02) && !insideFurnitureLow(x, z)) continue; // never ask the player to clean under a desk leg
    let v = 0;
    if (p.type === 'dust') {
      const edge = Math.min(Math.abs(z - p.z0), Math.abs(p.z1 - z));
      v = 0.35 + 0.5 * n(x * 0.9, z * 0.9) + (edge < 0.4 ? 0.25 : 0);
    } else if (p.type === 'mud' && p.id !== 'hall_mud') {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const d = Math.hypot((x - cx) / ((p.x1 - p.x0) * 0.45), (z - cz) / ((p.z1 - p.z0) * 0.44));
      v = (1.25 - d) * 1.6 + (n(x * 1.6, z * 1.6) - 0.5) * 1.3;
      v = Math.max(0, Math.min(1, v));
    } else if (p.id === 'hall_mud') {
      // a trail of muddy boot prints heading toward the service door
      const k = Math.floor((x - p.x0) / 0.36), side = k % 2 ? 1 : -1;
      const px = p.x0 + (k + 0.5) * 0.36, pz = 1.8 + side * 0.17 + Math.sin(k * 0.7) * 0.15;
      const dx = (x - px) / 0.12, dz = (z - pz) / 0.055;
      v = dx * dx + dz * dz < 1 ? 0.95 : 0;
      v = Math.max(v, (n(x * 3, z * 3) - 0.72) * 3);
      v = Math.max(0, Math.min(1, v));
    }
    m[j * p.w + i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  return m;
}
export const CLUE_SPOT = { patch: 'class_mud', x: 13.6, z: -4.4, r: 0.55 };

// ---------- geometry queries shared by movement, AI and rendering ----------
export function doorRect(d, open) { // collider rect for a closed door (null when open)
  if (open) return null;
  return d.axis === 'x' ? { x0: d.a0, z0: d.z - 0.05, x1: d.a1, z1: d.z + 0.05 } : { x0: d.x - 0.05, z0: d.a0, x1: d.x + 0.05, z1: d.a1 };
}
export function doorCenter(d) { return d.axis === 'x' ? { x: (d.a0 + d.a1) / 2, z: d.z } : { x: d.x, z: (d.a0 + d.a1) / 2 }; }
export function solidRects(doorState) {
  const out = [...WALLS, ...FURNITURE];
  for (const d of DOORS) { const r = doorRect(d, doorState?.[d.id]?.open); if (r) out.push({ ...r, door: d.id }); }
  return out;
}
// circle-vs-rect slide movement
export function moveCircle(x, z, dx, dz, r, rects) {
  const hit = (px, pz) => { for (const b of rects) { const nx = Math.max(b.x0, Math.min(px, b.x1)), nz = Math.max(b.z0, Math.min(pz, b.z1)); if ((px - nx) ** 2 + (pz - nz) ** 2 < r * r) return true; } return false; };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let s = 0; s < steps; s++) {
    const sx = dx / steps, sz = dz / steps;
    if (!hit(x + sx, z)) x += sx;
    if (!hit(x, z + sz)) z += sz;
  }
  return [x, z];
}
// line of sight: walls and closed doors block; glass does not block sight
export function segBlocked(x0, z0, x1, z1, rects, { sight = false } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  for (const b of rects) {
    if (sight && (b.glass || (b.h != null && b.h < 1.5 && !b.door))) continue; // see over desks, through glass
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[x0, dx, b.x0, b.x1], [z0, dz, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return true;
  }
  return false;
}
export function wallsBetween(x0, z0, x1, z1, rects) { // count of wall/door slabs a sound passes through
  let n = 0; const dx = x1 - x0, dz = z1 - z0;
  for (const b of rects) {
    if (!(b.door || (b.h != null && b.h > 2))) continue;
    if (segBlocked(x0, z0, x1, z1, [b])) n++;
  }
  return n;
}

// ---------- navigation grid for the Monitor ----------
export const NAV = { x0: -47, z0: -15, cell: 0.5, w: 196, h: 80 };
export function buildNav(r = 0.32) {
  const g = new Uint8Array(NAV.w * NAV.h); // 0 open, 1 blocked, 2+i = door i gap
  const rects = [...WALLS, ...FURNITURE];
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) {
    const x = NAV.x0 + (i + 0.5) * NAV.cell, z = NAV.z0 + (j + 0.5) * NAV.cell;
    let inside = false; for (const k in ROOMS) { const R = ROOMS[k]; if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) inside = true; }
    let blocked = !inside;
    for (const b of rects) { const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1)); if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) { blocked = true; break; } }
    let door = -1;
    DOORS.forEach((d, di) => { const c = doorCenter(d); if (Math.abs(x - c.x) < (d.axis === 'x' ? 0.5 : 0.45) && Math.abs(z - c.z) < (d.axis === 'x' ? 0.45 : 0.5)) door = di; });
    g[j * NAV.w + i] = door >= 0 ? 2 + door : blocked ? 1 : 0;
  }
  return g;
}
export function navCell(x, z) { return [Math.floor((x - NAV.x0) / NAV.cell), Math.floor((z - NAV.z0) / NAV.cell)]; }
export function navPos(i, j) { return [NAV.x0 + (i + 0.5) * NAV.cell, NAV.z0 + (j + 0.5) * NAV.cell]; }
// A* on the grid. passDoor(i) decides whether door i can be traversed.
export function findPath(nav, sx, sz, tx, tz, passDoor) {
  const W = NAV.w, H = NAV.h;
  const ok = (i, j) => { if (i < 0 || j < 0 || i >= W || j >= H) return false; const v = nav[j * W + i]; return v === 0 || (v >= 2 && passDoor(v - 2)); };
  let [si, sj] = navCell(sx, sz), [ti, tj] = navCell(tx, tz);
  const near = (i, j) => { if (ok(i, j)) return [i, j]; for (let r = 1; r < 5; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (ok(i + a, j + b)) return [i + a, j + b]; return null; };
  const s = near(si, sj), t = near(ti, tj); if (!s || !t) return null;
  [si, sj] = s; [ti, tj] = t;
  const g = new Float32Array(W * H).fill(1e9), came = new Int32Array(W * H).fill(-1), open = [], closed = new Uint8Array(W * H);
  const k0 = sj * W + si; g[k0] = 0; open.push([Math.hypot(ti - si, tj - sj), k0]);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, k] = open.splice(bi, 1)[0]; if (closed[k]) continue; closed[k] = 1;
    const i = k % W, j = (k / W) | 0;
    if (i === ti && j === tj) break;
    for (const [a, b, c] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
      const ni = i + a, nj = j + b; if (!ok(ni, nj)) continue;
      if (a && b && (!ok(i + a, j) || !ok(i, j + b))) continue;
      const nk = nj * W + ni, ng = g[k] + c; if (ng < g[nk]) { g[nk] = ng; came[nk] = k; open.push([ng + Math.hypot(ti - ni, tj - nj), nk]); }
    }
  }
  const tk = tj * W + ti; if (came[tk] < 0 && tk !== k0) return null;
  const path = []; for (let k = tk; k !== -1 && k !== k0; k = came[k]) path.push(navPos(k % W, (k / W) | 0));
  path.reverse(); return path;
}
