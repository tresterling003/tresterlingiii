import "server-only";
import { withUser, type Tx } from "./db";
import { AppError } from "./errors";
import { addDays, diffDays, minDate } from "./dates";
import { MIN_SAMPLES, pace, projectTeam, remainingDays, winProbability } from "./projections";
import type {
  DayScore, FeedItem, HistoryRow, LeagueSnapshot, Matchup, MatchupView, Member, Scoring,
  Standing, WeekStatus, WeekTotal,
} from "./types";

type LeagueRow = {
  id: string; name: string; code: string; status: LeagueSnapshot["league"]["status"]; season: number;
  season_start: string | null; season_weeks: number; playoff_teams: number; max_members: number;
  timezone: string; scoring: Scoring; commissioner_id: string; version: number;
};

type MatchupRow = {
  id: string; week: number; week_start: string; kind: Matchup["kind"]; round: number | null;
  home_id: string; away_id: string | null; home_seed: number | null; away_seed: number | null;
  home_score: number | null; away_score: number | null; winner_id: string | null; is_tie: boolean;
  finalized_at: string | null;
};

function toMatchup(r: MatchupRow): Matchup {
  return {
    id: r.id, week: r.week, weekStart: r.week_start, kind: r.kind, round: r.round,
    homeId: r.home_id, awayId: r.away_id, homeSeed: r.home_seed, awaySeed: r.away_seed,
    homeScore: r.home_score ?? 0, awayScore: r.away_id ? r.away_score ?? 0 : null,
    winnerId: r.winner_id, isTie: r.is_tie, final: r.finalized_at !== null,
  };
}

function weekStatus(start: string, today: string, finalized: boolean): WeekStatus {
  if (finalized) return "final";
  if (today < start) return "upcoming";
  if (diffDays(today, start) <= 6) return "live";
  return "pending";
}

function weekLabel(kind: Matchup["kind"] | undefined, week: number, round: number | null, seasonWeeks: number) {
  if (week <= seasonWeeks) return `Week ${week}`;
  if (kind === "championship") return "Championship";
  return round ? `Playoffs · Round ${round}` : "Playoffs";
}

async function loadLeague(tx: Tx, id: string) {
  return tx.one<LeagueRow>(
    `select id, name, code, status, season, season_start::text, season_weeks, playoff_teams, max_members,
            timezone, scoring, commissioner_id, version from leagues where id = $1`,
    [id],
  );
}

export async function getLeagueVersion(uid: string, leagueId: string): Promise<number | null> {
  return withUser(uid, async (tx) => {
    const r = await tx.one<{ version: number }>("select version from leagues where id = $1", [leagueId]);
    return r ? Number(r.version) : null;
  });
}

