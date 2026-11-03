"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { api, ApiError } from "@/lib/client";

export function JoinButton({ code, disabled }: { code: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="lg" block disabled={disabled} loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const r = await api<{ id: string }>("POST", "/api/leagues/join", { code });
          try { localStorage.setItem("rival.league", r.id); } catch {}
          router.replace("/home");
          router.refresh();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Couldn't join.");
          setBusy(false);
        }
      }}>Join league</Button>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    </>
  );
}
