"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/form";
import { TeamAvatar, TEAM_COLORS } from "./team-avatar";
import { api, ApiError } from "@/lib/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("POST", "/api/auth/signin", { email, password });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-6 p-6 sm:p-8" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold uppercase italic">Welcome back</h1>
        <p className="mt-1 text-sm text-fg-muted">Sign in to see your matchup.</p>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
      <p className="-mt-2 text-center text-xs text-fg-faint">Forgot your password? Ask your league commissioner to send you a reset link (League → Manage).</p>
      <p className="text-center text-sm text-fg-muted">
        New to RIVAL? <Link className="font-semibold text-lime hover:underline" href={`/sign-up${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Create an account</Link>
      </p>
    </form>
  );
}

function abbrFrom(name: string) {
  const words = name.replace(/^(the|team)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState({ displayName: "", email: "", password: "", teamName: "", teamAbbr: "", teamColor: TEAM_COLORS[0] });
  const [abbrTouched, setAbbrTouched] = useState(false);
  const [tz, setTz] = useState("America/Chicago");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"); } catch {}
    setF((x) => ({ ...x, teamColor: TEAM_COLORS[Math.floor(Math.random() * 9)] }));
  }, []);

  const set = (k: keyof typeof f) => (v: string) =>
    setF((x) => {
      const next = { ...x, [k]: v };
      if (k === "teamName" && !abbrTouched) next.teamAbbr = abbrFrom(v);
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("POST", "/api/auth/signup", { ...f, timezone: tz });
      router.replace(safeNext(params.get("next")) === "/home" ? "/onboarding" : safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-6 p-6 sm:p-8" noValidate>
      <div>
        <h1 className="font-display text-3xl font-bold uppercase italic">Create your team</h1>
        <p className="mt-1 text-sm text-fg-muted">You are the franchise. Pick a name your rivals will remember.</p>
      </div>
      <div className="flex items-center gap-4 rounded-md border border-ink-700 bg-ink-800 p-4">
        <TeamAvatar abbr={f.teamAbbr || "?"} color={f.teamColor} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold uppercase italic">{f.teamName || "Your team"}</p>
          <p className="truncate text-xs text-fg-muted">{f.displayName || "Your name"}</p>
        </div>
      </div>
      <Field label="Your name" htmlFor="displayName">
        <Input id="displayName" autoComplete="name" maxLength={40} value={f.displayName} onChange={(e) => set("displayName")(e.target.value)} />
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-4">
        <Field label="Team name" htmlFor="teamName">
          <Input id="teamName" maxLength={32} placeholder="Team Iron" value={f.teamName} onChange={(e) => set("teamName")(e.target.value)} />
        </Field>
        <Field label="Abbr." htmlFor="teamAbbr">
          <Input id="teamAbbr" maxLength={4} className="uppercase" value={f.teamAbbr}
            onChange={(e) => { setAbbrTouched(true); set("teamAbbr")(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); }} />
        </Field>
      </div>
      <Field label="Team color">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team color">
          {TEAM_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={f.teamColor === c} aria-label={c}
              onClick={() => set("teamColor")(c)}
              className={clsx("focus-ring h-9 w-9 rounded-md transition-transform active:scale-90", f.teamColor === c && "ring-2 ring-fg ring-offset-2 ring-offset-ink-850")}
              style={{ background: c }} />
          ))}
        </div>
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email")(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password")(e.target.value)} />
      </Field>
      <p className="text-xs text-fg-faint">Time zone: <span className="text-fg-muted">{tz}</span> — used to decide what counts as “today”. You can change it in Profile.</p>
      {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" block loading={busy}>Create account</Button>
      <p className="text-center text-sm text-fg-muted">
        Already have an account? <Link className="font-semibold text-lime hover:underline" href={`/sign-in${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Sign in</Link>
      </p>
    </form>
  );
}
