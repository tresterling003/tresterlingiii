"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ClipboardList, Plus, Sun, TrendingUp, User } from "lucide-react";
import { Wordmark } from "./brand";
import { useApp } from "./league-context";
import { Button } from "./ui/button";
import { LogWorkoutSheet } from "./log-workout";
import { PledgeGate } from "./pledge";

const NAV = [
  { href: "/home", label: "Today", icon: Sun },
  { href: "/program", label: "Program", icon: ClipboardList },
  { href: "/activity", label: "Progress", icon: TrendingUp },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, openLog, logOpen, closeLog } = useApp();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-ink-700 bg-ink-900 px-4 py-6 lg:flex">
        <Link href="/home" className="focus-ring mb-10 self-start rounded-md px-2"><Wordmark /></Link>
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
        <p className="mt-auto px-2 text-xs text-fg-faint">Every Move Counts. Every Week Matters.</p>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar — grows by the notch inset when installed. */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-ink-700 bg-ink-900/95 px-4 backdrop-blur lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(56px + env(safe-area-inset-top))" }}>
          <Link href="/home" aria-label="RIVAL home" className="focus-ring rounded-md"><Wordmark size="sm" /></Link>
          <div className="flex-1" />
          <button onClick={openLog} aria-label="Log activity"
            className="focus-ring inline-flex h-10 items-center gap-1 rounded-md bg-lime px-3 text-sm font-bold text-lime-ink active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={3} /> Log
          </button>
        </header>

        <main className="pb-nav mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Primary" className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-900/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-4">
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
      {me && !me.account.pledged_at && <PledgeGate me={me} />}
    </div>
  );
}
