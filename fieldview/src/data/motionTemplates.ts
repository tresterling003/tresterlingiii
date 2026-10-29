import type { Drill, Movement, PlayerSpec } from './schema';
import { buildFormation, exampleDefense, FORMATIONS, sx, other, type Side } from './formations';
import type { Hash } from './field';

// Quick-build motion templates for ad-hoc coach reps. They pick a legal player
// from the formation (an off-the-line receiver or back) and generate a path.

export const MOTION_TYPES = {
  none: 'No motion',
  jet: 'Jet (full speed, snap during)',
  across: 'Across (sets on other side)',
  return: 'Return (starts across, comes back)',
  orbit: 'Orbit (behind the QB)',
  'rb-out': 'RB motion out (to empty)',
  zip: 'Zip (wideout in to tight split)',
  fly: 'Out of formation (to the weak side)',
  'te-shift': 'Shift: TE across',
} as const;
export type MotionType = keyof typeof MOTION_TYPES;

let n = 0;
const mv = (playerId: string, kind: Movement['kind'], start: number, path: [number, number][], speed: number, extra: Partial<Movement> = {}): Movement => ({
  id: `q${++n}`,
  playerId,
  kind,
  start,
  anchor: 'rep',
  path: path.map(([x, y]) => ({ x: Math.round(x * 100) / 100, y })),
  speed,
  curve: 'smooth',
  noStop: false,
  ...extra,
});

const offLineReceivers = (p: PlayerSpec[]) => p.filter((q) => (q.role === 'WR' || q.role === 'TE') && !q.onLine);

export function applyMotion(players: PlayerSpec[], type: MotionType, strength: Side): { movements: Movement[]; snapTime: number; error?: string; edit?: (p: PlayerSpec[]) => void } {
  const s = sx(strength);
  const ws = sx(other(strength));
  const strongSide = (q: PlayerSpec) => Math.sign(q.x) === s;
  const off = offLineReceivers(players);
  const pickOuter = (list: PlayerSpec[]) => [...list].sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
  const pickInner = (list: PlayerSpec[]) => [...list].sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  switch (type) {
    case 'none':
      return { movements: [], snapTime: 5 };
    case 'jet': {
      const p = pickOuter(off.filter(strongSide)) ?? pickOuter(off);
      if (!p) return { movements: [], snapTime: 5, error: 'No off-the-line receiver available for jet motion.' };
      const d = -Math.sign(p.x);
      return { movements: [mv(p.id, 'motion', -2.4, [[p.x + d * 6, 2.0], [-d * 4, 2.3], [d * 4, 2.3], [d * 14, 2.0]].map(([x, y]) => [x, y]) as [number, number][], 8, { anchor: 'snap', noStop: true })], snapTime: 6 };
    }
    case 'across': {
      const p = pickOuter(off.filter(strongSide)) ?? pickOuter(off);
      if (!p) return { movements: [], snapTime: 5, error: 'No off-the-line receiver available.' };
      const d = -Math.sign(p.x);
      const end = d * 5.6;
      return { movements: [mv(p.id, 'motion', 1.6, [[p.x + d * 8, 2.3], [0, 2.7], [end - d * 2, 2.4], [end, 1.6]], 4.6, { endFacing: 0 })], snapTime: 1.6 + (Math.abs(p.x - end) + 2) / 4.2 + 1.4 };
    }
    case 'return': {
      const p = pickInner(off.filter(strongSide)) ?? pickInner(off);
      if (!p) return { movements: [], snapTime: 5, error: 'No off-the-line receiver available.' };
      const d = -Math.sign(p.x);
      return {
        movements: [mv(p.id, 'motion', 1.8, [[p.x + d * 3, 2.6], [p.x + d * 7.5, 2.6]], 4.4), mv(p.id, 'motion', 1.8, [[p.x + d * 3.5, 2.4], [p.x, p.y]], 4.6, { endFacing: 0 })],
        snapTime: 9,
      };
    }
    case 'orbit': {
      const p = pickInner(off.filter(strongSide)) ?? pickInner(off);
      if (!p) return { movements: [], snapTime: 5, error: 'No off-the-line receiver available.' };
      const d = -Math.sign(p.x);
      return {
        movements: [mv(p.id, 'motion', -2.1, [[p.x + d * 4, 2.4], [-d * 1.8, 5.6], [d * 0.4, 6.9], [d * 3.4, 6.3], [d * 7, 3.2]], 7, { anchor: 'snap', noStop: true })],
        snapTime: 5.5,
      };
    }
    case 'rb-out': {
      const rb = players.find((q) => q.role === 'RB');
      if (!rb) return { movements: [], snapTime: 5, error: 'No running back in this formation.' };
      const side = rb.x !== 0 ? Math.sign(rb.x) : ws;
      return { movements: [mv(rb.id, 'motion', 1.8, [[side * 4.2, 4.2], [side * 9, 3.6], [side * 13.8, 1.6]], 4.8, { endFacing: 0 })], snapTime: 7.2 };
    }
    case 'zip': {
      const p = pickOuter(players.filter((q) => q.role === 'WR'));
      if (!p) return { movements: [], snapTime: 5, error: 'No wide receiver available.' };
      const sign = Math.sign(p.x);
      const edit = (ps: PlayerSpec[]) => {
        // the motion man must be off the line; put the slot on the line instead
        const me = ps.find((q) => q.id === p.id)!;
        if (me.onLine) {
          const slot = ps.filter((q) => q.role === 'WR' && Math.sign(q.x) === sign && q.id !== me.id && !q.onLine).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
          me.onLine = false;
          me.y = 1.6;
          if (slot) {
            slot.onLine = true;
            slot.y = 0.65;
          }
        }
      };
      return { movements: [mv(p.id, 'motion', 1.6, [[sign * Math.max(7, Math.abs(p.x) * 0.6), 2.0], [sign * 6.2, 1.6]], 4.2, { endFacing: 0, curve: 'straight' })], snapTime: 6.8, edit };
    }
    case 'fly': {
      const strong = off.filter(strongSide);
      const p = strong.length >= 2 ? pickOuter(strong.filter((q) => q !== pickOuter(strong))) ?? strong[0] : pickInner(off);
      if (!p) return { movements: [], snapTime: 5, error: 'No off-the-line receiver available.' };
      const d = -Math.sign(p.x);
      return { movements: [mv(p.id, 'motion', 1.6, [[p.x + d * 6, 2.6], [0, 2.8], [d * 6, 2.5], [d * 9.2, 1.6]], 4.8, { endFacing: 0 })], snapTime: 1.6 + (Math.abs(p.x) + 9.2) / 4.3 + 1.4 };
    }
    case 'te-shift': {
      const te = players.find((q) => q.role === 'TE' && q.onLine);
      if (!te) return { movements: [], snapTime: 5, error: 'No attached tight end in this formation.' };
      const qb = players.find((q) => q.role === 'QB');
      const depth = qb && qb.y < 2 ? 2.9 : 2.5;
      const d = -Math.sign(te.x);
      return { movements: [mv(te.id, 'shift', 1.4, [[te.x + d * 0.6, depth], [0, depth + 0.2], [-te.x - d * 0.8, depth - 0.3], [-te.x, te.y]], 4.2, { endFacing: 0 })], snapTime: 7 };
    }
  }
}

