import type { CoachingRule, Drill, Movement, PlayerSpec, Playlist } from './schema';
import { buildFormation, exampleDefense, FORMATIONS, type Side } from './formations';
import type { Hash } from './field';

// ---------------------------------------------------------------------------
// DEMONSTRATION drills. Every defensive answer here is an EXAMPLE written for
// a generic over-front / cover-3 system. The correct check depends on YOUR
// coverage, front, terminology and rules — edit them in the Drill Editor.
// ---------------------------------------------------------------------------

const EX = 'EXAMPLE ANSWER — replace with your own rule. ';

const MOTION_CHOICES = [
  { id: 'bump', label: 'Bump — LBs slide toward the motion' },
  { id: 'spin', label: 'Spin — rotate safeties to the motion' },
  { id: 'lock', label: 'Lock — defender travels with motion' },
  { id: 'none', label: 'No check — stay in the call' },
];
const STRUCTURE_CHOICES = [
  { id: 'twoxtwo', label: '2x2 rules — stay in the call' },
  { id: 'trips', label: 'Trips check (3x1)' },
  { id: 'bunch', label: 'Bunch check (banjo)' },
  { id: 'empty', label: 'Empty check' },
];

export const DEMO_RULES: CoachingRule[] = [
  { id: 'r-spin', name: 'Spin to motion', trigger: 'Receiver motions across and sets to create 3x1', check: '"Spin"', notes: 'Example: safeties rotate toward the motion; Mike bumps a gap.' },
  { id: 'r-jet', name: 'Jet / fast motion', trigger: 'Motion at full speed at the snap', check: '"Bump"', notes: 'Example: LBs bump one gap to the motion; do not rotate late.' },
  { id: 'r-trips', name: 'Trips check', trigger: '3 receivers to one side (3x1)', check: '"Trips"', notes: 'Example: weak safety pushes to the trips side; backside corner on an island.' },
  { id: 'r-bunch', name: 'Bunch banjo', trigger: 'Three receivers in a tight cluster', check: '"Banjo"', notes: 'Example: in/out banjo — first out, first in.' },
  { id: 'r-empty', name: 'Empty check', trigger: 'No backs in the backfield', check: '"Empty"', notes: 'Example: Mike walks out to #3; rush 4.' },
  { id: 'r-shift', name: 'Strength reset on shift', trigger: 'TE / strength changes during a shift', check: 'Re-declare strength', notes: 'Example: front and edge align to the new TE side once everyone is set.' },
  { id: 'r-return', name: 'Return motion', trigger: 'Motion starts across and comes back', check: 'Stay with the original check', notes: 'Example: do not chase the first move — re-ID once the receiver resets.' },
  { id: 'r-zip', name: 'Reduced split', trigger: 'Wideout motions in to a tight split', check: '"Squeeze"', notes: 'Example: corner plays inside leverage, eyes through #1 to #2.' },
];

let mvCount = 0;
function mv(playerId: string, kind: Movement['kind'], start: number, path: [number, number][], speed: number, extra: Partial<Movement> = {}): Movement {
  return {
    id: `m${++mvCount}`,
    playerId,
    kind,
    start,
    anchor: 'rep',
    path: path.map(([x, y]) => ({ x, y })),
    speed,
    curve: 'smooth',
    noStop: false,
    ...extra,
  };
}

interface DrillInput {
  id: string;
  name: string;
  category: string;
  description: string;
  formation: string;
  strength: Side;
  hash?: Hash;
  motionName: string;
  edit?: (p: PlayerSpec[]) => void;
  movements: Movement[];
  snapTime: number;
  snapJitter?: [number, number];
  postSnap?: Drill['postSnap'];
  athleteId: string;
  call?: string;
  cue: string;
  decisionPoint: Drill['recognition']['decisionPoint'];
  freeze?: boolean;
  choices: { id: string; label: string }[];
  correct: string[];
  explanation: string;
  ruleIds?: string[];
}

function makeDrill(d: DrillInput): Drill {
  const hash = d.hash ?? 'M';
  const f = FORMATIONS.find((x) => x.key === d.formation)!;
  const players = buildFormation(d.formation, hash, d.strength);
  d.edit?.(players);
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    description: d.description,
    personnel: f.personnel,
    formationName: `${f.name} ${d.strength === 'R' ? 'Right' : 'Left'}`,
    motionName: d.motionName,
    ball: { yardLine: 35, hash },
    players,
    movements: d.movements,
    snapTime: d.snapTime,
    snapJitter: d.snapJitter ?? [0, 0.8],
    postSnap: d.postSnap ?? 'pass',
    postSnapDuration: 2.5,
    defense: { call: d.call ?? 'Over · Cover 3 (example)', athleteId: d.athleteId, defenders: exampleDefense(players) },
    recognition: { cue: d.cue, decisionPoint: d.decisionPoint, freeze: d.freeze ?? true },
    answers: { choices: d.choices, correct: d.correct, explanation: EX + d.explanation, isExample: true, ruleIds: d.ruleIds ?? [] },
  };
}

