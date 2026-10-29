import type { Drill, Movement, PlayerSpec, Point } from '../data/schema';
import { YARD_M, angleDiff, clamp } from '../core/units';
import { PathCurve, SpeedProfile } from './path';
import { mulberry32 } from './rng';

// ---------------------------------------------------------------------------
// The authoritative simulation timeline. A drill + seed compiles into fixed
// per-player tracks sampled at SAMPLE_HZ. Everything the renderer shows is a
// pure function of (timeline, t) — so replay, pause, scrubbing and speed
// changes can never drift, and two windows showing the same t agree exactly.
// ---------------------------------------------------------------------------

export const SAMPLE_HZ = 120;
const DT = 1 / SAMPLE_HZ;

export interface TimelineOptions {
  /** Prepend a huddle break so athletes watch the offense align. */
  huddleBreak?: boolean;
}

export interface Segment {
  playerId: string;
  kind: Movement['kind'] | 'align';
  start: number;
  curve: PathCurve;
  profile: SpeedProfile;
  end: number;
  holdFacing?: number; // radians (world yaw)
  endFacing?: number; // radians
  noStop: boolean;
  sourceId?: string;
}

export interface PlayerTrack {
  spec: PlayerSpec;
  index: number;
  /** yards */
  x: Float32Array;
  y: Float32Array;
  /** world yaw (radians; 0 = facing the defense) */
  yaw: Float32Array;
  /** m/s along the ground */
  speed: Float32Array;
  /** m/s² along travel (+ accelerating) */
  accel: Float32Array;
  /** yaw rate rad/s */
  turn: Float32Array;
  /** cumulative gait cycles */
  phase: Float32Array;
  /** 0 = standing still, 1 = locomotion (non-causal smoothing gives anticipation) */
  move: Float32Array;
  /** 0 = upright, 1 = in the player's football stance */
  stance: Float32Array;
  segments: Segment[];
}

export interface Markers {
  repStart: number;
  alignEnd: number;
  firstMotion: number | null;
  motionEnd: number | null;
  shiftEnd: number | null;
  set: number;
  snap: number;
  decision: number;
  end: number;
}

export interface Timeline {
  drillId: string;
  seed: number;
  duration: number;
  samples: number;
  snap: number;
  markers: Markers;
  tracks: PlayerTrack[];
  byId: Map<string, PlayerTrack>;
  ball: BallPlan;
  postSnapKind: Drill['postSnap'];
}

export interface BallPlan {
  /** QB receives the snap at snap + flight */
  qbId: string | null;
  flight: number;
  shotgun: boolean;
  handoffTo: string | null;
  handoffTime: number | null;
}

// Stride (one full gait cycle, two steps) length in meters for a speed in m/s.
export function cycleLength(vMps: number): number {
  return clamp(0.78 + 0.46 * vMps, 1.05, 4.6);
}

function yawFromDir(dx: number, dy: number): number {
  return Math.atan2(dx, -dy);
}

const deg = (d: number) => (d * Math.PI) / 180;

function accelFor(v: number) {
  return { a: clamp(1.15 * v, 3, 7.5), d: clamp(1.5 * v, 3.5, 9) };
}

