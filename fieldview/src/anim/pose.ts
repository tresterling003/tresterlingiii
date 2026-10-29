import { Quaternion, Vector3, Matrix4 } from 'three';
import { YARD_M, clamp, lerp, smoothstep, angleDiff } from '../core/units';
import { DIM, STANCES, type Build, type StanceDef, type StanceKey } from './skeleton';
import {
  lerpAngleArr,
  lerpArr,
  sampleAt,
  timeAtPhase,
  type PlayerTrack,
  type Timeline,
} from '../sim/timeline';

// ---------------------------------------------------------------------------
// Procedural skeletal pose solver. Produces joint positions/orientations in the
// player's root space as a PURE FUNCTION of (timeline, track, t) — no state is
// carried between frames, so scrubbing / replay / speed changes are exact.
//
// Locomotion uses footstep planting derived from the timeline: each foot's
// contact point is the body position at that foot's mid-stance time, so planted
// feet do not slide and stride length always matches travel speed.
// ---------------------------------------------------------------------------

export interface Pose {
  pelvis: Vector3;
  pelvisQ: Quaternion;
  torsoQ: Quaternion;
  neck: Vector3;
  headQ: Quaternion;
  shoulder: [Vector3, Vector3];
  elbow: [Vector3, Vector3];
  wrist: [Vector3, Vector3];
  hip: [Vector3, Vector3];
  knee: [Vector3, Vector3];
  ankle: [Vector3, Vector3];
  footQ: [Quaternion, Quaternion];
  handQ: [Quaternion, Quaternion];
}

export function createPose(): Pose {
  const v = () => new Vector3();
  const q = () => new Quaternion();
  return {
    pelvis: v(),
    pelvisQ: q(),
    torsoQ: q(),
    neck: v(),
    headQ: q(),
    shoulder: [v(), v()],
    elbow: [v(), v()],
    wrist: [v(), v()],
    hip: [v(), v()],
    knee: [v(), v()],
    ankle: [v(), v()],
    footQ: [q(), q()],
    handQ: [q(), q()],
  };
}

export interface PoseContext {
  build: Build;
  /** stance before the snap */
  stance: StanceKey;
  /** rest pose after the snap */
  postStance: StanceKey;
  /** mirror stagger (e.g. receivers on the other side of the ball) */
  mirror: boolean;
  seed: number;
  /** look at this field point (yards) when moving laterally (usually the ball) */
  lookAt: { x: number; y: number } | null;
  /** quiet linemen heads, scanning skill players */
  scan: number;
}

