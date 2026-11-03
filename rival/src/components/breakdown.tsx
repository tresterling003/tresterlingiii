"use client";
import clsx from "clsx";
import { fmtPts } from "@/lib/client";
import { addDays, dow } from "@/lib/dates";
import { CATEGORY } from "@/lib/activity-meta";
import { categorySums } from "@/lib/snapshot";
import type { DayScore, Scoring } from "@/lib/types";

type Sums = ReturnType<typeof categorySums>;

/** Mirrored category comparison: where each side's points came from. */
export function CategoryComparison({
  left, right, leftBonus, rightBonus, leftLabel, rightLabel, scoring,
}: {
  left: Sums; right: Sums | null; leftBonus: number; rightBonus: number; leftLabel: string; rightLabel: string; scoring: Scoring;
}) {
  const rows: { key: string; label: string; l: number; r: number; note: string }[] = [
    { key: "steps", label: "Steps", l: left.steps, r: right?.steps ?? 0, note: `${scoring.steps.points} per ${scoring.steps.per.toLocaleString()}` },
    { key: "cardio", label: "Cardio", l: left.cardio, r: right?.cardio ?? 0, note: `${scoring.cardio.points} per ${scoring.cardio.per} min` },
    { key: "strength", label: "Strength", l: left.strength, r: right?.strength ?? 0, note: `${scoring.strength.points} per ${scoring.strength.per} min` },
    { key: "mobility", label: "Mobility", l: left.mobility, r: right?.mobility ?? 0, note: `${scoring.mobility.points} per ${scoring.mobility.per} min` },
    { key: "plan", label: "Planned workouts", l: left.plan, r: right?.plan ?? 0, note: `+${scoring.planned_workout} each` },
    { key: "goal", label: "Daily goals", l: left.goal, r: right?.goal ?? 0, note: `+${scoring.daily_goal} each` },
    { key: "bonus", label: "Consistency", l: leftBonus, r: rightBonus, note: `+${scoring.consistency.points} for ${scoring.consistency.days} active days` },
  ];
  if (left.capAdjust < 0 || (right && right.capAdjust < 0)) {
    rows.push({ key: "cap", label: "Daily cap", l: left.capAdjust, r: right?.capAdjust ?? 0, note: `${scoring.daily_cap} pts max per day` });
  }
  const max = Math.max(1, ...rows.map((r) => Math.max(Math.abs(r.l), Math.abs(r.r))));
  return (
    <div>
      <div className="mb-2 flex justify-between text-2xs font-bold uppercase text-fg-faint">
        <span>{leftLabel}</span><span>{right ? rightLabel : ""}</span>
      </div>
      <ul className="divide-y divide-ink-700">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3">
            <div className="flex items-center gap-3">
              <span className={clsx("tnum w-12 shrink-0 font-display text-lg font-bold", r.l === 0 && "text-fg-faint", r.l < 0 && "text-warn")}>{fmtPts(r.l)}</span>
              <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-ink-750">
                <div className="h-full rounded-full bg-lime" style={{ width: `${(Math.max(0, r.l) / max) * 100}%` }} />
              </div>
            </div>
            <div className="w-24 text-center sm:w-32">
              <p className="text-xs font-semibold">{r.label}</p>
              <p className="hidden text-[11px] text-fg-faint sm:block">{r.note}</p>
            </div>
            {right ? (
              <div className="flex items-center gap-3">
                <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-ink-750">
                  <div className="h-full rounded-full bg-fg-muted" style={{ width: `${(Math.max(0, r.r) / max) * 100}%` }} />
                </div>
                <span className={clsx("tnum w-12 shrink-0 text-right font-display text-lg font-bold", r.r === 0 && "text-fg-faint", r.r < 0 && "text-warn")}>{fmtPts(r.r)}</span>
              </div>
            ) : <div />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mon–Sun paired bars. Future days are outlined. */
export function DayBars({
  start, today, left, right, leftLabel = "You", rightLabel,
}: {
  start: string; today: string; left: DayScore[]; right?: DayScore[] | null; leftLabel?: string; rightLabel?: string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const L = new Map(left.map((d) => [d.day, d]));
  const R = new Map((right ?? []).map((d) => [d.day, d]));
  const max = Math.max(10, ...days.map((d) => Math.max(L.get(d)?.total ?? 0, R.get(d)?.total ?? 0)));
  return (
    <figure>
      <div className="grid h-36 grid-cols-7 items-end gap-2" role="img"
        aria-label={`Daily points: ${days.map((d) => `${dow(d)} ${fmtPts(L.get(d)?.total ?? 0)}`).join(", ")}`}>
        {days.map((d) => {
          const future = d > today;
          const lv = L.get(d)?.total ?? 0;
          const rv = R.get(d)?.total ?? 0;
          return (
            <div key={d} className="flex h-full items-end justify-center gap-1">
              {[{ v: lv, c: "bg-lime" }, ...(right ? [{ v: rv, c: "bg-fg-muted" }] : [])].map((b, i) => (
                <div key={i}
                  className={clsx("w-full max-w-[14px] rounded-t-sm transition-[height] duration-500",
                    future ? "border border-dashed border-ink-600 bg-transparent" : b.c, !future && b.v === 0 && "bg-ink-700")}
                  style={{ height: future ? "12%" : `${Math.max(3, (b.v / max) * 100)}%` }} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 border-t border-ink-700 pt-2">
        {days.map((d) => (
          <div key={d} className="text-center">
            <p className={clsx("text-[11px] font-semibold", d === today ? "text-lime" : "text-fg-faint")}>{dow(d).slice(0, 2)}</p>
            <p className="tnum text-xs font-semibold text-fg-muted">{d > today ? "" : fmtPts(L.get(d)?.total ?? 0)}</p>
          </div>
        ))}
      </div>
      {right && (
        <figcaption className="mt-4 flex gap-4 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime" />{leftLabel}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-fg-muted" />{rightLabel}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** Active-day pips toward the consistency bonus. */
export function ActiveDays({ days, start, today, target }: { days: DayScore[]; start: string; today: string; target: number }) {
  const map = new Map(days.map((d) => [d.day, d]));
  const all = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="flex gap-1.5">
      {all.map((d) => {
        const on = map.get(d)?.is_active;
        return (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <div className={clsx("h-2 w-full rounded-full",
              on ? "bg-lime" : d > today ? "border border-dashed border-ink-600" : d === today ? "bg-ink-600" : "bg-ink-700")} />
            <span className={clsx("text-[10px] font-semibold", d === today ? "text-fg" : "text-fg-faint")}>{dow(d).slice(0, 1)}</span>
          </div>
        );
      })}
      <span className="sr-only">{days.filter((d) => d.is_active).length} of {target} active days</span>
    </div>
  );
}

export { CATEGORY };