export async function buildSnapshot(uid: string, leagueId: string, requestedWeek?: number): Promise<LeagueSnapshot> {
  if (!/^[0-9a-f-]{36}$/i.test(leagueId)) throw new AppError("not_found", "League not found.", 404);
  return withUser(uid, async (tx) => {
    // RLS returns nothing for non-members.
    if (!(await loadLeague(tx, leagueId))) throw new AppError("not_found", "League not found.", 404);
    // Roll weeks/playoffs forward if a boundary has passed (idempotent).
    await tx.query("select rival_advance_league($1)", [leagueId]);
    const l = (await loadLeague(tx, leagueId))!;
    const { today } = (await tx.one<{ today: string }>("select rival_league_today($1)::text as today", [leagueId]))!;

    const members = (
      await tx.query<{
        user_id: string; role: Member["role"]; active: boolean; joined_at: string;
        display_name: string; team_name: string; team_abbr: string; team_color: string;
      }>(
        `select m.user_id, m.role, m.active, m.joined_at, u.display_name, u.team_name, u.team_abbr, u.team_color
         from league_members m join users u on u.id = m.user_id
         where m.league_id = $1 order by m.joined_at`,
        [leagueId],
      )
    ).map<Member>((m) => ({
      id: m.user_id, displayName: m.display_name, teamName: m.team_name, teamAbbr: m.team_abbr,
      teamColor: m.team_color, role: m.role, active: m.active, joinedAt: m.joined_at,
    }));

    const schedule = (
      await tx.query<MatchupRow>(
        `select id, week, week_start::text, kind, round, home_id, away_id, home_seed, away_seed,
                home_score, away_score, winner_id, is_tie, finalized_at
         from matchups where league_id = $1 and season = $2 order by week, home_seed nulls last, created_at`,
        [leagueId, l.season],
      )
    ).map(toMatchup);

    const totalWeeks = Math.max(l.season_weeks, ...schedule.map((m) => m.week), 0);
    const currentWeek = l.season_start
      ? Math.max(1, Math.min(totalWeeks + (l.status === "playoffs" ? 1 : 0), Math.floor(diffDays(today, l.season_start) / 7) + 1))
      : null;

    let week: LeagueSnapshot["week"] = null;
    let matchups: MatchupView[] = [];
    const totals: Record<string, WeekTotal> = {};
    const days: Record<string, DayScore[]> = {};

    if (l.season_start && currentWeek) {
      let n = requestedWeek ?? currentWeek;
      if (l.status === "complete" && requestedWeek === undefined) n = totalWeeks;
      n = Math.max(1, Math.min(n, Math.max(totalWeeks, currentWeek)));
      const start = addDays(l.season_start, 7 * (n - 1));
      const end = addDays(start, 6);
      const weekRows = schedule.filter((m) => m.week === n);
      const allFinal = weekRows.length > 0 && weekRows.every((m) => m.final);
      const status = weekStatus(start, today, allFinal);
      week = {
        number: n, start, end, status,
        label: weekLabel(weekRows[0]?.kind, n, weekRows[0]?.round ?? null, l.season_weeks),
        daysLeft: status === "live" ? remainingDays(today, start) : status === "upcoming" ? 7 : 0,
      };

      if (start <= today) {
        for (const t of await tx.query<{ user_id: string; points: number; active_days: number; bonus: number }>(
          "select * from league_week_totals($1, $2)", [leagueId, start],
        )) {
          totals[t.user_id] = { points: t.points, activeDays: t.active_days, bonus: t.bonus };
        }
        // This week plus the prior week (for pace-based projections).
        const from = addDays(start, -7);
        for (const d of await tx.query<DayScore>(
          "select * from league_day_scores($1, $2, $3) order by day",
          [leagueId, from, minDate(end, today)],
        )) {
          (days[d.user_id] ??= []).push(d);
        }
      }

      matchups = weekRows.map((m) => {
        const view: MatchupView = { ...m, status, winProbHome: null, projectedHome: null, projectedAway: null };
        if (!m.final) {
          view.homeScore = totals[m.homeId]?.points ?? 0;
          view.awayScore = m.awayId ? totals[m.awayId]?.points ?? 0 : null;
        }
        if (status === "live" && m.awayId) {
          // Only days since the season began count as evidence for a projection.
          const inSeason = (xs: DayScore[] = []) => xs.filter((d) => d.day >= l.season_start!);
          const hp = pace(inSeason(days[m.homeId]), today);
          const ap = pace(inSeason(days[m.awayId]), today);
          const enough = hp.samples >= MIN_SAMPLES && ap.samples >= MIN_SAMPLES;
          const ht = totals[m.homeId] ?? { points: 0, activeDays: 0, bonus: 0 };
          const at = totals[m.awayId] ?? { points: 0, activeDays: 0, bonus: 0 };
          const daysLeft = week!.daysLeft;
          if (enough) {
            view.projectedHome = projectTeam({ current: ht.points, activeDays: ht.activeDays, bonusEarned: ht.bonus, pace: hp, daysLeft, scoring: l.scoring });
            view.projectedAway = projectTeam({ current: at.points, activeDays: at.activeDays, bonusEarned: at.bonus, pace: ap, daysLeft, scoring: l.scoring });
            view.winProbHome = winProbability({
              homeProjected: view.projectedHome, awayProjected: view.projectedAway,
              homePace: hp, awayPace: ap, daysLeft,
            });
          }
        }
        return view;
      });
    }

    const standings = (
      await tx.query<{
        user_id: string; wins: number; losses: number; ties: number; points_for: number;
        points_against: number; games: number; rank: number;
      }>("select * from league_standings($1) order by rank", [leagueId])
    ).map<Standing>((s) => ({
      userId: s.user_id, wins: s.wins, losses: s.losses, ties: s.ties, pointsFor: s.points_for,
      pointsAgainst: s.points_against, games: s.games, rank: s.rank,
    }));

    const history = (
      await tx.query<{
        season: number; champion_id: string | null; champion_team: string | null; runner_up_id: string | null;
        runner_up_team: string | null; champion_score: number | null; runner_up_score: number | null; completed_at: string;
      }>("select * from season_history where league_id = $1 order by season desc", [leagueId])
    ).map<HistoryRow>((h) => ({
      season: h.season, championId: h.champion_id, championTeam: h.champion_team, runnerUpId: h.runner_up_id,
      runnerUpTeam: h.runner_up_team, championScore: h.champion_score, runnerUpScore: h.runner_up_score,
      completedAt: h.completed_at,
    }));

    const feed = (
      await tx.query<{
        id: string; user_id: string; label: string; category: FeedItem["category"];
        activity_date: string; duration_min: number | null; created_at: string;
      }>("select * from league_feed($1, 15)", [leagueId])
    ).map<FeedItem>((f) => ({
      id: f.id, userId: f.user_id, label: f.label, category: f.category, activityDate: f.activity_date,
      durationMin: f.duration_min, createdAt: f.created_at,
    }));

    return {
      me: uid,
      league: {
        id: l.id, name: l.name, code: l.code, status: l.status, season: l.season, seasonStart: l.season_start,
        seasonWeeks: l.season_weeks, playoffTeams: l.playoff_teams, maxMembers: l.max_members, timezone: l.timezone,
        scoring: l.scoring, commissionerId: l.commissioner_id, version: Number(l.version), today, currentWeek, totalWeeks,
      },
      members, week, matchups, totals, days, standings, schedule, history, feed,
    };
  });
}