export interface RootTransform {
  X: number;
  Z: number;
  yaw: number;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const UP = new Vector3(0, 1, 0);
const AX_X = new Vector3(1, 0, 0);
const AX_Z = new Vector3(0, 0, 1);

type Blendable = {
  pelvisY: number;
  pelvisZ: number;
  pitch: number;
  feet: [Vector3, Vector3];
  hands: [Vector3, Vector3];
};

function stanceToBlend(def: StanceDef, h: number, mirror: boolean, out: Blendable, shoulderL: Vector3, shoulderR: Vector3) {
  out.pelvisY = def.pelvisY * h;
  out.pelvisZ = def.pelvisZ * h;
  out.pitch = def.pitch;
  for (let s = 0; s < 2; s++) {
    const src = mirror ? 1 - s : s;
    const sign = mirror ? -1 : 1;
    const f = def.feet[src];
    out.feet[s].set(f[0] * sign * h, DIM.ankleH * h, f[1] * h);
    const hd = def.hands[src];
    if (hd) out.hands[s].set(hd[0] * sign * h, hd[1] * h, hd[2] * h);
    else {
      const sh = s === 0 ? shoulderL : shoulderR;
      out.hands[s].set(sh.x + (s === 0 ? 0.05 : -0.05) * h, Math.max(0.12, sh.y - 0.56 * h), sh.z + 0.06 * h);
    }
  }
}

function mkBlend(): Blendable {
  return { pelvisY: 0, pelvisZ: 0, pitch: 0, feet: [new Vector3(), new Vector3()], hands: [new Vector3(), new Vector3()] };
}
const restA = mkBlend();
const restB = mkBlend();

/** Track-sampled state at time t. */
export function rootAt(tl: Timeline, tr: PlayerTrack, t: number, out: RootTransform): RootTransform {
  const { i, f } = sampleAt(tl, t);
  out.X = lerpArr(tr.x, i, f) * YARD_M;
  out.Z = -lerpArr(tr.y, i, f) * YARD_M;
  out.yaw = lerpAngleArr(tr.yaw, i, f);
  return out;
}

const _root = { X: 0, Z: 0, yaw: 0 };

/** Stance fraction: walking ~0.6, jogging ~0.44, sprinting ~0.3 (flight phase). */
function dutyFor(v: number) {
  return v < 2.2 ? lerp(0.62, 0.42, clamp((v - 1.2) / 1, 0, 1)) : lerp(0.42, 0.25, clamp((v - 2.2) / 5.5, 0, 1));
}
function spreadFor(v: number) {
  return lerp(0.12, 0.075, clamp(v / 8, 0, 1));
}
function speedAtPhase(tl: Timeline, tr: PlayerTrack, phase: number) {
  const { i, f } = sampleAt(tl, timeAtPhase(tr, phase));
  return lerpArr(tr.speed, i, f);
}

/** World foot position for a gait phase value (mid-stance plant). */
function plantWorld(tl: Timeline, tr: PlayerTrack, phase: number, side: 0 | 1, h: number, spread: number, out: Vector3) {
  const t = timeAtPhase(tr, phase);
  rootAt(tl, tr, t, _root);
  const lat = (side === 0 ? 1 : -1) * spread * h;
  // local (lat, 0, 0) → world
  const c = Math.cos(_root.yaw);
  const s = Math.sin(_root.yaw);
  out.set(_root.X + lat * c, DIM.ankleH * h, _root.Z - lat * s);
  return _root.yaw;
}

function worldToLocal(root: RootTransform, w: Vector3, out: Vector3) {
  const dx = w.x - root.X;
  const dz = w.z - root.Z;
  const c = Math.cos(root.yaw);
  const s = Math.sin(root.yaw);
  out.set(dx * c - dz * s, w.y, dx * s + dz * c);
  return out;
}

const _pA = new Vector3();
const _pB = new Vector3();
const gaitFeet: [Vector3, Vector3] = [new Vector3(), new Vector3()];
const gaitFootPitch = [0, 0];
const gaitFootYaw = [0, 0];

/**
 * Solve the full-body pose for one player at time t.
 * Returns the root transform (world meters + yaw) and fills `pose` (root-local).
 */
export function solvePose(tl: Timeline, tr: PlayerTrack, t: number, ctx: PoseContext, pose: Pose, root: RootTransform): void {
  const h = ctx.build.height;
  rootAt(tl, tr, t, root);
  const { i, f } = sampleAt(tl, t);
  const v = lerpArr(tr.speed, i, f);
  const acc = lerpArr(tr.accel, i, f);
  const turn = lerpArr(tr.turn, i, f);
  const move = clamp(lerpArr(tr.move, i, f), 0, 1);
  const stanceW = clamp(lerpArr(tr.stance, i, f), 0, 1);
  const phase = lerpArr(tr.phase, i, f);
  const post = smoothstep(tl.snap, tl.snap + 0.28, t);

  // ---- rest pose: upright ↔ football stance, then stance → post-snap pose
  const tmpShL = _v2.set(DIM.shoulderHalf * h, 1.45 * h, 0);
  const tmpShR = _v3.set(-DIM.shoulderHalf * h, 1.45 * h, 0);
  stanceToBlend(STANCES.stand, h, false, restA, tmpShL, tmpShR);
  stanceToBlend(STANCES[ctx.stance], h, ctx.mirror, restB, tmpShL, tmpShR);
  blendInto(restA, restB, stanceW, restA);
  if (post > 0) {
    stanceToBlend(STANCES[ctx.postStance], h, ctx.mirror, restB, tmpShL, tmpShR);
    blendInto(restA, restB, post, restA);
  }

  // ---- locomotion pose
  // Gait parameters are fixed per cycle (from the speed when that cycle began)
  // so a planted foot's contact point cannot drift while it is on the ground.
  const vN = clamp(v / 8, 0, 1);
  const runK = clamp((v - 1.8) / 3, 0, 1); // 0 = walk mechanics, 1 = run mechanics
  for (let s = 0 as 0 | 1; s < 2; s = (s + 1) as 0 | 1) {
    const off = s === 0 ? 0 : 0.5;
    const ph = phase + off;
    const k = Math.floor(ph);
    const u = ph - k;
    const vA = speedAtPhase(tl, tr, k - off);
    const dutyA = dutyFor(vA);
    const yawA = plantWorld(tl, tr, k + dutyA / 2 - off, s, h, spreadFor(vA), _pA);
    if (u < dutyA) {
      worldToLocal(root, _pA, gaitFeet[s]);
      gaitFootPitch[s] = u < dutyA * 0.25 ? lerp(-0.25 * vN, 0, u / (dutyA * 0.25)) : u > dutyA * 0.7 ? lerp(0, 0.5 + 0.4 * vN, (u - dutyA * 0.7) / (dutyA * 0.3)) : 0;
      gaitFootYaw[s] = angleDiff(root.yaw, yawA);
    } else {
      const vB = speedAtPhase(tl, tr, k + 1 - off);
      const yawB = plantWorld(tl, tr, k + 1 + dutyFor(vB) / 2 - off, s, h, spreadFor(vB), _pB);
      const sw = (u - dutyA) / (1 - dutyA);
      // Running: the heel recovers high behind the body first, then the knee
      // drives the foot forward. Walking: a low, even arc.
      const skew = lerp(1, 1.25, runK);
      const sk = Math.pow(sw, skew);
      const e = sk * sk * (3 - 2 * sk);
      _v.lerpVectors(_pA, _pB, e);
      const peak = (0.07 + 0.2 * runK + 0.08 * vN) * h;
      _v.y += Math.sin(Math.PI * Math.pow(sw, lerp(1, 0.8, runK))) * peak;
      worldToLocal(root, _v, gaitFeet[s]);
      gaitFootPitch[s] = lerp(0.6 * vN + 0.2, -0.25 * vN, e);
      gaitFootYaw[s] = angleDiff(root.yaw, yawA + angleDiff(yawA, yawB) * e);
    }
  }
  const duty = dutyFor(v);
  const bob = -Math.cos(2 * Math.PI * (2 * phase - duty)) * clamp(0.012 + 0.006 * v, 0, 0.05);
  const locoPelvisY = (0.97 - 0.08 * vN) * h + bob;
  const locoPitch = 0.07 + 0.045 * v + clamp(acc * 0.05, -0.12, 0.3);
  const armAmp = clamp(0.1 + 0.045 * v, 0.1, 0.38) * h;
  const swingL = -Math.cos(2 * Math.PI * phase);

  // ---- combine
  const pelvisY = lerp(restA.pelvisY, locoPelvisY, move);
  const pelvisZ = lerp(restA.pelvisZ, 0, move);
  let pitch = lerp(restA.pitch, locoPitch, move);
  // idle: breathing and small weight shifts (deterministic in t)
  const sd = ctx.seed;
  const breathe = Math.sin(t * 1.6 + sd) * 0.012;
  pitch += breathe * (1 - move);
  const sway = Math.sin(t * 0.55 + sd * 1.7) * 0.012 * (1 - move) * (1 - stanceW * 0.6);
  const bank = clamp(-turn * v * 0.035, -0.32, 0.32) * move;
  const twist = Math.sin(2 * Math.PI * phase) * 0.14 * move * clamp(v / 3, 0, 1);

  pose.pelvis.set(sway, pelvisY, pelvisZ);
  pose.pelvisQ.setFromAxisAngle(UP, twist).multiply(_q.setFromAxisAngle(AX_Z, bank)).multiply(_q2.setFromAxisAngle(AX_X, pitch * 0.25));
  // Torso: lean forward by pitch, counter-twist against pelvis.
  pose.torsoQ.setFromAxisAngle(UP, -twist * 0.7).multiply(_q.setFromAxisAngle(AX_Z, bank * 0.8)).multiply(_q2.setFromAxisAngle(AX_X, pitch));
  _v.set(0, DIM.torso * h, 0).applyQuaternion(pose.torsoQ);
  pose.neck.copy(pose.pelvis).add(_v);
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    _v.set(sign * DIM.shoulderHalf * h * (0.92 + 0.08 * ctx.build.width), DIM.shoulderAlong * h, 0).applyQuaternion(pose.torsoQ);
    pose.shoulder[s].copy(pose.pelvis).add(_v);
    _v.set(sign * DIM.hipHalf * h, -DIM.pelvisToHip * h, 0).applyQuaternion(pose.pelvisQ);
    pose.hip[s].copy(pose.pelvis).add(_v);
  }

