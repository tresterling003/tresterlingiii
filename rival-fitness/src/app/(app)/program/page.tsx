"use client";
import clsx from "clsx";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { ChevronRight, Plus, Sparkles } from "lucide-react";
import { KIND_ICON } from "@/lib/activity-meta";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { TemplateEditor } from "@/components/template-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Badge, EmptyState, SectionHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ACTIVITY_KEYS, useProgram } from "@/lib/hooks";
import { api, ApiError } from "@/lib/client";
import { STARTERS } from "@/lib/starters";
import type { Template } from "@/lib/solo-types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Starters({ onDone, compact }: { onDone: () => void; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function add(key: string, name: string) {
    setBusy(key);
    try {
      await api("POST", "/api/program/starter", { key });
      toast({ kind: "success", title: `${name} added`, body: "Edit any workout to make it yours." });
      onDone();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't add program", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(null); }
  }
  return (
    <div className={clsx("grid gap-2", !compact && "sm:grid-cols-3")}>
      {STARTERS.map((s) => (
        <button key={s.key} onClick={() => add(s.key, s.name)} disabled={!!busy} data-testid={`starter-${s.key}`}
          className="focus-ring flex flex-col items-start rounded-md border border-ink-700 bg-ink-800 p-4 text-left transition-colors hover:border-lime disabled:opacity-60">
          <span className="font-semibold">{s.name}</span>
          <span className="mt-1 text-xs text-fg-muted">{s.blurb}</span>
          <span className="mt-2 text-[11px] font-semibold text-fg-faint">{busy === s.key ? "Adding…" : s.days}</span>
        </button>
      ))}
    </div>
  );
}

export default function ProgramPage() {
  const { data, error, isLoading, mutate } = useProgram();
  const { mutate: mutateAll } = useSWRConfig();
  const toast = useToast();
  const [editing, setEditing] = useState<Template | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const refresh = () => { mutate(); mutateAll(ACTIVITY_KEYS); };

  if (isLoading && !data) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const byId = new Map(data.templates.map((t) => [t.id, t]));
  const todayIdx = (new Date().getDay() + 6) % 7;

  async function setDay(weekday: number, templateId: string | null) {
    const prev = data!.schedule;
    mutate({ ...data!, schedule: prev.map((v, i) => (i === weekday - 1 ? templateId : v)) }, false);
    try {
      await api("PUT", "/api/program/schedule", { weekday, templateId });
      mutateAll(ACTIVITY_KEYS);
    } catch (e) {
      mutate();
      toast({ kind: "error", title: "Couldn't update schedule", body: e instanceof ApiError ? e.message : undefined });
    }
  }

  const openEditor = (t: Template | null) => { setEditing(t); setEditorOpen(true); };

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Your plan" title="Program"
        action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)} data-testid="new-template">New workout</Button>} />

      {data.templates.length === 0 ? (
        <section className="panel p-4 sm:p-6">
          <SectionHeader title="Get started" />
          <p className="mb-4 text-sm text-fg-muted">Pick a starter program to fill your week in one tap, then tweak exercises, weights and days. Or build your own from scratch.</p>
          <Starters onDone={refresh} />
          <Button variant="outline" className="mt-4" block icon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)}>Build my own workout</Button>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <section className="panel overflow-hidden">
            <div className="px-4 pt-4 sm:px-6"><SectionHeader title="Weekly schedule" /></div>
            <ul className="divide-y divide-ink-700">
              {DAYS.map((d, i) => {
                const t = data.schedule[i] ? byId.get(data.schedule[i]!) : null;
                const Icon = t ? KIND_ICON[t.kind] : null;
                return (
                  <li key={d} className={clsx("flex items-center gap-3 px-4 py-3 sm:px-6", i === todayIdx && "bg-ink-800/60")}>
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold">{d.slice(0, 3)}</p>
                      {i === todayIdx && <p className="text-[11px] font-bold uppercase text-lime">Today</p>}
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-750">
                      {Icon ? <Icon className="h-4 w-4" /> : <span className="text-[10px] font-bold text-fg-faint">REST</span>}
                    </span>
                    <Select aria-label={`${d} workout`} className="h-10 flex-1 text-sm" value={data.schedule[i] ?? ""} data-testid={`day-${i + 1}`}
                      onChange={(e) => setDay(i + 1, e.target.value || null)}>
                      <option value="">Rest day</option>
                      {data.templates.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                    </Select>
                  </li>
                );
              })}
            </ul>
            <p className="px-4 py-3 text-xs text-fg-faint sm:px-6">Finishing the workout scheduled for a day earns the +5 planned-workout bonus.</p>
          </section>

          <div className="flex flex-col gap-6">
            <section className="panel overflow-hidden">
              <div className="px-4 pt-4 sm:px-6"><SectionHeader title="Workouts" /></div>
              <ul className="divide-y divide-ink-700">
                {data.templates.map((t) => {
                  const Icon = KIND_ICON[t.kind];
                  const days = DAYS.filter((_, i) => data.schedule[i] === t.id).map((d) => d.slice(0, 3));
                  return (
                    <li key={t.id}>
                      <button onClick={() => openEditor(t)} className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-800 sm:px-6" data-testid="template-row">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-750"><Icon className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{t.name}</p>
                          <p className="truncate text-xs text-fg-muted">
                            {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"} · ~{t.est_minutes} min
                          </p>
                        </div>
                        {days.length > 0 ? <Badge tone="lime">{days.join(" ")}</Badge> : <Badge>Unscheduled</Badge>}
                        <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="panel p-4 sm:p-6">
              <SectionHeader title="Add a starter program" />
              <p className="mb-4 text-xs text-fg-faint">Adds its workouts and replaces your weekly schedule. Your existing workouts stay.</p>
              <Starters onDone={refresh} compact />
            </section>
          </div>
        </div>
      )}
      {data.templates.length === 0 && (
        <EmptyState className="mt-2" icon={<Sparkles className="h-5 w-5" />} title="Your program lives here"
          body="Workouts you build show up on Today on the days you schedule them." />
      )}
      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} template={editing} onSaved={refresh} />
    </div>
  );
}
