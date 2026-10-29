import { z } from 'zod';

// ---------------------------------------------------------------------------
// FIELDVIEW data model. Every persisted / exported object is validated with
// these schemas. Field units are YARDS (see core/units.ts for the axes).
// ---------------------------------------------------------------------------

export const ROLES = ['OL', 'TE', 'WR', 'QB', 'RB', 'FB'] as const;
export const STANCES = [
  'three-point', // OL / TE / FB hand down
  'two-point', // upright ready (TE flexed, H-back)
  'wr', // receiver staggered stance
  'qb-center', // under center
  'qb-gun', // shotgun
  'rb', // two-point back, hands on thighs
  'center', // snapper
] as const;

const finite = z.number().finite();
const yards = finite.min(-60).max(60);

export const PointSchema = z.object({ x: yards, y: yards });
export type Point = z.infer<typeof PointSchema>;

export const PlayerSpecSchema = z.object({
  id: z.string().min(1).max(16),
  role: z.enum(ROLES),
  label: z.string().min(1).max(8),
  number: z.number().int().min(0).max(99),
  x: yards,
  y: finite.min(0).max(25),
  onLine: z.boolean(),
  stance: z.enum(STANCES),
  facing: finite.min(-360).max(360).default(0),
});
export type PlayerSpec = z.infer<typeof PlayerSpecSchema>;

export const MOVEMENT_KINDS = ['shift', 'motion', 'postsnap'] as const;
export const MovementSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  kind: z.enum(MOVEMENT_KINDS),
  /**
   * Start time in seconds. anchor 'rep' = from the start of the rep;
   * anchor 'snap' = relative to the snap (negative = before the snap).
   * Post-snap movements are always relative to the snap.
   */
  start: finite.min(-30).max(60),
  anchor: z.enum(['rep', 'snap']).default('rep'),
  /** Waypoints, in yards. The movement starts wherever the player currently is. */
  path: z.array(PointSchema).min(1).max(24),
  /** Cruise speed in yards / second. */
  speed: finite.min(0.5).max(11),
  /** Curved (Catmull-Rom) or straight segments between waypoints. */
  curve: z.enum(['smooth', 'straight']).default('smooth'),
  /** Final facing after the player settles (degrees, 0 = toward the defense). */
  endFacing: finite.min(-360).max(360).optional(),
  /** Keep body facing this direction while moving (e.g. shuffle). Undefined = face travel. */
  holdFacing: finite.min(-360).max(360).optional(),
  /** Randomized start offset range in seconds (applied with the rep seed). */
  jitter: z.tuple([finite, finite]).optional(),
  /** If true the player does not stop at the end (still moving at the snap). */
  noStop: z.boolean().default(false),
});
export type Movement = z.infer<typeof MovementSchema>;

export const POSITIONS = ['LB', 'S', 'CB', 'EDGE'] as const;
export type ViewPosition = (typeof POSITIONS)[number];

export const DefenderSchema = z.object({
  id: z.string().min(1).max(16),
  label: z.string().min(1).max(8),
  x: yards,
  /** Depth in yards off the ball (positive = toward the defense's side). */
  depth: finite.min(0).max(25),
  stance: z.enum(['three-point', 'two-point', 'lb', 'db']).default('two-point'),
  position: z.enum(POSITIONS).optional(),
});
export type DefenderSpec = z.infer<typeof DefenderSchema>;

export const AnswerChoiceSchema = z.object({
  id: z.string().min(1).max(24),
  label: z.string().min(1).max(60),
});
export type AnswerChoice = z.infer<typeof AnswerChoiceSchema>;

export const DECISION_POINTS = [
  'motion-start',
  'mid-motion',
  'motion-end',
  'set',
  'snap',
  'custom',
] as const;
export type DecisionPoint = (typeof DECISION_POINTS)[number];

export const DrillSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  category: z.string().max(40).default('General'),
  description: z.string().max(600).default(''),
  personnel: z.string().max(12).default('11'),
  formationName: z.string().max(40).default(''),
  motionName: z.string().max(40).default('None'),
  ball: z.object({
    /** Yard line from the OFFENSE's own goal line (1-99). 35 = own 35. */
    yardLine: finite.min(1).max(99),
    hash: z.enum(['L', 'M', 'R']),
  }),
  players: z.array(PlayerSpecSchema).length(11),
  movements: z.array(MovementSchema).max(40),
  /** Seconds from the start of the rep to the snap. */
  snapTime: finite.min(0.5).max(40),
  /** Random snap offset range in seconds (cadence variation). */
  snapJitter: z.tuple([finite, finite]).default([0, 0]),
  postSnap: z.enum(['pass', 'run-left', 'run-right', 'none']).default('pass'),
  postSnapDuration: finite.min(0).max(6).default(2.5),
  defense: z.object({
    call: z.string().max(80).default(''),
    athleteId: z.string().min(1),
    defenders: z.array(DefenderSchema).min(1).max(11),
  }),
  recognition: z.object({
    cue: z.string().max(200).default(''),
    decisionPoint: z.enum(DECISION_POINTS).default('motion-end'),
    /** Used when decisionPoint === 'custom' (seconds). */
    decisionTime: finite.min(0).max(40).optional(),
    /** Pause the rep at the decision point. */
    freeze: z.boolean().default(true),
  }),
  answers: z.object({
    choices: z.array(AnswerChoiceSchema).min(1).max(8),
    correct: z.array(z.string()).min(1),
    explanation: z.string().max(1200).default(''),
    /** Demonstration answers are examples only — the coach's system decides. */
    isExample: z.boolean().default(true),
    ruleIds: z.array(z.string()).default([]),
  }),
});
export type Drill = z.infer<typeof DrillSchema>;

export const PlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  drillIds: z.array(z.string()).min(1),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

export const UNITS = ['in', 'ft', 'cm', 'm'] as const;
export const CalibrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  unit: z.enum(UNITS),
  imageWidth: finite.positive(),
  imageHeight: finite.positive(),
  bottomEdge: finite.min(0),
  distance: finite.positive(),
  eyeHeight: finite.positive(),
  offsetX: finite,
  resolutionW: z.number().int().min(320).max(16384),
  resolutionH: z.number().int().min(240).max(16384),
});
export type Calibration = z.infer<typeof CalibrationSchema>;

export const CoachingRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  trigger: z.string().max(200).default(''),
  check: z.string().max(200).default(''),
  notes: z.string().max(800).default(''),
});
export type CoachingRule = z.infer<typeof CoachingRuleSchema>;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const UniformSchema = z.object({
  name: z.string().min(1).max(40),
  helmet: color,
  facemask: color,
  jersey: color,
  numbers: color,
  pants: color,
  socks: color,
  cleats: color,
});
export type Uniform = z.infer<typeof UniformSchema>;

export const TeamSettingsSchema = z.object({
  offense: UniformSchema,
  defense: UniformSchema,
});
export type TeamSettings = z.infer<typeof TeamSettingsSchema>;

export const PackageSchema = z.object({
  format: z.literal('fieldview-package'),
  version: z.literal(1),
  exportedAt: z.string(),
  drills: z.array(DrillSchema).default([]),
  playlists: z.array(PlaylistSchema).default([]),
  calibrations: z.array(CalibrationSchema).default([]),
  rules: z.array(CoachingRuleSchema).default([]),
  team: TeamSettingsSchema.optional(),
});
export type FieldviewPackage = z.infer<typeof PackageSchema>;
