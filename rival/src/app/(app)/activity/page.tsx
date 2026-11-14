"use client";
import clsx from "clsx";
import { useState } from "react";
import { Beef, ChevronDown, Crown, Droplet, Pencil, Plus, Trophy } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { DayBars } from "@/components/breakdown";
import { LogWorkoutSheet } from "@/components/log-workout";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, ProgressBar, SectionHeader } from "@/components/ui/states";
import { ACTIVITY, KM_PER_MI } from "@/lib/activity-meta";
import { useActivity, useProgress } from "@/lib/hooks";
import { fmtPts } from "@/lib/client";
import { addDays, relativeDay, shortDate } from "@/lib/dates";
import type { DayScore, Scoring, Workout } from "@/lib/types";

const DEFAULT_RULES: Scoring = {
  steps: { per: 1000, points: 2, daily_cap: 25000 }, cardio: { per: 10, points: 4, daily_cap: 120 },
  strength: { per: 10, points: 4, daily_cap: 90 }, mobility: { per: 10, points: 3, daily_cap: 60 },
  planned_workout: 5, daily_goal: 5, habits: { water: 3, protein: 3 }, active_day: { minutes: 20, steps: 5000 }, consistency: { days: 5, points: 10 }, daily_cap: 60,
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel px-4 py-4">
      <p className="eyebrow">{label}</p>
      <p className="tnum mt-2 font-display text-[32px] font-bold leading-none">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg-faint">{sub}</p>}
    </div>
  );
}

function DayDetail({ d }: { d: DayScore }) {
  const rows = [
    ["Steps", d.steps_pts, d.steps ? `${d.steps.toLocaleString()} steps` : null],
    ["Cardio", d.cardio_pts, d.cardio_min ? `${d.cardio_min} min` : null],
    ["Strength", d.strength_pts, d.strength_min ? `${d.strength_min} min` : null],
    ["Mobility", d.mobility_pts, d.mobility_min ? `${d.mobility_min} min` : null],
    ["Planned workout", d.plan_pts, d.plan_done ? "completed" : null],
    ["Daily goal", d.goal_pts, d.goal_met ? "met" : null],
  ].filter(([, v]) => (v as number) > 0) as [string, number, string | null][];
  return (
    <div className="mt-2 rounded-md bg-ink-800 px-4 py-3 text-sm">
      {rows.length === 0 ? <p className="text-fg-faint">No points yet.</p> : (
        <ul className="flex flex-col gap-1">
          {rows.map(([k, v, note]) => (
            <li key={k} className="flex justify-between gap-4">
              <span className="text-fg-muted">{k}{note && <span className="text-fg-faint"> · {note}</span>}</span>
              <span className="tnum font-semibold">+{fmtPts(v)}</span>
            </li>
          ))}
          {d.raw_total > d.total && (
            <li className="flex justify-between gap-4 text-warn"><span>Daily cap</span><span className="tnum font-semibold">−{fmtPts(d.raw_total - d.total)}</span></li>
          )}
          <li className="mt-1 flex justify-between gap-4 border-t border-ink-700 pt-2 font-semibold"><span>Total</span><span className="tnum">{fmtPts(d.total)}</span></li>
        </ul>
      )}
      <p className="mt-2 text-xs text-fg-faint">{d.is_active ? "Counts as an active day." : "Not an active day yet."}</p>
    </div>
  );
}

