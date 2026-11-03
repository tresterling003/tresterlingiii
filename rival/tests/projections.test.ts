import { describe, expect, it } from "vitest";
import { DEFAULT_PRIOR, leaguePrior, normalCdf, pace, projectTeam, remainingDays, winProbability } from "@/lib/projections";
import type { DayScore, Scoring } from "@/lib/types";

const rules = { consistency: { days: 5, points: 10 } } as Scoring;
const day = (d: string, total: number, active = total > 0): DayScore =>
  ({ day: d, total, is_active: active } as DayScore);

describe("projections", () => {
  it("normal CDF is accurate", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("counts remaining days with today as half", () => {
    expect(remainingDays("2026-11-02", "2026-11-02")).toBe(6.5);
    expect(remainingDays("2026-11-08", "2026-11-02")).toBe(0.5);
    expect(remainingDays("2026-11-09", "2026-11-02")).toBe(0);
    expect(remainingDays("2026-11-01", "2026-11-02")).toBe(7);
  });

  it("uses only completed days before today for pace", () => {
    const p = pace([day("2026-11-02", 10), day("2026-11-03", 20), day("2026-11-04", 99)], "2026-11-04", DEFAULT_PRIOR, 0);
    expect(p.samples).toBe(2);
    expect(p.rate).toBe(15);
  });

  it("starts at the prior with no data and moves toward observed days", () => {
    expect(pace([], "2026-11-02").rate).toBe(DEFAULT_PRIOR.rate);
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(10 + i).padStart(2, "0")}`, 40));
    const p = pace(days, "2026-11-01");
    expect(p.rate).toBeGreaterThan(35);   // (400 + 60) / 13 ≈ 35.4
    expect(p.rate).toBeLessThan(40);
  });

  it("league prior falls back to default with little data and is bounded", () => {
    expect(leaguePrior([], "2026-11-02")).toEqual(DEFAULT_PRIOR);
    const lots = Array.from({ length: 28 }, (_, i) => day(`2026-10-${String(1 + i).padStart(2, "0")}`, 50));
    const pr = leaguePrior(lots, "2026-11-01");
    expect(pr.rate).toBe(50);
    expect(pr.sd).toBeGreaterThanOrEqual(6);
  });

  it("day-one odds favour whoever is ahead, but not decisively", () => {
    const p = pace([], "2026-11-02");
    const w = winProbability({ homeProjected: 17 + p.rate * 6.5, awayProjected: 8 + p.rate * 6.5, homePace: p, awayPace: p, daysLeft: 6.5 });
    expect(w).toBeGreaterThan(0.5);
    expect(w).toBeLessThan(0.8);
  });

  it("projects current + pace and adds a reachable consistency bonus", () => {
    const p = { rate: 10, sd: 2, activeRate: 1, samples: 5 };
    expect(projectTeam({ current: 30, activeDays: 3, bonusEarned: 0, pace: p, daysLeft: 3, scoring: rules })).toBe(70);
    expect(projectTeam({ current: 30, activeDays: 3, bonusEarned: 10, pace: p, daysLeft: 3, scoring: rules })).toBe(60);
  });

  it("win probability is symmetric, bounded, and decided at zero days left", () => {
    const p = { rate: 10, sd: 5, activeRate: 1, samples: 5 };
    const even = winProbability({ homeProjected: 50, awayProjected: 50, homePace: p, awayPace: p, daysLeft: 3 });
    expect(even).toBeCloseTo(0.5, 5);
    const ahead = winProbability({ homeProjected: 80, awayProjected: 50, homePace: p, awayPace: p, daysLeft: 3 });
    const behind = winProbability({ homeProjected: 50, awayProjected: 80, homePace: p, awayPace: p, daysLeft: 3 });
    expect(ahead + behind).toBeCloseTo(1, 5);
    expect(ahead).toBeLessThanOrEqual(0.99);
    expect(winProbability({ homeProjected: 51, awayProjected: 50, homePace: p, awayPace: p, daysLeft: 0 })).toBe(1);
    expect(winProbability({ homeProjected: 50, awayProjected: 50, homePace: p, awayPace: p, daysLeft: 0 })).toBe(0.5);
  });
});
