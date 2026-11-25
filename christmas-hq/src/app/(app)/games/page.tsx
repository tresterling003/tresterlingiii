"use client";

import Link from "next/link";
import { Coins, Gift, Shuffle, Sparkles } from "lucide-react";
import { useMe } from "@/lib/hooks";
import { GAMES, type GameKey } from "@/lib/catalog";
import { PageHead, Panel } from "@/components/ui";

const LIST: { key: GameKey; icon: typeof Gift; color: string }[] = [
  { key: "catch", icon: Gift, color: "teal" },
  { key: "memory", icon: Sparkles, color: "orange" },
  { key: "scramble", icon: Shuffle, color: "blue" },
];

export default function Games() {
  const { data: me } = useMe();
  return (
    <div className="grid gap-5">
      <PageHead title="Games" sub="Play to earn coins, then spend them in the Shop." />
      {me && (
        <Panel className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#F7D774] text-[#8A6400]"><Coins /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">{me.coinsToday} of {me.dailyCap} coins earned today</p>
            <div className="mt-2 h-3 max-w-md overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-[#E8B931]" style={{ width: `${Math.min(100, (me.coinsToday / me.dailyCap) * 100)}%` }} /></div>
          </div>
        </Panel>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {LIST.map((g, i) => (
          <Link key={g.key} href={`/games/${g.key}`} className="tile-press anim-rise overflow-hidden rounded-xl3 bg-card shadow-soft" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="grid h-40 place-items-center" style={{ background: `var(--c-${g.color}-bg)`, color: `var(--c-${g.color}-fg)` }}><g.icon className="h-16 w-16" strokeWidth={2} /></div>
            <div className="p-5">
              <h2 className="text-2xl font-semibold">{GAMES[g.key].name}</h2>
              <p className="mt-1 text-muted">{GAMES[g.key].blurb}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 font-medium text-accent"><Coins className="h-4 w-4" />Up to {GAMES[g.key].cap} coins</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
