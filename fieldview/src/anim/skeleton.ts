// Canonical FIELDVIEW humanoid skeleton. Every visual player (procedural or a
// loaded GLB) is driven from the same joint positions produced by the pose
// solver, so assets can be swapped without touching animation logic.
//
// Root-local axes: +Z = the player's forward, +X = the player's LEFT, +Y = up.
// Lengths are meters for a 1.88 m reference athlete and scale with `height`.

export interface Build {
  /** height multiplier (1 = 1.88 m) */
  height: number;
  /** girth multiplier for meshes (linemen > skill players) */
  width: number;
}

export const BUILDS: Record<string, Build> = {
  OL: { height: 1.02, width: 1.2 },
  TE: { height: 1.02, width: 1.1 },
  FB: { height: 0.97, width: 1.12 },
  RB: { height: 0.95, width: 1.04 },
  QB: { height: 1.0, width: 0.98 },
  WR: { height: 0.98, width: 0.93 },
  DL: { height: 1.01, width: 1.17 },
  LB: { height: 0.99, width: 1.07 },
  DB: { height: 0.96, width: 0.94 },
};

export const DIM = {
  ankleH: 0.085,
  shin: 0.47,
  thigh: 0.47,
  hipHalf: 0.1,
  pelvisToHip: 0.06,
  torso: 0.56, // pelvis center → neck base
  shoulderAlong: 0.46, // along the torso from the pelvis center
  shoulderHalf: 0.2,
  upperArm: 0.32,
  forearm: 0.28,
  footFwd: 0.2,
};

export type StanceKey =
  | 'stand'
  | 'three-point'
  | 'center'
  | 'wr'
  | 'two-point'
  | 'rb'
  | 'qb-gun'
  | 'qb-center'
  | 'dl'
  | 'lb'
  | 'db'
  | 'passpro'
  | 'runblock'
  | 'ready'
  | 'qb-ball';

export interface StanceDef {
  pelvisY: number;
  pelvisZ: number;
  /** torso pitch forward (rad, from vertical) */
  pitch: number;
  /** feet [left, right]: root-local (x, z) */
  feet: [[number, number], [number, number]];
  /** wrist targets [left, right] root-local (x, y, z); null = hang naturally */
  hands: [[number, number, number] | null, [number, number, number] | null];
  /** toe-out angles (rad) */
  toeOut: number;
}

// Hand on ground = wrist ~0.11 m above the turf (knuckles down).
export const STANCES: Record<StanceKey, StanceDef> = {
  stand: { pelvisY: 0.99, pelvisZ: 0, pitch: 0.05, feet: [[0.13, 0.02], [-0.13, -0.02]], hands: [null, null], toeOut: 0.12 },
  'three-point': {
    pelvisY: 0.62,
    pelvisZ: -0.08,
    pitch: 1.3,
    feet: [[0.25, 0.02], [-0.21, -0.2]],
    hands: [[0.24, 0.46, 0.2], [-0.15, 0.11, 0.46]],
    toeOut: 0.08,
  },
  dl: {
    pelvisY: 0.66,
    pelvisZ: -0.12,
    pitch: 1.32,
    feet: [[0.24, 0.0], [-0.22, -0.32]],
    hands: [[0.22, 0.5, 0.24], [-0.14, 0.11, 0.44]],
    toeOut: 0.05,
  },
  center: {
    pelvisY: 0.62,
    pelvisZ: -0.08,
    pitch: 1.25,
    feet: [[0.27, -0.02], [-0.27, -0.06]],
    hands: [[0.2, 0.47, 0.22], [-0.04, 0.17, 0.5]],
    toeOut: 0.16,
  },
  wr: {
    pelvisY: 0.86,
    pelvisZ: -0.04,
    pitch: 0.55,
    feet: [[0.1, 0.2], [-0.12, -0.3]],
    hands: [[0.16, 0.76, 0.3], [-0.14, 0.8, 0.22]],
    toeOut: 0.04,
  },
  'two-point': {
    pelvisY: 0.82,
    pelvisZ: -0.04,
    pitch: 0.6,
    feet: [[0.21, 0.02], [-0.21, -0.06]],
    hands: [[0.17, 0.6, 0.2], [-0.17, 0.6, 0.2]],
    toeOut: 0.12,
  },
  rb: {
    pelvisY: 0.8,
    pelvisZ: -0.05,
    pitch: 0.62,
    feet: [[0.22, 0.0], [-0.22, 0.0]],
    hands: [[0.17, 0.56, 0.22], [-0.17, 0.56, 0.22]],
    toeOut: 0.14,
  },
  'qb-gun': {
    pelvisY: 0.92,
    pelvisZ: 0,
    pitch: 0.22,
    feet: [[0.2, 0.04], [-0.2, -0.06]],
    hands: [[0.08, 0.98, 0.36], [-0.08, 0.98, 0.36]],
    toeOut: 0.16,
  },
  'qb-center': {
    pelvisY: 0.8,
    pelvisZ: -0.06,
    pitch: 0.52,
    feet: [[0.2, -0.05], [-0.2, -0.05]],
    hands: [[0.04, 0.66, 0.42], [-0.04, 0.64, 0.44]],
    toeOut: 0.14,
  },
  lb: {
    pelvisY: 0.82,
    pelvisZ: -0.04,
    pitch: 0.5,
    feet: [[0.25, 0.0], [-0.25, 0.02]],
    hands: [[0.18, 0.8, 0.3], [-0.18, 0.8, 0.3]],
    toeOut: 0.14,
  },
  db: {
    pelvisY: 0.87,
    pelvisZ: -0.04,
    pitch: 0.42,
    feet: [[0.14, 0.14], [-0.16, -0.22]],
    hands: [[0.17, 0.84, 0.24], [-0.17, 0.84, 0.24]],
    toeOut: 0.06,
  },
  passpro: {
    pelvisY: 0.8,
    pelvisZ: -0.04,
    pitch: 0.36,
    feet: [[0.28, 0.04], [-0.28, -0.12]],
    hands: [[0.15, 1.16, 0.38], [-0.15, 1.16, 0.38]],
    toeOut: 0.1,
  },
  runblock: {
    pelvisY: 0.76,
    pelvisZ: -0.02,
    pitch: 0.7,
    feet: [[0.24, 0.12], [-0.24, -0.08]],
    hands: [[0.14, 1.0, 0.5], [-0.14, 1.0, 0.5]],
    toeOut: 0.08,
  },
  ready: {
    pelvisY: 0.88,
    pelvisZ: -0.02,
    pitch: 0.32,
    feet: [[0.22, 0.02], [-0.22, -0.02]],
    hands: [[0.17, 0.86, 0.26], [-0.17, 0.86, 0.26]],
    toeOut: 0.12,
  },
  'qb-ball': {
    pelvisY: 0.94,
    pelvisZ: 0,
    pitch: 0.16,
    feet: [[0.2, 0.0], [-0.2, -0.04]],
    hands: [[0.07, 1.22, 0.26], [-0.07, 1.2, 0.27]],
    toeOut: 0.18,
  },
};
