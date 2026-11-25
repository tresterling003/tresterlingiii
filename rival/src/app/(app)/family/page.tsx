"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { mutate } from "swr";
import { Check, ChevronRight, Copy, LogOut, Share2 } from "lucide-react";
import { useMe } from "@/lib/hooks";
import { api, ApiError } from "@/lib/client";
import { Avatar, Button, PageHead, Panel, Sheet, Spinner, useToast } from "@/components/ui";
import { FamilyStart } from "@/components/family-start";

export default function Family() {
  const { data: me } = useMe();
  const params = useSearchParams();
  const toast = useToast();
  const [copied, setCopied] = useState("");
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const code = params.get("code") ?? "";

  useEffect(() => {
    if (params.get("invite")) setTimeout(() => document.getElementById("invite")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, [params]);

  if (!me) return <Spinner />;

  async function share(name: string, c: string) {
    const link = `${location.origin}/join/${c}`;
    const text = `Join ${name} on Christmas HQ so we can see each other's wishlists! ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: "Christmas HQ", text, url: link });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(c);
        toast("Invite copied. Paste it in a text!");
        setTimeout(() => setCopied(""), 2500);
      }
    } catch {}
  }

  async function leave() {
    if (!leaving) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/families/${leaving.id}`);
      await mutate("/api/me");
      toast(`You left ${leaving.name}`);
      setLeaving(null);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't leave.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHead title="Family" sub="Tap anyone to see their wishlist. What you plan to give stays hidden from them." />
      {me.families.length === 0 && <FamilyStart initialCode={code} />}
      {me.families.map((f) => (
        <Panel key={f.id}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 flex-1 text-2xl font-semibold">{f.name}</h2>
            <span id="invite" className="rounded-full bg-ink/[.06] px-4 py-2 font-semibold tracking-[.2em]" aria-label={`Invite code ${f.code.split("").join(" ")}`}>{f.code}</span>
            <Button size="sm" onClick={() => share(f.name, f.code)}>
              {copied === f.code ? <Check className="h-4 w-4" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Invite
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {f.members.map((m, i) => {
              const self = m.id === me.user.id;
              return (
                <Link
                  key={m.id}
                  href={self ? "/list" : `/family/${m.id}`}
                  className="tile-press anim-rise flex flex-col items-center gap-2 rounded-[22px] bg-card p-4 text-center shadow-soft"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Avatar avatar={m.avatar} color={m.color} size={64} />
                  <span className="w-full truncate text-[17px] font-semibold">{m.name}{self && " (you)"}</span>
                  <span className="flex items-center gap-1 text-[14px] text-muted">{m.wishes} {m.wishes === 1 ? "wish" : "wishes"}<ChevronRight className="h-4 w-4" /></span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="danger" size="sm" onClick={() => setLeaving({ id: f.id, name: f.name })}><LogOut className="h-4 w-4" />Leave family</Button>
          </div>
        </Panel>
      ))}
      {me.families.length > 0 && (
        <div>
          <h2 className="mb-1 text-xl font-semibold">Another family?</h2>
          <p className="mb-3 text-muted">Join grandparents, cousins or in-laws too. Everyone in every family you're in can see your list.</p>
          <FamilyStart initialCode={code} />
        </div>
      )}
      <Sheet open={!!leaving} onClose={() => setLeaving(null)} title="Leave family?">
        <p className="mb-4 text-muted">You'll stop seeing {leaving?.name}'s lists and they won't see yours. You can rejoin with the code.</p>
        <div className="flex justify-end gap-2 pb-2">
          <Button variant="soft" onClick={() => setLeaving(null)}>Stay</Button>
          <Button busy={busy} onClick={leave}>Leave</Button>
        </div>
      </Sheet>
    </div>
  );
}
