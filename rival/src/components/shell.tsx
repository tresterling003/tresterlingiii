"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, Check, ChevronDown, Home, Plus, Swords, Trophy, User, WifiOff } from "lucide-react";
import { Wordmark, RivalMark } from "./brand";
import { useApp } from "./league-context";
import { Sheet } from "./ui/sheet";
import { Button } from "./ui/button";
import { LiveDot, Skeleton } from "./ui/states";
import { LogWorkoutSheet } from "./log-workout";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/matchup", label: "Matchup", icon: Swords },
  { href: "/league", label: "League", icon: Trophy },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/profile", label: "Profile", icon: User },
];

function SyncIndicator({ compact }: { compact?: boolean }) {
  const { sync, leagueId } = useApp();
  if (!leagueId) return null;
  if (sync === "offline")
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase text-warn" role="status">
        <WifiOff className="h-3.5 w-3.5" /> {!compact && "Offline"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-2xs font-bold uppercase text-fg-faint" role="status"
      title={sync === "live" ? "Live — scores update automatically" : "Connecting…"}>
      {sync === "live" ? <LiveDot /> : <span className="h-2 w-2 rounded-full bg-ink-600" />}
      {!compact && (sync === "live" ? "Live" : "Connecting")}
    </span>
  );
}

function LeagueSwitcher({ className }: { className?: string }) {
  const { me, leagueId, setLeagueId } = useApp();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!me) return <Skeleton className={clsx("h-10 w-40", className)} />;
  const current = me.leagues.find((l) => l.id === leagueId);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={clsx("focus-ring flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-ink-800", className)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current?.name ?? "No league yet"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your leagues">
        <ul className="-mx-2 flex flex-col">
          {me.leagues.map((l) => (
            <li key={l.id}>
              <button onClick={() => { setLeagueId(l.id); setOpen(false); }}
                className="focus-ring flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-ink-800">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-750 font-display text-lg font-bold italic">
                  {l.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.name}</span>
                  <span className="text-xs text-fg-muted">
                    {l.members} members · {l.role === "commissioner" ? "Commissioner" : "Member"}
                  </span>
                </span>
                {l.id === leagueId && <Check className="h-5 w-5 text-lime" />}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" block className="mt-4" icon={<Plus className="h-4 w-4" />}
          onClick={() => { setOpen(false); router.push("/onboarding?more=1"); }}>
          Create or join a league
        </Button>
      </Sheet>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, openLog, logOpen, closeLog } = useApp();

  useEffect(() => {
    if (me && me.leagues.length === 0 && !pathname.startsWith("/onboarding") && !pathname.startsWith("/profile") && !pathname.startsWith("/activity")) {
      router.replace("/onboarding");
    }
  }, [me, pathname, router]);

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <Link href="/home" className="focus-ring mb-8 self-start rounded-md px-2"><Wordmark /></Link>
        <p className="eyebrow mb-2 px-2">League</p>
        <LeagueSwitcher className="mb-6 w-full" />
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={clsx(
                "focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                active(href) ? "bg-ink-800 text-fg" : "text-fg-muted hover:bg-ink-850 hover:text-fg",
              )}>
              <Icon className={clsx("h-5 w-5", active(href) && "text-lime")} strokeWidth={active(href) ? 2.4 : 2} />
              {label}
            </Link>
          ))}
        </nav>
        <Button className="mt-6" block icon={<Plus className="h-4 w-4" />} onClick={openLog}>Log activity</Button>
        <div className="mt-auto px-2"><SyncIndicator /></div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-700 bg-ink-900/95 px-4 backdrop-blur lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Link href="/home" aria-label="RIVAL home" className="focus-ring rounded-md"><RivalMark size={28} /></Link>
          <LeagueSwitcher className="min-w-0 flex-1" />
          <SyncIndicator compact />
          <button onClick={openLog} aria-label="Log activity"
            className="focus-ring ml-1 inline-flex h-10 items-center gap-1 rounded-md bg-lime px-3 text-sm font-bold text-lime-ink active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={3} /> Log
          </button>
        </header>

        <main className="pb-nav mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Primary"
        className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined}
                className={clsx(
                  "focus-ring flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:scale-95",
                  active(href) ? "text-fg" : "text-fg-faint",
                )}>
                <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active(href) && "bg-lime-soft")}>
                  <Icon className={clsx("h-5 w-5", active(href) && "text-lime")} strokeWidth={active(href) ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <LogWorkoutSheet open={logOpen} onClose={closeLog} />
    </div>
  );
}
