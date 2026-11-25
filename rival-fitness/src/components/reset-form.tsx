"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/form";
import { api, ApiError } from "@/lib/client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setError("Those passwords don't match.");
    setBusy(true); setError(null);
    try {
      await api("POST", "/api/auth/reset", { token, password: pw });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset your password.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-6" noValidate>
      <Field label="New password" htmlFor="np" hint="At least 8 characters.">
        <Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="np2">
        <Input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" block loading={busy} disabled={pw.length < 8}>Set password &amp; sign in</Button>
    </form>
  );
}