/** Compile a drill into the deterministic timeline for one rep. */
export function compileTimeline(drill: Drill, seed: number, opts: TimelineOptions = {}): Timeline {
  const rng = mulberry32(seed);
  const jit = (r?: [number, number]) => (r ? r[0] + (r[1] - r[0]) * rng() : 0);

  // Snap time (+ coach-bounded randomization).
  let snap = drill.snapTime + jit(drill.snapJitter);
  const huddle = !!opts.huddleBreak;

  // Resolve movement start times (consume rng in array order → deterministic).
  const resolved = drill.movements.map((m) => ({ m, j: jit(m.jitter) }));

  // Huddle break offset: compute alignment segments first.
  const pos = new Map<string, Point>();
  const facing = new Map<string, number>();
  const segsBy = new Map<string, Segment[]>();
  for (const p of drill.players) segsBy.set(p.id, []);

  let offset = 0;
  if (huddle) {
    const spots = huddleSpots(drill.players);
    let latest = 0;
    drill.players.forEach((p, i) => {
      const h = spots[i];
      const start = 0.6 + (p.role === 'OL' ? 0 : 0.15 + 0.05 * (i % 3));
      const v = p.role === 'OL' ? 3.4 : p.role === 'WR' ? 5.2 : 4.2;
      const target = { x: p.x, y: p.y };
      const curve = new PathCurve([h.p, approach(h.p, target), target], true);
      const { a, d } = accelFor(v);
      const profile = new SpeedProfile(curve.length, 0, v, 0, a, d);
      const seg: Segment = {
        playerId: p.id,
        kind: 'align',
        start,
        curve,
        profile,
        end: start + profile.duration,
        endFacing: deg(p.facing),
        noStop: false,
      };
      segsBy.get(p.id)!.push(seg);
      latest = Math.max(latest, seg.end);
      pos.set(p.id, h.p);
      facing.set(p.id, h.yaw);
    });
    offset = latest + 1.6; // time to put a hand down and get set
    snap += offset;
  } else {
    for (const p of drill.players) {
      pos.set(p.id, { x: p.x, y: p.y });
      facing.set(p.id, deg(p.facing));
    }
  }

  // Pre-snap movements, sequential per player.
  const pre = resolved
    .filter((r) => r.m.kind !== 'postsnap')
    .map((r) => ({
      m: r.m,
      t: (r.m.anchor === 'snap' ? snap + r.m.start : offset + r.m.start) + r.j,
    }))
    .sort((a, b) => a.t - b.t);

  const cursor = new Map<string, { p: Point; free: number; v: number }>();
  for (const p of drill.players) {
    const segs = segsBy.get(p.id)!;
    const last = segs[segs.length - 1];
    cursor.set(p.id, { p: last ? last.curve.end() : pos.get(p.id)!, free: last ? last.end : 0, v: 0 });
  }

  for (const { m, t } of pre) {
    const c = cursor.get(m.playerId);
    if (!c) continue;
    const start = Math.max(t, c.free);
    if (!Number.isFinite(start)) continue; // player is already in continuous motion
    const curve = new PathCurve([c.p, ...m.path], m.curve === 'smooth');
    const { a, d } = accelFor(m.speed);
    const vf = m.noStop ? m.speed : 0;
    const profile = new SpeedProfile(curve.length, 0, m.speed, vf, a, d);
    const seg: Segment = {
      playerId: m.playerId,
      kind: m.kind,
      start,
      curve,
      profile,
      end: start + profile.duration,
      holdFacing: m.holdFacing !== undefined ? deg(m.holdFacing) : undefined,
      endFacing: m.endFacing !== undefined ? deg(m.endFacing) : undefined,
      noStop: m.noStop,
      sourceId: m.id,
    };
    segsBy.get(m.playerId)!.push(seg);
    c.p = curve.end();
    c.free = m.noStop ? Infinity : seg.end;
  }

  // Positions and velocities at the snap (needed for post-snap continuation).
  const atSnap = new Map<string, { p: Point; vx: number; vy: number }>();
  for (const p of drill.players) {
    const st = evalSegments(segsBy.get(p.id)!, snap, pos.get(p.id)!);
    atSnap.set(p.id, st);
  }

  // Post-snap movements: explicit ones, or generated defaults by role.
  const explicitPost = resolved.filter((r) => r.m.kind === 'postsnap');
  const postIds = new Set(explicitPost.map((r) => r.m.playerId));
  const generated: { m: Movement; j: number }[] =
    drill.postSnap === 'none'
      ? []
      : drill.players
          .filter((p) => !postIds.has(p.id))
          .map((p) => ({ m: defaultPostSnap(drill, p, atSnap.get(p.id)!), j: 0 }))
          .filter((r): r is { m: Movement; j: number } => r.m !== null);
  for (const { m, j } of [...explicitPost, ...generated]) {
    const segs = segsBy.get(m.playerId);
    if (!segs) continue;
    const st = atSnap.get(m.playerId)!;
    // Truncate any pre-snap segment still running at the snap.
    for (const s of segs) {
      if (s.start < snap && (s.end > snap || s.noStop)) {
        s.end = snap;
        s.noStop = false;
        (s as Segment & { truncated?: boolean }).truncated = true;
      }
    }
    const v0 = Math.hypot(st.vx, st.vy);
    const start = snap + Math.max(0, m.start + j);
    const curve = new PathCurve([st.p, ...m.path], m.curve === 'smooth');
    const { a, d } = accelFor(m.speed);
    const profile = new SpeedProfile(curve.length, start === snap ? v0 : 0, m.speed, m.noStop ? m.speed : 0, a, d);
    segs.push({
      playerId: m.playerId,
      kind: 'postsnap',
      start,
      curve,
      profile,
      end: start + profile.duration,
      holdFacing: m.holdFacing !== undefined ? deg(m.holdFacing) : undefined,
      endFacing: m.endFacing !== undefined ? deg(m.endFacing) : undefined,
      noStop: m.noStop,
      sourceId: m.id,
    });
  }

  const duration = snap + drill.postSnapDuration + 0.0001;
  const samples = Math.ceil(duration * SAMPLE_HZ) + 1;

  const tracks: PlayerTrack[] = drill.players.map((spec, index) =>
    sampleTrack(spec, index, segsBy.get(spec.id)!, pos.get(spec.id)!, facing.get(spec.id)!, samples, huddle),
  );

  // Markers
  const allSegs = [...segsBy.values()].flat();
  const motions = allSegs.filter((s) => s.kind === 'motion');
  const shifts = allSegs.filter((s) => s.kind === 'shift');
  const firstMotion = motions.length ? Math.min(...motions.map((s) => s.start)) : null;
  const motionEnd = motions.length ? Math.min(snap, Math.max(...motions.map((s) => (s.noStop ? snap : s.end)))) : null;
  const shiftEnd = shifts.length ? Math.max(...shifts.map((s) => s.end)) : null;
  const alignEnd = huddle ? offset : 0;
  const set = Math.max(alignEnd, shiftEnd ?? 0);
  const markers: Markers = {
    repStart: 0,
    alignEnd,
    firstMotion,
    motionEnd,
    shiftEnd,
    set,
    snap,
    decision: 0,
    end: duration,
  };
  markers.decision = decisionTime(drill, markers, offset);

  const qb = drill.players.find((p) => p.role === 'QB') ?? null;
  const shotgun = qb ? qb.y > 2.5 : true;
  let handoffTo: string | null = null;
  if (drill.postSnap === 'run-left' || drill.postSnap === 'run-right') {
    const rb = drill.players.filter((p) => p.role === 'RB').sort((a, b) => b.y - a.y)[0];
    handoffTo = rb?.id ?? null;
  }
  return {
    drillId: drill.id,
    seed,
    duration,
    samples,
    snap,
    markers,
    tracks,
    byId: new Map(tracks.map((t) => [t.spec.id, t])),
    ball: {
      qbId: qb?.id ?? null,
      flight: shotgun ? 0.42 : 0.12,
      shotgun,
      handoffTo,
      handoffTime: handoffTo ? snap + (shotgun ? 0.95 : 1.1) : null,
    },
    postSnapKind: drill.postSnap,
  };
}