function WorkoutRow({ w, editable, onEdit }: { w: Workout; editable: boolean; onEdit: () => void }) {
  const A = ACTIVITY[w.activity_type];
  const detail = [
    w.duration_min ? `${w.duration_min} min` : null,
    w.steps ? `${w.steps.toLocaleString()} steps` : null,
    w.distance_km ? `${(w.distance_km / KM_PER_MI).toFixed(2)} mi` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 py-3" data-testid="workout-row">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-750">
        {A ? <A.icon className="h-5 w-5" strokeWidth={1.8} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{A?.label ?? w.activity_type}</p>
        <p className="truncate text-xs text-fg-muted">{detail}{w.notes ? ` · ${w.notes}` : ""}</p>
      </div>
      <Badge className="hidden sm:inline-flex">{w.source === "manual" ? "Self-reported" : w.source === "apple_health" ? "Apple Health" : "Health Connect"}</Badge>
      {editable ? (
        <IconButton label="Edit workout" onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>
      ) : <span className="w-10" title="Locked" />}
    </li>
  );
}

function levelFor(points: number) {
  // Level n starts at 50·n·(n−1) lifetime points: 0, 100, 300, 600, 1000…
  let n = 1;
  while (50 * (n + 1) * n <= points) n++;
  const start = 50 * n * (n - 1), next = 50 * (n + 1) * n;
  return { level: n, into: points - start, span: next - start, toNext: next - points };
}

function LevelAndWeeks() {
  const { data } = useProgress();
  if (!data) return <div className="skeleton h-64" />;
  const lv = levelFor(data.lifetime);
  const weeks = data.weeks.slice(-12);
  const max = Math.max(10, ...weeks.map((w) => w.points));
  let wins = 0, played = 0;
  for (let i = 1; i < data.weeks.length - 1; i++) { played++; if (data.weeks[i].points > data.weeks[i - 1].points) wins++; }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <section className="panel p-4 sm:p-6" data-testid="level-card">
        <SectionHeader title="Level" />
        <div className="flex items-end gap-4">
          <p className="tnum font-display text-score font-bold leading-none">{lv.level}</p>
          <div className="pb-1">
            <p className="tnum text-sm font-semibold">{fmtPts(data.lifetime)} lifetime pts</p>
            <p className="tnum text-xs text-fg-faint">{fmtPts(lv.toNext)} to level {lv.level + 1}</p>
          </div>
        </div>
        <ProgressBar className="mt-4" value={lv.into} max={lv.span} />
        <div className="mt-6 flex items-center gap-3 rounded-md bg-ink-800 px-4 py-3">
          <Crown className="h-5 w-5 shrink-0 text-lime" />
          <p className="text-sm">{played === 0 ? "Finish a full week to start your record against yourself." :
            <>You&rsquo;ve beaten the week before <span className="tnum font-bold">{wins}</span> of <span className="tnum font-bold">{played}</span> weeks.</>}</p>
        </div>
      </section>
      <section className="panel p-4 sm:p-6">
        <SectionHeader title="Weekly score" action={<span className="text-[11px] text-fg-faint">lime = beat the week before</span>} />
        <div className="flex h-40 items-end gap-2" role="img" aria-label={weeks.map((w) => `Week of ${shortDate(w.week_start)}: ${fmtPts(w.points)}`).join(", ")}>
          {weeks.map((w, i) => {
            const prev = data.weeks[data.weeks.length - weeks.length + i - 1];
            const won = prev ? w.points > prev.points : false;
            const current = i === weeks.length - 1;
            return (
              <div key={w.week_start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="tnum text-[10px] font-semibold text-fg-muted">{Math.round(w.points)}</span>
                <div className={clsx("w-full max-w-[28px] rounded-t-sm", current ? "border border-dashed border-lime bg-lime/30" : won ? "bg-lime" : "bg-ink-600")}
                  style={{ height: `${Math.max(3, (w.points / max) * 85)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2 border-t border-ink-700 pt-2">
          {weeks.map((w, i) => <p key={w.week_start} className={clsx("flex-1 text-center text-[10px] font-semibold", i === weeks.length - 1 ? "text-lime" : "text-fg-faint")}>{i === weeks.length - 1 ? "Now" : shortDate(w.week_start).split(" ")[1]}</p>)}
        </div>
      </section>
    </div>
  );
}

function RecordsAndSessions() {
  const { data } = useProgress();
  if (!data) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel overflow-hidden" data-testid="prs">
        <div className="px-4 pt-4 sm:px-6"><SectionHeader title="Personal records" /></div>
        {data.prs.length === 0 ? (
          <EmptyState icon={<Trophy className="h-5 w-5" />} title="No records yet" body="Enter the weight you use when you check off an exercise. Your best lift for each one shows up here." />
        ) : (
          <ul className="divide-y divide-ink-700">
            {data.prs.map((p) => (
              <li key={p.name} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <Trophy className="h-4 w-4 shrink-0 text-warn" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                <span className="tnum font-display text-lg font-bold">{p.weight} lb</span>
                <span className="w-16 text-right text-xs text-fg-faint">{shortDate(p.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel overflow-hidden">
        <div className="px-4 pt-4 sm:px-6"><SectionHeader title="Recent workouts" /></div>
        {data.sessions.length === 0 ? (
          <EmptyState title="Nothing finished yet" body="Finish a workout from Today and it shows up here." />
        ) : (
          <ul className="divide-y divide-ink-700">
            {data.sessions.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.template_name}</span>
                  <span className="text-xs text-fg-faint">{shortDate(s.session_date)} · {s.duration_min} min · {s.done}/{s.total} exercises</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RulesCard({ rules }: { rules: Scoring }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel p-4 sm:p-6">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h2 className="eyebrow">How scoring works</h2>
        <ChevronDown className={clsx("h-4 w-4 text-fg-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-4 text-sm">
          <table className="w-full">
            <tbody className="divide-y divide-ink-700">
              {[
                [`${rules.steps.per.toLocaleString()} steps`, `${rules.steps.points} pts`, `cap ${rules.steps.daily_cap.toLocaleString()}/day`],
                [`${rules.cardio.per} min cardio`, `${rules.cardio.points} pts`, `cap ${rules.cardio.daily_cap} min`],
                [`${rules.strength.per} min strength`, `${rules.strength.points} pts`, `cap ${rules.strength.daily_cap} min`],
                [`${rules.mobility.per} min yoga / mobility`, `${rules.mobility.points} pts`, `cap ${rules.mobility.daily_cap} min`],
                ["Completed planned workout", `${rules.planned_workout} pts`, "1 per day"],
                ["Personal daily goal", `${rules.daily_goal} pts`, "your own target"],
                ["Water goal / protein goal", "3 pts each", "your own targets"],
                [`${rules.consistency.days} active days in a week`, `${rules.consistency.points} pts`, "weekly bonus"],
              ].map(([a, b, c]) => (
                <tr key={a}><td className="py-2 text-fg-muted">{a}</td><td className="tnum py-2 text-right font-semibold">{b}</td><td className="py-2 pl-4 text-right text-xs text-fg-faint">{c}</td></tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-fg-faint">
            <li>Points accrue per minute and per step (rounded down to 0.1), up to each daily cap.</li>
            <li>Most points in one day: {rules.daily_cap}. More exercise past the cap isn&rsquo;t rewarded — recovery matters.</li>
            <li>An active day is {rules.active_day.minutes}+ active minutes or {rules.active_day.steps.toLocaleString()}+ steps.</li>
            <li>Steps count once a day: your daily total or your logged walks, whichever is higher.</li>
            <li>Finishing the workout your program schedules for a day earns the planned-workout bonus.</li>
            <li>Goal changes start tomorrow.</li>
          </ul>
        </div>
      )}
    </section>
  );
}

export default function ActivityPage() {
  const { me, openLog } = useApp();
  const { data, error, isLoading, mutate } = useActivity();
  const [editing, setEditing] = useState<Workout | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  if ((isLoading && !data) || !me) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const today = data.today;
  const monday = addDays(today, -((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7));
  const weekDays = data.days.filter((d) => d.day >= monday);
  const sum = (k: keyof DayScore) => weekDays.reduce((a, d) => a + ((d[k] as number) ?? 0), 0);
  const weekPts = Math.round(sum("total") * 10) / 10;
  const byDate = new Map<string, Workout[]>();
  for (const w of data.workouts) (byDate.get(w.activity_date) ?? byDate.set(w.activity_date, []).get(w.activity_date)!).push(w);
  const dayMap = new Map(data.days.map((d) => [d.day, d]));
  const dates = Array.from(byDate.keys()).sort().reverse();
  const weeks = [3, 2, 1, 0].map((i) => {
    const start = addDays(monday, -7 * i);
    const pts = data.days.filter((d) => d.day >= start && d.day < addDays(start, 7)).reduce((a, d) => a + d.total, 0);
    return { start, pts: Math.round(pts * 10) / 10 };
  });
  const maxW = Math.max(10, ...weeks.map((w) => w.pts));
  const rules = DEFAULT_RULES;
  const last28 = data.days.slice(-28);
  const waterHits = last28.filter((d) => d.water_met).length;
  const proteinHits = last28.filter((d) => d.protein_met).length;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Your record" title="Progress"
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openLog} className="hidden lg:inline-flex">Log activity</Button>} />

      <div className="mb-6"><LevelAndWeeks /></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <Stat label="This week" value={fmtPts(weekPts)} sub="daily points" />
        <Stat label="Active min" value={String(sum("active_minutes"))} sub="this week" />
        <Stat label="Steps" value={sum("steps").toLocaleString()} sub="this week" />
        <Stat label="Active days" value={`${weekDays.filter((d) => d.is_active).length}/7`} sub={`${rules.consistency.days} for bonus`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="panel p-4 sm:p-6">
          <SectionHeader title="This week by day" />
          <DayBars start={monday} today={today} left={weekDays} />
        </section>
        <section className="panel p-4 sm:p-6">
          <SectionHeader title="Last 4 weeks" />
          <div className="flex h-36 items-end gap-4" role="img" aria-label={weeks.map((w) => `Week of ${shortDate(w.start)}: ${fmtPts(w.pts)}`).join(", ")}>
            {weeks.map((w, i) => (
              <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="tnum text-xs font-semibold text-fg-muted">{fmtPts(w.pts)}</span>
                <div className={clsx("w-full max-w-[40px] rounded-t-sm", i === 3 ? "bg-lime" : "bg-ink-600")} style={{ height: `${Math.max(3, (w.pts / maxW) * 80)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 border-t border-ink-700 pt-2">
            {weeks.map((w, i) => <p key={w.start} className={clsx("flex-1 text-center text-[11px] font-semibold", i === 3 ? "text-lime" : "text-fg-faint")}>{i === 3 ? "Now" : shortDate(w.start)}</p>)}
          </div>
          <p className="mt-2 text-xs text-fg-faint">Daily points only; weekly consistency bonuses not included.</p>
        </section>
      </div>

      <div className="mt-6"><RecordsAndSessions /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="panel p-4 sm:p-6">
          <SectionHeader title="History · last 28 days" />
          {dates.length === 0 ? (
            <EmptyState title="No workouts yet" body="Log your first activity — steps, a run, a lift, a yoga flow. Every move counts."
              action={<Button icon={<Plus className="h-4 w-4" />} onClick={openLog}>Log activity</Button>} />
          ) : (
            <div className="flex flex-col gap-4">
              {dates.map((date) => {
                const d = dayMap.get(date);
                const editable = date >= addDays(today, -1);
                return (
                  <div key={date}>
                    <button className="flex w-full items-center justify-between border-b border-ink-700 pb-2 text-left" onClick={() => setOpenDay(openDay === date ? null : date)} aria-expanded={openDay === date}>
                      <span className="text-sm font-semibold">{relativeDay(date, today)} <span className="font-normal text-fg-faint">· {shortDate(date)}</span></span>
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="tnum font-display text-lg font-bold">{fmtPts(d?.total ?? 0)}</span>
                        <span className="text-xs text-fg-faint">pts</span>
                        <ChevronDown className={clsx("h-4 w-4 text-fg-faint transition-transform", openDay === date && "rotate-180")} />
                      </span>
                    </button>
                    {openDay === date && d && <DayDetail d={d} />}
                    <ul className="divide-y divide-ink-700">
                      {byDate.get(date)!.map((w) => <WorkoutRow key={w.id} w={w} editable={editable} onEdit={() => setEditing(w)} />)}
                    </ul>
                  </div>
                );
              })}
              <p className="text-xs text-fg-faint">Entries from today and yesterday can be edited. Older entries are locked so weekly results stay fair.</p>
            </div>
          )}
        </section>
        <div className="flex flex-col gap-6">
          <section className="panel p-4 sm:p-6">
            <SectionHeader title="Habits · last 28 days" />
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><Droplet className="h-4 w-4 text-info" />Water goal</span><span className="tnum text-fg-muted">{waterHits}/{last28.length} days</span></div>
                <ProgressBar value={waterHits} max={last28.length} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><Beef className="h-4 w-4 text-warn" />Protein goal</span><span className="tnum text-fg-muted">{proteinHits}/{last28.length} days</span></div>
                <ProgressBar value={proteinHits} max={last28.length} />
              </div>
            </div>
          </section>
          <RulesCard rules={rules} />
        </div>
      </div>
      <LogWorkoutSheet open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
