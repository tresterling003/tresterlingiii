"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Camera, Check, LogOut, Plus, Smartphone, Watch } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageHeader, PageSkeleton } from "@/components/page";
import { TeamAvatar, TEAM_COLORS } from "@/components/team-avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Stepper, Switch } from "@/components/ui/form";
import { Badge, SectionHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client";
import { shortDate } from "@/lib/dates";
import { avatarUrl } from "@/lib/avatar";
import { squareJpeg } from "@/lib/image";

function TeamIdentity() {
  const { me } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const a = me!.account;
  const [f, setF] = useState({ display_name: a.display_name, team_name: a.team_name, team_abbr: a.team_abbr, team_color: a.team_color });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photo = avatarUrl(a.id, a.avatar_updated_at);
  const refreshAll = () => mutate((k) => typeof k === "string" && (k === "/api/me" || k.startsWith("/api/leagues/")));
  async function upload(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await squareJpeg(file);
      const res = await fetch("/api/me/avatar", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Upload failed.");
      await refreshAll();
      toast({ kind: "success", title: "Photo updated", body: "Your league sees it right away." });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't upload photo", body: (e as Error).message });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await api("DELETE", "/api/me/avatar");
      await refreshAll();
      toast({ kind: "success", title: "Photo removed" });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't remove photo", body: e instanceof ApiError ? e.message : undefined });
    } finally { setPhotoBusy(false); }
  }
  const dirty = f.display_name !== a.display_name || f.team_name !== a.team_name || f.team_abbr !== a.team_abbr || f.team_color !== a.team_color;
  async function save() {
    setBusy(true);
    try {
      await api("PATCH", "/api/me", f);
      await mutate((k) => typeof k === "string" && (k === "/api/me" || k.startsWith("/api/leagues/")));
      toast({ kind: "success", title: "Team updated", body: "Your league sees the new look right away." });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Team identity" />
      <div className="mb-6 flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}
          className="focus-ring group relative shrink-0 rounded-md" aria-label={photo ? "Change photo" : "Upload photo"}>
          <TeamAvatar abbr={f.team_abbr || "?"} color={f.team_color} size="xl" src={photo} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink-850 bg-lime text-lime-ink transition-transform group-active:scale-90">
            <Camera className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-2xl font-bold uppercase italic">{f.team_name || "Your team"}</p>
          <p className="truncate text-sm text-fg-muted">{f.display_name}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" loading={photoBusy} onClick={() => fileRef.current?.click()} data-testid="upload-photo">
              {photo ? "Change photo" : "Upload photo"}
            </Button>
            {photo && <Button size="sm" variant="ghost" disabled={photoBusy} onClick={removePhoto}>Remove</Button>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="photo-input"
          onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_96px] gap-4">
          <Field label="Team name" htmlFor="tn"><Input id="tn" maxLength={32} value={f.team_name} onChange={(e) => setF({ ...f, team_name: e.target.value })} /></Field>
          <Field label="Abbr." htmlFor="ta"><Input id="ta" maxLength={4} className="uppercase" value={f.team_abbr}
            onChange={(e) => setF({ ...f, team_abbr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></Field>
        </div>
        <Field label="Your name" htmlFor="dn"><Input id="dn" maxLength={40} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label="Team color">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team color">
            {TEAM_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.team_color === c} aria-label={c} onClick={() => setF({ ...f, team_color: c })}
                className={clsx("focus-ring h-9 w-9 rounded-md active:scale-90", f.team_color.toLowerCase() === c.toLowerCase() && "ring-2 ring-fg ring-offset-2 ring-offset-ink-850")}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Button onClick={save} disabled={!dirty} loading={busy}>Save team</Button>
      </div>
    </section>
  );
}

function Goals() {
  const { me } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const cur = me!.pendingGoal ?? me!.goal;
  const [mins, setMins] = useState(cur.active_minutes);
  const [steps, setSteps] = useState(cur.steps);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMins(cur.active_minutes); setSteps(cur.steps); }, [cur.active_minutes, cur.steps]);
  async function save() {
    setBusy(true);
    try {
      const r = await api<{ effectiveFrom: string }>("POST", "/api/me/goal", { activeMinutes: mins, steps });
      await mutate("/api/me");
      toast({ kind: "success", title: "Goal saved", body: `Starts ${shortDate(r.effectiveFrom)}.` });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save goal", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(false); }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Daily goal" />
      <p className="mb-4 text-sm text-fg-muted">
        Hit <span className="font-semibold text-fg">either</span> target to earn the daily goal bonus. Set what&rsquo;s right for you — everyone earns the same bonus for reaching their own goal.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Active minutes"><Stepper label="active minutes" value={mins} onChange={setMins} min={10} max={180} step={5} suffix="min" /></Field>
        <Field label="Steps"><Stepper label="steps" value={steps} onChange={setSteps} min={1000} max={40000} step={500} /></Field>
      </div>
      <p className="mt-4 text-xs text-fg-faint">
        Current: {me!.goal.active_minutes} min or {me!.goal.steps.toLocaleString()} steps.
        {me!.pendingGoal && ` New goal starts ${shortDate(me!.pendingGoal.effective_from)}.`} Changes take effect tomorrow.
      </p>
      <Button className="mt-4" block onClick={save} loading={busy}>Save goal</Button>
    </section>
  );
}

function Privacy() {
  const { me } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [tz, setTz] = useState(me!.account.timezone);
  const update = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api("PATCH", "/api/me", body);
      await mutate("/api/me");
      toast({ kind: "success", title: msg });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't save", body: e instanceof ApiError ? e.message : undefined });
    }
  };
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Privacy & time" />
      <Switch label="Share workout details with my leagues" checked={me!.account.share_details}
        description="Off: league-mates see your points only. On: they also see minutes and steps. Distance and notes are always private."
        onChange={(v) => update({ share_details: v }, v ? "Details shared with your leagues" : "Details are private")} />
      <div className="mt-6 flex items-end gap-2">
        <Field label="Your time zone" htmlFor="utz" className="flex-1" hint="Decides what “today” means when you log.">
          <Input id="utz" value={tz} onChange={(e) => setTz(e.target.value)} />
        </Field>
        <Button variant="secondary" className="mb-6 h-12" disabled={tz === me!.account.timezone} onClick={() => update({ timezone: tz }, "Time zone updated")}>Save</Button>
      </div>
      <button className="text-xs font-semibold text-lime" onClick={() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch {} }}>Use this device&rsquo;s time zone</button>
    </section>
  );
}

