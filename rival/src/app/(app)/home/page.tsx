"use client";
import clsx from "clsx";
import { Flame, Plus, Swords, Target } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { InstallCard } from "@/components/pwa";
import { WorkoutCard } from "@/components/workout-card";
import { HabitsCard } from "@/components/habits";
import { ActiveDays } from "@/components/breakdown";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar, Ring, SectionHeader } from "@/components/ui/states";
import { useToday } from "@/lib/hooks";
import { fmtPts } from "@/lib/client";
import { addDays } from "@/lib/dates";
import type { DayScore } from "@/lib/types";
import type { TodayResponse } from "@/lib/solo-types";

const CONSISTENCY = { days: 5, points: 10 };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function sum(days: DayScore[]) {
  return Math.round(days.reduce((a, d) => a + d.total, 0) * 10) / 10;
}
function weekTotal(days: DayScore[]) {
  const active = days.filter((d) => d.is_active).length;
  return sum(days) + (active >= CONSISTENCY.days ? CONSISTENCY.points : 0);
}

/** The solo scoreboard: this week so far vs last week at the same point. */
function VsLastWeek({ data }: { data: TodayResponse }) {
  const { today, weekStart, days } = data;
  const lastStart = addDays(weekStart, -7);
  const sameDayLast = addDays(today, -7);
  const thisWeek = days.filter((d) => d.day >= weekStart && d.day <= today);
  const lastSoFar = days.filter((d) => d.day >= lastStart && d.day <= sameDayLast);
  const lastFull = days.filter((d) => d.day >= lastStart && d.day < weekStart);
  const mine = weekTotal(thisWeek);
  const theirs = weekTotal(lastSoFar);
  const target = weekTotal(lastFull);
  const diff = Math.round((mine - theirs) * 10) / 10;
  const daysLeft = 7 - thisWeek.length;
  const hadLastWeek = lastFull.some((d) => d.workouts > 0 || d.total > 0);
  return (
    <section className="panel overflow-hidden" data-testid="vs-last-week">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3 sm:px-6">
        <p className="eyebrow flex items-center gap-2"><Swords className="h-3.5 w-3.5" /> You vs last week</p>
        <span className={clsx("text-2xs font-bold uppercase", diff > 0 ? "text-lime" : diff < 0 ? "text-warn" : "text-fg-muted")}>
          {diff > 0 ? `Ahead by ${fmtPts(diff)}` : diff < 0 ? `Behind by ${fmtPts(-diff)}` : "Dead even"}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4 px-4 py-6 sm:px-6">
        <div>
          <p className="text-xs font-semibold text-fg-muted">This week</p>
          <p className={clsx("tnum font-display text-score font-bold", mine >= theirs ? "text-fg" : "text-fg-muted")} data-testid="this-week">{fmtPts(mine)}</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-lime" />
        </div>
        <p className="pb-6 font-display text-sm font-bold italic text-fg-faint">VS</p>
        <div className="text-right">
          <p className="text-xs font-semibold text-fg-muted">Last week, same day</p>
          <p className={clsx("tnum font-display text-score font-bold", theirs > mine ? "text-fg" : "text-fg-muted")}>{fmtPts(theirs)}</p>
          <div className="mt-2 h-1" />
        </div>
      </div>
      <div className="border-t border-ink-700 px-4 py-4 sm:px-6">
        {hadLastWeek ? (
          <>
            <div className="mb-2 flex justify-between text-xs">
              <span className="font-semibold">Beat <span className="tnum">{fmtPts(target)}</span> to win the week</span>
              <span className="tnum text-fg-muted">{daysLeft === 0 ? "Last day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} after today`}</span>
            </div>
            <ProgressBar value={mine} max={Math.max(target, 1)} />
          </>
        ) : (
          <p className="text-xs text-fg-faint">This is your first week. Every point you score becomes the number to beat next week.</p>
        )}
      </div>
    </section>
  );
}

function TodayPoints({ data }: { data: TodayResponse }) {
  const { me, openLog } = useApp();
  const d = data.days.find((x) => x.day === data.today);
  const goalMin = me?.goal.active_minutes ?? 30;
  const goalSteps = me?.goal.steps ?? 8000;
  const mins = d?.active_minutes ?? 0;
  const steps = d?.steps ?? 0;
  const active = new Set(data.days.filter((x) => x.is_active).map((x) => x.day));
  let day = active.has(data.today) ? data.today : addDays(data.today, -1);
  let streak = 0;
  while (active.has(day)) { streak++; day = addDays(day, -1); }
  const chips = d ? ([
    ["Steps", d.steps_pts], ["Cardio", d.cardio_pts], ["Strength", d.strength_pts], ["Mobility", d.mobility_pts],
    ["Program", d.plan_pts], ["Goal", d.goal_pts], ["Habits", d.habit_pts ?? 0],
  ] as [string, number][]).filter(([, v]) => v > 0) : [];
  const weekDays = data.days.filter((x) => x.day >= data.weekStart);
  return (
    <section className="panel flex flex-col p-4 sm:p-6">
      <SectionHeader title="Today" action={
        <div className="flex items-center gap-2">
          {streak > 0 && <span className="inline-flex items-center gap-1 text-xs font-bold text-warn" data-testid="streak"><Flame className="h-4 w-4" />{streak}-day streak</span>}
          {d?.goal_met && <Badge tone="lime">Goal met</Badge>}
        </div>
      } />
      <div className="flex items-center gap-6">
        <Ring value={Math.max(mins / goalMin, steps / goalSteps)} max={1} size={88} stroke={8}>
          <Target className={`h-6 w-6 ${d?.goal_met ? "text-lime" : "text-fg-faint"}`} />
        </Ring>
        <div className="min-w-0">
          <p className="tnum font-display text-[44px] font-bold leading-none" data-testid="today-points">{fmtPts(d?.total ?? 0)}</p>
          <p className="mt-1 text-xs text-fg-muted">points today{d && d.raw_total > d.total ? " · daily cap reached" : ""}</p>
          <p className="tnum mt-2 text-xs text-fg-faint">{mins}/{goalMin} active min · {steps.toLocaleString()}/{goalSteps.toLocaleString()} steps</p>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map(([k, v]) => <span key={k} className="tnum rounded-sm bg-ink-750 px-2 py-1 text-xs"><span className="text-fg-muted">{k}</span> <span className="font-semibold">+{fmtPts(v)}</span></span>)}
        </div>
      )}
      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold text-fg-muted">Active days this week · 5 earns +10</p>
        <ActiveDays days={weekDays} start={data.weekStart} today={data.today} target={5} />
      </div>
      <Button variant="secondary" className="mt-6" icon={<Plus className="h-4 w-4" />} onClick={openLog}>Log steps or other activity</Button>
    </section>
  );
}

export default function TodayPage() {
  const { me } = useApp();
  const { data, error, isLoading, mutate } = useToday();
  if (!me || (isLoading && !data)) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;
  const first = me.account.display_name.split(" ")[0];
  const dateLabel = new Date(data.today + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={dateLabel} title={`${greeting()}, ${first}`} />
      <div className="mb-6 empty:hidden"><InstallCard dismissible /></div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-6">
          <WorkoutCard data={data} />
          <HabitsCard data={data} />
        </div>
        <div className="flex flex-col gap-6">
          <VsLastWeek data={data} />
          <TodayPoints data={data} />
        </div>
      </div>
    </div>
  );
}
