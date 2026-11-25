"use client";

import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { Coins, Gift, Shuffle, Sparkles, Trophy } from "lucide-react";
import { fetcher } from "@/lib/client";
import type { Person } from "@/lib/types";
import { useMe } from "@/lib/hooks";
import { GAMES, type GameKey } from "@/lib/catalog";
import { Avatar, PageHead, Panel } from "@/components/ui";

type Board = { rows: (Person & { week: number; total: number })[]; me: string };

const LIST: { key: GameKey; icon: typeof Gift; color: string }[] = [
  { key: "catch", icon: Gift, color: "teal" },
  { key: "memory", icon: Sparkles, color: "orange" },
  { key: "scramble", icon: Shuffle, color: "blue" },
];

export default function Games() {
  const { data: me } = useMe();
  const { data: board } = useSWR<Board>("/api/leaderboard", fetcher, { refreshInterval: 30000 });
  return (
    <div className="grid gap-5">
      <PageHead title="Games" sub="Play to earn coins and climb the family leaderboard." />
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
      {board && board.rows.length > 0 && (
        <Panel>
          <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold"><Trophy className="h-6 w-6 text-[#B88A10]" />Family leaderboard</h2>
          <p className="mb-3 text-muted">Coins earned this week. Resets every Monday.</p>
          <ol className="grid gap-2">
            {board.rows.map((r, i) => (
              <li key={r.id} className={clsx("flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft", r.id === board.me && "ring-2 ring-accent/40")}>
                <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold", i === 0 ? "bg-[#F7D774] text-[#8A6400]" : i === 1 ? "bg-[#E2E5EA] text-[#5B6577]" : i === 2 ? "bg-[#F1D2B6] text-[#8A4F1F]" : "bg-ink/[.06] text-muted")}>{i + 1}</span>
                <Avatar avatar={r.avatar} color={r.color} size={40} />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}{r.id === board.me && " (you)"}</span>
                <span className="text-right"><span className="block text-xl font-semibold tabular-nums">{r.week}</span><span className="block text-[12px] text-muted">{r.total} all-time</span></span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