  // Head: keep eyes roughly level; look toward the ball while moving laterally.
  let headYaw = Math.sin(t * 0.41 + sd * 3.1) * 0.12 * ctx.scan * (1 - move);
  if (ctx.lookAt && move > 0.05) {
    const lx = ctx.lookAt.x * YARD_M - root.X;
    const lz = -ctx.lookAt.y * YARD_M - root.Z;
    const target = Math.atan2(lx, lz);
    const rel = angleDiff(root.yaw, target);
    headYaw = lerp(headYaw, clamp(rel, -1.2, 1.2), move * 0.85);
  }
  const headPitch = -pitch * 0.92 + 0.05 + Math.sin(t * 0.3 + sd) * 0.02;
  pose.headQ.copy(pose.torsoQ).multiply(_q.setFromAxisAngle(AX_X, headPitch)).premultiply(_q2.setFromAxisAngle(UP, headYaw));

  // Feet
  for (let s = 0; s < 2; s++) {
    const target = pose.ankle[s].copy(restA.feet[s]).lerp(gaitFeet[s], move);
    const restYaw = (s === 0 ? 1 : -1) * STANCES[ctx.stance].toeOut;
    const fy = lerp(restYaw, gaitFootYaw[s], move);
    const fp = gaitFootPitch[s] * move;
    pose.footQ[s].setFromAxisAngle(UP, fy).multiply(_q.setFromAxisAngle(AX_X, fp));
    if (target.y < DIM.ankleH * h) target.y = DIM.ankleH * h;
  }
  // Keep the legs within reach in deep static stances by lowering the pelvis.
  // Uses only the rest-pose feet so it is continuous; in locomotion the leg IK
  // simply extends (heel-off / toe-off) instead.
  const reach = (DIM.thigh + DIM.shin) * h * 0.985;
  let drop = 0;
  for (let s = 0; s < 2; s++) {
    const d = _v.subVectors(restA.feet[s], pose.hip[s]);
    const horiz = Math.hypot(d.x, d.z);
    const maxV = Math.sqrt(Math.max(0, reach * reach - horiz * horiz));
    drop = Math.max(drop, -d.y - maxV);
  }
  drop = clamp(drop, 0, 0.2 * h) * (1 - move);
  if (drop > 0) {
    pose.pelvis.y -= drop;
    pose.neck.y -= drop;
    for (let s = 0; s < 2; s++) {
      pose.hip[s].y -= drop;
      pose.shoulder[s].y -= drop;
    }
  }

