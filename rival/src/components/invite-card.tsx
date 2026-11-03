"use client";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

export function InviteCard({ code, leagueName, compact }: { code: string; leagueName: string; compact?: boolean }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;
  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${leagueName} on RIVAL`, text: `Join my RIVAL fitness league "${leagueName}". Code: ${pretty}`, url: link });
        return;
      } catch { return; }
    }
    copy("link");
  };
  return (
    <div className={compact ? "" : "panel p-4 sm:p-6"}>
      {!compact && <p className="eyebrow mb-2">Invite code</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => copy("code")} className="focus-ring group rounded-md" aria-label="Copy invite code">
          <span className="tnum font-display text-4xl font-bold tracking-[0.12em] text-fg" data-testid="invite-code">{pretty}</span>
        </button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => copy("link")} icon={copied === "link" ? <Check className="h-4 w-4 text-lime" /> : <Copy className="h-4 w-4" />}>
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
          <Button size="sm" onClick={share} icon={<Share2 className="h-4 w-4" />}>Invite</Button>
        </div>
      </div>
      {copied === "code" && <p className="mt-2 text-xs text-lime">Code copied</p>}
    </div>
  );
}
