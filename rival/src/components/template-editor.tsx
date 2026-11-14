"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Sheet } from "./ui/sheet";
import { Button, IconButton } from "./ui/button";
import { Field, Input, Segmented, Stepper } from "./ui/form";
import { useToast } from "./ui/toast";
import { api, ApiError } from "@/lib/client";
import type { Template } from "@/lib/solo-types";

type Row = { key: string; name: string; sets: string; reps: string; weight: string; minutes: string; notes: string };
const blank = (): Row => ({ key: Math.random().toString(36).slice(2), name: "", sets: "3", reps: "10", weight: "", minutes: "", notes: "" });

export function TemplateEditor({
  open, onClose, template, onSaved,
}: {
  open: boolean; onClose: () => void; template: Template | null; onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Template["kind"]>("strength");
  const [mins, setMins] = useState(45);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (template) {
      setName(template.name); setKind(template.kind); setMins(template.est_minutes);
      setRows(template.exercises.map((e) => ({
        key: e.id, name: e.name, sets: e.sets?.toString() ?? "", reps: e.reps ?? "", weight: e.weight?.toString() ?? "",
        minutes: e.minutes?.toString() ?? "", notes: e.notes ?? "",
      })));
    } else {
      setName(""); setKind("strength"); setMins(45); setRows([blank(), blank(), blank()]);
    }
  }, [open, template]);

  const timed = kind !== "strength";
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const c = [...rs]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setBusy(true); setError(null);
    try {
      await api("POST", "/api/program/templates", {
        id: template?.id, name, kind, est_minutes: mins,
        exercises: rows.filter((r) => r.name.trim()).map((r) => ({
          name: r.name.trim(), sets: timed ? null : n(r.sets), reps: timed ? null : r.reps.trim() || null,
          weight: timed ? null : n(r.weight), minutes: timed ? n(r.minutes) : null, notes: r.notes.trim() || null,
        })),
      });
      toast({ kind: "success", title: template ? "Workout saved" : "Workout created" });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Check the numbers and try again.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!template || !confirm(`Delete "${template.name}"? It's removed from your schedule. Past workouts stay in your history.`)) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/program/templates/${template.id}`);
      toast({ kind: "success", title: "Workout deleted" });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete.");
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={template ? "Edit workout" : "New workout"} wide
      footer={
        <div className="flex gap-2">
          {template && <Button variant="danger" onClick={remove} disabled={busy} aria-label="Delete workout" icon={<Trash2 className="h-4 w-4" />} />}
          <Button block size="lg" onClick={save} loading={busy} disabled={!name.trim()} data-testid="save-template">Save workout</Button>
        </div>
      }>
      <div className="flex flex-col gap-6">
        <Field label="Name" htmlFor="tname">
          <Input id="tname" maxLength={40} placeholder="Push Day" value={name} onChange={(e) => setName(e.target.value)} data-testid="template-name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Segmented className="w-full" value={kind} onChange={setKind} label="Workout type"
              options={[{ value: "strength", label: "Strength" }, { value: "cardio", label: "Cardio" }, { value: "mobility", label: "Mobility" }]} />
          </Field>
          <Field label="Usual length">
            <Stepper label="minutes" value={mins} onChange={setMins} min={5} max={240} step={5} suffix="min" />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold text-fg-muted">Exercises</p>
            <p className="text-[11px] text-fg-faint">{timed ? "Name · minutes" : "Name · sets × reps · weight (lb, optional)"}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.key} className="rounded-md border border-ink-700 bg-ink-800 p-2" data-testid="exercise-row">
                <div className="flex items-center gap-2">
                  <Input aria-label={`Exercise ${i + 1} name`} className="h-10 flex-1 text-sm" placeholder={timed ? "Run, bike or row" : "Bench Press"}
                    value={r.name} maxLength={60} onChange={(e) => update(i, { name: e.target.value })} />
                  <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="h-8 w-8"><ArrowUp className="h-4 w-4" /></IconButton>
                  <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="h-8 w-8"><ArrowDown className="h-4 w-4" /></IconButton>
                  <IconButton label="Remove exercise" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="h-8 w-8"><X className="h-4 w-4" /></IconButton>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {timed ? (
                    <Input aria-label="Minutes" inputMode="numeric" className="h-9 text-sm" placeholder="min" value={r.minutes}
                      onChange={(e) => update(i, { minutes: e.target.value.replace(/\D/g, "") })} />
                  ) : (
                    <>
                      <Input aria-label="Sets" inputMode="numeric" className="h-9 text-sm" placeholder="sets" value={r.sets}
                        onChange={(e) => update(i, { sets: e.target.value.replace(/\D/g, "") })} />
                      <Input aria-label="Reps" className="h-9 text-sm" placeholder="reps (8-10)" value={r.reps} maxLength={20}
                        onChange={(e) => update(i, { reps: e.target.value })} />
                      <Input aria-label="Weight in pounds" inputMode="decimal" className="h-9 text-sm" placeholder="lb" value={r.weight}
                        onChange={(e) => update(i, { weight: e.target.value.replace(/[^\d.]/g, "") })} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-2" block icon={<Plus className="h-4 w-4" />} onClick={() => setRows((rs) => [...rs, blank()])}>
            Add exercise
          </Button>
        </div>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
