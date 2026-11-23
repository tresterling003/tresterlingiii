// 2D skeletal rig: forward kinematics, two-bone IK, pose interpolation.
//
// Angle convention (degrees, y axis points DOWN like canvas):
//  - The root (pelvis) points straight up when lean = 0. Positive lean tips the body FORWARD.
//  - Every bone angle is LOCAL to its parent; 0 means "continue in the parent's direction".
//  - Arms hang from the chest: 180 = hanging down, 90 = pointing forward, 0 = straight up, 270 = backward.
//  - Thighs hang from the pelvis: 180 = straight down, smaller = knee lifted forward.
//  - Elbows bend with NEGATIVE forearm angles, knees bend with POSITIVE shin angles.
//  - "Forward" is the direction the character faces (+x for facing 1). In front view the R limbs are
//    mirrored to screen-left, so forward = outward from the body.

export type BoneId =
  | 'spine' | 'neck' | 'head'
  | 'uaR' | 'faR' | 'uaL' | 'faL'
  | 'thR' | 'shR' | 'ftR' | 'thL' | 'shL' | 'ftL';

export type JointId =
  | 'pelvis' | 'chest' | 'neckTop' | 'headC'
  | 'shoulderR' | 'elbowR' | 'wristR' | 'shoulderL' | 'elbowL' | 'wristL'
  | 'hipR' | 'kneeR' | 'ankleR' | 'toeR' | 'hipL' | 'kneeL' | 'ankleL' | 'toeL';

export interface BoneDef {
  id: BoneId;
  parent: BoneId | null; // null = attached to the root (pelvis)
  from: JointId;
  to: JointId;
  side: 'R' | 'L' | null;
  label: string;
}

export const BONES: BoneDef[] = [
  { id: 'spine', parent: null, from: 'pelvis', to: 'chest', side: null, label: 'Torso' },
  { id: 'neck', parent: 'spine', from: 'chest', to: 'neckTop', side: null, label: 'Neck' },
  { id: 'head', parent: 'neck', from: 'neckTop', to: 'headC', side: null, label: 'Head' },
  { id: 'uaR', parent: 'spine', from: 'shoulderR', to: 'elbowR', side: 'R', label: 'Right upper arm' },
  { id: 'faR', parent: 'uaR', from: 'elbowR', to: 'wristR', side: 'R', label: 'Right forearm' },
  { id: 'uaL', parent: 'spine', from: 'shoulderL', to: 'elbowL', side: 'L', label: 'Left upper arm' },
  { id: 'faL', parent: 'uaL', from: 'elbowL', to: 'wristL', side: 'L', label: 'Left forearm' },
  { id: 'thR', parent: null, from: 'hipR', to: 'kneeR', side: 'R', label: 'Right thigh' },
  { id: 'shR', parent: 'thR', from: 'kneeR', to: 'ankleR', side: 'R', label: 'Right shin' },
  { id: 'ftR', parent: 'shR', from: 'ankleR', to: 'toeR', side: 'R', label: 'Right foot' },
  { id: 'thL', parent: null, from: 'hipL', to: 'kneeL', side: 'L', label: 'Left thigh' },
  { id: 'shL', parent: 'thL', from: 'kneeL', to: 'ankleL', side: 'L', label: 'Left shin' },
  { id: 'ftL', parent: 'shL', from: 'ankleL', to: 'toeL', side: 'L', label: 'Left foot' },
];
export const BONE_BY_ID = Object.fromEntries(BONES.map((b) => [b.id, b])) as Record<BoneId, BoneDef>;
export const BONE_BY_END = Object.fromEntries(BONES.map((b) => [b.to, b])) as Partial<Record<JointId, BoneDef>>;

/** Bone lengths as a fraction of the standing figure height. */
export type Proportions = Record<BoneId, number> & { shoulderW: number; hipW: number };

export const DEFAULT_PROPORTIONS: Proportions = {
  spine: 0.3, neck: 0.055, head: 0.085,
  uaR: 0.165, faR: 0.155, uaL: 0.165, faL: 0.155,
  thR: 0.235, shR: 0.225, ftR: 0.07, thL: 0.235, shL: 0.225, ftL: 0.07,
  shoulderW: 0.0, hipW: 0.025,
};

export type View = 'side' | 'front';

export interface RigPose {
  angles: Record<BoneId, number>;
  lean: number; // degrees, + = forward
  dx: number; // horizontal offset from the rig anchor, fraction of height (+ = forward)
  lift: number; // height of the lowest point above the ground, fraction of height (0 = standing on ground)
  facing: 1 | -1;
  view: View;
  look: number; // -1..1 where the eyes look (screen space before facing flip)
}