function decisionTime(drill: Drill, m: Markers, offset: number): number {
  const r = drill.recognition;
  const pre = m.snap - 0.35;
  switch (r.decisionPoint) {
    case 'motion-start':
      return m.firstMotion !== null ? Math.min(m.firstMotion + 0.6, pre) : Math.max(m.set + 0.8, pre - 0.6);
    case 'mid-motion':
      return m.firstMotion !== null && m.motionEnd !== null
        ? (m.firstMotion + m.motionEnd) / 2
        : Math.max(m.set + 0.8, pre - 0.6);
    case 'motion-end':
      return m.motionEnd !== null ? Math.min(m.motionEnd + 0.15, m.snap - 0.05) : Math.max(m.set + 0.8, pre - 0.4);
    case 'set':
      return Math.min(m.set + 0.6, pre);
    case 'snap':
      return m.snap;
    case 'custom':
      return clamp(offset + (r.decisionTime ?? m.snap - offset), 0, m.end);
  }
}

function approach(a: Point, b: Point): Point {
  // Slight curve: come out of the huddle then square up to the line.
  return { x: a.x + (b.x - a.x) * 0.55, y: b.y + Math.max(1.2, (a.y - b.y) * 0.35) };
}

/** Huddle positions ~7 yards behind the ball, linemen in front, QB facing them. */
export function huddleSpots(players: PlayerSpec[]): { p: Point; yaw: number }[] {
  const cx = 0;
  const cy = 8.5;
  const nonQb = players.filter((p) => p.role !== 'QB');
  const ordered = [...nonQb].sort((a, b) => rank(a) - rank(b) || a.x - b.x);
  const spots = new Map<string, { p: Point; yaw: number }>();
  ordered.forEach((p, i) => {
    const front = i < 5;
    const row = front ? i : i - 5;
    const count = front ? 5 : ordered.length - 5;
    const spread = front ? 3.6 : 3.2;
    const x = cx + (row - (count - 1) / 2) * (spread / Math.max(1, count - 1)) * 1.4;
    const y = cy - (front ? 0.2 : -0.9);
    // face the QB (who stands on the far side of the huddle)
    const qbP = { x: cx, y: cy + 2.3 };
    spots.set(p.id, { p: { x, y }, yaw: yawFromDir(qbP.x - x, qbP.y - y) });
  });
  return players.map((p) =>
    p.role === 'QB'
      ? { p: { x: cx, y: cy + 2.3 }, yaw: yawFromDir(0, -1) }
      : spots.get(p.id)!,
  );
}
const rank = (p: PlayerSpec) => (p.role === 'OL' ? 0 : p.role === 'TE' ? 1 : 2);