  // Legs (two-bone IK, knees forward)
  for (let s = 0; s < 2; s++) {
    // pole: in front of the knee, following the foot's direction (slightly outward)
    _v3.set((s === 0 ? 1 : -1) * 0.15, 0, 1).applyQuaternion(pose.footQ[s]);
    _v3.y = 0;
    const pole = _v2
      .set((pose.hip[s].x + pose.ankle[s].x) / 2, (pose.hip[s].y + pose.ankle[s].y) / 2, (pose.hip[s].z + pose.ankle[s].z) / 2)
      .add(_v3);
    solveTwoBone(pose.hip[s], pose.ankle[s], DIM.thigh * h, DIM.shin * h, pole, pose.knee[s]);
  }

  // Arms
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const sh = pose.shoulder[s];
    const swing = (s === 0 ? swingL : -swingL) * armAmp;
    // running hand target relative to the shoulder (elbows bend more with speed)
    // elbows bend toward ~90° as speed rises; hands swing cheek-to-hip
    const drop = lerp(0.5, 0.3, runK) * h;
    _v.set(sh.x + sign * (0.06 + 0.02 * runK) * h, sh.y - drop + Math.max(0, swing) * 0.45 * runK, sh.z + swing + lerp(0.06, 0.12, runK) * h);
    const target = pose.wrist[s].copy(restA.hands[s]).lerp(_v, move);
    const pole = _v2.set(sh.x + sign * 0.3, sh.y - 0.3, sh.z - 0.6);
    solveTwoBone(sh, target, DIM.upperArm * h, DIM.forearm * h, pole, pose.elbow[s]);
    // hand orientation follows the forearm
    _v.subVectors(pose.wrist[s], pose.elbow[s]).normalize();
    orientY(_v, AX_Z, pose.handQ[s]);
  }
}