function Devices() {
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Connected devices" />
      <ul className="divide-y divide-ink-700">
        {[
          { icon: Watch, name: "Apple Health", body: "Requires the RIVAL iPhone app. Web browsers can't read HealthKit data." },
          { icon: Smartphone, name: "Health Connect", body: "Requires the RIVAL Android app. Web browsers can't read Health Connect data." },
        ].map(({ icon: Icon, name, body }) => (
          <li key={name} className="flex items-start gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-750"><Icon className="h-5 w-5 text-fg-muted" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><p className="text-sm font-semibold">{name}</p><Badge>Not available</Badge></div>
              <p className="mt-1 text-xs text-fg-faint">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-fg-faint">For now, log activity manually. Entries are labeled self-reported.</p>
    </section>
  );
}

function Leagues() {
  const { me, leagueId, setLeagueId } = useApp();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const toast = useToast();
  async function leave(id: string, name: string) {
    if (!confirm(`Leave ${name}? Your current matchup becomes a forfeit.`)) return;
    try {
      await api("POST", `/api/leagues/${id}/actions`, { action: "leave" });
      await mutate("/api/me");
      toast({ kind: "success", title: `You left ${name}` });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't leave", body: e instanceof ApiError ? e.message : undefined });
    }
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Leagues" action={<Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => router.push("/onboarding?more=1")}>Add</Button>} />
      <ul className="divide-y divide-ink-700">
        {me!.leagues.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setLeagueId(l.id)}>
              <p className="flex items-center gap-2 truncate text-sm font-semibold">{l.name}{l.id === leagueId && <Check className="h-4 w-4 text-lime" />}</p>
              <p className="text-xs text-fg-muted">{l.members} teams · {l.role === "commissioner" ? "Commissioner" : "Member"} · {l.status}</p>
            </button>
            {l.role === "commissioner"
              ? <Button size="sm" variant="ghost" onClick={() => { setLeagueId(l.id); router.push("/league/manage"); }}>Manage</Button>
              : <Button size="sm" variant="ghost" onClick={() => leave(l.id, l.name)}>Leave</Button>}
          </li>
        ))}
        {me!.leagues.length === 0 && <li className="py-3 text-sm text-fg-muted">You&rsquo;re not in a league yet.</li>}
      </ul>
    </section>
  );
}

function Account() {
  const { me } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function changePw() {
    setBusy("pw");
    try {
      await api("POST", "/api/me/password", { current: cur, next });
      setCur(""); setNext("");
      toast({ kind: "success", title: "Password changed" });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't change password", body: e instanceof ApiError ? e.message : undefined });
    } finally { setBusy(null); }
  }
  async function signOutOthers() {
    setBusy("others");
    try {
      const r = await api<{ ended: number }>("DELETE", "/api/me/sessions");
      toast({ kind: "success", title: `Signed out ${r.ended} other session${r.ended === 1 ? "" : "s"}` });
    } finally { setBusy(null); }
  }
  async function signOut() {
    setBusy("out");
    await api("POST", "/api/auth/signout").catch(() => {});
    router.replace("/sign-in");
    router.refresh();
  }
  return (
    <section className="panel p-4 sm:p-6">
      <SectionHeader title="Account" />
      <p className="text-sm text-fg-muted">Signed in as <span className="font-semibold text-fg">{me!.account.email}</span></p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="New password" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
      <Button className="mt-4" variant="secondary" disabled={!cur || next.length < 8} loading={busy === "pw"} onClick={changePw}>Change password</Button>
      <div className="mt-6 flex flex-col gap-2 border-t border-ink-700 pt-6 sm:flex-row">
        <Button variant="outline" loading={busy === "others"} onClick={signOutOthers}>Sign out other devices</Button>
        <Button variant="danger" icon={<LogOut className="h-4 w-4" />} loading={busy === "out"} onClick={signOut} data-testid="sign-out">Sign out</Button>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { me } = useApp();
  if (!me) return <PageSkeleton />;
  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Profile" title={me.account.team_name} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6"><TeamIdentity /><Goals /><Leagues /></div>
        <div className="flex flex-col gap-6"><Privacy /><Devices /><Account /></div>
      </div>
    </div>
  );
}
