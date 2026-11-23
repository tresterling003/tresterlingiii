// Draws a rigged character for a pose. Three looks:
//  - stick:   clean stick figure (color + line thickness can match a student's uploaded stick figure)
//  - cartoon: simple shape-built character (used by the demo character "Pip")
//  - cutout:  pieces cut from the student's own drawing, each pinned to a bone (rigid "paper puppet" deformation)
import { BONES, solve, type BoneId, type CharacterRig, type Pt, type RigPose, type Solved } from './skeleton';

export interface StickStyle { kind: 'stick'; color: string; lineWidth: number; headFill: string | null; face: boolean }
export interface CartoonStyle { kind: 'cartoon'; outline: string; skin: string; shirt: string; pants: string; shoes: string; hair: string }
export interface CutoutPart { id: string; bone: BoneId; polygon: Pt[]; label: string }
export interface CutoutStyle { kind: 'cutout'; parts: CutoutPart[]; remainder: boolean; sourceFrameId: string }
export type RigStyle = StickStyle | CartoonStyle | CutoutStyle;

export const DEFAULT_STICK: StickStyle = { kind: 'stick', color: '#1d1f24', lineWidth: 9, headFill: null, face: true };
export const PIP_STYLE: CartoonStyle = { kind: 'cartoon', outline: '#1b1c22', skin: '#f2c9a5', shirt: '#4d8dff', pants: '#2f3440', shoes: '#e8574f', hair: '#3b2a22' };

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function line(ctx: Ctx, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function drawStick(ctx: Ctx, s: Solved, rig: CharacterRig, pose: RigPose, st: StickStyle) {
  const j = s.joints;
  const lw = st.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = st.color;
  ctx.lineWidth = lw;
  const chain = (pts: Pt[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  chain([j.pelvis, j.chest, j.neckTop]);
  chain([j.shoulderR, j.elbowR, j.wristR]);
  chain([j.shoulderL, j.elbowL, j.wristL]);
  chain([j.pelvis, j.hipR, j.kneeR, j.ankleR, j.toeR]);
  chain([j.pelvis, j.hipL, j.kneeL, j.ankleL, j.toeL]);
  const r = rig.proportions.head * rig.height;
  ctx.beginPath();
  ctx.arc(j.headC.x, j.headC.y, Math.max(1, r - lw / 2), 0, Math.PI * 2);
  if (st.headFill) {
    ctx.fillStyle = st.headFill;
    ctx.fill();
  }
  ctx.stroke();
  if (st.face) drawEyes(ctx, j.headC, r, pose, s, st.color, Math.max(2, lw * 0.42));
}

function drawEyes(ctx: Ctx, c: Pt, r: number, pose: RigPose, s: Solved, color: string, size: number) {
  const headAngle = (s.world.head * Math.PI) / 180; // points from neck to head center ("up" for the head)
  const ux = Math.cos(headAngle), uy = Math.sin(headAngle);
  // perpendicular pointing "forward" for facing 1
  const fx = -uy * (pose.facing === 1 ? -1 : 1) * -1, fy = ux * (pose.facing === 1 ? -1 : 1) * -1;
  ctx.fillStyle = color;
  const eye = (along: number, across: number) => {
    ctx.beginPath();
    ctx.arc(c.x + ux * along * r + fx * across * r, c.y + uy * along * r + fy * across * r, size, 0, Math.PI * 2);
    ctx.fill();
  };
  if (pose.view === 'front') {
    const lk = pose.look * 0.25 * pose.facing;
    eye(0.15, -0.32 + lk);
    eye(0.15, 0.32 + lk);
  } else {
    const lk = pose.look * 0.12;
    eye(0.18 + lk, 0.5);
    eye(0.18 + lk, 0.15);
  }
}

function drawCartoon(ctx: Ctx, s: Solved, rig: CharacterRig, pose: RigPose, st: CartoonStyle) {
  const j = s.joints;
  const H = rig.height;
  const o = Math.max(2, H * 0.009);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const capsule = (pts: Pt[], w: number, fill: string) => {
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = w + o * 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const dot = (p: Pt, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = o;
    ctx.strokeStyle = st.outline;
    ctx.stroke();
  };
  const limbW = H * 0.052;
  const arm = (side: 'R' | 'L', dark: boolean) => {
    const f = dark ? 0.8 : 1;
    capsule([j[`shoulder${side}`], j[`elbow${side}`]], limbW * 1.05, shade(st.shirt, f));
    capsule([j[`elbow${side}`], j[`wrist${side}`]], limbW * 0.85, shade(st.skin, f));
    dot(j[`wrist${side}`], limbW * 0.62, shade(st.skin, f));
  };
  const leg = (side: 'R' | 'L', dark: boolean) => {
    const f = dark ? 0.8 : 1;
    capsule([j[`hip${side}`], j[`knee${side}`], j[`ankle${side}`]], limbW * 1.15, shade(st.pants, f));
    capsule([j[`ankle${side}`], j[`toe${side}`]], limbW * 0.95, shade(st.shoes, f));
  };
  const torso = () => {
    const top = { x: j.chest.x + (j.neckTop.x - j.chest.x) * 0.15, y: j.chest.y + (j.neckTop.y - j.chest.y) * 0.15 };
    const bottom = { x: j.pelvis.x + (j.chest.x - j.pelvis.x) * 0.1, y: j.pelvis.y + (j.chest.y - j.pelvis.y) * 0.1 };
    capsule([j.chest, j.neckTop], limbW * 0.6, st.skin);
    capsule([bottom, top], pose.view === 'front' ? H * 0.15 : H * 0.12, st.shirt);
    capsule([j.pelvis, bottom], H * 0.11, st.pants);
  };
  const head = () => {
    const r = rig.proportions.head * H * 1.12;
    dot(j.headC, r, st.skin);
    // hair cap on the top/back of the head
    const up = (s.world.head * Math.PI) / 180;
    const back = pose.view === 'front' ? 0 : pose.facing === 1 ? -0.5 : 0.5;
    ctx.beginPath();
    ctx.arc(j.headC.x, j.headC.y, r, up - 1.25 + back, up + 1.25 + back);
    ctx.closePath();
    ctx.fillStyle = st.hair;
    ctx.fill();
    ctx.lineWidth = o;
    ctx.strokeStyle = st.outline;
    ctx.stroke();
    drawEyes(ctx, j.headC, r, pose, s, st.outline, Math.max(2, H * 0.011));
  };
  if (pose.view === 'front') {
    leg('R', false); leg('L', false); torso(); arm('R', false); arm('L', false); head();
  } else {
    arm('L', true); leg('L', true); leg('R', false); torso(); head(); arm('R', false);
  }
}

/** Affine transform of a bone frame: translate(from) · rotate(world) · scale(1, mirror). */
function boneMatrix(s: Solved, bone: BoneId, facing: 1 | -1) {
  const b = BONES.find((x) => x.id === bone)!;
  const p = s.joints[b.from];
  const a = (s.world[bone] * Math.PI) / 180;
  const m = facing * s.sign[bone];
  return new DOMMatrix([Math.cos(a), Math.sin(a), -Math.sin(a) * m, Math.cos(a) * m, p.x, p.y]);
}

function drawCutout(ctx: Ctx, rig: CharacterRig, pose: RigPose, st: CutoutStyle, source: CanvasImageSource | null) {
  if (!source) return;
  const rest = solve(rig, rig.rest);
  const now = solve(rig, pose);
  const place = (bone: BoneId) => boneMatrix(now, bone, pose.facing).multiply(boneMatrix(rest, bone, rig.rest.facing).inverse());
  const clip = (poly: Pt[]) => {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };
  if (st.remainder) {
    ctx.save();
    ctx.setTransform(place('spine'));
    // everything that is not inside a part follows the torso
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    for (const part of st.parts) {
      part.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    }
    ctx.clip('evenodd');
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }
  for (const part of st.parts) {
    ctx.save();
    ctx.setTransform(place(part.bone));
    clip(part.polygon);
    ctx.clip();
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }
}

export function renderRig(ctx: Ctx, rig: CharacterRig, pose: RigPose, style: RigStyle, source: CanvasImageSource | null = null) {
  ctx.save();
  const s = solve(rig, pose);
  if (style.kind === 'stick') drawStick(ctx, s, rig, pose, style);
  else if (style.kind === 'cartoon') drawCartoon(ctx, s, rig, pose, style);
  else drawCutout(ctx, rig, pose, style, source);
  ctx.restore();
}

/**
 * A colour-coded skeleton used as a "pose guide" reference image for AI generation:
 * right limbs warm, left limbs cool, so the model can tell them apart.
 */
export function renderGuide(ctx: Ctx, rig: CharacterRig, pose: RigPose, lineWidth: number) {
  const s = solve(rig, pose);
  const j = s.joints;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  const seg = (a: Pt, b: Pt, c: string) => { ctx.strokeStyle = c; line(ctx, a, b); };
  seg(j.pelvis, j.chest, '#222');
  seg(j.chest, j.neckTop, '#222');
  seg(j.shoulderR, j.elbowR, '#e0442f'); seg(j.elbowR, j.wristR, '#f08a24');
  seg(j.shoulderL, j.elbowL, '#2f7be0'); seg(j.elbowL, j.wristL, '#24b5f0');
  seg(j.pelvis, j.hipR, '#222'); seg(j.pelvis, j.hipL, '#222');
  seg(j.hipR, j.kneeR, '#c0392b'); seg(j.kneeR, j.ankleR, '#e67e22'); seg(j.ankleR, j.toeR, '#e67e22');
  seg(j.hipL, j.kneeL, '#2c5fb8'); seg(j.kneeL, j.ankleL, '#2e9fd0'); seg(j.ankleL, j.toeL, '#2e9fd0');
  ctx.beginPath();
  ctx.arc(j.headC.x, j.headC.y, rig.proportions.head * rig.height, 0, Math.PI * 2);
  ctx.strokeStyle = '#222';
  ctx.stroke();
  ctx.restore();
}