export function buildDemoDrills(): Drill[] {
  mvCount = 0;
  return [
    makeDrill({
      id: 'demo-across-rl',
      name: 'Doubles · Across Motion to Trips (R→L)',
      category: 'Motion',
      description: 'Z motions across the formation from the offense’s right and sets inside H, creating 3x1 to the offense’s left. This is the core recognition rep.',
      formation: 'doubles-11',
      strength: 'R',
      motionName: 'Across (Z)',
      movements: [mv('Z', 'motion', 1.6, [[-10, 2.3], [-2, 2.7], [3.5, 2.4], [5.6, 1.6]], 4.6, { endFacing: 0 })],
      snapTime: 9.8,
      athleteId: 'M',
      cue: 'Z leaves the boundary, crosses the formation and sets as #3 to the other side.',
      decisionPoint: 'motion-end',
      choices: MOTION_CHOICES,
      correct: ['spin'],
      explanation: 'Across motion that sets to create 3x1 = "Spin". Safeties rotate toward the motion and the Mike bumps one gap toward the new trips side.',
      ruleIds: ['r-spin'],
    }),
    makeDrill({
      id: 'demo-across-lr',
      name: 'Doubles · Across Motion to Trips (L→R)',
      category: 'Motion',
      description: 'Mirror rep: H motions from the offense’s left slot across to the TE side and sets, creating 3x1 to the offense’s right.',
      formation: 'doubles-11',
      strength: 'R',
      motionName: 'Across (H)',
      movements: [mv('H', 'motion', 1.6, [[4.5, 2.5], [0, 2.7], [-6, 2.4], [-9.4, 1.6]], 4.6, { endFacing: 0 })],
      snapTime: 8.8,
      athleteId: 'M',
      cue: 'H crosses from the open side to the TE side — 3x1 to the TE.',
      decisionPoint: 'motion-end',
      choices: MOTION_CHOICES,
      correct: ['spin'],
      explanation: 'Same rule in the opposite direction: across motion that sets into 3x1 = "Spin" toward the motion.',
      ruleIds: ['r-spin'],
    }),
    makeDrill({
      id: 'demo-doubles-nomo',
      name: 'Doubles · No Motion (comparison)',
      category: 'Comparison',
      description: 'Same personnel and formation with no motion. Use it between motion reps so the athlete has to actually see the motion instead of guessing.',
      formation: 'doubles-11',
      strength: 'R',
      motionName: 'None',
      movements: [],
      snapTime: 5,
      snapJitter: [0, 1.5],
      athleteId: 'M',
      cue: 'Formation stays 2x2. Nothing moves before the snap.',
      decisionPoint: 'set',
      choices: MOTION_CHOICES,
      correct: ['none'],
      explanation: 'No motion, no shift: stay in the called defense.',
    }),
    makeDrill({
      id: 'demo-jet-rl',
      name: 'Jet Motion (R→L) · answer before the snap',
      category: 'Motion',
      description: 'Z runs full-speed jet motion; the ball is snapped as he crosses the guard. No freeze — answer before the snap.',
      formation: 'doubles-11',
      strength: 'R',
      motionName: 'Jet (Z)',
      movements: [mv('Z', 'motion', -2.4, [[-12, 2.0], [-4, 2.3], [4, 2.3], [14, 2.0]], 8, { anchor: 'snap', noStop: true })],
      snapTime: 6,
      snapJitter: [0, 1.2],
      postSnap: 'run-left',
      athleteId: 'M',
      cue: 'Full-speed motion across the formation that does not stop.',
      decisionPoint: 'motion-start',
      freeze: false,
      choices: MOTION_CHOICES,
      correct: ['bump'],
      explanation: 'Jet motion = "Bump". LBs bump a gap toward the motion; do not spin late against a player still running at the snap.',
      ruleIds: ['r-jet'],
    }),
    makeDrill({
      id: 'demo-jet-lr',
      name: 'Jet Motion (L→R) · answer before the snap',
      category: 'Motion',
      description: 'Mirror jet rep from the open side toward the TE.',
      formation: 'doubles-11',
      strength: 'L',
      motionName: 'Jet (Z)',
      movements: [mv('Z', 'motion', -2.4, [[12, 2.0], [4, 2.3], [-4, 2.3], [-14, 2.0]], 8, { anchor: 'snap', noStop: true })],
      snapTime: 6,
      snapJitter: [0, 1.2],
      postSnap: 'run-right',
      athleteId: 'M',
      cue: 'Full-speed motion across the formation that does not stop.',
      decisionPoint: 'motion-start',
      freeze: false,
      choices: MOTION_CHOICES,
      correct: ['bump'],
      explanation: 'Jet motion = "Bump" toward the motion.',
      ruleIds: ['r-jet'],
    }),
    makeDrill({
      id: 'demo-trips-return',
      name: 'Trips · Return Motion',
      category: 'Motion',
      description: 'The #3 receiver starts across the formation, plants, and returns to his original spot. The structure never actually changes.',
      formation: 'trips-10',
      strength: 'R',
      motionName: 'Return (Y)',
      movements: [
        mv('Y', 'motion', 1.8, [[-2.5, 2.6], [2.6, 2.6]], 4.4, { holdFacing: undefined }),
        mv('Y', 'motion', 1.8, [[-1.5, 2.4], [-5.6, 1.6]], 4.6, { endFacing: 0 }),
      ],
      snapTime: 9.2,
      athleteId: 'M',
      cue: 'Y starts across, redirects, and resets at #3 in trips.',
      decisionPoint: 'motion-end',
      choices: STRUCTURE_CHOICES,
      correct: ['trips'],
      explanation: 'Return motion: do not chase the first move. The formation is still 3x1 when he resets — stay with the trips check.',
      ruleIds: ['r-return', 'r-trips'],
    }),
    makeDrill({
      id: 'demo-bunch',
      name: 'Bunch · No Motion (Safety view)',
      category: 'Formation ID',
      description: 'Three receivers in a tight bunch to the offense’s right. Safety perspective.',
      formation: 'bunch-10',
      strength: 'R',
      motionName: 'None',
      movements: [],
      snapTime: 4.6,
      snapJitter: [0, 1.4],
      athleteId: 'SS',
      cue: 'Point man on the line with two receivers stacked behind him, inside of the numbers.',
      decisionPoint: 'set',
      choices: STRUCTURE_CHOICES,
      correct: ['bunch'],
      explanation: 'Tight three-man cluster = "Banjo". Communicate in/out responsibilities before the snap.',
      ruleIds: ['r-bunch'],
    }),
    makeDrill({
      id: 'demo-empty-rb-out',
      name: 'Doubles · RB Motion to Empty',
      category: 'Motion',
      description: 'The running back motions out of the backfield to the open side, leaving an empty (3x2) backfield.',
      formation: 'doubles-10',
      strength: 'R',
      motionName: 'RB out',
      movements: [mv('RB', 'motion', 1.8, [[4.2, 4.2], [9, 3.6], [13.8, 1.6]], 4.8, { endFacing: 0 })],
      snapTime: 7.2,
      athleteId: 'M',
      cue: 'Back leaves the backfield — no one is left beside the QB.',
      decisionPoint: 'motion-end',
      choices: STRUCTURE_CHOICES,
      correct: ['empty'],
      explanation: 'Back motions out = "Empty". Mike walks out toward #3; the box count changes.',
      ruleIds: ['r-empty'],
    }),
    makeDrill({
      id: 'demo-orbit',
      name: 'Doubles · Orbit Motion',
      category: 'Motion',
      description: 'The slot runs orbit motion behind the quarterback and is still moving at the snap.',
      formation: 'doubles-10',
      strength: 'R',
      motionName: 'Orbit (Y)',
      movements: [mv('Y', 'motion', -2.1, [[-5, 2.4], [-1.8, 5.6], [0.4, 6.9], [3.4, 6.3], [7, 3.2]], 7, { anchor: 'snap', noStop: true })],
      snapTime: 5.5,
      snapJitter: [0, 1.2],
      athleteId: 'M',
      cue: 'Slot comes toward the ball and loops BEHIND the quarterback.',
      decisionPoint: 'mid-motion',
      choices: MOTION_CHOICES,
      correct: ['lock'],
      explanation: 'Orbit motion behind the QB = "Lock". The player responsible for him travels; LBs keep eyes on the back.',
      ruleIds: ['r-jet'],
    }),
    makeDrill({
      id: 'demo-i-shift',
      name: 'I-Form · TE Strength Shift (Edge view)',
      category: 'Shift',
      description: 'The tight end shifts across the formation behind the quarterback and the fullback offsets. Everyone resets before the snap.',
      formation: 'i-21',
      strength: 'R',
      motionName: 'Shift (Y + F)',
      movements: [
        mv('Y', 'shift', 1.4, [[-3.4, 2.8], [0, 3.0], [3.2, 2.6], [4.05, 0.8]], 4.2, { endFacing: 0 }),
        mv('FB', 'shift', 1.6, [[1.5, 4.4]], 2.2, { endFacing: 0, curve: 'straight' }),
      ],
      snapTime: 6.9,
      athleteId: 'DER',
      cue: 'Tight end leaves the right side, resets attached on the other side; fullback offsets.',
      decisionPoint: 'set',
      choices: [
        { id: 'reset', label: 'Reset strength to the new TE side' },
        { id: 'stay', label: 'Stay — strength did not change' },
        { id: 'slant', label: 'Slant the front away' },
        { id: 'none', label: 'No check' },
      ],
      correct: ['reset'],
      explanation: 'A shift that moves the TE flips strength. Re-declare and re-align once everyone is set (they must be set for a full second).',
      ruleIds: ['r-shift'],
    }),
    makeDrill({
      id: 'demo-zip',
      name: 'Doubles · Zip Motion Into Formation (Corner view)',
      category: 'Motion',
      description: 'The wide receiver motions in from the numbers to a tight split. Corner perspective.',
      formation: 'doubles-11',
      strength: 'R',
      motionName: 'Zip (X in)',
      edit: (p) => {
        const x = p.find((q) => q.id === 'X')!;
        const h = p.find((q) => q.id === 'H')!;
        x.y = 1.6;
        x.onLine = false;
        h.y = 0.65;
        h.onLine = true;
      },
      movements: [mv('X', 'motion', 1.6, [[12, 2.0], [6.2, 1.6]], 4.2, { endFacing: 0, curve: 'straight' })],
      snapTime: 6.8,
      athleteId: 'CBR',
      cue: 'Your #1 leaves the numbers and sets in a tight split near #2.',
      decisionPoint: 'motion-end',
      choices: [
        { id: 'squeeze', label: 'Squeeze — inside leverage on #1' },
        { id: 'travel', label: 'Travel with him (man)' },
        { id: 'stay', label: 'Stay on the numbers' },
        { id: 'none', label: 'No check' },
      ],
      correct: ['squeeze'],
      explanation: 'Reduced split = "Squeeze". Corner stays outside the box, plays inside leverage and reads #1 to #2.',
      ruleIds: ['r-zip'],
    }),
    makeDrill({
      id: 'demo-trips-fly-out',
      name: 'Trips · Motion Out of Formation (Safety view)',
      category: 'Motion',
      description: 'From trips, the #2 receiver motions out of the trips side and sets as a slot to the other side — 3x1 becomes 2x2.',
      formation: 'trips-10',
      strength: 'R',
      motionName: 'Fly out (H)',
      movements: [mv('H', 'motion', 1.6, [[-7, 2.6], [0, 2.8], [6, 2.5], [9.2, 1.6]], 4.8, { endFacing: 0 })],
      snapTime: 8.8,
      athleteId: 'FS',
      cue: 'One of the trips receivers leaves and sets on the single-receiver side.',
      decisionPoint: 'motion-end',
      choices: STRUCTURE_CHOICES,
      correct: ['twoxtwo'],
      explanation: 'Trips motion that resets as 2x2 = check back to 2x2 rules. Communicate it — the trips check is now wrong.',
      ruleIds: ['r-trips'],
    }),
    makeDrill({
      id: 'demo-trips-nomo',
      name: 'Trips · No Motion (comparison, Safety view)',
      category: 'Comparison',
      description: 'Same trips look with no motion. Pair it with the motion-out rep.',
      formation: 'trips-10',
      strength: 'R',
      motionName: 'None',
      movements: [],
      snapTime: 4.8,
      snapJitter: [0, 1.6],
      athleteId: 'FS',
      cue: 'Three receivers to the offense’s right, one to the left.',
      decisionPoint: 'set',
      choices: STRUCTURE_CHOICES,
      correct: ['trips'],
      explanation: '3x1 with no motion = "Trips" check.',
      ruleIds: ['r-trips'],
    }),
  ];
}

export function buildDemoPlaylists(): Playlist[] {
  return [
    { id: 'pl-motion', name: 'Motion ID — LB', drillIds: ['demo-across-rl', 'demo-across-lr', 'demo-doubles-nomo', 'demo-jet-rl', 'demo-jet-lr', 'demo-orbit', 'demo-empty-rb-out'] },
    { id: 'pl-structure', name: 'Formation ID — Safety', drillIds: ['demo-bunch', 'demo-trips-nomo', 'demo-trips-fly-out', 'demo-trips-return'] },
    { id: 'pl-all', name: 'All demo drills', drillIds: buildDemoDrills().map((d) => d.id) },
  ];
}
