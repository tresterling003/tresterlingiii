import Link from "next/link";
import { CalendarDays, ShieldCheck, Swords } from "lucide-react";
import { Wordmark, TAGLINE } from "@/components/brand";
import { TeamAvatar } from "@/components/team-avatar";

function SampleScoreboard() {
  return (
    <div className="panel relative overflow-hidden" aria-label="Example matchup">
      <div className="flex items-center justify-between border-b border-ink-700 px-6 py-3">
        <p className="eyebrow">Week 4 · Head-to-head</p>
        <span className="text-2xs font-bold uppercase text-fg-faint">Example</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4 px-6 py-8">
        <div>
          <TeamAvatar abbr="IRN" color="#C8FF3D" size="lg" />
          <p className="mt-4 font-display text-2xl font-bold uppercase italic">Team Iron</p>
          <p className="text-xs text-fg-muted">3-0</p>
          <p className="tnum mt-4 font-display text-score font-bold">127.5</p>
          <div className="mt-2 h-1 w-12 rounded-full bg-lime" />
        </div>
        <p className="pb-10 font-display text-sm font-bold italic text-fg-faint">VS</p>
        <div className="text-right">
          <div className="flex justify-end"><TeamAvatar abbr="GRN" color="#3DDCFF" size="lg" /></div>
          <p className="mt-4 font-display text-2xl font-bold uppercase italic">The Grinders</p>
          <p className="text-xs text-fg-muted">2-1</p>
          <p className="tnum mt-4 font-display text-score font-bold text-fg-muted">114.0</p>
          <div className="mt-2 h-1" />
        </div>
      </div>
      <div className="border-t border-ink-700 px-6 py-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          <div className="w-[64%] rounded-l-full bg-lime" /><div className="flex-1 rounded-r-full bg-ink-600" />
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-10">
      <header className="flex h-20 items-center justify-between">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <Link href="/sign-in" className="focus-ring rounded-md px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg">Sign in</Link>
          <Link href="/sign-up" className="focus-ring rounded-md bg-lime px-4 py-2 text-sm font-bold text-lime-ink hover:bg-[#d4ff66]">Get started</Link>
        </nav>
      </header>

      <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div className="animate-fade-up">
          <p className="eyebrow mb-4 text-lime">Fantasy fitness for friends &amp; family</p>
          <h1 className="font-display text-[52px] font-extrabold uppercase italic leading-[0.95] tracking-tight sm:text-[76px]">
            Every move counts.<br /><span className="text-fg-muted">Every week matters.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-fg-muted">
            Start a private league, face a new rival every week, and turn real workouts into fantasy points. Standings, playoffs, a champion.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="focus-ring inline-flex h-12 items-center rounded-md bg-lime px-6 text-base font-bold text-lime-ink hover:bg-[#d4ff66]">
              Create your team
            </Link>
            <Link href="/sign-in" className="focus-ring inline-flex h-12 items-center rounded-md border border-ink-600 px-6 text-base font-semibold hover:bg-ink-850">
              I have an invite
            </Link>
          </div>
        </div>
        <div className="animate-fade-up [animation-delay:120ms]"><SampleScoreboard /></div>
      </main>

      <section className="grid gap-6 border-t border-ink-700 py-12 sm:grid-cols-3">
        {[
          { icon: Swords, title: "Head-to-head weeks", body: "A fair round-robin schedule pairs you with a new rival every Monday. Byes for odd leagues." },
          { icon: CalendarDays, title: "Real seasons", body: "Wins, losses, ties, points for and against, then a playoff bracket and a champion." },
          { icon: ShieldCheck, title: "Fair scoring", body: "Points are calculated on the server from what you log, with daily caps and the same rules for everyone." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="mb-4 h-6 w-6 text-lime" />
            <p className="font-semibold">{title}</p>
            <p className="mt-2 text-sm text-fg-muted">{body}</p>
          </div>
        ))}
      </section>
      <footer className="pb-8 text-xs text-fg-faint">RIVAL · {TAGLINE}</footer>
    </div>
  );
}