interface SegState {
  p: Point;
  vx: number;
  vy: number;
}

/** Position/velocity of a player at time t given its segments. */
function evalSegments(segs: Segment[], t: number, initial: Point): SegState {
  let p = initial;
  let vx = 0;
  let vy = 0;
  for (const s of segs) {
    if (t < s.start) break;
    const local = Math.min(t, s.end) - s.start;
    const dist = s.profile.s(local);
    const v = t >= s.end && !s.noStop ? 0 : s.profile.v(local);
    if (dist > s.curve.length && s.noStop) {
      const e = s.curve.at(s.curve.length);
      const extra = dist - s.curve.length;
      p = { x: e.x + e.tx * extra, y: e.y + e.ty * extra };
      vx = e.tx * v;
      vy = e.ty * v;
    } else {
      const e = s.curve.at(dist);
      p = { x: e.x, y: e.y };
      vx = e.tx * v;
      vy = e.ty * v;
    }
    if (t >= s.end && (s as Segment & { truncated?: boolean }).truncated) {
      // Frozen at the truncation point; velocity carried by the next segment.
      vx = vy = 0;
    }
  }
  return { p, vx, vy };
}

function sampleTrack(
  spec: PlayerSpec,
  index: number,
  segs: Segment[],
  initial: Point,
  initialYaw: number,
  n: number,
  huddle: boolean,
): PlayerTrack {
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const yaw = new Float32Array(n);
  const speed = new Float32Array(n);
  const accel = new Float32Array(n);
  const turn = new Float32Array(n);
  const phase = new Float32Array(n);
  const move = new Float32Array(n);
  const stance = new Float32Array(n);
  const moving = new Uint8Array(n);

  segs.sort((a, b) => a.start - b.start);
  let heading = initialYaw;
  let targetIdle = initialYaw;
  let ph = 0;
  let prevV = 0;
  const firstArrival = huddle ? (segs.find((s) => s.kind === 'align')?.end ?? 0) : -1;

  for (let i = 0; i < n; i++) {
    const t = i * DT;
    const st = evalSegments(segs, t, initial);
    x[i] = st.p.x;
    y[i] = st.p.y;
    const vYd = Math.hypot(st.vx, st.vy);
    const vM = vYd * YARD_M;
    speed[i] = vM;
    accel[i] = i > 0 ? (vM - prevV) / DT : 0;
    prevV = vM;
    moving[i] = vM > 0.12 ? 1 : 0;

    // Desired facing
    const active = activeSeg(segs, t);
    let desired = targetIdle;
    if (active && vYd > 0.25) {
      desired = active.holdFacing ?? yawFromDir(st.vx, st.vy);
    }
    const lastDone = lastFinished(segs, t);
    if (!active && lastDone && lastDone.endFacing !== undefined) targetIdle = lastDone.endFacing;
    else if (!active && lastDone && lastDone.holdFacing !== undefined) targetIdle = lastDone.holdFacing;
    if (!active) desired = targetIdle;

    const d = angleDiff(heading, desired);
    const maxRate = vM > 0.5 ? 7.5 : 4.2;
    const step = clamp(d * (1 - Math.exp(-12 * DT)), -maxRate * DT, maxRate * DT);
    heading += step;
    yaw[i] = heading;
    turn[i] = step / DT;

    ph += (vM * DT) / cycleLength(vM);
    phase[i] = ph;
  }

  // Acceleration and turn rate drive body lean; raw values step at the start
  // and end of every speed ramp, so smooth them with a centered window.
  smoothInPlace(accel, Math.round(0.15 * SAMPLE_HZ));
  smoothInPlace(turn, Math.round(0.12 * SAMPLE_HZ));

  // Non-causal smoothing from the distance (in samples) to the nearest moving
  // sample ahead / behind. Players rise out of their stance slightly BEFORE the
  // first step and settle back into it after stopping; every curve is continuous.
  const ahead = new Float32Array(n); // samples until the next moving sample
  const behind = new Float32Array(n); // samples since the last moving sample
  let k = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    k = moving[i] ? 0 : k + 1;
    ahead[i] = k;
  }
  k = Infinity;
  for (let i = 0; i < n; i++) {
    k = moving[i] ? 0 : k + 1;
    behind[i] = k;
  }
  const ease = (u: number) => {
    const c = clamp(u, 0, 1);
    return c * c * (3 - 2 * c);
  };
  const lead = 0.2 * SAMPLE_HZ;
  const lag = 0.3 * SAMPLE_HZ;
  const rise = 0.24 * SAMPLE_HZ;
  const settle = 0.6 * SAMPLE_HZ;
  for (let i = 0; i < n; i++) {
    move[i] = Math.max(ease(1 - ahead[i] / lead), ease(1 - behind[i] / lag));
    const t = i * DT;
    stance[i] = huddle && t < firstArrival + 0.3 ? 0 : Math.min(ease(ahead[i] / rise), ease(behind[i] / settle));
  }
  if (huddle) {
    // ease into the stance after arriving from the huddle
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      if (t >= firstArrival + 0.3) stance[i] = Math.min(stance[i], ease((t - firstArrival - 0.3) / 0.6));
    }
  }

  return { spec, index, x, y, yaw, speed, accel, turn, phase, move, stance, segments: segs };
}

