import type { DefenderSpec, PlayerSpec } from './schema';
import { type Hash, sidelineDistance } from './field';

// ---------------------------------------------------------------------------
// Formation builders. Formations are described in OFFENSE terms (strength
// "right" = the offense's right) and resolved into field coordinates, where
// +x is the DEFENSE's right. So the offense's right side is at negative x.
// Splits use landmarks relative to the hash so spacing stays plausible.
// ---------------------------------------------------------------------------

export type Side = 'R' | 'L';
/** Field-x sign of an offensive side. */
export const sx = (side: Side): 1 | -1 => (side === 'R' ? -1 : 1);
export const other = (side: Side): Side => (side === 'R' ? 'L' : 'R');

export const OL_SPACING = 1.35; // center-to-center, ~2-ft splits
export const LINE_DEPTH = 0.8; // linemen's hips behind the ball
export const ON_LINE_DEPTH = 0.65; // receivers on the line
export const OFF_LINE_DEPTH = 1.6; // receivers off the line (backs)

/** Outside receiver split ("on the numbers" to the field, tighter to the boundary). */
export function wideX(side: Side, hash: Hash): number {
  const s = sx(side);
  const d = sidelineDistance(hash, s);
  const split = d >= 30 ? d - 9 : d >= 22 ? d - 8 : d - 6;
  return s * split;
}
/** Slot receiver: roughly split the difference between the tackle and the wideout. */
export function slotX(side: Side, hash: Hash): number {
  const w = Math.abs(wideX(side, hash));
  return sx(side) * Math.min(9.5, Math.max(6, w * 0.48));
}

const P = (
  id: string,
  role: PlayerSpec['role'],
  label: string,
  number: number,
  x: number,
  y: number,
  onLine: boolean,
  stance: PlayerSpec['stance'],
): PlayerSpec => ({ id, role, label, number, x: round(x), y: round(y), onLine, stance, facing: 0 });

const round = (v: number) => Math.round(v * 100) / 100;

export function offensiveLine(): PlayerSpec[] {
  // LT is on the offense's LEFT = defense's right (+x).
  return [
    P('LT', 'OL', 'LT', 72, 2 * OL_SPACING, LINE_DEPTH, true, 'three-point'),
    P('LG', 'OL', 'LG', 64, OL_SPACING, LINE_DEPTH, true, 'three-point'),
    P('C', 'OL', 'C', 55, 0, LINE_DEPTH - 0.05, true, 'center'),
    P('RG', 'OL', 'RG', 66, -OL_SPACING, LINE_DEPTH, true, 'three-point'),
    P('RT', 'OL', 'RT', 78, -2 * OL_SPACING, LINE_DEPTH, true, 'three-point'),
  ];
}

const attachedTE = (side: Side) => sx(side) * 3 * OL_SPACING;

export const QB_GUN = () => P('QB', 'QB', 'QB', 7, 0, 5, false, 'qb-gun');
export const QB_UC = () => P('QB', 'QB', 'QB', 7, 0, 1.25, false, 'qb-center');

export interface FormationDef {
  key: string;
  name: string;
  personnel: string;
  build: (hash: Hash, strength: Side) => PlayerSpec[];
}

