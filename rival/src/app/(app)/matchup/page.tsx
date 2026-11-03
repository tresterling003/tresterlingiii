"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Swords } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { MatchupRow, Scoreboard } from "@/components/scoreboard";
import { CategoryComparison, DayBars } from "@/components/breakdown";
import { IconButton } from "@/components/ui/button";
import { rivalColor } from "@/components/team-avatar";
import { TrashTalk } from "@/components/trash-talk";
import { EmptyState, SectionHeader } from "@/components/ui/states";
import { useLeague } from "@/lib/hooks";
import { fmtPts } from "@/lib/client";
import { rangeLabel } from "@/lib/dates";
import { categorySums, memberMap, myMatchup, orient, weekDays } from "@/lib/snapshot";
import type { LeagueSnapshot, MatchupView } from "@/lib/types";

function Opportunities({ s, m }: { s: LeagueSnapshot; m: MatchupView }) {
  if (m.status !== "live" || !s.week) return null;
  const o = orient(m, s.me);
  const members = memberMap(s);
  const rules = s.league.scoring;
  const daysLeft = Math.ceil(s.week.daysLeft);
  const sides = [o.leftId, o.rightId].filter(Boolean) as string[];
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Still in play" />
      <ul className="flex flex-col gap-4">
        {sides.map((id) => {
          const t = s.totals[id] ?? { points: 0, activeDays: 0, bonus: 0 };
          const need = Math.max(0, rules.consistency.days - t.activeDays);
          const mem = members.get(id)!;
          const reachable = need <= daysLeft;
          return (
            <li key={id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: id === s.me ? "#C8FF3D" : rivalColor(mem.teamColor) }} />
              <p className="text-fg-muted">
                <span className="font-semibold text-fg">{id === s.me ? "You" : mem.teamName}</span>{" "}
                {t.bonus > 0
                  ? `locked in the +${rules.consistency.points} consistency bonus.`
                  : reachable
                    ? `need ${need} more active day${need === 1 ? "" : "s"} for +${rules.consistency.points}.`
                    : `can't reach the consistency bonus this week.`}
              </p>
            </li>
          );
        })}
        <li className="flex items-start gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" />
          <p className="text-fg-muted">
            {daysLeft} day{daysLeft === 1 ? "" : "s"} left · up to <span className="tnum font-semibold text-fg">{rules.daily_cap}</span> pts per day, plus +{rules.daily_goal} for hitting your daily goal and +{rules.planned_workout} for completing a planned workout.
          </p>
        </li>
      </ul>
    </section>
  );
}

function MatchupDetail({ s, m }: { s: LeagueSnapshot; m: MatchupView }) {
  const o = orient(m, s.me);
  const members = memberMap(s);
  const leftDays = weekDays(s, o.leftId);
  const rightDays = o.rightId ? weekDays(s, o.rightId) : null;
  const left = members.get(o.leftId)!;
  const right = o.rightId ? members.get(o.rightId) : null;
  const started = s.week && s.week.start <= s.league.today;
  const leftColor = o.leftId === s.me ? "#C8FF3D" : left.teamColor;
  const rightColor = rivalColor(right?.teamColor);
  return (
    <div className="flex flex-col gap-6">
      <Scoreboard s={s} m={m} />
      {started ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="panel p-4 sm:p-6">
            <SectionHeader title="Scoring breakdown" />
            <CategoryComparison
              left={categorySums(leftDays)} right={rightDays ? categorySums(rightDays) : null}
              leftBonus={s.totals[o.leftId]?.bonus ?? 0} rightBonus={o.rightId ? s.totals[o.rightId]?.bonus ?? 0 : 0}
              leftLabel={left.teamAbbr} rightLabel={right?.teamAbbr ?? ""} scoring={s.league.scoring}
              leftColor={leftColor} rightColor={rightColor} />
            {m.final && (
              <p className="mt-4 text-xs text-fg-faint">
                Final scores were locked at {fmtPts(m.homeScore)}–{fmtPts(m.awayScore)}. The breakdown reflects current records.
              </p>
            )}
          </section>
          <div className="flex flex-col gap-6">
            <section className="panel p-4 sm:p-6">
              <SectionHeader title="By day" />
              <DayBars start={s.week!.start} today={s.league.today} left={leftDays} right={rightDays}
                leftLabel={left.teamName} rightLabel={right?.teamName} leftColor={leftColor} rightColor={rightColor} />
            </section>
            <Opportunities s={s} m={m} />
          </div>
        </div>
      ) : (
        <EmptyState className="panel" icon={<Swords className="h-5 w-5" />} title="Kicks off Monday"
          body={`This matchup runs ${s.week && rangeLabel(s.week.start, s.week.end)}. Scores start at 0.0 for both teams.`} />
      )}
    </div>
  );
}

function MatchupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { leagueId } = useApp();
  const week = Number(params.get("week")) || undefined;
  const id = params.get("id");
  const { data: s, error, isLoading, mutate } = useLeague(leagueId, week);

  if (isLoading && !s) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!s) return <PageSkeleton />;
  if (!s.week) {
    return (
      <>
        <PageHeader eyebrow={s.league.name} title="Matchup" />
        <EmptyState className="panel" icon={<Swords className="h-5 w-5" />} title="Season hasn't started"
          body="Once the commissioner starts the season, your weekly head-to-head shows up here." />
      </>
    );
  }
  const m = (id && s.matchups.find((x) => x.id === id)) || myMatchup(s) || s.matchups[0];
  const n = s.week.number;
  const go = (w: number) => router.replace(`/matchup?week=${w}`);
  const others = s.matchups.filter((x) => x !== m);

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={s.league.name} title={s.week.label}
        action={
          <div className="flex items-center gap-1">
            <IconButton label="Previous week" disabled={n <= 1} onClick={() => go(n - 1)}><ChevronLeft className="h-5 w-5" /></IconButton>
            <IconButton label="Next week" disabled={n >= Math.max(s.league.totalWeeks, s.league.currentWeek ?? 1)} onClick={() => go(n + 1)}><ChevronRight className="h-5 w-5" /></IconButton>
          </div>
        } />
      {m ? <MatchupDetail s={s} m={m} /> : (
        <EmptyState className="panel" icon={<Swords className="h-5 w-5" />} title="No matchups this week"
          body={s.league.status === "playoffs" ? "Playoff matchups are set at 12:00 AM Tuesday after the regular season ends." : undefined} />
      )}
      <section className="panel mt-6 overflow-hidden" id="chat">
        <div className="px-4 pt-4 sm:px-6"><h2 className="eyebrow">Trash talk</h2></div>
        <TrashTalk s={s} />
      </section>
      {others.length > 0 && (
        <section className="panel mt-6 overflow-hidden">
          <div className="px-4 pt-4 sm:px-6"><h2 className="eyebrow">Other matchups</h2></div>
          <div className="divide-y divide-ink-700 py-2">
            {others.map((x) => <MatchupRow key={x.id} s={s} m={x} href={`/matchup?week=${n}&id=${x.id}`} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><MatchupPage /></Suspense>;
}
