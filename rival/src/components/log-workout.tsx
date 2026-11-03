"use client";
import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { Info, RotateCcw, Trash2 } from "lucide-react";
import { useActivity } from "@/lib/hooks";
import { Sheet } from "./ui/sheet";
import { Button } from "./ui/button";
import { Field, Input, Segmented, Stepper } from "./ui/form";
import { useToast } from "./ui/toast";
import { useApp } from "./league-context";
import { ACTIVITY, ACTIVITY_ORDER, KM_PER_MI } from "@/lib/activity-meta";
import { api, ApiError, fmtPts, uuid } from "@/lib/client";
import { addDays, shortDate } from "@/lib/dates";
import type { DayScore, Workout } from "@/lib/types";

export function LogWorkoutSheet({
  open, onClose, editing,
}: {
  open: boolean; onClose: () => void; editing?: Workout | null;
}) {
  const { me, leagueId } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const { data: activity } = useActivity(leagueId);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Workout[] = [];
    for (const w of activity?.workouts ?? []) {
      if (w.activity_type === "steps") continue;
      const key = `${w.activity_type}:${w.duration_min ?? ""}:${w.steps ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
      if (out.length === 3) break;
    }
    return out;
  }, [activity?.workouts]);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);

  const [type, setType] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(30);
  const [steps, setSteps] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per opened form: double-taps and retries can't create duplicates.
  const requestId = useMemo(() => (open ? uuid() : ""), [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setType(editing.activity_type);
      setDate(editing.activity_date);
      setMinutes(editing.duration_min ?? 30);
      setSteps(editing.steps ? String(editing.steps) : "");
      setDistance(editing.distance_km ? (editing.distance_km / KM_PER_MI).toFixed(2) : "");
      setNotes(editing.notes ?? "");
    } else {
      setType(null); setDate(today); setMinutes(30); setSteps(""); setDistance(""); setNotes("");
    }
  }, [open, editing, today]);

  const meta = type ? ACTIVITY[type] : null;
  const needsSteps = meta?.category === "steps";
  const durationRequired = meta ? meta.category !== "steps" : false;
  const showDistance = type && ["walk", "run", "cycle", "swim", "hike"].includes(type);

  const refresh = () =>
    mutate((k) => typeof k === "string" && (k.startsWith("/api/activity") || k.startsWith("/api/leagues/") || k === "/api/me"));

  async function submit() {
    if (!type) return;
    setError(null);
    const stepsN = needsSteps ? parseInt(steps.replace(/\D/g, ""), 10) : null;
    if (needsSteps && !stepsN) return setError("Enter your step count.");
    const dist = distance ? Number(distance) * KM_PER_MI : null;
    if (distance && (!Number.isFinite(dist) || (dist as number) <= 0)) return setError("Distance must be a positive number.");
    const body = {
      type, date,
      durationMin: durationRequired ? minutes : null,
      steps: stepsN,
      distanceKm: dist ? Math.round(dist * 100) / 100 : null,
      notes: notes.trim() || null,
    };
    setBusy(true);
    try {
      if (editing) {
        await api("PATCH", `/api/workouts/${editing.id}`, body);
        toast({ kind: "success", title: "Workout updated", body: "Scores recalculated." });
      } else {
        const r = await api<{ day: DayScore }>("POST", `/api/workouts${leagueId ? `?league=${leagueId}` : ""}`, { requestId, ...body });
        toast({
          kind: "success",
          title: `${ACTIVITY[type].label} logged`,
          body: `${date === today ? "Today" : "Yesterday"}: ${fmtPts(r.day.total)} pts${r.day.raw_total > r.day.total ? " (daily cap reached)" : ""}`,
        });
      }
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function quickLog(w: Workout) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ day: DayScore }>("POST", `/api/workouts${leagueId ? `?league=${leagueId}` : ""}`, {
        requestId, type: w.activity_type, date: today, durationMin: w.duration_min, steps: w.steps,
        distanceKm: w.distance_km, notes: null,
      });
      toast({ kind: "success", title: `${ACTIVITY[w.activity_type]?.label ?? "Workout"} logged`, body: `Today: ${fmtPts(r.day.total)} pts` });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !confirm("Delete this workout? Your points will be recalculated.")) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/workouts/${editing.id}`);
      toast({ kind: "success", title: "Workout deleted", body: "Scores recalculated." });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit workout" : type ? ACTIVITY[type].label : "Log activity"}
      footer={type ? (
        <div className="flex gap-2">
          {editing && (
            <Button variant="danger" onClick={remove} disabled={busy} aria-label="Delete workout" icon={<Trash2 className="h-4 w-4" />} />
          )}
          {!editing && <Button variant="secondary" onClick={() => setType(null)} disabled={busy}>Back</Button>}
          <Button block size="lg" onClick={submit} loading={busy} data-testid="save-workout">
            {editing ? "Save changes" : "Log it"}
          </Button>
        </div>
      ) : undefined}>
      {!type ? (
        <div>
          {recent.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold text-fg-muted">Log again for today</p>
              <div className="flex flex-col gap-2">
                {recent.map((w) => {
                  const A = ACTIVITY[w.activity_type];
                  return (
                    <button key={w.id} onClick={() => quickLog(w)} disabled={busy} data-testid="quick-log"
                      className="focus-ring flex h-12 items-center gap-3 rounded-md border border-ink-700 bg-ink-800 px-3 text-left transition-colors hover:border-lime active:scale-[0.98] disabled:opacity-50">
                      {A && <A.icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />}
                      <span className="flex-1 truncate text-sm font-semibold">
                        {A?.label ?? w.activity_type}
                        <span className="font-normal text-fg-muted"> · {w.duration_min ? `${w.duration_min} min` : `${w.steps?.toLocaleString()} steps`}</span>
                      </span>
                      <RotateCcw className="h-4 w-4 shrink-0 text-fg-faint" />
                    </button>
                  );
                })}
              </div>
              {error && <p role="alert" className="mt-2 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            </div>
          )}
          <p className="mb-4 text-sm text-fg-muted">What did you do?</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ACTIVITY_ORDER.map((t) => {
              const A = ACTIVITY[t];
              return (
                <button key={t} onClick={() => setType(t)} data-testid={`type-${t}`}
                  className="focus-ring flex aspect-[1/0.9] flex-col items-center justify-center gap-2 rounded-md border border-ink-700 bg-ink-800 px-1 text-center transition-colors hover:border-ink-600 hover:bg-ink-750 active:scale-[0.97]">
                  <A.icon className="h-6 w-6 text-fg" strokeWidth={1.8} />
                  <span className="text-xs font-semibold leading-tight">{A.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-6 flex items-start gap-2 text-xs text-fg-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Entries are self-reported and visible to your league as points only. RIVAL calculates every point from these details.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Field label="When">
            <Segmented label="Date" value={date} onChange={setDate} className="w-full"
              options={[
                { value: today, label: `Today · ${shortDate(today)}` },
                { value: yesterday, label: "Yesterday" },
              ]} />
          </Field>

          {durationRequired && (
            <Field label="Duration" hint="Up to 240 minutes per entry. Points stop at the daily cap.">
              <Stepper label="minutes" value={minutes} onChange={setMinutes} min={1} max={240} step={5} suffix="min" />
            </Field>
          )}

          {needsSteps && (
            <Field label={type === "steps" ? "Total steps today" : "Steps on this walk"} htmlFor="steps"
              hint={type === "steps"
                ? "Use your phone or watch total. Walks you've logged aren't added on top — we use whichever is higher."
                : "No step count? Log it as Cardio instead."}>
              <Input id="steps" inputMode="numeric" placeholder="e.g. 8,500" data-autofocus
                className="tnum font-display text-2xl font-bold"
                value={steps} onChange={(e) => setSteps(e.target.value.replace(/[^\d,]/g, ""))} />
            </Field>
          )}

          {showDistance && (
            <Field label="Distance (optional)" htmlFor="distance" hint="Private to you. Not used for scoring.">
              <div className="relative">
                <Input id="distance" inputMode="decimal" placeholder="0.0" value={distance}
                  onChange={(e) => setDistance(e.target.value.replace(/[^\d.]/g, ""))} />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-faint">mi</span>
              </div>
            </Field>
          )}

          <Field label="Notes (optional)" htmlFor="notes">
            <Input id="notes" maxLength={200} placeholder="Leg day, morning loop…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <p className="text-xs text-fg-faint">Self-reported. You can edit or delete entries from today and yesterday.</p>
        </div>
      )}
    </Sheet>
  );
}
