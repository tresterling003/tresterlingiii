// Understands short pose corrections like "raise the arm higher" or "bend the knees more" and applies them
// to a rig pose. Used by Rig mode's "Fix this pose"; AI mode sends the correction text to the model instead.
import type { BoneId, RigPose } from '../rig/skeleton';

export interface CorrectionResult { pose: RigPose; applied: string[] }

export function applyCorrection(pose: RigPose, text: string, defaultSide: 'R' | 'L' = 'R'): CorrectionResult {
  const t = text.toLowerCase();
  const p: RigPose = { ...pose, angles: { ...pose.angles } };
  const applied: string[] = [];
  const amount = /\b(a lot|much|way|really|very)\b/.test(t) ? 30 : /\b(a (?:little|bit)|slightly|tiny)\b/.test(t) ? 8 : 18;
  const sides: ('R' | 'L')[] = /\bboth\b|\barms\b|\blegs\b|\bknees\b|\belbows\b/.test(t) ? ['R', 'L'] : /\bleft\b/.test(t) ? ['L'] : /\bright\b/.test(t) ? ['R'] : [defaultSide];
  const front = pose.view === 'front';
  const rot = (b: BoneId, d: number) => { p.angles[b] += d; };

  const up = /\b(raise|higher|up|lift)\b/.test(t);
  const down = /\b(lower|down|drop)\b/.test(t);
  // arm higher/lower: in side view arms rotate toward 0 (up) by decreasing the angle when in front of the body
  if (/\barms?\b|\bhands?\b|\bfists?\b/.test(t) && (up || down)) {
    for (const s of sides) {
      const ua = `ua${s}` as BoneId;
      const a = ((p.angles[ua] % 360) + 360) % 360;
      const dir = front || a <= 180 ? -1 : 1; // which way is "up" depends on whether the arm is in front or behind
      rot(ua, (up ? 1 : -1) * dir * amount);
    }
    applied.push(`${up ? 'raised' : 'lowered'} ${sides.length > 1 ? 'both arms' : `the ${sides[0] === 'R' ? 'right' : 'left'} arm`}`);
  }
  if (/\b(straighten|straight)\b.*\b(arm|elbow)s?\b|\b(arm|elbow)s?\b.*\bstraight/.test(t)) {
    for (const s of sides) p.angles[`fa${s}` as BoneId] *= 0.4;
    applied.push('straightened the arm');
  }
  if (/\bbend\b.*\b(arm|elbow)s?\b|\b(arm|elbow)s?\b.*\bbent?\b/.test(t)) {
    for (const s of sides) rot(`fa${s}` as BoneId, -amount * 1.5);
    applied.push('bent the elbow more');
  }
  if (/\bknees?\b|\bcrouch(?: lower)?\b|\bsquat\b/.test(t)) {
    const more = /\bmore|deeper|lower|bend\b/.test(t) && !/\bless\b|\bstraight/.test(t);
    for (const s of ['R', 'L'] as const) {
      rot(`th${s}` as BoneId, (more ? -1 : 1) * amount * (front ? 0.5 : 1));
      rot(`sh${s}` as BoneId, (more ? 1 : -1) * amount * 1.4 * (front ? 0.5 : 1));
    }
    applied.push(more ? 'bent the knees more' : 'straightened the knees');
  }
  if (/\blean\b|\btilt\b/.test(t)) {
    const back = /\bback(?:ward)?\b|\bless\b/.test(t);
    p.lean += (back ? -1 : 1) * amount * 0.7;
    applied.push(back ? 'leaned back' : 'leaned forward more');
  }
  if (/\bhead\b/.test(t) && (up || down)) {
    p.angles.head += (up ? -1 : 1) * amount * 0.6;
    applied.push(up ? 'tilted the head up' : 'tilted the head down');
  }
  if (/\b(leg|kick)\b/.test(t) && (up || down) && !/\bknee/.test(t)) {
    for (const s of sides) rot(`th${s}` as BoneId, (up ? -1 : 1) * amount);
    applied.push(`${up ? 'raised' : 'lowered'} the leg`);
  }
  if (/\b(higher|jump higher)\b/.test(t) && /\bjump|air\b/.test(t)) {
    p.lift += 0.08;
    applied.push('jumped higher');
  }
  if (/\b(bigger|more|exaggerat)/.test(t) && applied.length === 0) {
    // generic "more!": push the body lean further
    p.lean *= 1.3;
    applied.push('exaggerated the lean');
  }
  return { pose: p, applied };
}
