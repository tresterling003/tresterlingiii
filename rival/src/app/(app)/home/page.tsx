"use client";
import Link from "next/link";
import { ArrowRight, Crown, Plus, Target } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { PreseasonPanel } from "@/components/preseason";
import { MatchupRow, StatusBadge, WinProbBar } from "@/components/scoreboard";
import { ActiveDays } from "@/components/breakdown";
import { LeagueFeed } from "@/components/feed";
import { StandingsTable } from "@/components/standings";
import { TeamAvatar } from "@/components/team-avatar";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar, Ring, SectionHeader } from "@/components/ui/states";
import { useLeague } from "@/lib/hooks";
import { fmtPts } from "@/lib/client";
import { memberMap, myMatchup, orient, recordOf, weekDays } from "@/lib/snapshot";
import type { LeagueSnapshot } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function MatchupHero({ s }: { s: LeagueSnapshot }) {
  const m = myMatchup(s);
  const members = memberMap(s);
  if (!m || !s.week) {
    return (
      <section className="panel p-6">
        <p className="eyebrow mb-2">{s.week?.label ?? "This week"}</p>
        <p className="font-semibold">{s.league.status === "playoffs" ? "Your season is over — you didn't make (or were eliminated from) the playoffs." : "No matchup for you this week."}</p>
        <p className="mt-1 text-sm text-fg-muted">Your activity still counts toward your stats. Follow the rest of the league below.</p>
      </section>
    );
  }
  const o = orient(m, s.me);
  const me = members.get(o.leftId)!;
  const opp = o.rightId ? members.get(o.rightId) : null;
  const winning = o.leftScore >= (o.rightScore ?? 0);
  return (
    <Link href="/matchup" className="focus-ring panel group block overflow-hidden transition-colors hover:border-ink-600">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3 sm:px-6">
        <p className="eyebrow">{s.week.label} · Head-to-head</p>
        <StatusBadge status={m.status} daysLeft={s.week.daysLeft} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-6 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <TeamAvatar abbr={me.teamAbbr} color={me.teamColor} size="md" ring />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold uppercase italic leading-5">{me.teamName}</p>
              <p className="text-xs text-fg-muted">{recordOf(s, me.id)}</p>
            </div>
          </div>
          <p className={`tnum mt-4 font-display text-score font-bold ${winning ? "text-fg" : "text-fg-muted"}`} data-testid="home-my-score">{fmtPts(o.leftScore)}</p>
        </div>
        <span className="font-display text-sm font-bold italic text-fg-faint">VS</span>
        <div className="min-w-0 text-right">
          {opp ? (
            <>
              <div className="flex items-center justify-end gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold uppercase italic leading-5">{opp.teamName}</p>
                  <p className="text-xs text-fg-muted">{recordOf(s, opp.id)}</p>
                </div>
                <TeamAvatar abbr={opp.teamAbbr} color={opp.teamColor} size="md" />
              </div>
              <p className={`tnum mt-4 font-display text-score font-bold ${!winning ? "text-fg" : "text-fg-muted"}`} data-testid="home-opp-score">{fmtPts(o.rightScore)}</p>
            </>
          ) : (
            <p className="font-display text-xl font-bold uppercase italic text-fg-muted">Bye week</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-ink-700 px-4 py-4 sm:px-6">
        <div className="flex-1">
          {o.leftWin !== null && opp ? (
            <WinProbBar left={o.leftWin} leftLabel={me.teamAbbr} rightLabel={opp.teamAbbr} />
          ) : m.status === "final" ? (
            <p className="text-sm font-semibold">{m.isTie ? "Tie." : m.winnerId === s.me ? "You won this week." : m.winnerId ? `${members.get(m.winnerId)?.teamName} won.` : "Bye week."}</p>
          ) : (
            <p className="text-xs text-fg-faint">Win probability appears after 3 days of activity.</p>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function TodayCard({ s }: { s: LeagueSnapshot }) {
  const { me, openLog } = useApp();
  const today = s.league.today;
  const d = (s.days[s.me] ?? []).find((x) => x.day === today);
  const goalMin = me?.goal.active_minutes ?? 30;
  const goalSteps = me?.goal.steps ?? 8000;
  const mins = d?.active_minutes ?? 0;
  const steps = d?.steps ?? 0;
  const progress = Math.max(mins / goalMin, steps / goalSteps);
  const chips = d ? [
    ["Steps", d.steps_pts], ["Cardio", d.cardio_pts], ["Strength", d.strength_pts], ["Mobility", d.mobility_pts],
    ["Plan", d.plan_pts], ["Goal", d.goal_pts],
  ].filter(([, v]) => (v as number) > 0) : [];
  return (
    <section className="panel flex flex-col p-4 sm:p-6">
      <SectionHeader title="Today" action={d?.goal_met ? <Badge tone="lime">Goal met</Badge> : undefined} />
      <div className="flex items-center gap-6">
        <Ring value={progress} max={1} size={88} stroke={8}>
          <Target className={`h-6 w-6 ${d?.goal_met ? "text-lime" : "text-fg-faint"}`} />
        </Ring>
        <div className="min-w-0">
          <p className="tnum font-display text-[44px] font-bold leading-none" data-testid="today-points">{fmtPts(d?.total ?? 0)}</p>
          <p className="mt-1 text-xs text-fg-muted">points today{d && d.raw_total > d.total ? ` · capped at ${s.league.scoring.daily_cap}` : ""}</p>
          <p className="tnum mt-2 text-xs text-fg-faint">{mins}/{goalMin} active min · {steps.toLocaleString()}/{goalSteps.toLocaleString()} steps</p>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map(([k, v]) => (
            <span key={k as string} className="tnum rounded-sm bg-ink-750 px-2 py-1 text-xs"><span className="text-fg-muted">{k}</span> <span className="font-semibold">+{fmtPts(v as number)}</span></span>
          ))}
        </div>
      )}
      <Button variant="secondary" className="mt-6" icon={<Plus className="h-4 w-4" />} onClick={openLog}>Log activity</Button>
    </section>
  );
}

function WeekCard({ s }: { s: LeagueSnapshot }) {
  if (!s.week) return null;
  const days = weekDays(s, s.me);
  const t = s.totals[s.me];
  const target = s.league.scoring.consistency.days;
  const active = t?.activeDays ?? days.filter((d) => d.is_active).length;
  const need = Math.max(0, target - active);
  return (
    <section className="panel flex flex-col p-4 sm:p-6">
      <SectionHeader title="This week" action={<span className="tnum text-xs font-semibold text-fg-muted">{fmtPts(t?.points ?? 0)} pts</span>} />
      <ActiveDays days={days} start={s.week.start} today={s.league.today} target={target} />
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold">Consistency bonus</p>
          <p className="tnum text-xs text-fg-muted">{Math.min(active, target)}/{target} active days</p>
        </div>
        <ProgressBar value={active} max={target} />
        <p className="mt-2 text-xs text-fg-faint">
          {t?.bonus ? `+${s.league.scoring.consistency.points} bonus locked in.` :
            need > 0 ? `${need} more active day${need > 1 ? "s" : ""} for +${s.league.scoring.consistency.points}. An active day is ${s.league.scoring.active_day.minutes}+ minutes or ${s.league.scoring.active_day.steps.toLocaleString()}+ steps.` : ""}
        </p>
      </div>
    </section>
  );
}

function NextOpponent({ s }: { s: LeagueSnapshot }) {
  if (!s.week) return null;
  const next = s.schedule.find((m) => m.week === s.week!.number + 1 && (m.homeId === s.me || m.awayId === s.me));
  if (!next) return null;
  const members = memberMap(s);
  const oppId = next.homeId === s.me ? next.awayId : next.homeId;
  const opp = oppId ? members.get(oppId) : null;
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title={`Next · Week ${next.week}`} />
      {opp ? (
        <div className="flex items-center gap-3">
          <TeamAvatar abbr={opp.teamAbbr} color={opp.teamColor} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{opp.teamName}</p>
            <p className="text-xs text-fg-muted">{recordOf(s, opp.id)} · {opp.displayName}</p>
          </div>
        </div>
      ) : <p className="text-sm text-fg-muted">Bye week — your points still count toward points-for.</p>}
    </section>
  );
}

function ChampionBanner({ s }: { s: LeagueSnapshot }) {
  const h = s.history.find((x) => x.season === s.league.season);
  if (!h) return null;
  return (
    <section className="panel flex items-center gap-4 border-lime/30 p-6">
      <Crown className="h-8 w-8 shrink-0 text-lime" />
      <div>
        <p className="eyebrow">Season {h.season} champion</p>
        <p className="font-display text-2xl font-bold uppercase italic">{h.championTeam ?? "—"}</p>
        {h.championId === s.me && <p className="text-sm text-lime">That&rsquo;s you. Enjoy it.</p>}
        {s.league.commissionerId === s.me && <Link href="/league/manage" className="mt-2 inline-block text-sm font-semibold text-lime">Start next season →</Link>}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { me, leagueId } = useApp();
  const { data: s, error, isLoading, mutate } = useLeague(leagueId);
  if (!me || (leagueId && isLoading && !s)) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!s) return <PageSkeleton />;
  const first = me.account.display_name.split(" ")[0];

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={`${s.league.name}${s.week ? ` · ${s.week.label}` : ""}`} title={`${greeting()}, ${first}`} />
      {s.league.status === "preseason" ? (
        <PreseasonPanel s={s} />
      ) : (
        <div className="flex flex-col gap-6">
          {s.league.status === "complete" && <ChampionBanner s={s} />}
          <MatchupHero s={s} />
          <div className="grid gap-6 md:grid-cols-2">
            <TodayCard s={s} />
            <WeekCard s={s} />
          </div>
          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-6">
              <NextOpponent s={s} />
              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 sm:px-6"><h2 className="eyebrow">Standings</h2>
                  <Link href="/league" className="text-xs font-semibold text-lime">Full table</Link></div>
                <div className="mt-2"><StandingsTable s={s} compact /></div>
              </section>
            </div>
            <section className="panel overflow-hidden">
              <div className="px-4 pt-4 sm:px-6"><h2 className="eyebrow">League activity</h2></div>
              <LeagueFeed s={s} />
            </section>
          </div>
          {s.matchups.length > 1 && (
            <section className="panel overflow-hidden">
              <div className="px-4 pt-4 sm:px-6"><h2 className="eyebrow">Around the league</h2></div>
              <div className="divide-y divide-ink-700 py-2">
                {s.matchups.filter((m) => m !== myMatchup(s)).map((m) => <MatchupRow key={m.id} s={s} m={m} href={`/matchup?id=${m.id}`} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
