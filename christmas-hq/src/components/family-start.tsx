"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Home, KeyRound } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button, Panel, inputCls, useToast } from "./ui";

export function FamilyStart({ initialCode = "" }: { initialCode?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState<"" | "create" | "join">("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      await api("POST", "/api/families", { name });
      await mutate("/api/me");
      toast("Family created! Share your invite code.");
      router.push("/family");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't create the family.");
    } finally {
      setBusy("");
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy("join");
    try {
      await api("POST", "/api/families/join", { code });
      await mutate("/api/me");
      toast("You're in! Say hi to the family.");
      setCode("");
      router.push("/family");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't join.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Panel>
        <form onSubmit={create} className="grid gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--c-green-bg)", color: "var(--c-green-fg)" }}><Home /></span>
          <h2 className="text-xl font-semibold">Start a family</h2>
          <p className="text-muted">You'll get a code to share with everyone.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="The Sterling Family" className={inputCls} aria-label="Family name" />
          <Button type="submit" busy={busy === "create"}>Create family</Button>
        </form>
      </Panel>
      <Panel>
        <form onSubmit={join} className="grid gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--c-blue-bg)", color: "var(--c-blue-fg)" }}><KeyRound /></span>
          <h2 className="text-xl font-semibold">Join with a code</h2>
          <p className="text-muted">Someone in your family can find it on their Family tab.</p>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} required placeholder="ABC123" className={inputCls + " font-semibold uppercase tracking-[.25em]"} aria-label="Invite code" />
          <Button type="submit" variant="soft" busy={busy === "join"} disabled={code.length !== 6}>Join family</Button>
        </form>
      </Panel>
    </div>
  );
}