export function quickDrill(formationKey: string, strength: Side, hash: Hash, motion: MotionType): { drill: Drill; error?: string } {
  const f = FORMATIONS.find((x) => x.key === formationKey)!;
  const players = buildFormation(formationKey, hash, strength);
  const m = applyMotion(players, motion, strength);
  m.edit?.(players);
  const drill: Drill = {
    id: `quick-${formationKey}-${strength}-${hash}-${motion}`,
    name: `${f.name} ${strength === 'R' ? 'Rt' : 'Lt'} · ${MOTION_TYPES[motion]}`,
    category: 'Quick build',
    description: 'Built from the quick builder. Open it in the editor to add your call and answers, then save.',
    personnel: f.personnel,
    formationName: `${f.name} ${strength === 'R' ? 'Right' : 'Left'}`,
    motionName: MOTION_TYPES[motion],
    ball: { yardLine: 35, hash },
    players,
    movements: m.movements,
    snapTime: Math.round(m.snapTime * 10) / 10,
    snapJitter: [0, 1],
    postSnap: 'pass',
    postSnapDuration: 2.5,
    defense: { call: '(set your call)', athleteId: 'M', defenders: exampleDefense(players) },
    recognition: { cue: '', decisionPoint: m.movements.length ? 'motion-end' : 'set', freeze: !m.movements.some((x) => x.noStop) },
    answers: {
      choices: [
        { id: 'a', label: 'Answer A (edit me)' },
        { id: 'b', label: 'Answer B (edit me)' },
      ],
      correct: ['a'],
      explanation: 'No coaching answer has been written for this quick-build rep yet.',
      isExample: true,
      ruleIds: [],
    },
  };
  return { drill, error: m.error };
}
