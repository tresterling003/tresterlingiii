import { describe, expect, it } from 'vitest';
import { aimBone, defaultRig, inbetweenPoses, lerpPose, neutralPose, reachIK, solve, swapSides, twoBoneIK } from '../src/lib/rig/skeleton';
import { applyCorrection } from '../src/lib/motion/corrections';
import { planMotion } from '../src/lib/motion/planner';

const rig = defaultRig(1280, 720);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('rig kinematics', () => {
  it('keeps bone lengths constant in any pose', () => {
    const plan = planMotion('crouch down, jump into the air, and throw a punch', { poseCount: 3, intensity: 'exaggerated', speed: 'normal' });
    for (const k of plan.keys) {
      const s = solve(rig, k.pose);
      expect(dist(s.joints.elbowR, s.joints.wristR)).toBeCloseTo(rig.proportions.faR * rig.height, 6);
      expect(dist(s.joints.kneeL, s.joints.ankleL)).toBeCloseTo(rig.proportions.shL * rig.height, 6);
    }
  });

  it('stands the lowest point on the ground line', () => {
    const s = solve(rig, neutralPose());
    const lowest = Math.max(...Object.values(s.joints).map((p) => p.y));
    expect(lowest).toBeCloseTo(rig.groundY, 6);
  });

  it('two-bone IK reaches a reachable target', () => {
    const [a1, a2] = twoBoneIK({ x: 0, y: 0 }, 10, 10, { x: 12, y: 5 }, 1);
    const mid = { x: Math.cos((a1 * Math.PI) / 180) * 10, y: Math.sin((a1 * Math.PI) / 180) * 10 };
    const end = { x: mid.x + Math.cos((a2 * Math.PI) / 180) * 10, y: mid.y + Math.sin((a2 * Math.PI) / 180) * 10 };
    expect(dist(end, { x: 12, y: 5 })).toBeLessThan(1e-6);
  });

  it('dragging a hand with IK puts the wrist on the target (side and front views, both facings)', () => {
    for (const view of ['side', 'front'] as const)
      for (const facing of [1, -1] as const) {
        const pose = neutralPose(view, facing);
        const s = solve(rig, pose);
        const target = { x: s.joints.chest.x + 60 * facing, y: s.joints.chest.y - 40 };
        const next = reachIK(rig, pose, 'uaR', 'faR', target);
        expect(dist(solve(rig, next).joints.wristR, target), `${view}/${facing}`).toBeLessThan(0.5);
      }
  });

  it('aiming a bone points it at the target', () => {
    const pose = neutralPose('side', -1);
    const s = solve(rig, pose);
    const target = { x: s.joints.shoulderL.x - 100, y: s.joints.shoulderL.y };
    const next = solve(rig, aimBone(rig, pose, 'uaL', target));
    const v = { x: next.joints.elbowL.x - next.joints.shoulderL.x, y: next.joints.elbowL.y - next.joints.shoulderL.y };
    expect(Math.cos(Math.atan2(v.y, v.x))).toBeCloseTo(-1, 4);
  });

  it('interpolates with easing and the short way round', () => {
    const a = neutralPose();
    const b = { ...neutralPose(), angles: { ...a.angles, uaR: a.angles.uaR + 80 }, lift: 0.2 };
    const mid = lerpPose(a, b, 0.5);
    expect(mid.angles.uaR).toBeCloseTo(a.angles.uaR + 40, 6);
    expect(mid.lift).toBeCloseTo(0.1, 6);
    const ib = inbetweenPoses(a, b, 3);
    expect(ib).toHaveLength(3);
    // eased: first step is smaller than the middle step
    expect(ib[0].angles.uaR - a.angles.uaR).toBeLessThan(ib[1].angles.uaR - ib[0].angles.uaR);
    const wrap = lerpPose({ ...a, angles: { ...a.angles, uaR: 170 } }, { ...a, angles: { ...a.angles, uaR: -170 } }, 0.5);
    expect(Math.abs(Math.abs(wrap.angles.uaR) - 180)).toBeLessThan(1e-6);
  });

  it('swapSides mirrors which limb is used', () => {
    const p = { ...neutralPose(), angles: { ...neutralPose().angles, uaR: 10 } };
    expect(swapSides(p).angles.uaL).toBe(10);
  });
});

describe('rig corrections', () => {
  it('"raise the arm higher" raises the right arm', () => {
    const p = planMotion('point forward', { poseCount: 3, intensity: 'normal', speed: 'normal' }).keys[1].pose;
    const before = solve(rig, p).joints.wristR.y;
    const r = applyCorrection(p, 'raise the arm higher');
    expect(r.applied.length).toBe(1);
    expect(solve(rig, r.pose).joints.wristR.y).toBeLessThan(before);
  });
  it('"bend the knees more" lowers the body', () => {
    const p = neutralPose();
    const r = applyCorrection(p, 'bend the knees more');
    expect(solve(rig, r.pose).joints.pelvis.y).toBeGreaterThan(solve(rig, p).joints.pelvis.y);
  });
  it('reports nothing for text it does not understand', () => {
    expect(applyCorrection(neutralPose(), 'make it purple').applied).toEqual([]);
  });
});
