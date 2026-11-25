"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { ChevronLeft, Gift, HandHeart, ListChecks, Plus, Undo2, Wand2 } from "lucide-react";
import { api, ApiError, centsFrom, fetcher } from "@/lib/client";
import type { About, Person, WishRow } from "@/lib/types";
import { Avatar, Button, Empty, ErrorBox, Spinner, useToast } from "@/components/ui";
import { AboutCard, WishCard } from "@/components/wish";
import { GiftForm, STATUS } from "@/components/gift-form";

type ListData = { owner: Person & { about: About }; mine: boolean; wishes: WishRow[] };

export default function PersonList({ params }: { params: { id: string } }) {
  const toast = useToast();
  const key = `/api/wishes?user=${params.id}`;
  const { data, error, mutate: reload } = useSWR<ListData>(key, fetcher, { refreshInterval: 20000 });
  const [busy, setBusy] = useState("");
  const [planOpen, setPlanOpen] = useState(false);

  if (error) return <ErrorBox message={error.status === 403 ? "You can only see lists of people in your families." : error.message} />;
  if (!data) return <Spinner />;
  const o = data.owner;
  const first = o.name.split(" ")[0];

  async function claim(w: WishRow) {
    setBusy(w.id);
    try {
      await api("POST", "/api/gifts", { recipient_id: o.id, wish_id: w.id, title: w.title, price_cents: centsFrom(w.price) });
      toast(`Nice! ${first} won't see that you're getting it.`);
      reload();
      mutate("/api/gifts");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't claim it.");
      reload();
    } finally {
      setBusy("");
    }
  }
  async function unclaim(w: WishRow) {
    if (!w.claim?.gift_id) return;
    setBusy(w.id);
    try {
      await api("DELETE", `/api/gifts/${w.claim.gift_id}`);
      toast("Released. Someone else can get it now.");
      reload();
      mutate("/api/gifts");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't undo.");
    } finally {
      setBusy("");
    }
  }

  const footer = (w: WishRow) => {
    if (!w.claim)
      return <Button size="sm" busy={busy === w.id} onClick={() => claim(w)}><HandHeart className="h-4 w-4" />I'll get this</Button>;
    if (w.claim.mine) {
      const st = STATUS.find((s) => s.key === w.claim!.status);
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1.5 text-[14px] font-semibold text-white" style={{ background: st?.color }}>You're getting this · {st?.label}</span>
          <Button size="sm" variant="ghost" busy={busy === w.id} onClick={() => unclaim(w)}><Undo2 className="h-4 w-4" />Undo</Button>
        </div>
      );
    }
    return <span className="inline-flex items-center gap-2 rounded-full bg-ink/[.06] px-3 py-1.5 text-[14px] font-medium text-muted"><Gift className="h-4 w-4" />{w.claim.by ? `${w.claim.by} is getting this` : "Someone is getting this"}</span>;
  };

  const open = data.wishes.filter((w) => !w.claim).length;

  return (
    <div>
      <Link href="/family" className="mb-3 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><ChevronLeft className="h-5 w-5" />Family</Link>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar avatar={o.avatar} color={o.color} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[32px] font-semibold leading-tight sm:text-[40px]">{o.name}'s list</h1>
          <p className="text-[17px] text-muted">{data.wishes.length} {data.wishes.length === 1 ? "wish" : "wishes"} · {open} not claimed yet</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/finder?for=${o.id}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-card px-5 font-medium shadow-soft transition hover:shadow-pop"><Wand2 className="h-5 w-5" />Find ideas</Link>
          <Button onClick={() => setPlanOpen(true)}><Plus className="h-5 w-5" />Off-list gift</Button>
        </div>
      </div>
      <p className="mb-5 rounded-2xl bg-good/10 px-4 py-3 text-[15px] font-medium text-good">
        Claims are secret. {first} can't see who's getting what, but the rest of the family can, so nobody buys the same thing twice.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 lg:order-1">
          {data.wishes.length === 0 ? (
            <Empty icon={ListChecks} title={`${first} hasn't added wishes yet`}>Try the Gift Finder for ideas based on what {first} is into.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.wishes.map((w, i) => <WishCard key={w.id} w={w} i={i} footer={footer(w)} />)}
            </div>
          )}
        </div>
        <aside className="order-1 lg:order-2">
          <AboutCard about={o.about ?? {}} name={first} />
        </aside>
      </div>
      <GiftForm open={planOpen} onClose={() => setPlanOpen(false)} onSaved={() => mutate("/api/gifts")} people={[o]} preset={{ recipient_id: o.id }} />
    </div>
  );
}
