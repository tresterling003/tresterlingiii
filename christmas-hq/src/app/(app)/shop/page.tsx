"use client";

import Link from "next/link";
import { useState } from "react";
import { mutate } from "swr";
import clsx from "clsx";
import { Check, Coins, Gamepad2, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/lib/hooks";
import { AVATARS, EFFECTS, THEMES } from "@/lib/catalog";
import { Avatar, Button, PageHead, Panel, Spinner, useToast } from "@/components/ui";

export default function Shop() {
  const { data: me } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  if (!me) return <Spinner />;
  const owned = new Set(me.owned);
  const coins = me.user.coins;

  async function act(kind: "theme" | "effect" | "avatar", key: string, price: number) {
    const id = `${kind}:${key}`;
    setBusy(id);
    try {
      if (price === 0 || owned.has(id)) {
        await api("PATCH", "/api/me", { [kind]: key });
        toast("Equipped!");
      } else {
        await api("POST", "/api/shop", { item: id });
        toast("Unlocked and equipped!");
      }
      await mutate("/api/me");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't do that.");
    } finally {
      setBusy("");
    }
  }

  const btn = (kind: "theme" | "effect" | "avatar", key: string, price: number, current: string) => {
    const id = `${kind}:${key}`;
    const have = price === 0 || owned.has(id);
    if (current === key) return <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-good/15 px-4 text-[14px] font-semibold text-good"><Check className="h-4 w-4" />Using</span>;
    if (have) return <Button size="sm" variant="soft" busy={busy === id} onClick={() => act(kind, key, price)}>Use</Button>;
    return (
      <Button size="sm" busy={busy === id} disabled={coins < price} onClick={() => act(kind, key, price)}>
        {coins < price ? <Lock className="h-4 w-4" /> : <Coins className="h-4 w-4" />}{price}
      </Button>
    );
  };

  return (
    <div className="grid gap-6">
      <PageHead title="Shop" sub="Spend coins to make your dashboard yours.">
        <Link href="/games" className="inline-flex h-11 items-center gap-2 rounded-full bg-card px-5 font-medium shadow-soft transition hover:shadow-pop"><Gamepad2 className="h-5 w-5" />Earn coins</Link>
      </PageHead>

      <Panel>
        <h2 className="mb-4 text-2xl font-semibold">Themes</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t, i) => (
            <div key={t.key} className={clsx("anim-rise overflow-hidden rounded-[22px] bg-card shadow-soft transition hover:shadow-pop", me.user.theme === t.key && "ring-4 ring-good/40")} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="relative h-28" style={{ background: t.swatch[0] }} aria-hidden>
                <div className="absolute inset-x-5 top-5 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((n) => <span key={n} className="h-14 rounded-xl shadow" style={{ background: n === 1 ? t.swatch[2] : t.swatch[1] }} />)}
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{t.name}</p><p className="text-[14px] text-muted">{t.blurb}</p></div>
                {btn("theme", t.key, t.price, me.user.theme)}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-4 text-2xl font-semibold">Effects</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {EFFECTS.map((e) => (
            <div key={e.key} className={clsx("flex items-center gap-3 rounded-[22px] bg-card p-4 shadow-soft", me.user.effect === e.key && "ring-4 ring-good/40")}>
              <div className="min-w-0 flex-1"><p className="font-semibold">{e.name}</p><p className="text-[14px] text-muted">{e.blurb}</p></div>
              {btn("effect", e.key, e.price, me.user.effect)}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-4 text-2xl font-semibold">Avatars</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {AVATARS.map((a) => (
            <div key={a.key} className={clsx("flex flex-col items-center gap-2 rounded-[22px] bg-card p-4 text-center shadow-soft", me.user.avatar === a.key && "ring-4 ring-good/40")}>
              <Avatar avatar={a.key} color={me.user.color} size={60} />
              <p className="font-semibold">{a.name}</p>
              {btn("avatar", a.key, a.price, me.user.avatar)}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
