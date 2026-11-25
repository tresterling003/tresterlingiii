"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, Field, inputCls } from "./ui";

export function AuthForm({ mode }: { mode: "in" | "up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const code = params.get("code") ?? "";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    try {
      if (mode === "up") {
        const r = await api<{ family: string | null }>("POST", "/api/auth/signup", {
          name: f.get("name"), email: f.get("email"), password: f.get("password"), code: code || undefined,
        });
        router.replace(r.family ? "/family" : "/home?welcome=1");
      } else {
        await api("POST", "/api/auth/signin", { email: f.get("email"), password: f.get("password") });
        if (code) await api("POST", "/api/families/join", { code }).catch(() => {});
        router.replace(code ? "/family" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const q = new URLSearchParams();
  if (code) q.set("code", code);
  if (next) q.set("next", next);
  const qs = q.toString() ? `?${q}` : "";

  return (
    <form onSubmit={submit} className="grid gap-4">
      {code && (
        <p className="rounded-2xl bg-good/10 px-4 py-3 text-[15px] font-medium text-good">
          You're invited! {mode === "up" ? "Make an account" : "Sign in"} to join the family with code {code}.
        </p>
      )}
      {mode === "up" && (
        <Field label="Your name">
          <input name="name" required maxLength={40} autoComplete="given-name" className={inputCls} placeholder="What your family calls you" />
        </Field>
      )}
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className={inputCls} />
      </Field>
      <Field label="Password" hint={mode === "up" ? "At least 8 characters." : undefined}>
        <input name="password" type="password" required minLength={mode === "up" ? 8 : 1} autoComplete={mode === "up" ? "new-password" : "current-password"} className={inputCls} />
      </Field>
      {err && <p className="rounded-2xl bg-accent/10 px-4 py-3 text-[15px] font-medium text-accent" role="alert">{err}</p>}
      <Button size="lg" busy={busy} type="submit">{mode === "up" ? "Create account" : "Sign in"}</Button>
      <p className="text-center text-muted">
        {mode === "up" ? "Already have an account? " : "New here? "}
        <Link className="font-semibold text-accent" href={(mode === "up" ? "/sign-in" : "/sign-up") + qs}>
          {mode === "up" ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
