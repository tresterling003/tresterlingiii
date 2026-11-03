"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { ChevronLeft, Copy, KeyRound, RefreshCw, Share2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { TeamAvatar } from "@/components/team-avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select } from "@/components/ui/form";
import { EmptyState, SectionHeader } from "@/components/ui/states";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { useToast } from "@/components/ui/toast";
import { useLeague } from "@/lib/hooks";
import { api, ApiError } from "@/lib/client";
import type { LeagueSnapshot, Scoring } from "@/lib/types";

const DEFAULTS: Scoring = {
  steps: { per: 1000, points: 2, daily_cap: 25000 },
  cardio: { per: 10, points: 4, daily_cap: 120 },
  strength: { per: 10, points: 4, daily_cap: 90 },
  mobility: { per: 10, points: 3, daily_cap: 60 },
  planned_workout: 5, daily_goal: 5,
  active_day: { minutes: 20, steps: 5000 },
  consistency: { days: 5, points: 10 },
  daily_cap: 60,
};

function Num({ value, onChange, min, max, step = 1, id }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; id?: string }) {
  return <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
    className="tnum h-10 text-sm" onChange={(e) => onChange(Number(e.target.value))} />;
}

function ScoringEditor({ s, onSaved }: { s: LeagueSnapshot; onSaved: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<Scoring>(s.league.scoring);
  const [busy, setBusy] = useState(false);
  useEffect(() => setR(s.league.scoring), [s.league.scoring]);
  const cat = (k: "cardio" | "strength" | "mobility", label: string, maxCap: number) => (
    <div className="grid grid-cols-3 items-end gap-2">
      <Field label={`${label} pts`}><Num value={r[k].points} min={0} max={10} step={0.5} onChange={(v) => setR({ ...r, [k]: { ...r[k], points: v } })} /></Field>
      <Field label="per">
        <Select className="h-10 text-sm" value={r[k].per} onChange={(e) => setR({ ...r, [k]: { ...r[k], per: Number(e.target.value) } })}>
          {[5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}
        </Select>
      </Field>
      <Field label="Daily cap (min)"><Num value={r[k].daily_cap} min={r[k].per} max={maxCap} onChange={(v) => setR({ ...r, [k]: { ...r[k], daily_cap: v } })} /></Field>
    </div>
  );
  async function save(next: Scoring) {
    setBusy(true);
    try {
      await api("PATCH", `/api/leagues/${s.league.id}`, { scoring: next });
      toast({ kind: "success", title: "Scoring updated", body: "Applied to every team for all weeks not yet final." });
      onSaved();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save scoring", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Scoring rules" action={<button className="text-xs font-semibold text-fg-muted hover:text-fg" onClick={() => setR(DEFAULTS)}>Reset to defaults</button>} />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 items-end gap-2">
          <Field label="Steps pts"><Num value={r.steps.points} min={0} max={10} step={0.5} onChange={(v) => setR({ ...r, steps: { ...r.steps, points: v } })} /></Field>
          <Field label="per">
            <Select className="h-10 text-sm" value={r.steps.per} onChange={(e) => setR({ ...r, steps: { ...r.steps, per: Number(e.target.value) } })}>
              {[500, 1000, 2000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </Select>
          </Field>
          <Field label="Daily cap (steps)"><Num value={r.steps.daily_cap} min={r.steps.per} max={40000} step={500} onChange={(v) => setR({ ...r, steps: { ...r.steps, daily_cap: v } })} /></Field>
        </div>
        {cat("cardio", "Cardio", 180)}
        {cat("strength", "Strength", 120)}
        {cat("mobility", "Mobility", 90)}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Planned workout"><Num value={r.planned_workout} min={0} max={15} onChange={(v) => setR({ ...r, planned_workout: v })} /></Field>
          <Field label="Daily goal"><Num value={r.daily_goal} min={0} max={15} onChange={(v) => setR({ ...r, daily_goal: v })} /></Field>
          <Field label="Daily point cap"><Num value={r.daily_cap} min={20} max={150} onChange={(v) => setR({ ...r, daily_cap: v })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Active day: min"><Num value={r.active_day.minutes} min={10} max={60} onChange={(v) => setR({ ...r, active_day: { ...r.active_day, minutes: v } })} /></Field>
          <Field label="…or steps"><Num value={r.active_day.steps} min={2000} max={15000} step={500} onChange={(v) => setR({ ...r, active_day: { ...r.active_day, steps: v } })} /></Field>
          <Field label="Bonus days"><Num value={r.consistency.days} min={3} max={7} onChange={(v) => setR({ ...r, consistency: { ...r.consistency, days: v } })} /></Field>
          <Field label="Bonus pts"><Num value={r.consistency.points} min={0} max={25} onChange={(v) => setR({ ...r, consistency: { ...r.consistency, points: v } })} /></Field>
        </div>
        <p className="text-xs text-fg-faint">Changes apply to everyone equally and recalculate the current week immediately. Final weeks are never changed.</p>
        <Button onClick={() => save(r)} loading={busy}>Save scoring</Button>
      </div>
    </section>
  );
}

function Settings({ s, onSaved }: { s: LeagueSnapshot; onSaved: () => void }) {
  const toast = useToast();
  const pre = s.league.status === "preseason";
  const [f, setF] = useState({ name: s.league.name, max_members: s.league.maxMembers, season_weeks: s.league.seasonWeeks, playoff_teams: s.league.playoffTeams, timezone: s.league.timezone });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: f.name, max_members: f.max_members };
      if (pre) Object.assign(body, { season_weeks: f.season_weeks, playoff_teams: f.playoff_teams, timezone: f.timezone });
      await api("PATCH", `/api/leagues/${s.league.id}`, body);
      toast({ kind: "success", title: "League settings saved" });
      onSaved();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="League settings" />
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="ln"><Input id="ln" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max teams" htmlFor="mm">
            <Select id="mm" value={f.max_members} onChange={(e) => setF({ ...f, max_members: Number(e.target.value) })}>
              {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Regular season" htmlFor="sw" hint={pre ? undefined : "Locked after start"}>
            <Select id="sw" disabled={!pre} value={f.season_weeks} onChange={(e) => setF({ ...f, season_weeks: Number(e.target.value) })}>
              {Array.from({ length: 26 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} weeks</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Playoff teams" hint={pre ? undefined : "Locked after start"}>
          <Segmented className="w-full" value={f.playoff_teams} onChange={(v) => pre && setF({ ...f, playoff_teams: v })} label="Playoff teams"
            options={[0, 2, 4, 6, 8].map((n) => ({ value: n, label: n ? String(n) : "None", disabled: !pre }))} />
        </Field>
        <Field label="Time zone" htmlFor="tz" hint={pre ? "Weeks run Monday–Sunday here." : "Locked after start"}>
          <TimezoneSelect id="tz" disabled={!pre} value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })} />
        </Field>
        <Button onClick={save} loading={busy}>Save settings</Button>
      </div>
    </section>
  );
}

function MembersAdmin({ s, onSaved }: { s: LeagueSnapshot; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reset, setReset] = useState<{ name: string; url: string } | null>(null);
  async function resetLink(userId: string, name: string) {
    setBusy(userId + "reset");
    try {
      const r = await api<{ result: { url: string } }>("POST", `/api/leagues/${s.league.id}/actions`, { action: "reset_link", userId });
      setReset({ name, url: r.result.url });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't create link", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(null); }
  }
  async function act(action: "remove" | "transfer", userId: string, name: string) {
    const msg = action === "remove"
      ? `Remove ${name}? Their current matchup becomes a forfeit and future weeks are rescheduled.`
      : `Make ${name} the commissioner? You'll lose commissioner tools.`;
    if (!confirm(msg)) return;
    setBusy(userId + action);
    try {
      await api("POST", `/api/leagues/${s.league.id}/actions`, { action, userId });
      toast({ kind: "success", title: action === "remove" ? `${name} removed` : `${name} is now commissioner` });
      onSaved();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't do that", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(null); }
  }
  return (
    <section className="panel overflow-hidden">
      <div className="px-4 pt-4 sm:px-6"><SectionHeader title="Members" /></div>
      <ul className="divide-y divide-ink-700">
        {s.members.filter((m) => m.active).map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} src={m.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.teamName}</p>
              <p className="truncate text-xs text-fg-muted">{m.displayName}{m.role === "commissioner" && " · Commissioner"}</p>
            </div>
            {m.id !== s.me && (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} loading={busy === m.id + "reset"} onClick={() => resetLink(m.id, m.displayName)}>Reset link</Button>
                <Button size="sm" variant="ghost" loading={busy === m.id + "transfer"} onClick={() => act("transfer", m.id, m.teamName)}>Make commish</Button>
                <Button size="sm" variant="danger" loading={busy === m.id + "remove"} onClick={() => act("remove", m.id, m.teamName)}>Remove</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Sheet open={!!reset} onClose={() => setReset(null)} title="Password reset link">
        {reset && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Send this to <span className="font-semibold text-fg">{reset.name}</span>. It works once, expires in 48 hours, and signs them out of other devices.
            </p>
            <p className="break-all rounded-md border border-ink-700 bg-ink-800 p-3 font-mono text-xs" data-testid="reset-url">{reset.url}</p>
            <div className="flex gap-2">
              <Button variant="secondary" block icon={<Copy className="h-4 w-4" />}
                onClick={async () => { try { await navigator.clipboard.writeText(reset.url); toast({ kind: "success", title: "Link copied" }); } catch {} }}>Copy</Button>
              <Button block icon={<Share2 className="h-4 w-4" />}
                onClick={async () => { try { if (navigator.share) await navigator.share({ title: "Reset your RIVAL password", url: reset.url }); else await navigator.clipboard.writeText(reset.url); } catch {} }}>Send</Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function SeasonControls({ s, onSaved }: { s: LeagueSnapshot; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(action: "regenerate_invite" | "new_season") {
    if (action === "regenerate_invite" && !confirm("Create a new invite code? The old code and link stop working.")) return;
    setBusy(action);
    try {
      await api("POST", `/api/leagues/${s.league.id}/actions`, { action });
      toast({ kind: "success", title: action === "new_season" ? `Season ${s.league.season + 1} is open` : "New invite code created" });
      onSaved();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't do that", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(null); }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Season & invites" />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-semibold">Invite code</p><p className="tnum text-xs text-fg-muted">{s.league.code.slice(0, 4)}-{s.league.code.slice(4)}</p></div>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} loading={busy === "regenerate_invite"} onClick={() => act("regenerate_invite")}>New code</Button>
        </div>
        {s.league.status === "preseason" && <p className="text-xs text-fg-faint">Start the season from the Home screen once your rivals have joined.</p>}
        {s.league.status === "complete" && (
          <Button loading={busy === "new_season"} onClick={() => act("new_season")}>Start season {s.league.season + 1}</Button>
        )}
      </div>
    </section>
  );
}

export default function ManagePage() {
  const { leagueId } = useApp();
  const { mutate: mutateAll } = useSWRConfig();
  const { data: s, error, isLoading, mutate } = useLeague(leagueId);
  if (isLoading && !s) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!s) return <PageSkeleton />;
  const refresh = () => { mutate(); mutateAll("/api/me"); };
  if (s.league.commissionerId !== s.me)
    return <EmptyState className="panel" title="Commissioner only" body="Only the league commissioner can change settings." action={<Link href="/league" className="text-sm font-semibold text-lime">Back to league</Link>} />;
  return (
    <div className="animate-fade-up">
      <Link href="/league" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg"><ChevronLeft className="h-4 w-4" /> League</Link>
      <PageHeader eyebrow="Commissioner tools" title="Manage league" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Settings s={s} onSaved={refresh} />
          <SeasonControls s={s} onSaved={refresh} />
          <MembersAdmin s={s} onSaved={refresh} />
        </div>
        <ScoringEditor s={s} onSaved={refresh} />
      </div>
    </div>
  );
}
