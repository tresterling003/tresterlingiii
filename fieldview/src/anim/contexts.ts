import type { DefenderSpec, Drill, PlayerSpec } from '../data/schema';
import { hashString } from '../sim/rng';
import { BUILDS, type StanceKey } from './skeleton';
import type { PoseContext } from './pose';

/** Pose parameters for an offensive player (shared by the renderer and tests). */
export function offensePoseContext(spec: PlayerSpec, drill: Drill): PoseContext {
  const build = BUILDS[spec.role] ?? BUILDS.WR;
  const seed = hashString(spec.id + spec.number);
  const qb = drill.players.find((p) => p.role === 'QB');
  return {
    build,
    stance: spec.stance as StanceKey,
    postStance: postStanceFor(spec, drill.postSnap),
    mirror: spec.x > 0,
    seed: (seed % 1000) / 100,
    lookAt: qb ? { x: 0, y: qb.y } : { x: 0, y: 0 },
    scan: spec.role === 'OL' ? 0.25 : 1,
  };
}

export function defensePoseContext(d: DefenderSpec): PoseContext {
  const build = d.stance === 'three-point' ? BUILDS.DL : d.stance === 'lb' ? BUILDS.LB : BUILDS.DB;
  const seed = hashString('D' + d.id);
  const stance = defStance(d);
  return { build, stance, postStance: stance === 'dl' ? 'runblock' : stance, mirror: false, seed: (seed % 1000) / 100, lookAt: null, scan: 0.6 };
}

export function postStanceFor(p: PlayerSpec, kind: Drill['postSnap']): StanceKey {
  const run = kind === 'run-left' || kind === 'run-right';
  switch (p.role) {
    case 'OL':
      return run ? 'runblock' : 'passpro';
    case 'TE':
      return run ? 'runblock' : 'ready';
    case 'QB':
      return 'qb-ball';
    default:
      return 'ready';
  }
}

export function defStance(d: DefenderSpec): StanceKey {
  return d.stance === 'three-point' ? 'dl' : d.stance === 'lb' ? 'lb' : d.stance === 'db' ? 'db' : 'two-point';
}
