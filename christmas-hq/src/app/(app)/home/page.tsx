"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight, ClipboardPaste, Coins, Gamepad2, Gift, ListChecks, Package, Palette, PiggyBank, Shuffle, Sparkles, Trophy,
  UserPlus, Users, Wand2,
} from "lucide-react";
import { useMe } from "@/lib/hooks";
import { fetcher } from "@/lib/client";
import { money } from "@/lib/catalog";
import type { GiftsData, Person } from "@/lib/types";
import { Avatar, Panel, Spinner } from "@/components/ui";
import { TileGrid, type TileDef } from "@/components/tiles";
import { FamilyStart } from "@/components/family-start";

type Feed = { items: (Person & { id: string; user_id: string; title: string; kind: string; created_at: string })[] };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function Home() {
  const { data: me } = useMe();
  const { data: feed } = useSWR<Feed>("/api/feed", fetcher, { refreshInterval: 30000 });
  const { data: gifts } = useSWR<GiftsData>("/api/gifts", fetcher);
  if (!me) return <Spinner />;

  const first = me.user.name.split(" ")[0];
  const fresh = feed?.items.filter((x) => Date.now() - new Date(x.created_at).getTime() < 7 * 86400000).length ?? 0;
  const toBuy = gifts?.gifts.filter((g) => g.status === "planned").length ?? 0;
  const spent = gifts?.gifts.reduce((s, g) => s + g.price_cents, 0) ?? 0;
  const budget = gifts?.budget_cents ?? 0;
  const counts = { planned: 0, bought: 0, wrapped: 0, given: 0 } as Record<string, number>;
  gifts?.gifts.forEach((g) => counts[g.status]++);
  const totalGifts = gifts?.gifts.length ?? 0;

  const tiles: TileDef[] = [
    { href: "/list", label: "My Wishlist", icon: ListChecks, color: "red" },
    { href: "/family", label: "Family Lists", icon: Users, color: "green", badge: fresh || undefined },
    { href: "/finder", label: "Gift Finder", icon: Wand2, color: "purple" },
    { href: "/gifts", label: "Gift Tracker", icon: Package, color: "blue", badge: toBuy || undefined },
    { href: "/budget", label: "Budget", icon: PiggyBank, color: "gold" },
    { href: "/games", label: "Leaderboard", icon: Trophy, color: "pink" },
    { href: "/games/catch", label: "Present Catch", icon: Gift, color: "teal" },
    { href: "/games/memory", label: "Ornament Match", icon: Sparkles, color: "orange" },
    { href: "/games/scramble", label: "Jingle Jumble", icon: Shuffle, color: "blue" },
    { href: "/family?invite=1", label: "Invite Family", icon: UserPlus, color: "green" },
    { href: "/list?import=1", label: "Paste from Notes", icon: ClipboardPaste, color: "gold" },
    { href: "/settings", label: "Customize", icon: Palette, color: "purple" },
  ];

  const message = !me.families.length
    ? "Start by creating your family, or join one with a code."
    : fresh
      ? `Your family added ${fresh} new ${fresh === 1 ? "wish" : "wishes"} this week. Take a look!`
      : `Welcome back, ${first}! Add a few wishes so your family knows what you'd love.`;

  return (
    <div className="grid gap-5">
      <Link
        href={!me.families.length ? "#start" : fresh ? "/family" : "/list"}
        className="anim-rise flex items-center gap-3 rounded-full bg-card/90 px-5 py-3 text-[16px] shadow-soft transition hover:shadow-pop"
      >
        <span className="min-w-0 flex-1">{message}</span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>

      <Panel>
        <TileGrid tiles={tiles} />
      </Panel>

      {!me.families.length && <div id="start"><FamilyStart /></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Family activity</h2>
            <Link href="/family" className="text-[15px] font-medium text-accent">See lists</Link>
          </div>
          {!feed ? <Spinner className="py-8" /> : feed.items.length === 0 ? (
            <p className="py-6 text-center text-muted">No new wishes yet. When someone in your family adds one, it shows up here.</p>
          ) : (
            <ul className="grid gap-1">
              {feed.items.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <Link href={`/family/${x.user_id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-ink/[.04]">
                    <Avatar avatar={x.avatar} color={x.color} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate"><b className="font-semibold">{x.name}</b> added <b className="font-semibold">{x.title}</b></span>
                      <span className="text-[13px] text-muted">{x.kind === "idea" ? "Gift idea" : "Wish"} · {ago(x.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-5">
          <Panel>
            <h2 className="mb-3 text-xl font-semibold">Gifts I'm giving</h2>
            {totalGifts === 0 ? (
              <p className="text-muted">Nothing planned yet. Open a family member's list and tap <b>I'll get this</b>.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-ink/10">
                  {(["given", "wrapped", "bought", "planned"] as const).map((k, i) => (
                    <span key={k} style={{ width: `${(counts[k] / totalGifts) * 100}%`, background: ["#2E8B57", "#7D5BC0", "#3C7CC4", "#C9CED8"][i] }} />
                  ))}
                </div>
                <p className="mt-2 text-[15px] text-muted">
                  <b className="text-ink">{counts.bought + counts.wrapped + counts.given}</b> of {totalGifts} bought · {counts.wrapped + counts.given} wrapped
                </p>
                {budget > 0 && (
                  <p className="mt-1 text-[15px] text-muted">
                    <b className={spent > budget ? "text-accent" : "text-ink"}>{money(spent)}</b> of {money(budget)} budget
                  </p>
                )}
              </>
            )}
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#F7D774] text-[#8A6400]"><Coins /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">Daily coins</h2>
                <p className="text-[15px] text-muted">{me.coinsToday} of {me.dailyCap} earned today</p>
              </div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink/10">
              <span className="block h-full rounded-full bg-[#E8B931] transition-all" style={{ width: `${Math.min(100, (me.coinsToday / me.dailyCap) * 100)}%` }} />
            </div>
            <Link href="/games" className="mt-3 inline-flex items-center gap-2 font-medium text-accent"><Gamepad2 className="h-5 w-5" /> Play to earn</Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
