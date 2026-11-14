"use client";
import clsx from "clsx";
import { fmtPts } from "@/lib/client";
import { addDays, dow } from "@/lib/dates";
import type { DayScore } from "@/lib/types";

/** Mon–Sun paired bars. Future days are outlined. */
export function DayBars({
  start, today, left, right, leftLabel = "You", rightLabel, leftColor = "#C8FF3D", rightColor = "#A2A7B1",
}: {
  start: string; today: string; left: DayScore[]; right?: DayScore[] | null; leftLabel?: string; rightLabel?: string;
  leftColor?: string; rightColor?: string;
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
              {[{ v: lv, c: leftColor }, ...(right ? [{ v: rv, c: rightColor }] : [])].map((b, i) => (
                <div key={i}
                  className={clsx("w-full max-w-[14px] rounded-t-sm transition-[height] duration-500",
                    future && "border border-dashed border-ink-600 bg-transparent")}
                  style={{
                    height: future ? "12%" : `${Math.max(3, (b.v / max) * 100)}%`,
                    background: future ? undefined : b.v === 0 ? "#262931" : b.c,
                  }} />
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
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: leftColor }} />{leftLabel}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: rightColor }} />{rightLabel}</span>
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

