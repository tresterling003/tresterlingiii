import { describe, expect, it } from 'vitest';
import { buildDemoDrills } from '../src/data/demoDrills';
import { DrillSchema } from '../src/data/schema';
import { compileTimeline, playerPosAt, SAMPLE_HZ, timeAtPhase } from '../src/sim/timeline';
import { validateDrill } from '../src/sim/validate';
import { PathCurve, SpeedProfile } from '../src/sim/path';

const drills = buildDemoDrills();

describe('demo drills', () => {
  it('has at least 10 drills, all schema-valid', () => {
    expect(drills.length).toBeGreaterThanOrEqual(10);
    for (const d of drills) expect(DrillSchema.safeParse(d).success, d.id).toBe(true);
  });

  it('every drill has 11 players and passes legality checks without errors/warnings', () => {
    for (const d of drills) {
      expect(d.players).toHaveLength(11);
      const issues = validateDrill(d).filter((i) => i.level !== 'info');
      expect(issues, `${d.id}: ${JSON.stringify(issues)}`).toEqual([]);
    }
  });

  it('includes motion both directions and no-motion comparisons', () => {
    const across = drills.filter((d) => d.id.startsWith('demo-across'));
    const dirs = across.map((d) => {
      const m = d.movements[0];
      const p = d.players.find((q) => q.id === m.playerId)!;
      return Math.sign(m.path[m.path.length - 1].x - p.x);
    });
    expect(new Set(dirs).size).toBe(2);
    expect(drills.filter((d) => d.movements.length === 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe('timeline determinism', () => {
  it('same drill + seed produces identical tracks', () => {
    for (const d of drills) {
      const a = compileTimeline(d, 12345);
      const b = compileTimeline(d, 12345);
      expect(a.snap).toBe(b.snap);
      a.tracks.forEach((t, i) => {
        expect(Array.from(t.x)).toEqual(Array.from(b.tracks[i].x));
        expect(Array.from(t.yaw)).toEqual(Array.from(b.tracks[i].yaw));
        expect(Array.from(t.phase)).toEqual(Array.from(b.tracks[i].phase));
      });
    }
  });

  it('different seeds vary timing only within the coach bounds', () => {
    const d = drills[0];
    const snaps = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => compileTimeline(d, s).snap);
    for (const s of snaps) {
      expect(s).toBeGreaterThanOrEqual(d.snapTime + d.snapJitter[0] - 1e-9);
      expect(s).toBeLessThanOrEqual(d.snapTime + d.snapJitter[1] + 1e-9);
    }
    expect(new Set(snaps).size).toBeGreaterThan(1);
  });

  it('motion follows the authored path and ends at the last waypoint', () => {
    const d = drills.find((x) => x.id === 'demo-across-rl')!;
    const tl = compileTimeline(d, 7);
    const z = tl.byId.get('Z')!;
    const end = playerPosAt(z, tl.markers.motionEnd! + 0.01, tl);
    expect(end.x).toBeCloseTo(5.6, 1);
    expect(end.y).toBeCloseTo(1.6, 1);
    // Non-moving players stay put pre-snap
    const lt = tl.byId.get('LT')!;
    const a = playerPosAt(lt, 0, tl);
    const b = playerPosAt(lt, tl.snap - 0.01, tl);
    expect(a).toEqual(b);
  });

  it('jet motion is still moving at the snap and continues after it', () => {
    const d = drills.find((x) => x.id === 'demo-jet-rl')!;
    const tl = compileTimeline(d, 99);
    const z = tl.byId.get('Z')!;
    const i = Math.floor(tl.snap * SAMPLE_HZ);
    expect(z.speed[i - 1]).toBeGreaterThan(5);
    expect(z.speed[i + 30]).toBeGreaterThan(4);
    expect(tl.markers.decision).toBeLessThan(tl.snap);
  });

  it('speeds stay physically plausible (no teleporting)', () => {
    for (const d of drills) {
      const tl = compileTimeline(d, 3, { huddleBreak: true });
      for (const tr of tl.tracks) {
        for (let i = 1; i < tl.samples; i++) {
          const dx = (tr.x[i] - tr.x[i - 1]) * SAMPLE_HZ;
          const dy = (tr.y[i] - tr.y[i - 1]) * SAMPLE_HZ;
          expect(Math.hypot(dx, dy), `${d.id} ${tr.spec.id} @${i}`).toBeLessThan(10.5);
        }
      }
    }
  });

  it('gait phase is monotonic and invertible', () => {
    const tl = compileTimeline(drills[0], 1);
    const z = tl.byId.get('Z')!;
    for (let i = 1; i < tl.samples; i++) expect(z.phase[i]).toBeGreaterThanOrEqual(z.phase[i - 1]);
    const t = 4.0;
    const ph = z.phase[Math.round(t * SAMPLE_HZ)];
    expect(Math.abs(timeAtPhase(z, ph) - t)).toBeLessThan(0.02);
  });

  it('huddle break ends with everyone at their formation spots', () => {
    const d = drills[2];
    const tl = compileTimeline(d, 1, { huddleBreak: true });
    for (const tr of tl.tracks) {
      const p = playerPosAt(tr, tl.markers.alignEnd, tl);
      expect(p.x).toBeCloseTo(tr.spec.x, 2);
      expect(p.y).toBeCloseTo(tr.spec.y, 2);
    }
  });
});

describe('path + speed profile', () => {
  it('speed profile covers the full distance', () => {
    const p = new SpeedProfile(20, 0, 6, 0, 5, 7);
    expect(p.s(p.duration)).toBeCloseTo(20, 6);
    expect(p.v(p.duration)).toBeCloseTo(0, 6);
    const short = new SpeedProfile(1, 0, 8, 0, 5, 7);
    expect(short.s(short.duration)).toBeCloseTo(1, 6);
  });
  it('path passes through waypoints', () => {
    const c = new PathCurve([{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 0 }], true);
    const end = c.at(c.length);
    expect(end.x).toBeCloseTo(10, 6);
  });
});
