"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bell, CandyCane, Cookie, Gift, Heart, Snowflake, Sparkles, Star, TreePine, type LucideIcon } from "lucide-react";
import { GameFrame } from "@/components/game-frame";

const ICONS: { icon: LucideIcon; color: string }[] = [
  { icon: TreePine, color: "green" }, { icon: Gift, color: "red" }, { icon: Star, color: "gold" }, { icon: Snowflake, color: "blue" },
  { icon: Bell, color: "orange" }, { icon: CandyCane, color: "pink" }, { icon: Cookie, color: "orange" }, { icon: Heart, color: "purple" },
];

function Memory({ finish }: { finish: (s: number) => void }) {
  const deck = useMemo(() => {
    const d = [...ICONS.keys(), ...ICONS.keys()];
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }, []);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    if (done.size === deck.length) {
      const score = Math.max(0, 100 - Math.max(0, moves - 8) * 5);
      const t = setTimeout(() => finish(score), 600);
      return () => clearTimeout(t);
    }
  }, [done, deck.length, moves, finish]);

  function flip(i: number) {
    if (lock.current || open.includes(i) || done.has(i)) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      lock.current = true;
      const [a, b] = next;
      setTimeout(() => {
        if (deck[a] === deck[b]) setDone((d) => new Set([...d, a, b]));
        setOpen([]);
        lock.current = false;
      }, deck[a] === deck[b] ? 350 : 800);
    }
  }

  return (
    <div className="rounded-xl3 bg-card p-4 shadow-pop sm:p-6">
      <div className="mb-4 flex items-center justify-between font-semibold">
        <span><span className="text-2xl tabular-nums">{done.size / 2}</span> <span className="text-muted">of 8 pairs</span></span>
        <span><span className="text-2xl tabular-nums">{moves}</span> <span className="text-muted">moves</span></span>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:gap-3">
        {deck.map((k, i) => {
          const up = open.includes(i) || done.has(i);
          const { icon: Icon, color } = ICONS[k];
          return (
            <button key={i} onClick={() => flip(i)} aria-label={up ? "Ornament" : "Hidden card"} className="aspect-square [perspective:600px]">
              <span className={clsx("relative block h-full w-full rounded-2xl transition-transform duration-500 [transform-style:preserve-3d]", up && "[transform:rotateY(180deg)]")}>
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-accent shadow-soft [backface-visibility:hidden]" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.14) 0 8px, transparent 8px 16px)" }}>
                  <Sparkles className="h-6 w-6 text-white/70" />
                </span>
                <span className={clsx("absolute inset-0 grid place-items-center rounded-2xl shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)]", done.has(i) && "ring-4 ring-good/40")} style={{ background: `var(--c-${color}-bg)`, color: `var(--c-${color}-fg)` }}>
                  <Icon className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={2.2} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <GameFrame game="memory" color="orange" icon={<Sparkles className="h-10 w-10" />} howTo="Flip two ornaments at a time to find matching pairs. Fewer moves means more coins.">
      {(finish) => <Memory finish={finish} />}
    </GameFrame>
  );
}
