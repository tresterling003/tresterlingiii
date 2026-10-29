import type { Point } from '../data/schema';

/** An arc-length parameterized polyline in yards. */
export class PathCurve {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  readonly cum: number[] = [];
  readonly length: number;

  constructor(points: Point[], smooth: boolean) {
    const pts = dedupe(points);
    const dense = smooth && pts.length > 2 ? catmullRom(pts, 14) : pts;
    let acc = 0;
    for (let i = 0; i < dense.length; i++) {
      if (i > 0) acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
      this.xs.push(dense[i].x);
      this.ys.push(dense[i].y);
      this.cum.push(acc);
    }
    this.length = acc;
  }

  /** Point and unit tangent at arc length s (clamped). */
  at(s: number): { x: number; y: number; tx: number; ty: number } {
    const n = this.xs.length;
    if (n === 1 || this.length <= 1e-9) return { x: this.xs[0], y: this.ys[0], tx: 0, ty: -1 };
    if (s <= 0) return this.seg(0, 0);
    if (s >= this.length) return this.seg(n - 2, 1);
    // binary search segment
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const segLen = this.cum[lo + 1] - this.cum[lo];
    return this.seg(lo, segLen > 0 ? (s - this.cum[lo]) / segLen : 0);
  }

  private seg(i: number, u: number) {
    const x0 = this.xs[i];
    const y0 = this.ys[i];
    const x1 = this.xs[i + 1];
    const y1 = this.ys[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, tx: (x1 - x0) / len, ty: (y1 - y0) / len };
  }

  end(): Point {
    return { x: this.xs[this.xs.length - 1], y: this.ys[this.ys.length - 1] };
  }
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-4) out.push({ x: p.x, y: p.y });
  }
  return out.length ? out : [points[0]];
}

/** Centripetal Catmull-Rom through all points (passes through each waypoint). */
function catmullRom(pts: Point[], perSpan: number): Point[] {
  const out: Point[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const t0 = 0;
    const t1 = t0 + Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1e-3, 0.5);
    const t2 = t1 + Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1e-3, 0.5);
    const t3 = t2 + Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y) || 1e-3, 0.5);
    for (let k = 0; k < perSpan; k++) {
      const t = t1 + ((t2 - t1) * k) / perSpan;
      const A1 = mix(p0, p1, t0, t1, t);
      const A2 = mix(p1, p2, t1, t2, t);
      const A3 = mix(p2, p3, t2, t3, t);
      const B1 = mix(A1, A2, t0, t2, t);
      const B2 = mix(A2, A3, t1, t3, t);
      out.push(mix(B1, B2, t1, t2, t));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function mix(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const d = tb - ta || 1e-6;
  const u = (t - ta) / d;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * Trapezoidal speed profile over a fixed distance (yards, seconds).
 * Starts at v0, cruises at vc, ends at vf. Analytic so any time can be
 * evaluated directly (needed for deterministic scrubbing).
 */
export class SpeedProfile {
  readonly duration: number;
  private readonly t1: number;
  private readonly t2: number;
  private readonly s1: number;
  private readonly s2: number;
  private readonly vp: number;
  private readonly a1: number;
  private readonly a3: number;

  constructor(
    readonly length: number,
    readonly v0: number,
    vc: number,
    readonly vf: number,
    accel: number,
    decel: number,
  ) {
    if (length <= 1e-6) {
      this.duration = 0;
      this.t1 = this.t2 = this.s1 = this.s2 = 0;
      this.vp = v0;
      this.a1 = this.a3 = 0;
      return;
    }
    let vp = vc;
    let a1 = vp >= v0 ? accel : -decel;
    let s1 = (vp * vp - v0 * v0) / (2 * a1);
    let s3 = (vp * vp - vf * vf) / (2 * decel);
    if (s1 + s3 > length) {
      // Not enough room to reach cruise speed: find the peak speed.
      if (v0 <= vc) {
        const vp2 = (2 * length + (v0 * v0) / accel + (vf * vf) / decel) / (1 / accel + 1 / decel);
        vp = Math.sqrt(Math.max(vp2, 0));
      }
      if (vp < Math.max(v0, vf) || v0 > vc) {
        // Decelerate the whole way (e.g. arriving fast into a short path).
        vp = v0;
        a1 = 0;
        s1 = 0;
      } else {
        a1 = accel;
        s1 = (vp * vp - v0 * v0) / (2 * a1);
      }
      s3 = length - s1;
    }
    const a3 = s3 > 1e-9 ? (vf * vf - vp * vp) / (2 * s3) : 0; // negative (decel)
    const t1 = a1 !== 0 ? (vp - v0) / a1 : 0;
    const s2 = Math.max(0, length - s1 - s3);
    const t2 = vp > 1e-6 ? s2 / vp : 0;
    const t3 = a3 !== 0 ? (vf - vp) / a3 : vp > 0 ? s3 / vp : 0;
    this.vp = vp;
    this.a1 = a1;
    this.a3 = a3;
    this.s1 = s1;
    this.s2 = s1 + s2;
    this.t1 = t1;
    this.t2 = t1 + t2;
    this.duration = t1 + t2 + t3;
  }

  /** Distance travelled after t seconds (clamped to length; continues at vf if vf > 0). */
  s(t: number): number {
    if (t <= 0) return 0;
    if (t < this.t1) return this.v0 * t + 0.5 * this.a1 * t * t;
    if (t < this.t2) return this.s1 + this.vp * (t - this.t1);
    if (t < this.duration) {
      const u = t - this.t2;
      return this.s2 + this.vp * u + 0.5 * this.a3 * u * u;
    }
    return this.length + this.vf * (t - this.duration);
  }

  v(t: number): number {
    if (t <= 0) return this.v0;
    if (t < this.t1) return this.v0 + this.a1 * t;
    if (t < this.t2) return this.vp;
    if (t < this.duration) return this.vp + this.a3 * (t - this.t2);
    return this.vf;
  }
}
