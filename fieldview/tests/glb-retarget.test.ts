import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getGlbFactory, mapBones, useTemplate } from '../src/render/glbPlayer';
import { buildDemoDrills } from '../src/data/demoDrills';
import { compileTimeline } from '../src/sim/timeline';
import { createPose, solvePose, type RootTransform } from '../src/anim/pose';
import { offensePoseContext } from '../src/anim/contexts';
import type { UniformMaterials } from '../src/render/playerModel';

/** Synthetic Mixamo-named humanoid in a T-pose (arms along ±X), facing +Z. */
function makeRig(): THREE.Group {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, world: [number, number, number], parentWorld: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = `mixamorig:${name}`;
    b.position.set(world[0] - parentWorld[0], world[1] - parentWorld[1], world[2] - parentWorld[2]);
    parent.add(b);
    return b;
  };
  const hipsW: [number, number, number] = [0, 1.0, 0];
  const hips = bone('Hips', root, hipsW, [0, 0, 0]);
  const spine = bone('Spine', hips, [0, 1.12, 0], hipsW);
  const spine2 = bone('Spine2', spine, [0, 1.38, 0], [0, 1.12, 0]);
  const neck = bone('Neck', spine2, [0, 1.56, 0], [0, 1.38, 0]);
  bone('Head', neck, [0, 1.68, 0], [0, 1.56, 0]);
  for (const [side, sx] of [['Left', 1], ['Right', -1]] as const) {
    const arm = bone(`${side}Arm`, spine2, [sx * 0.2, 1.48, 0], [0, 1.38, 0]);
    const fore = bone(`${side}ForeArm`, arm, [sx * 0.5, 1.48, 0], [sx * 0.2, 1.48, 0]);
    bone(`${side}Hand`, fore, [sx * 0.77, 1.48, 0], [sx * 0.5, 1.48, 0]);
    const up = bone(`${side}UpLeg`, hips, [sx * 0.1, 0.95, 0], hipsW);
    const leg = bone(`${side}Leg`, up, [sx * 0.1, 0.5, 0], [sx * 0.1, 0.95, 0]);
    const foot = bone(`${side}Foot`, leg, [sx * 0.1, 0.08, 0], [sx * 0.1, 0.5, 0]);
    bone(`${side}ToeBase`, foot, [sx * 0.1, 0.02, 0.14], [sx * 0.1, 0.08, 0]);
  }
  // a tiny mesh so the bounding box has a height
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.3), new THREE.MeshStandardMaterial({ name: 'Jersey' }));
  m.position.y = 0.9;
  root.add(m);
  return root;
}

const uniform = { uniform: { jersey: '#ff0000', pants: '#ffffff', helmet: '#ff0000', socks: '#ff0000', cleats: '#000000', numbers: '#fff', facemask: '#ccc', name: 'x' } } as unknown as UniformMaterials;

describe('GLB athlete retargeting', () => {
  it('maps Mixamo bone names', () => {
    const map = mapBones(makeRig());
    for (const k of ['hips', 'chest', 'neck', 'head', 'upperArmL', 'foreArmR', 'thighL', 'shinR', 'footL', 'handR'] as const) expect(map[k], k).toBeTruthy();
    expect(map.upperArmL!.name).toBe('mixamorig:LeftArm');
    expect(map.shinR!.name).toBe('mixamorig:RightLeg');
  });

  it('limb bones follow the solved pose directions', () => {
    expect(useTemplate(makeRig(), 'synthetic').ok).toBe(true);
    const make = getGlbFactory()!;
    const d = buildDemoDrills()[0];
    const tl = compileTimeline(d, 3);
    const tr = tl.byId.get('Z')!;
    const ctx = offensePoseContext(tr.spec, d);
    const visual = make(uniform, 11, ctx.build, 1);
    const pose = createPose();
    const root: RootTransform = { X: 0, Z: 0, yaw: 0 };
    const bones = mapBones(visual.object);
    const wp = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const toWorld = (v: THREE.Vector3) => {
      const c = Math.cos(root.yaw);
      const s = Math.sin(root.yaw);
      return new THREE.Vector3(root.X + v.x * c + v.z * s, v.y, root.Z - v.x * s + v.z * c);
    };
    let worst = 0;
    for (const t of [0.5, 3.2, 4.1, 9.0]) {
      solvePose(tl, tr, t, ctx, pose, root);
      visual.applyPose(pose, root);
      visual.object.updateMatrixWorld(true);
      const pairs: [THREE.Object3D, THREE.Object3D, THREE.Vector3, THREE.Vector3][] = [
        [bones.thighL!, bones.shinL!, pose.hip[0], pose.knee[0]],
        [bones.shinL!, bones.footL!, pose.knee[0], pose.ankle[0]],
        [bones.thighR!, bones.shinR!, pose.hip[1], pose.knee[1]],
        [bones.upperArmL!, bones.foreArmL!, pose.shoulder[0], pose.elbow[0]],
        [bones.foreArmR!, bones.handR!, pose.elbow[1], pose.wrist[1]],
      ];
      for (const [a, b, ja, jb] of pairs) {
        const got = wp(b).sub(wp(a)).normalize();
        const want = toWorld(jb).sub(toWorld(ja)).normalize();
        worst = Math.max(worst, (got.angleTo(want) * 180) / Math.PI);
      }
      // hips follow the solved pelvis height (model scaled to the athlete's size)
      expect(Math.abs(wp(bones.hips!).y - pose.pelvis.y)).toBeLessThan(0.02);
    }
    expect(worst).toBeLessThan(1);
  });
});
