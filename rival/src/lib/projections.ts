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

/** Daily scoring pace from completed days (most recent 14). */
export function pace(history: DayScore[], beforeDay: string): Pace {
  const past = history.filter((d) => d.day < beforeDay).slice(-14);
  if (past.length === 0) return { rate: 0, sd: 0, activeRate: 0, samples: 0 };
  const totals = past.map((d) => d.total);
  const rate = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance = totals.reduce((a, b) => a + (b - rate) ** 2, 0) / Math.max(1, totals.length - 1);
  const activeRate = past.filter((d) => d.is_active).length / past.length;
  return { rate, sd: Math.sqrt(variance), activeRate, samples: past.length };
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
