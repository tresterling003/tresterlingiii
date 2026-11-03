import { addDays } from "./dates";
import type { DayScore, LeagueSnapshot, Member, MatchupView } from "./types";

export function memberMap(s: LeagueSnapshot) {
  return new Map<string, Member>(s.members.map((m) => [m.id, m]));
}

export function recordOf(s: LeagueSnapshot, uid: string) {
  const r = s.standings.find((x) => x.userId === uid);
  if (!r) return "0-0";
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

export function myMatchup(s: LeagueSnapshot): MatchupView | undefined {
  return s.matchups.find((m) => m.homeId === s.me || m.awayId === s.me);
}

/** Returns [me-or-home side, other side] for display. */
export function orient(m: MatchupView, me: string) {
  const flip = m.awayId === me;
  return {
    leftId: flip ? m.awayId! : m.homeId,
    rightId: flip ? m.homeId : m.awayId,
    leftScore: flip ? m.awayScore ?? 0 : m.homeScore,
    rightScore: flip ? m.homeScore : m.awayScore,
    leftProj: flip ? m.projectedAway : m.projectedHome,
    rightProj: flip ? m.projectedHome : m.projectedAway,
    leftWin: m.winProbHome === null ? null : flip ? 1 - m.winProbHome : m.winProbHome,
    leftSeed: flip ? m.awaySeed : m.homeSeed,
    rightSeed: flip ? m.homeSeed : m.awaySeed,
  };
}

export function weekDays(s: LeagueSnapshot, uid: string): DayScore[] {
  if (!s.week) return [];
  const end = addDays(s.week.start, 6);
  return (s.days[uid] ?? []).filter((d) => d.day >= s.week!.start && d.day <= end);
}

export function categorySums(days: DayScore[]) {
  const sum = (k: keyof DayScore) => Math.round(days.reduce((a, d) => a + (d[k] as number), 0) * 10) / 10;
  const raw = sum("raw_total");
  const capped = sum("total");
  return {
    steps: sum("steps_pts"), cardio: sum("cardio_pts"), strength: sum("strength_pts"), mobility: sum("mobility_pts"),
    plan: sum("plan_pts"), goal: sum("goal_pts"), capAdjust: Math.round((capped - raw) * 10) / 10,
  };
}
