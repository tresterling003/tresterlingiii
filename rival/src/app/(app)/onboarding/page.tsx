"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { Ticket, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Segmented } from "@/components/ui/form";
import { useApp } from "@/components/league-context";
import { api, ApiError } from "@/lib/client";

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, setLeagueId } = useApp();
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState(10);
  const [weeks, setWeeks] = useState(8);
  const [playoffs, setPlayoffs] = useState(4);
  const [tz, setTz] = useState("America/Chicago");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.account.timezone) setTz(me.account.timezone);
  }, [me?.account.timezone]);

  const done = async (id: string) => {
    setLeagueId(id);
    await mutate("/api/me");
    router.replace("/home");
  };

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>("POST", "/api/leagues/join", { code });
      await done(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join.");
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>("POST", "/api/leagues", { name, maxMembers: size, seasonWeeks: weeks, playoffTeams: playoffs, timezone: tz });
      await done(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the league.");
      setBusy(false);
    }
  }

  const first = !params.get("more") && (me?.leagues.length ?? 0) === 0;

  return (
    <div className="mx-auto max-w-lg animate-fade-up">
      <p className="eyebrow mb-2 text-lime">{first ? "Step 2 of 2" : "Leagues"}</p>
      <h1 className="font-display text-4xl font-bold uppercase italic">{first ? "Find your league" : "Add a league"}</h1>
      <p className="mt-2 text-fg-muted">Join friends with their invite code, or start your own and be the commissioner.</p>

      <Segmented className="mt-8 w-full" value={mode} onChange={(v) => { setMode(v); setError(null); }} label="Join or create"
        options={[{ value: "join", label: "Join with code" }, { value: "create", label: "Create a league" }]} />

      {mode === "join" ? (
        <form onSubmit={join} className="panel mt-6 flex flex-col gap-6 p-6">
          <div className="flex items-center gap-3 text-fg-muted"><Ticket className="h-5 w-5 text-lime" /> Got a code from your commissioner?</div>
          <Field label="Invite code" htmlFor="code" hint="8 characters, like K7QM-2XPA. Opening an invite link works too.">
            <Input id="code" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX"
              className="tnum font-display text-2xl font-bold uppercase tracking-[0.12em]"
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 9))} />
          </Field>
          {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" block loading={busy} disabled={code.replace(/[^A-Z0-9]/g, "").length < 8}>Join league</Button>
        </form>
      ) : (
        <form onSubmit={create} className="panel mt-6 flex flex-col gap-6 p-6">
          <div className="flex items-center gap-3 text-fg-muted"><Trophy className="h-5 w-5 text-lime" /> You&rsquo;ll be the commissioner.</div>
          <Field label="League name" htmlFor="lname">
            <Input id="lname" maxLength={40} placeholder="Sterling Family Classic" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max teams" htmlFor="size">
              <Select id="size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => <option key={n} value={n}>{n} teams</option>)}
              </Select>
            </Field>
            <Field label="Regular season" htmlFor="weeks">
              <Select id="weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {Array.from({ length: 26 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} week{n > 1 ? "s" : ""}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Playoff teams" hint="Single elimination, one week per round. Top seeds get byes with 6 teams.">
            <Segmented className="w-full" value={playoffs} onChange={setPlayoffs} label="Playoff teams"
              options={[0, 2, 4, 6, 8].map((n) => ({ value: n, label: n === 0 ? "None" : String(n) }))} />
          </Field>
          <Field label="League time zone" htmlFor="tz" hint="Weeks run Monday–Sunday here. Scores lock at 12:00 AM Tuesday.">
            <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
          </Field>
          {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" block loading={busy} disabled={name.trim().length < 3}>Create league</Button>
        </form>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Onboarding /></Suspense>;
}
