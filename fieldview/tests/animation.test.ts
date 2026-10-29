import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildDemoDrills } from '../src/data/demoDrills';
import { compileTimeline, SAMPLE_HZ, compileDefenseTracks } from '../src/sim/timeline';
import { createPose, solvePose, type Pose, type RootTransform } from '../src/anim/pose';
import { offensePoseContext, defensePoseContext } from '../src/anim/contexts';
import { DIM } from '../src/anim/skeleton';

const drills = buildDemoDrills();

function toWorld(root: RootTransform, v: Vector3, out = new Vector3()) {
  const c = Math.cos(root.yaw);
  const s = Math.sin(root.yaw);
  return out.set(root.X + v.x * c + v.z * s, v.y, root.Z - v.x * s + v.z * c);
}

function joints(p: Pose): Vector3[] {
  return [p.pelvis, p.neck, ...p.shoulder, ...p.elbow, ...p.wrist, ...p.hip, ...p.knee, ...p.ankle];
}

interface Stats {
  maxLocal: number;
  maxLocalAt: string;
  maxJump: number;
  maxJumpAt: string;
  maxSlide: number;
  maxSlideAt: string;
  minAnkle: number;
  contacts: number;
}

function analyse(drillIdx: number, huddle: boolean): Stats {
  const d = drills[drillIdx];
  const tl = compileTimeline(d, 42, { huddleBreak: huddle });
  const st: Stats = { maxLocal: 0, maxLocalAt: '', maxJump: 0, maxJumpAt: '', maxSlide: 0, maxSlideAt: '', minAnkle: Infinity, contacts: 0 };
  for (const tr of tl.tracks) {
    const ctx = offensePoseContext(tr.spec, d);
    const pose = createPose();
    const root: RootTransform = { X: 0, Z: 0, yaw: 0 };
    let prev: Vector3[] | null = null;
    let prevLocal: Vector3[] | null = null;
    const ground = DIM.ankleH * ctx.build.height + 0.012;
    const anchor: (Vector3 | null)[] = [null, null];
    for (let i = 0; i < tl.samples; i++) {
      const t = i / SAMPLE_HZ;
      solvePose(tl, tr, t, ctx, pose, root);
      const w = joints(pose).map((j) => toWorld(root, j));
      if (prev) {
        for (let k = 0; k < w.length; k++) {
          const dist = w[k].distanceTo(prev[k]);
          if (dist > st.maxJump) {
            st.maxJump = dist;
            st.maxJumpAt = `${d.id} ${tr.spec.id} t=${t.toFixed(3)} joint ${k}`;
          }
        }
      }
      prev = w;
      const loc = joints(pose).map((j) => j.clone());
      if (prevLocal)
        for (let k = 0; k < loc.length; k++) {
          const dist = loc[k].distanceTo(prevLocal[k]);
          if (dist > st.maxLocal) {
            st.maxLocal = dist;
            st.maxLocalAt = `${d.id} ${tr.spec.id} t=${t.toFixed(3)} joint ${k}`;
          }
        }
      prevLocal = loc;
      // planted-foot sliding while in full locomotion
      const move = tr.move[i];
      for (let s = 0; s < 2; s++) {
        const a = toWorld(root, pose.ankle[s]);
        st.minAnkle = Math.min(st.minAnkle, pose.ankle[s].y);
        const planted = a.y <= ground && move > 0.98 && tr.speed[i] > 0.5;
        if (planted) {
          if (!anchor[s]) {
            anchor[s] = a.clone();
            st.contacts++;
          } else {
            const slide = Math.hypot(a.x - anchor[s]!.x, a.z - anchor[s]!.z);
            if (slide > st.maxSlide) {
              st.maxSlide = slide;
              st.maxSlideAt = `${d.id} ${tr.spec.id} t=${t.toFixed(3)} foot ${s}`;
            }
          }
        } else anchor[s] = null;
      }
    }
  }
  return st;
}

describe('skeletal animation quality', () => {
  it('planted feet do not slide during locomotion and joints never pop', () => {
    const report: string[] = [];
    let worstSlide = 0;
    let worstJump = 0;
    let worstLocal = 0;
    let contacts = 0;
    drills.forEach((_, i) => {
      for (const huddle of [false, true]) {
        const s = analyse(i, huddle);
        worstSlide = Math.max(worstSlide, s.maxSlide);
        worstJump = Math.max(worstJump, s.maxJump);
        worstLocal = Math.max(worstLocal, s.maxLocal);
        contacts += s.contacts;
        report.push(`${drills[i].id}${huddle ? ' +huddle' : ''}: slide ${(s.maxSlide * 100).toFixed(1)} cm (${s.maxSlideAt}), world jump ${(s.maxJump * 100).toFixed(1)} cm (${s.maxJumpAt}), body-relative jump ${(s.maxLocal * 100).toFixed(1)} cm (${s.maxLocalAt})`);
        // ankles never go through the ground
        expect(s.minAnkle).toBeGreaterThan(DIM.ankleH * 0.9 - 1e-6);
      }
    });
    console.log(`[animation] foot contacts analysed: ${contacts}; worst planted-foot slide ${(worstSlide * 100).toFixed(2)} cm; worst per-frame (1/120 s) joint motion ${(worstJump * 100).toFixed(1)} cm world / ${(worstLocal * 100).toFixed(1)} cm relative to the body`);
    if (worstSlide > 0.03 || worstJump > 0.25 || worstLocal > 0.12) console.log(report.join('\n'));
    expect(contacts).toBeGreaterThan(100);
    expect(worstSlide).toBeLessThan(0.03); // < 3 cm while planted
    // No pops: relative to the body a joint moves < 12 cm per 1/120 s (≈14 m/s);
    // in world space (body travel included, sprinting ≈ 7.3 m/s) < 25 cm.
    expect(worstLocal).toBeLessThan(0.12);
    expect(worstJump).toBeLessThan(0.25);
  });

  it('pose is a pure function of time (scrubbing order does not matter)', () => {
    const d = drills[3];
    const tl = compileTimeline(d, 5);
    const tr = tl.byId.get('Z')!;
    const ctx = offensePoseContext(tr.spec, d);
    const sample = (t: number) => {
      const p = createPose();
      const r: RootTransform = { X: 0, Z: 0, yaw: 0 };
      solvePose(tl, tr, t, ctx, p, r);
      return [r.X, r.Z, r.yaw, ...joints(p).flatMap((v) => [v.x, v.y, v.z])];
    };
    const times = [0.5, 4.2, 5.9, 6.4, 2.0];
    const a = times.map(sample);
    const b = [...times].reverse().map(sample).reverse();
    expect(a).toEqual(b);
  });

  it('defensive teammates solve without errors', () => {
    const d = drills[0];
    const tl = compileTimeline(d, 1);
    const tracks = compileDefenseTracks(d, tl);
    expect(tracks).toHaveLength(11);
    for (const tr of tracks) {
      const ctx = defensePoseContext(d.defense.defenders.find((x) => x.id === tr.spec.id)!);
      const p = createPose();
      const r: RootTransform = { X: 0, Z: 0, yaw: 0 };
      for (const t of [0, tl.snap + 0.5, tl.duration]) {
        solvePose(tl, tr, t, ctx, p, r);
        expect(Number.isFinite(p.knee[0].x + p.wrist[1].y + r.X)).toBe(true);
      }
    }
  });
});