/** Centered moving average (twice → triangular kernel) over ±r samples. */
function smoothInPlace(a: Float32Array, r: number) {
  const n = a.length;
  for (let pass = 0; pass < 2; pass++) {
    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + a[i];
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(n - 1, i + r);
      a[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
}

function activeSeg(segs: Segment[], t: number): Segment | null {
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (t >= s.start && (t < s.end || s.noStop)) return s;
  }
  return null;
}
function lastFinished(segs: Segment[], t: number): Segment | null {
  let best: Segment | null = null;
  for (const s of segs) if (s.end <= t && (!best || s.end >= best.end)) best = s;
  return best;
}

/** Sample index helpers (linear interpolation between fixed samples). */
export function sampleAt(tl: Timeline, t: number): { i: number; f: number } {
  const u = clamp(t, 0, tl.duration) * SAMPLE_HZ;
  const i = Math.min(tl.samples - 2, Math.floor(u));
  return { i, f: u - i };
}

export function lerpArr(a: Float32Array, i: number, f: number): number {
  return a[i] + (a[i + 1] - a[i]) * f;
}

export function lerpAngleArr(a: Float32Array, i: number, f: number): number {
  return a[i] + angleDiff(a[i], a[i + 1]) * f;
}

/** Time at which a track's cumulative gait phase reaches `ph` (binary search). */
export function timeAtPhase(track: PlayerTrack, ph: number): number {
  const p = track.phase;
  let lo = 0;
  let hi = p.length - 1;
  if (ph <= p[0]) return 0;
  if (ph >= p[hi]) return hi * DT;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid] < ph) lo = mid;
    else hi = mid;
  }
  const span = p[hi] - p[lo];
  return (lo + (span > 0 ? (ph - p[lo]) / span : 0)) * DT;
}

/** Player ground position (yards) at time t. */
export function playerPosAt(track: PlayerTrack, t: number, tl: Timeline): Point {
  const { i, f } = sampleAt(tl, t);
  return { x: lerpArr(track.x, i, f), y: lerpArr(track.y, i, f) };
}

