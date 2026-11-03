import { describe, expect, it } from "vitest";
import { normalCdf, pace, projectTeam, remainingDays, winProbability } from "@/lib/projections";
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
    const p = pace([day("2026-11-02", 10), day("2026-11-03", 20), day("2026-11-04", 99)], "2026-11-04");
    expect(p.samples).toBe(2);
    expect(p.rate).toBe(15);
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