export const NEUTRAL_ANGLES: Record<BoneId, number> = {
  spine: 0, neck: 0, head: 0,
  uaR: 172, faR: -8, uaL: 188, faL: -8,
  thR: 176, shR: 4, ftR: -90, thL: 184, shL: 4, ftL: -90,
};

export function neutralPose(view: View = 'side', facing: 1 | -1 = 1): RigPose {
  const angles = { ...NEUTRAL_ANGLES };
  if (view === 'front') Object.assign(angles, { uaR: 165, uaL: 165, faR: -6, faL: -6, thR: 172, thL: 172, shR: 2, shL: 2 });
  return { angles, lean: 0, dx: 0, lift: 0, facing, view, look: 0 };
}

export interface CharacterRig {
  proportions: Proportions;
  height: number; // standing height in canvas px
  anchorX: number; // pelvis x in canvas px for dx = 0
  groundY: number; // ground line y in canvas px
  rest: RigPose; // the pose that matches the original drawing
}

export type Pt = { x: number; y: number };
export interface Solved {
  joints: Record<JointId, Pt>;
  world: Record<BoneId, number>; // world angle (deg) of each bone
  sign: Record<BoneId, 1 | -1>; // -1 for bones in a mirrored chain (front view R side)
  len: Record<BoneId, number>; // px
}

const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Forward kinematics: pose → joint positions in canvas px. */
export function solve(rig: CharacterRig, pose: RigPose): Solved {
  const H = rig.height;
  const P = rig.proportions;
  const front = pose.view === 'front';
  const joints = {} as Record<JointId, Pt>;
  const world = {} as Record<BoneId, number>;
  const sign = {} as Record<BoneId, 1 | -1>;
  const len = {} as Record<BoneId, number>;
  const rootWorld = -90 + pose.lean;

  // Solve with the pelvis at (0,0), then place on the ground.
  joints.pelvis = { x: 0, y: 0 };
  for (const b of BONES) {
    const s: 1 | -1 = front && b.side === 'R' ? -1 : 1;
    const parentWorld = b.parent ? world[b.parent] : rootWorld;
    const w = parentWorld + s * pose.angles[b.id];
    world[b.id] = w;
    sign[b.id] = s;
    len[b.id] = P[b.id] * H;
    let from: Pt;
    if (b.from === 'shoulderR' || b.from === 'shoulderL' || b.from === 'hipR' || b.from === 'hipL') {
      const isArm = b.from.startsWith('shoulder');
      const base = isArm ? joints.chest : joints.pelvis;
      const baseAngle = isArm ? world.spine : rootWorld;
      const off = front ? (isArm ? P.shoulderW : P.hipW) * H * (b.side === 'R' ? -1 : 1) : 0;
      // offset perpendicular to the torso axis
      const perp = rad(baseAngle + 90);
      from = { x: base.x - Math.cos(perp) * off, y: base.y - Math.sin(perp) * off };
      if (isArm) from = { x: from.x - Math.cos(rad(baseAngle)) * H * 0.012, y: from.y - Math.sin(rad(baseAngle)) * H * 0.012 };
      joints[b.from] = from;
    } else from = joints[b.from];
    joints[b.to] = { x: from.x + Math.cos(rad(w)) * len[b.id], y: from.y + Math.sin(rad(w)) * len[b.id] };
  }
  // Lowest point (largest y) touches ground - lift.
  const headBottom = joints.headC.y + P.head * H;
  let lowest = headBottom;
  for (const p of Object.values(joints)) lowest = Math.max(lowest, p.y);
  const ox = rig.anchorX;
  const oy = rig.groundY - pose.lift * H - lowest;
  for (const k of Object.keys(joints) as JointId[]) {
    const p = joints[k];
    const x = pose.facing === 1 ? p.x : -p.x;
    joints[k] = { x: ox + x + pose.dx * H * pose.facing, y: oy + p.y };
  }
  if (pose.facing === -1) for (const b of BONES) world[b.id] = 180 - world[b.id];
  return { joints, world, sign, len };
}

/** Two-bone IK. Returns world angles (deg) for the upper and lower bone, keeping the current bend direction. */
export function twoBoneIK(root: Pt, l1: number, l2: number, target: Pt, bend: 1 | -1): [number, number] {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, Math.hypot(dx, dy)));
  const theta = Math.atan2(dy, dx);
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const a1 = theta - bend * Math.acos(cosA);
  const mid = { x: root.x + Math.cos(a1) * l1, y: root.y + Math.sin(a1) * l1 };
  const a2 = Math.atan2(target.y - mid.y, target.x - mid.x);
  return [deg(a1), deg(a2)];
}