function blendInto(a: Blendable, b: Blendable, w: number, out: Blendable) {
  out.pelvisY = lerp(a.pelvisY, b.pelvisY, w);
  out.pelvisZ = lerp(a.pelvisZ, b.pelvisZ, w);
  out.pitch = lerp(a.pitch, b.pitch, w);
  for (let s = 0; s < 2; s++) {
    out.feet[s].lerpVectors(a.feet[s], b.feet[s], w);
    out.hands[s].lerpVectors(a.hands[s], b.hands[s], w);
  }
}

const _ik1 = new Vector3();
const _ik2 = new Vector3();
/** Analytic two-bone IK. Writes the middle joint; clamps the end into reach. */
export function solveTwoBone(a: Vector3, c: Vector3, la: number, lb: number, pole: Vector3, outMid: Vector3) {
  const dir = _ik1.subVectors(c, a);
  let d = dir.length();
  const maxD = (la + lb) * 0.999;
  const minD = Math.abs(la - lb) + 1e-3;
  // Soft IK: approach full extension asymptotically. Near a straight limb the
  // middle joint is ill-conditioned and would whip from frame to frame.
  const soft = maxD * 0.93;
  if (d > soft) {
    const span = maxD - soft;
    const ds = soft + span * (1 - Math.exp(-(d - soft) / span));
    dir.multiplyScalar(ds / d);
    c.copy(a).add(dir);
    d = ds;
  } else if (d < minD) {
    if (d < 1e-6) dir.set(0, -1, 0);
    dir.setLength(minD);
    c.copy(a).add(dir);
    d = minD;
  }
  dir.divideScalar(d);
  const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = _ik2.subVectors(pole, a);
  perp.addScaledVector(dir, -perp.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
  perp.normalize();
  outMid.copy(a).addScaledVector(dir, la * cosA).addScaledVector(perp, la * sinA);
}

const _bx = new Vector3();
const _bz = new Vector3();
/** Quaternion whose +Y axis points along `dir` with +Z as close to `ref` as possible. */
export function orientY(dir: Vector3, ref: Vector3, out: Quaternion): Quaternion {
  const y = dir;
  _bz.copy(ref).addScaledVector(y, -ref.dot(y));
  if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0).addScaledVector(y, -y.x);
  _bz.normalize();
  _bx.crossVectors(y, _bz);
  _m.makeBasis(_bx, y, _bz);
  return out.setFromRotationMatrix(_m);
}
