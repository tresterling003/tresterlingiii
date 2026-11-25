"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Coins, Ellipsis, Gift, House, ListChecks, Users, TreePine } from "lucide-react";
import { useMe } from "@/lib/hooks";
import { daysUntilChristmas } from "@/lib/catalog";
import { Avatar, ToastProvider } from "./ui";
import { Effects } from "./effects";

const TABS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/list", label: "My List", icon: ListChecks },
  { href: "/family", label: "Family", icon: Users },
  { href: "/gifts", label: "Gifts", icon: Gift },
  { href: "/more", label: "More", icon: Ellipsis },
];
const MORE = ["/more", "/shop", "/finder", "/budget", "/games", "/settings"];

export function CoinPill() {
  const { data } = useMe();
  const coins = data?.user.coins;
  const prev = useRef<number | undefined>(coins);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current !== undefined && coins !== undefined && coins !== prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 600);
      prev.current = coins;
      return () => clearTimeout(t);
    }
    prev.current = coins;
  }, [coins]);
  return (
    <Link
      href="/shop"
      aria-label={`${coins ?? 0} coins. Open the shop`}
      className="flex h-12 items-center gap-2 rounded-full bg-card pl-2 pr-4 font-semibold shadow-soft transition hover:shadow-pop active:scale-95"
    >
      <span className={clsx("grid h-8 w-8 place-items-center rounded-full bg-[#F7D774] text-[#8A6400]", bump && "coin-bump")}>
        <Coins className="h-[18px] w-[18px]" />
      </span>
      <span className="tabular-nums">{coins ?? "–"}</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data } = useMe();
  const theme = data?.user.theme ?? "snow";
  const effect = data?.user.effect ?? "none";
  const days = daysUntilChristmas();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("hq-theme", theme); } catch {}
  }, [theme]);

  return (
    <ToastProvider>
      <div className="page-bg min-h-dvh">
        <Effects effect={effect} />
        <header className="relative z-20 mx-auto flex max-w-6xl items-center gap-3 px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))] sm:px-6">
          <Link href="/home" className="flex h-12 min-w-0 items-center gap-2 rounded-full bg-card pl-2 pr-4 shadow-soft transition hover:shadow-pop">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-onaccent">
              <TreePine className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate font-semibold">
              {days === 0 ? "Merry Christmas!" : <><span className="tabular-nums">{days}</span> {days === 1 ? "day" : "days"}<span className="hidden sm:inline"> to Christmas</span></>}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <CoinPill />
            <Link href="/settings" aria-label="Your profile and settings" className="rounded-full shadow-soft transition hover:shadow-pop active:scale-90">
              {data ? <Avatar avatar={data.user.avatar} color={data.user.color} size={48} className="ring-4 ring-card" /> : <span className="block h-12 w-12 rounded-full bg-card" />}
            </Link>
          </div>
        </header>
        <main className="relative z-10 mx-auto max-w-6xl px-4 pb-[calc(110px+env(safe-area-inset-bottom))] pt-3 sm:px-6">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
          <div className="mx-auto grid max-w-6xl grid-cols-5 gap-1 px-2 py-2">
            {TABS.map((t) => {
              const on = path === t.href || path.startsWith(t.href + "/") || (t.href === "/more" && MORE.some((m) => path.startsWith(m)));
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={clsx("flex flex-col items-center gap-1 rounded-2xl py-2 text-[13px] transition", on ? "bg-ink/[.06] text-ink" : "text-muted hover:text-ink")}
                >
                  <t.icon className={clsx("h-[22px] w-[22px] transition-transform", on && "scale-110")} strokeWidth={on ? 2.3 : 1.8} />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
