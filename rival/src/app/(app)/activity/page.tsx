"use client";
import clsx from "clsx";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { CalendarPlus, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { DayBars } from "@/components/breakdown";
import { LogWorkoutSheet } from "@/components/log-workout";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Segmented, Stepper } from "@/components/ui/form";
import { Badge, EmptyState, SectionHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ACTIVITY, KM_PER_MI } from "@/lib/activity-meta";
import { useActivity, useLeague } from "@/lib/hooks";
import { api, ApiError, fmtPts } from "@/lib/client";
import { addDays, dow, relativeDay, shortDate } from "@/lib/dates";
import type { DayScore, Scoring, Workout } from "@/lib/types";

const DEFAULT_RULES: Scoring = {
  steps: { per: 1000, points: 2, daily_cap: 25000 }, cardio: { per: 10, points: 4, daily_cap: 120 },
  strength: { per: 10, points: 4, daily_cap: 90 }, mobility: { per: 10, points: 3, daily_cap: 60 },
  planned_workout: 5, daily_goal: 5, active_day: { minutes: 20, steps: 5000 }, consistency: { days: 5, points: 10 }, daily_cap: 60,
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

function PlanCard({ today, plans }: { today: string; plans: { plan_date: string; category: string; target_minutes: number }[] }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [date, setDate] = useState(addDays(today, 1));
  const [cat, setCat] = useState<"cardio" | "strength" | "mobility">("strength");
  const [mins, setMins] = useState(30);
  const [busy, setBusy] = useState(false);
  const options = [1, 2, 3, 4, 5, 6, 7].map((i) => addDays(today, i));
  async function save() {
    setBusy(true);
    try {
      await api("POST", "/api/plans", { date, category: cat, targetMinutes: mins });
      toast({ kind: "success", title: "Workout planned", body: `${relativeDay(date, today) === "Today" ? "" : dow(date)} ${shortDate(date)} · ${mins} min ${cat}` });
      await mutate("/api/me");
    } catch (e) {
      toast({ kind: "error", title: "Couldn't plan that", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }
  async function remove(d: string) {
    try { await api("DELETE", `/api/plans?date=${d}`); await mutate("/api/me"); } catch (e) {
      toast({ kind: "error", title: "Couldn't remove", body: e instanceof ApiError ? e.message : undefined });
    }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Plan ahead" />
      <p className="mb-4 text-sm text-fg-muted">Plan a workout for a future day. Complete it on that day for a bonus — plans can&rsquo;t be made the same day.</p>
      <div className="flex flex-col gap-4">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {options.map((d) => (
            <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}
              className={clsx("focus-ring flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                date === d ? "border-lime bg-lime-soft text-fg" : "border-ink-700 bg-ink-800 text-fg-muted hover:text-fg")}>
              <span>{dow(d)}</span><span className="tnum text-sm text-fg">{d.slice(8)}</span>
            </button>
          ))}
        </div>
        <Segmented className="w-full" value={cat} onChange={setCat} label="Workout type"
          options={[{ value: "cardio", label: "Cardio" }, { value: "strength", label: "Strength" }, { value: "mobility", label: "Mobility" }]} />
        <Field label="Target"><Stepper label="target minutes" value={mins} onChange={setMins} min={10} max={120} step={5} suffix="min" /></Field>
        <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} loading={busy} onClick={save}>Save plan</Button>
      </div>
      {plans.length > 0 && (
        <ul className="mt-6 divide-y divide-ink-700 border-t border-ink-700">
          {plans.map((p) => (
            <li key={p.plan_date} className="flex items-center gap-3 py-3 text-sm">
              <span className="w-24 font-semibold">{relativeDay(p.plan_date, today) === "Today" ? "Today" : `${dow(p.plan_date)} ${shortDate(p.plan_date)}`}</span>
              <span className="flex-1 text-fg-muted">{p.target_minutes} min {p.category}</span>
              {p.plan_date > today && <IconButton label="Remove plan" onClick={() => remove(p.plan_date)}><Trash2 className="h-4 w-4" /></IconButton>}
            </li>
          ))}
        </ul>
      )}
    </section>
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
            <li>Goal changes start tomorrow. These are RIVAL&rsquo;s rules — your commissioner can adjust them for the league.</li>
          </ul>
        </div>
      )}
    </section>
  );
}

export default function ActivityPage() {
  const { me, leagueId, openLog } = useApp();
  const { data, error, isLoading, mutate } = useActivity(leagueId);
  const { data: league } = useLeague(leagueId);
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
  const rules = league?.league.scoring ?? DEFAULT_RULES;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={league ? `Scored with ${league.league.name} rules` : "Default RIVAL rules"} title="Activity"
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openLog} className="hidden lg:inline-flex">Log activity</Button>} />

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
          <PlanCard today={today} plans={me.plans} />
          <RulesCard rules={rules} />
        </div>
      </div>
      <LogWorkoutSheet open={!!editing} editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
