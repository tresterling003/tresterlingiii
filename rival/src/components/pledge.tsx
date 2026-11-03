"use client";
import clsx from "clsx";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Check, HeartPulse, MessageCircleHeart, PencilLine, ShieldCheck } from "lucide-react";
import { RivalMark } from "./brand";
import { Button } from "./ui/button";
import { api, ApiError } from "@/lib/client";
import type { MeResponse } from "@/lib/types";

export const PLEDGE = [
  { icon: ShieldCheck, title: "I'll log honestly", body: "Only activity I actually did, with real minutes and steps. No padding, no guessing high." },
  { icon: HeartPulse, title: "I'll take care of myself", body: "I'll push hard, listen to my body, and rest when I need it. Recovery counts too." },
  { icon: MessageCircleHeart, title: "I'll keep it fun", body: "Compete hard, trash talk with love, and cheer my rivals on when they show up." },
  { icon: PencilLine, title: "I'll own my mistakes", body: "If I log something wrong, I'll fix or delete it." },
];

/** Shown once, before a player can log anything. The server enforces it too. */
export function PledgeGate({ me }: { me: MeResponse }) {
  const { mutate } = useSWRConfig();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pledge() {
    setBusy(true); setError(null);
    try {
      await api("POST", "/api/me/pledge");
      await mutate((k) => typeof k === "string" && (k === "/api/me" || k.startsWith("/api/leagues/")));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink-900" role="dialog" aria-modal="true" aria-labelledby="pledge-title">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pb-10 pt-12 animate-fade-up">
        <RivalMark size={40} />
        <p className="eyebrow mt-8 text-lime">Before you play</p>
        <h1 id="pledge-title" className="mt-2 font-display text-[44px] font-extrabold uppercase italic leading-[0.95]">The RIVAL Pledge</h1>
        <p className="mt-4 text-fg-muted">
          RIVAL runs on the honor system. You could fudge a number and win a week, but the point is to get healthier together. Winning is the bonus.
        </p>

        <ol className="mt-8 flex flex-col gap-4">
          {PLEDGE.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-800 text-lime">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold"><span className="tnum mr-2 text-fg-faint">{i + 1}</span>{title}</p>
                <p className="mt-1 text-sm text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <button type="button" role="checkbox" aria-checked={agreed} onClick={() => setAgreed(!agreed)} data-testid="pledge-agree"
          className={clsx("focus-ring mt-8 flex items-start gap-3 rounded-md border p-4 text-left transition-colors",
            agreed ? "border-lime bg-lime-soft" : "border-ink-600 hover:border-ink-600 hover:bg-ink-850")}>
          <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors",
            agreed ? "border-lime bg-lime text-lime-ink" : "border-fg-faint")}>
            {agreed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
          <span className="text-sm">
            I, <span className="font-semibold">{me.account.display_name}</span> of <span className="font-semibold">{me.account.team_name}</span>, take the RIVAL Pledge.
          </span>
        </button>

        {error && <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
        <Button className="mt-6" size="lg" block disabled={!agreed} loading={busy} onClick={pledge} data-testid="pledge-submit">
          Take the pledge
        </Button>
        <p className="mt-4 text-center text-xs text-fg-faint">Signed {today}. Your league sees that you&rsquo;ve pledged.</p>
      </div>
    </div>
  );
}