// ---------------------------------------------------------------------------
// Default post-snap actions — only the first couple of seconds that matter for
// first-step reads. Explicit post-snap movements in a drill override these.
// ---------------------------------------------------------------------------
function defaultPostSnap(drill: Drill, p: PlayerSpec, st: SegState): Movement | null {
  const kind = drill.postSnap;
  const { x, y } = st.p;
  const runDir = kind === 'run-left' ? -1 : kind === 'run-right' ? 1 : 0;
  const mk = (path: Point[], speed: number, extra: Partial<Movement> = {}): Movement => ({
    id: `auto-${p.id}`,
    playerId: p.id,
    kind: 'postsnap',
    start: 0,
    anchor: 'snap',
    path,
    speed,
    curve: 'smooth',
    noStop: false,
    ...extra,
  });
  const moving = Math.hypot(st.vx, st.vy) > 1;
  if (moving) {
    // Still in motion at the snap (jet / orbit): continue through.
    const len = Math.hypot(st.vx, st.vy);
    const dx = st.vx / len;
    const dy = st.vy / len;
    if (kind === 'pass') {
      return mk([{ x: x + dx * 5, y: y + dy * 5 - 0.5 }, { x: x + dx * 8, y: y - 3 }], Math.max(6.5, len), { noStop: true });
    }
    return mk([{ x: x + dx * 6, y: y + dy * 6 }, { x: x + dx * 10, y: y - 2 }], Math.max(7, len), { noStop: true });
  }
  switch (p.role) {
    case 'OL': {
      if (runDir === 0) {
        const kick = Math.sign(p.x) * (Math.abs(p.x) > 2 ? 0.9 : 0.2);
        return mk([{ x: x + kick, y: y + 1.3 }], 2.6, { holdFacing: 0, curve: 'straight' });
      }
      return mk([{ x: x + runDir * 1.4, y: y - 0.9 }], 3.2, { holdFacing: runDir * 25, curve: 'straight' });
    }
    case 'TE': {
      if (runDir === 0) return mk([{ x: x + Math.sign(p.x) * 1, y: y - 3 }, { x: x + Math.sign(p.x) * 1.5, y: y - 9 }], 6.2);
      return mk([{ x: x + runDir * 1.2, y: y - 1.1 }], 3.4, { holdFacing: runDir * 25, curve: 'straight' });
    }
    case 'WR': {
      if (runDir === 0) return mk([{ x: x, y: y - 4 }, { x: x - Math.sign(p.x) * 0.5, y: y - 14 }], 7.8);
      return mk([{ x, y: y - 3.5 }, { x, y: y - 5 }], 5.2, { endFacing: 0 });
    }
    case 'QB': {
      if (runDir === 0) {
        if (y > 2.5) return mk([{ x, y: y + 2.4 }], 3.4, { holdFacing: 0, curve: 'straight' });
        return mk([{ x: x + 0.4, y: y + 2 }, { x: x + 0.3, y: y + 6 }], 5, { holdFacing: -55 });
      }
      if (y > 2.5) return mk([{ x: x - runDir * 0.7, y: y + 0.4 }], 2, { holdFacing: runDir * 40, curve: 'straight' });
      return mk([{ x: x + runDir * 0.8, y: y + 2.2 }], 3.6, { holdFacing: runDir * 120 });
    }
    case 'RB':
    case 'FB': {
      if (runDir === 0) {
        // Pass protection: step up into the B-gap
        return mk([{ x: x + (x === 0 ? 1 : -Math.sign(x)) * 1.1, y: y - 1.2 }], 3, { holdFacing: 0, curve: 'straight' });
      }
      if (p.role === 'FB') return mk([{ x: x + runDir * 2.5, y: y - 3 }], 6);
      // Mesh, then press the hole.
      return mk([{ x: x + runDir * 1.6, y: y - 1.6 }, { x: x + runDir * 3.5, y: y - 5 }, { x: x + runDir * 4.2, y: y - 9 }], 7);
    }
  }
  return null;
}

/**
 * Defensive teammates (everyone but the athlete). They hold their alignment;
 * after the snap the front gets off the ball and the secondary bails slightly.
 * Facing 180° = toward the offense.
 */
export function compileDefenseTracks(drill: Drill, tl: Timeline): PlayerTrack[] {
  return drill.defense.defenders.map((d, index) => {
    const spec: PlayerSpec = {
      id: d.id,
      role: 'OL',
      label: d.label,
      number: 0,
      x: d.x,
      y: -d.depth,
      onLine: d.depth < 1.5,
      stance: 'two-point',
      facing: 180,
    };
    const start: Point = { x: d.x, y: -d.depth };
    const segs: Segment[] = [];
    const add = (path: Point[], speed: number, delay: number, holdFacing?: number) => {
      const curve = new PathCurve([start, ...path], false);
      const { a, d: dec } = accelFor(speed);
      const profile = new SpeedProfile(curve.length, 0, speed, 0, a, dec);
      const s0 = tl.snap + delay;
      segs.push({ playerId: d.id, kind: 'postsnap', start: s0, curve, profile, end: s0 + profile.duration, holdFacing, endFacing: Math.PI, noStop: false });
    };
    if (drill.postSnap !== 'none') {
      if (d.stance === 'three-point') add([{ x: d.x, y: -d.depth + 1.1 }], 3.5, 0.12);
      else if (d.stance === 'db') add([{ x: d.x, y: -d.depth - 1.2 }], 2.2, 0.25, Math.PI);
    }
    return sampleTrack(spec, index, segs, start, Math.PI, tl.samples, false);
  });
}