/** Convert a desired world angle for a bone into the local angle stored in the pose. */
function worldToLocal(s: Solved, pose: RigPose, bone: BoneId, worldAngle: number): number {
  const b = BONE_BY_ID[bone];
  // undo facing mirror
  let w = pose.facing === 1 ? worldAngle : 180 - worldAngle;
  let parentWorld = b.parent ? s.world[b.parent] : -90 + pose.lean;
  if (pose.facing === -1 && b.parent) parentWorld = 180 - parentWorld;
  return wrapDeg((w - parentWorld) * s.sign[bone]);
}

/** Rotate a single bone so its end points at `target` (FK drag). */
export function aimBone(rig: CharacterRig, pose: RigPose, bone: BoneId, target: Pt): RigPose {
  const s = solve(rig, pose);
  const b = BONE_BY_ID[bone];
  const from = s.joints[b.from];
  const w = deg(Math.atan2(target.y - from.y, target.x - from.x));
  const next = { ...pose, angles: { ...pose.angles } };
  next.angles[bone] = worldToLocal(s, pose, bone, w);
  return next;
}

/** Move a wrist or ankle with IK (moves the two bones above it). */
export function reachIK(rig: CharacterRig, pose: RigPose, upper: BoneId, lower: BoneId, target: Pt): RigPose {
  const s = solve(rig, pose);
  const bu = BONE_BY_ID[upper];
  const bl = BONE_BY_ID[lower];
  const root = s.joints[bu.from];
  const mid = s.joints[bu.to];
  const end = s.joints[bl.to];
  const cross = (mid.x - root.x) * (end.y - mid.y) - (mid.y - root.y) * (end.x - mid.x);
  const bend: 1 | -1 = cross >= 0 ? 1 : -1;
  const [w1, w2] = twoBoneIK(root, s.len[upper], s.len[lower], target, bend);
  const next = { ...pose, angles: { ...pose.angles } };
  next.angles[upper] = worldToLocal(s, pose, upper, w1);
  const s2 = solve(rig, next);
  next.angles[lower] = worldToLocal(s2, next, lower, w2);
  return next;
}

/** Rig fitting: move the end joint of a bone, changing that bone's angle AND length (for matching a drawing). */
export function fitBone(rig: CharacterRig, pose: RigPose, bone: BoneId, target: Pt): { rig: CharacterRig; pose: RigPose } {
  const s = solve(rig, pose);
  const b = BONE_BY_ID[bone];
  const from = s.joints[b.from];
  const length = Math.max(rig.height * 0.02, Math.hypot(target.x - from.x, target.y - from.y));
  const proportions = { ...rig.proportions, [bone]: length / rig.height };
  // keep left/right limbs in sync when unchanged? No: each bone is fitted independently.
  const nextRig = { ...rig, proportions };
  const nextPose = aimBone(nextRig, pose, bone, target);
  return { rig: nextRig, pose: nextPose };
}

export const easings = {
  linear: (t: number) => t,
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeIn: (t: number) => t * t,
};
export type EasingId = keyof typeof easings;

/** Interpolate two poses (angles take the short way round). Facing/view switch at the midpoint. */
export function lerpPose(a: RigPose, b: RigPose, t: number): RigPose {
  const angles = {} as Record<BoneId, number>;
  for (const k of Object.keys(a.angles) as BoneId[]) {
    const d = wrapDeg(b.angles[k] - a.angles[k]);
    angles[k] = a.angles[k] + d * t;
  }
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    angles,
    lean: l(a.lean, b.lean),
    dx: l(a.dx, b.dx),
    lift: l(a.lift, b.lift),
    look: l(a.look, b.look),
    facing: t < 0.5 ? a.facing : b.facing,
    view: t < 0.5 ? a.view : b.view,
  };
}

/** Poses strictly between a and b (count of them), eased. */
export function inbetweenPoses(a: RigPose, b: RigPose, count: number, easing: EasingId = 'easeInOut'): RigPose[] {
  const out: RigPose[] = [];
  for (let i = 1; i <= count; i++) out.push(lerpPose(a, b, easings[easing](i / (count + 1))));
  return out;
}

export function clonePose(p: RigPose): RigPose {
  return { ...p, angles: { ...p.angles } };
}

/** Mirror which limb does the work (e.g. a right punch becomes a left punch). */
export function swapSides(p: RigPose): RigPose {
  const a = p.angles;
  return {
    ...p,
    angles: { ...a, uaR: a.uaL, faR: a.faL, uaL: a.uaR, faL: a.faR, thR: a.thL, shR: a.shL, ftR: a.ftL, thL: a.thR, shL: a.shR, ftL: a.ftR },
  };
}

export function defaultRig(canvasW: number, canvasH: number, height = canvasH * 0.62, view: View = 'side'): CharacterRig {
  return {
    proportions: { ...DEFAULT_PROPORTIONS },
    height,
    anchorX: canvasW / 2,
    groundY: canvasH * 0.86,
    rest: neutralPose(view),
  };
}
