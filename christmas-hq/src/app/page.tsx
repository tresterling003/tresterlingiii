import Link from "next/link";
import { Gamepad2, Gift, ListChecks, Package, PiggyBank, ShoppingBag, Sparkles, TreePine, Users, Wand2 } from "lucide-react";

const TILES = [
  { label: "Wishlists", icon: ListChecks, color: "red" },
  { label: "Family Lists", icon: Users, color: "green" },
  { label: "Gift Finder", icon: Wand2, color: "purple" },
  { label: "Gift Tracker", icon: Package, color: "blue" },
  { label: "Budget", icon: PiggyBank, color: "gold" },
  { label: "Games", icon: Gamepad2, color: "teal" },
  { label: "Shop", icon: ShoppingBag, color: "pink" },
  { label: "Ornament Match", icon: Sparkles, color: "orange" },
  { label: "Present Catch", icon: Gift, color: "green" },
];

const POINTS = [
  { t: "Lists with the details", d: "Sizes, colors, photos and a link to buy. Or a gift idea that leaves room for a surprise." },
  { t: "Secret claims", d: "Tap “I'll get this” so nobody doubles up. The person getting the gift never sees who's buying it." },
  { t: "Budget and tracking", d: "Plan who you're shopping for, track what's bought and wrapped, and stay on budget." },
  { t: "Games and coins", d: "Play quick Christmas games to earn coins, then unlock themes, effects and avatars." },
];

export default function Landing() {
  return (
    <div className="page-bg min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-[max(20px,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-onaccent shadow-soft"><TreePine /></span>
          <span className="text-2xl font-semibold">Christmas HQ</span>
          <Link href="/sign-in" className="ml-auto inline-flex h-11 items-center rounded-full bg-card px-5 font-medium shadow-soft transition hover:shadow-pop">Sign in</Link>
        </header>
        <section className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="anim-rise">
            <h1 className="text-[44px] font-semibold leading-[1.05] sm:text-[60px]">Your family's Christmas, all in one place.</h1>
            <p className="mt-4 max-w-xl text-xl text-muted">Share wishlists, secretly claim gifts, plan your budget and play a few games along the way.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/sign-up" className="inline-flex h-14 items-center rounded-full bg-accent px-8 text-lg font-medium text-onaccent shadow-soft transition hover:brightness-110 active:scale-95">Get started free</Link>
              <Link href="/sign-in" className="inline-flex h-14 items-center rounded-full bg-card px-8 text-lg font-medium shadow-soft transition hover:shadow-pop">I have an account</Link>
            </div>
          </div>
          <div className="panel rounded-xl3 p-4 shadow-pop sm:p-6" aria-hidden>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {TILES.map((t, i) => (
                <div key={t.label} className="tile-press anim-rise grid aspect-square place-items-center rounded-[22px] shadow-tile" style={{ background: `var(--c-${t.color}-bg)`, color: `var(--c-${t.color}-fg)`, animationDelay: `${i * 50}ms` }}>
                  <span className="flex flex-col items-center gap-1.5 text-center">
                    <t.icon className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={2.2} />
                    <span className="text-[13px] font-semibold sm:text-[16px]">{t.label}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((p) => (
            <div key={p.t} className="rounded-[22px] bg-card p-5 shadow-soft">
              <h2 className="text-xl font-semibold">{p.t}</h2>
              <p className="mt-2 text-muted">{p.d}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
