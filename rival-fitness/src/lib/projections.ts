import type { DayScore, Scoring } from "./types";

/**
 * Presentation-only projections. These never affect results — final scores
 * are computed in the database from stored workouts.
 */

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export type Pace = { rate: number; sd: number; activeRate: number; samples: number };
export type Prior = { rate: number; sd: number; activeRate: number };

export const DEFAULT_PRIOR: Prior = { rate: 20, sd: 10, activeRate: 0.6 };

/**
 * Daily scoring pace from completed days (most recent 14), shrunk toward a
 * prior worth `k` pseudo-days. With no data the pace equals the prior; as
 * real days accumulate they dominate. This lets odds appear from day one
 * without overreacting to a single big (or empty) day.
 */
export function pace(history: DayScore[], beforeDay: string, prior: Prior = DEFAULT_PRIOR, k = 3): Pace {
  const past = history.filter((d) => d.day < beforeDay).slice(-14);
  const n = past.length;
  const totals = past.map((d) => d.total);
  const sum = totals.reduce((a, b) => a + b, 0);
  const rate = (sum + prior.rate * k) / (n + k);
  const sq = totals.reduce((a, b) => a + (b - rate) ** 2, 0);
  const sd = Math.sqrt((sq + k * prior.sd ** 2) / (n + k));
  const activeRate = (past.filter((d) => d.is_active).length + prior.activeRate * k) / (n + k);
  return { rate, sd, activeRate, samples: n };
}

/** League-wide prior from every member's in-season days so far. */
export function leaguePrior(allDays: DayScore[], beforeDay: string): Prior {
  const past = allDays.filter((d) => d.day < beforeDay);
  if (past.length < 3) return DEFAULT_PRIOR;
  const mean = past.reduce((a, d) => a + d.total, 0) / past.length;
  const sd = Math.sqrt(past.reduce((a, d) => a + (d.total - mean) ** 2, 0) / Math.max(1, past.length - 1));
  // Blend with the default so a tiny sample can't set an extreme prior.
  const w = Math.min(1, past.length / 14);
  return {
    rate: w * mean + (1 - w) * DEFAULT_PRIOR.rate,
    sd: Math.max(6, w * sd + (1 - w) * DEFAULT_PRIOR.sd),
    activeRate: w * (past.filter((d) => d.is_active).length / past.length) + (1 - w) * DEFAULT_PRIOR.activeRate,
  };
}

export const MIN_SAMPLES = 3;

/**
 * Days of scoring left in a week, counting the rest of today as half a day.
 * `today` and `weekStart` are YYYY-MM-DD in the league's time zone.
 */
export function remainingDays(today: string, weekStart: string): number {
  const d = (Date.parse(today) - Date.parse(weekStart)) / 86_400_000;
  if (d < 0) return 7;
  if (d > 6) return 0;
  return 6 - d + 0.5;
}

export function projectTeam(opts: {
  current: number;
  activeDays: number;
  bonusEarned: number;
  pace: Pace;
  daysLeft: number;
  scoring: Scoring;
}) {
  const { current, activeDays, bonusEarned, pace: p, daysLeft, scoring } = opts;
  let projected = current + p.rate * daysLeft;
  if (bonusEarned === 0) {
    const expectedActive = activeDays + p.activeRate * daysLeft;
    if (expectedActive >= scoring.consistency.days) projected += scoring.consistency.points;
  }
  return Math.round(projected * 10) / 10;
}

/** P(home finishes ahead), treating each remaining day as an independent draw. */
export function winProbability(opts: {
  homeProjected: number;
  awayProjected: number;
  homePace: Pace;
  awayPace: Pace;
  daysLeft: number;
}): number {
  const { homeProjected, awayProjected, homePace, awayPace, daysLeft } = opts;
  const diff = homeProjected - awayProjected;
  if (daysLeft <= 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  // Floor the spread so a couple of identical days don't produce false certainty.
  const sd = Math.sqrt(daysLeft * (Math.max(homePace.sd, 4) ** 2 + Math.max(awayPace.sd, 4) ** 2));
  const p = normalCdf(diff / sd);
  return Math.min(0.99, Math.max(0.01, p));
}
