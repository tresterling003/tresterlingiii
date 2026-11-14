"use client";
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Check, ChevronDown, Moon, RotateCcw, Trophy } from "lucide-react";
import { Button } from "./ui/button";
import { Field, Select, Stepper } from "./ui/form";
import { Badge, SectionHeader } from "./ui/states";
import { useToast } from "./ui/toast";
import { KIND_ICON } from "@/lib/activity-meta";
import { ACTIVITY_KEYS } from "@/lib/hooks";
import { api, ApiError, fmtPts, uuid } from "@/lib/client";
import type { ExerciseLog, Template, TodayResponse } from "@/lib/solo-types";
import type { DayScore } from "@/lib/types";

type Row = ExerciseLog & { target: string };

function targetText(e: Template["exercises"][number]) {
  if (e.minutes) return `${e.minutes} min`;
  const sr = [e.sets ? `${e.sets}` : null, e.reps].filter(Boolean).join(" × ");
  return [sr, e.weight ? `${e.weight} lb` : null].filter(Boolean).join(" @ ");
}

/** Today's workout as a checklist with weights; autosaves and finishes into scoring. */
export function WorkoutCard({ data }: { data: TodayResponse }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [other, setOther] = useState<Template | null>(null);
  // The scheduled workout unless you pick a different one from the menu.
  const active = pickedId && pickedId !== data.scheduled?.id ? other : data.scheduled;

  // On a rest day, show a workout you already started today.
  useEffect(() => {
    if (pickedId || data.scheduled) return;
    const s = data.sessions.find((x) => x.session_date === data.today && x.template_id);
    if (s?.template_id) setPickedId(s.template_id);
  }, [data.sessions, data.scheduled, data.today, pickedId]);

  // Load a non-scheduled template's details on demand.
  useEffect(() => {
    if (!pickedId || pickedId === data.scheduled?.id) { setOther(null); return; }
    fetch("/api/program").then((r) => r.json()).then((p) => setOther(p.templates.find((t: Template) => t.id === pickedId) ?? null)).catch(() => {});
  }, [pickedId, data.scheduled?.id]);

  const session = active ? data.sessions.find((s) => s.template_id === active.id && s.session_date === data.today) : undefined;
  const done = !!session?.completed_at;

  const initial = useMemo<Row[]>(() => {
    if (!active) return [];
    return active.exercises.map((e) => {
      const logged = session?.logs.find((l) => l.exercise_id === e.id) ?? session?.logs.find((l) => l.name === e.name);
      const last = data.lastUsed[e.name.toLowerCase()];
      return {
        exercise_id: e.id, name: e.name, target: targetText(e),
        done: logged?.done ?? false,
        sets_done: logged?.sets_done ?? e.sets ?? null,
        reps: logged?.reps ?? null,
        weight: logged?.weight ?? e.weight ?? last?.weight ?? null,
      };
    });
  }, [active, session, data.lastUsed]);

  const [rows, setRows] = useState<Row[]>(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [mins, setMins] = useState(45);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const requestId = useMemo(() => uuid(), [active?.id, done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setRows(initial); }, [initial]);
  useEffect(() => { if (active) setMins(session?.duration_min ?? active.est_minutes); }, [active, session?.duration_min]);

  const payload = (rs: Row[]) => rs.map(({ target: _, ...r }) => r);
  const persist = (rs: Row[]) => {
    if (!active || done) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api("POST", "/api/session", { date: data.today, templateId: active.id, exercises: payload(rs) }).catch((e) =>
        toast({ kind: "error", title: "Couldn't save progress", body: e instanceof ApiError ? e.message : undefined }));
    }, 500);
  };
  const update = (i: number, patch: Partial<Row>) => {
    setRows((rs) => { const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r)); persist(next); return next; });
  };

  async function finish() {
    if (!active) return;
    clearTimeout(saveTimer.current);
    setBusy(true);
    try {
      const r = await api<{ prs: { name: string; weight: number; previous: number }[]; day: DayScore }>("POST", "/api/session/finish", {
        date: data.today, templateId: active.id, durationMin: mins, requestId, exercises: payload(rows),
      });
      if (r.prs.length) {
        toast({ kind: "success", title: `New PR${r.prs.length > 1 ? "s" : ""}!`, body: r.prs.map((p) => `${p.name} ${p.weight} lb (was ${p.previous})`).join(" · ") });
      } else {
        toast({ kind: "success", title: `${active.name} complete`, body: `Today: ${fmtPts(r.day.total)} pts` });
      }
      await mutate(ACTIVITY_KEYS);
    } catch (e) {
      toast({ kind: "error", title: "Couldn't finish workout", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }

  async function reopen() {
    if (!active) return;
    setBusy(true);
    try {
      await api("POST", "/api/session/reopen", { date: data.today, templateId: active.id });
      await mutate(ACTIVITY_KEYS);
    } catch (e) {
      toast({ kind: "error", title: "Couldn't reopen", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }

  const picker = data.templates.length > 0 && (
    <Select aria-label="Choose a different workout" className="h-9 w-auto max-w-[55%] text-xs" value={active?.id ?? ""}
      onChange={(e) => setPickedId(e.target.value || null)} data-testid="workout-picker">
      {!data.scheduled && <option value="">Rest day</option>}
      {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </Select>
  );

  if (!data.hasProgram) {
    return (
      <section className="panel p-4 sm:p-6">
        <SectionHeader title="Today's workout" />
        <p className="text-sm text-fg-muted">Set up your program and today&rsquo;s workout will be waiting here as a checklist.</p>
        <Link href="/program"><Button className="mt-4" block>Set up my program</Button></Link>
      </section>
    );
  }

  if (!active) {
    return (
      <section className="panel p-4 sm:p-6" data-testid="rest-day">
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="eyebrow">Today&rsquo;s workout</h2>{picker}</div>
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-ink-750"><Moon className="h-6 w-6 text-info" /></span>
          <div>
            <p className="font-display text-2xl font-bold uppercase italic">Rest day</p>
            <p className="text-sm text-fg-muted">Recovery counts. Hit your habits, take a walk, or pick a workout above.</p>
          </div>
        </div>
      </section>
    );
  }

  const Icon = KIND_ICON[active.kind];
  const doneCount = rows.filter((r) => r.done).length;
  const scheduled = active.id === data.scheduled?.id;

  return (
    <section className="panel overflow-hidden" data-testid="workout-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-6">
        <h2 className="eyebrow">{scheduled ? "Today's workout" : "Extra workout"}</h2>
        {picker}
      </div>
      <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
        <span className={clsx("flex h-12 w-12 items-center justify-center rounded-md", done ? "bg-lime text-lime-ink" : "bg-ink-750")}>
          {done ? <Check className="h-6 w-6" strokeWidth={3} /> : <Icon className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl font-bold uppercase italic leading-7" data-testid="workout-name">{active.name}</p>
          <p className="text-xs text-fg-muted">
            {done ? `Done · ${session?.duration_min} min` : `${doneCount}/${rows.length} exercises · ~${active.est_minutes} min`}
            {scheduled && !done && " · +5 planned bonus"}
          </p>
        </div>
        {done && <Badge tone="lime"><span data-testid="workout-complete">Complete</span></Badge>}
      </div>

      <ul className="divide-y divide-ink-700 border-t border-ink-700">
        {rows.map((r, i) => (
          <li key={r.exercise_id ?? i}>
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button type="button" role="checkbox" aria-checked={r.done} aria-label={`${r.name} done`} disabled={done}
                onClick={() => update(i, { done: !r.done })} data-testid="exercise-check"
                className={clsx("focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors active:scale-90",
                  r.done ? "border-lime bg-lime text-lime-ink" : "border-ink-600 hover:border-fg-muted")}>
                {r.done && <Check className="h-4 w-4" strokeWidth={3} />}
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <p className={clsx("truncate text-sm font-semibold", r.done && "text-fg-muted line-through decoration-fg-faint")}>{r.name}</p>
                <p className="truncate text-xs text-fg-faint">
                  {r.target || "—"}
                  {r.weight ? <span className="text-fg-muted"> · using {r.weight} lb</span> : null}
                  {data.lastUsed[r.name.toLowerCase()]?.weight && !session ? <span> · last {data.lastUsed[r.name.toLowerCase()].weight} lb</span> : null}
                </p>
              </button>
              {active.kind === "strength" && !done && (
                <ChevronDown className={clsx("h-4 w-4 shrink-0 text-fg-faint transition-transform", open === i && "rotate-180")} />
              )}
            </div>
            {open === i && active.kind === "strength" && !done && (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:px-6">
                <label className="text-[11px] font-semibold text-fg-faint">Weight (lb)
                  <input inputMode="decimal" className="mt-1 h-10 w-full rounded-md border border-ink-700 bg-ink-800 px-3 text-sm text-fg focus:border-lime focus:outline-none"
                    value={r.weight ?? ""} data-testid="weight-input"
                    onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); update(i, { weight: v === "" ? null : Number(v) }); }} />
                </label>
                <label className="text-[11px] font-semibold text-fg-faint">Sets
                  <input inputMode="numeric" className="mt-1 h-10 w-full rounded-md border border-ink-700 bg-ink-800 px-3 text-sm text-fg focus:border-lime focus:outline-none"
                    value={r.sets_done ?? ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); update(i, { sets_done: v === "" ? null : Math.min(20, Number(v)) }); }} />
                </label>
                <label className="text-[11px] font-semibold text-fg-faint">Reps
                  <input className="mt-1 h-10 w-full rounded-md border border-ink-700 bg-ink-800 px-3 text-sm text-fg focus:border-lime focus:outline-none"
                    value={r.reps ?? ""} maxLength={20} placeholder="e.g. 8,8,7" onChange={(e) => update(i, { reps: e.target.value || null })} />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-ink-700 px-4 py-4 sm:px-6">
        {done ? (
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reopen} loading={busy}>Reopen workout</Button>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="How long did it take?">
              <Stepper label="workout minutes" value={mins} onChange={setMins} min={1} max={240} step={5} suffix="min" />
            </Field>
            <Button size="lg" block onClick={finish} loading={busy} disabled={doneCount === 0} icon={<Trophy className="h-4 w-4" />} data-testid="finish-workout">
              {doneCount === 0 ? "Check off an exercise to finish" : `Finish workout${doneCount < rows.length ? ` (${doneCount}/${rows.length})` : ""}`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