export const FORMATIONS: FormationDef[] = [
  {
    key: 'doubles-11',
    name: 'Doubles (TE attached)',
    personnel: '11',
    build: (h, st) => [
      ...offensiveLine(),
      QB_GUN(),
      P('RB', 'RB', 'RB', 22, sx(other(st)) * 1.4, 5.2, false, 'rb'),
      P('Y', 'TE', 'Y', 88, attachedTE(st), LINE_DEPTH, true, 'three-point'),
      P('Z', 'WR', 'Z', 11, wideX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
      P('H', 'WR', 'H', 3, slotX(other(st), h), OFF_LINE_DEPTH, false, 'wr'),
    ],
  },
  {
    key: 'doubles-10',
    name: 'Doubles (4 WR)',
    personnel: '10',
    build: (h, st) => [
      ...offensiveLine(),
      QB_GUN(),
      P('RB', 'RB', 'RB', 22, sx(other(st)) * 1.4, 5.2, false, 'rb'),
      P('Z', 'WR', 'Z', 11, wideX(st, h), ON_LINE_DEPTH, true, 'wr'),
      P('Y', 'WR', 'Y', 9, slotX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
      P('H', 'WR', 'H', 3, slotX(other(st), h), OFF_LINE_DEPTH, false, 'wr'),
    ],
  },
  {
    key: 'trips-10',
    name: 'Trips',
    personnel: '10',
    build: (h, st) => {
      const w = wideX(st, h);
      const s = sx(st);
      return [
        ...offensiveLine(),
        QB_GUN(),
        P('RB', 'RB', 'RB', 22, sx(other(st)) * 1.4, 5.2, false, 'rb'),
        P('Z', 'WR', 'Z', 11, w, ON_LINE_DEPTH, true, 'wr'),
        P('H', 'WR', 'H', 3, s * Math.max(9, Math.abs(w) - 5), OFF_LINE_DEPTH, false, 'wr'),
        P('Y', 'WR', 'Y', 9, s * 5.6, OFF_LINE_DEPTH, false, 'wr'),
        P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
      ];
    },
  },
  {
    key: 'trey-11',
    name: 'Trey (TE + 2 WR)',
    personnel: '11',
    build: (h, st) => [
      ...offensiveLine(),
      QB_GUN(),
      P('RB', 'RB', 'RB', 22, sx(other(st)) * 1.4, 5.2, false, 'rb'),
      P('Y', 'TE', 'Y', 88, attachedTE(st), LINE_DEPTH, true, 'three-point'),
      P('Z', 'WR', 'Z', 11, wideX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('H', 'WR', 'H', 3, slotX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
    ],
  },
  {
    key: 'bunch-10',
    name: 'Bunch',
    personnel: '10',
    build: (h, st) => {
      const s = sx(st);
      const c = s * 7.2;
      return [
        ...offensiveLine(),
        QB_GUN(),
        P('RB', 'RB', 'RB', 22, sx(other(st)) * 1.4, 5.2, false, 'rb'),
        P('Z', 'WR', 'Z', 11, c, ON_LINE_DEPTH, true, 'wr'),
        P('H', 'WR', 'H', 3, c - s * 1.2, OFF_LINE_DEPTH + 0.2, false, 'wr'),
        P('Y', 'WR', 'Y', 9, c + s * 1.2, OFF_LINE_DEPTH + 0.2, false, 'wr'),
        P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
      ];
    },
  },
  {
    key: 'empty-10',
    name: 'Empty (3x2)',
    personnel: '10',
    build: (h, st) => {
      const s = sx(st);
      return [
        ...offensiveLine(),
        QB_GUN(),
        P('Z', 'WR', 'Z', 11, wideX(st, h), ON_LINE_DEPTH, true, 'wr'),
        P('H', 'WR', 'H', 3, s * Math.max(9, Math.abs(wideX(st, h)) - 5), OFF_LINE_DEPTH, false, 'wr'),
        P('RB', 'RB', 'RB', 22, s * 5.4, OFF_LINE_DEPTH, false, 'wr'),
        P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
        P('Y', 'WR', 'Y', 9, slotX(other(st), h), OFF_LINE_DEPTH, false, 'wr'),
      ];
    },
  },
  {
    key: 'i-21',
    name: 'I-Formation (Pro)',
    personnel: '21',
    build: (h, st) => [
      ...offensiveLine(),
      QB_UC(),
      P('FB', 'FB', 'F', 44, 0, 4.4, false, 'three-point'),
      P('RB', 'RB', 'RB', 22, 0, 7, false, 'rb'),
      P('Y', 'TE', 'Y', 88, attachedTE(st), LINE_DEPTH, true, 'three-point'),
      P('Z', 'WR', 'Z', 11, wideX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('X', 'WR', 'X', 1, wideX(other(st), h), ON_LINE_DEPTH, true, 'wr'),
    ],
  },
  {
    key: 'pistol-12',
    name: 'Pistol Twins (2 TE)',
    personnel: '12',
    build: (h, st) => [
      ...offensiveLine(),
      P('QB', 'QB', 'QB', 7, 0, 4, false, 'qb-gun'),
      P('RB', 'RB', 'RB', 22, 0, 6.8, false, 'rb'),
      P('Y', 'TE', 'Y', 88, attachedTE(st), LINE_DEPTH, true, 'three-point'),
      P('F', 'TE', 'F', 85, attachedTE(other(st)), LINE_DEPTH, true, 'three-point'),
      P('Z', 'WR', 'Z', 11, wideX(st, h), OFF_LINE_DEPTH, false, 'wr'),
      P('X', 'WR', 'X', 1, sx(st) * Math.max(9, Math.abs(wideX(st, h)) - 6), OFF_LINE_DEPTH + 0.2, false, 'wr'),
    ],
  },
];

export function buildFormation(key: string, hash: Hash, strength: Side): PlayerSpec[] {
  const f = FORMATIONS.find((d) => d.key === key);
  if (!f) throw new Error(`Unknown formation ${key}`);
  return f.build(hash, strength);
}

// ---------------------------------------------------------------------------
// Example defensive alignment (4-2-5 look). Coaches can drag every defender in
// the editor — this only seeds a reasonable picture of teammates.
// ---------------------------------------------------------------------------
export function exampleDefense(players: PlayerSpec[]): DefenderSpec[] {
  const recv = players.filter((p) => p.role === 'WR' || p.role === 'TE' || (p.role === 'RB' && Math.abs(p.x) > 4));
  const left = recv.filter((p) => p.x < 0).length;
  const right = recv.filter((p) => p.x > 0).length;
  const te = players.find((p) => p.role === 'TE');
  const st: 1 | -1 = right > left ? 1 : left > right ? -1 : te ? (te.x > 0 ? 1 : -1) : 1;
  const edgeOf = (s: 1 | -1) => {
    const line = players.filter((p) => p.onLine && (p.role === 'OL' || p.role === 'TE') && Math.sign(p.x) === s);
    const m = line.length ? Math.max(...line.map((p) => Math.abs(p.x))) : 2.7;
    return s * (m + 0.9);
  };
  const widest = (s: 1 | -1) =>
    recv.filter((p) => Math.sign(p.x) === s).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
  const second = (s: 1 | -1) =>
    recv.filter((p) => Math.sign(p.x) === s).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[1];
  const cb = (s: 1 | -1) => {
    const w = widest(s);
    return w ? w.x - s * 0.8 : s * 16;
  };
  const n2 = second(st);
  const nickelX = n2 ? (n2.x + edgeOf(st)) / 2 : st * 6;
  const r = (v: number) => Math.round(v * 10) / 10;
  return [
    { id: 'DEL', label: 'E', x: r(edgeOf(-1)), depth: 1, stance: 'three-point', position: 'EDGE' },
    { id: 'DTL', label: 'T', x: st === -1 ? -2.0 : -0.65, depth: 1, stance: 'three-point' },
    { id: 'DTR', label: 'N', x: st === 1 ? 2.0 : 0.65, depth: 1, stance: 'three-point' },
    { id: 'DER', label: 'E', x: r(edgeOf(1)), depth: 1, stance: 'three-point', position: 'EDGE' },
    { id: 'M', label: 'M', x: r(st * 1.2), depth: 5, stance: 'lb', position: 'LB' },
    { id: 'W', label: 'W', x: r(-st * 3.4), depth: 5, stance: 'lb', position: 'LB' },
    { id: 'N', label: 'N', x: r(nickelX), depth: 4.5, stance: 'lb' },
    { id: 'CBL', label: 'C', x: r(cb(-1)), depth: 7, stance: 'db', position: 'CB' },
    { id: 'CBR', label: 'C', x: r(cb(1)), depth: 7, stance: 'db', position: 'CB' },
    { id: 'SS', label: 'S', x: r(st * 6), depth: 9, stance: 'db', position: 'S' },
    { id: 'FS', label: 'F', x: r(-st * 1.5), depth: 12, stance: 'db', position: 'S' },
  ];
}
