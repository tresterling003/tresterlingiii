"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Shuffle, SkipForward } from "lucide-react";
import { GameFrame, useCountdown } from "@/components/game-frame";
import { Button, inputCls } from "@/components/ui";

const WORDS = [
  "SANTA", "SLEIGH", "REINDEER", "PRESENT", "STOCKING", "SNOWMAN", "CANDY", "COOKIE", "TINSEL", "WREATH", "GARLAND", "MITTENS",
  "CAROL", "JINGLE", "WINTER", "FROSTY", "CHIMNEY", "ORNAMENT", "RIBBON", "COCOA", "EGGNOG", "ELVES", "NORTH", "STAR", "ANGEL",
  "HOLLY", "MERRY", "GIFTS", "SNOWFLAKE", "FIREPLACE", "PINE", "SCARF", "SLED", "BELLS", "GINGER", "MISTLETOE", "TREE", "LIGHTS",
  "TOYS", "WRAP", "BOW", "FAMILY", "FEAST", "JOLLY", "PEPPERMINT", "ICICLE", "WONDER", "NUTCRACKER", "SPRINKLES", "CHEER",
];

function scramble(w: string) {
  for (let n = 0; n < 10; n++) {
    const a = w.split("");
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const s = a.join("");
    if (s !== w) return s;
  }
  return w.split("").reverse().join("");
}

function Jumble({ finish }: { finish: (s: number) => void }) {
  const order = useMemo(() => [...WORDS].sort(() => Math.random() - 0.5), []);
  const [i, setI] = useState(0);
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [pop, setPop] = useState(false);
  const scoreRef = useRef(0);
  const left = useCountdown(60, () => finish(scoreRef.current));
  const word = order[i % order.length];
  const mixed = useMemo(() => scramble(word), [word]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (guess.trim().toUpperCase() === word) {
      scoreRef.current = Math.min(25, scoreRef.current + 1);
      setScore(scoreRef.current);
      setPop(true);
      setTimeout(() => setPop(false), 300);
      setGuess("");
      setI((x) => x + 1);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div className="rounded-xl3 bg-card p-5 shadow-pop sm:p-8">
      <div className="mb-6 flex items-center justify-between font-semibold">
        <span><span className={clsx("inline-block text-2xl tabular-nums transition", pop && "scale-125 text-good")}>{score}</span> <span className="text-muted">solved</span></span>
        <span className={clsx("text-2xl tabular-nums", left <= 10 && "text-accent")}>0:{String(left).padStart(2, "0")}</span>
      </div>
      <div className={clsx("mb-6 flex flex-wrap justify-center gap-2", shake && "animate-[pop-in_.3s]")} aria-live="polite" aria-label={`Scrambled word: ${mixed.split("").join(" ")}`}>
        {mixed.split("").map((ch, n) => (
          <span key={`${word}-${n}`} className="anim-pop grid h-12 w-10 place-items-center rounded-xl text-2xl font-semibold shadow-soft sm:h-14 sm:w-12 sm:text-3xl" style={{ background: "var(--c-blue-bg)", color: "var(--c-blue-fg)", animationDelay: `${n * 30}ms` }}>{ch}</span>
        ))}
      </div>
      <p className="mb-3 text-center text-muted">{word.length} letters</p>
      <form onSubmit={submit} className="mx-auto flex max-w-md gap-2">
        <input autoFocus value={guess} onChange={(e) => setGuess(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
          className={clsx(inputCls, "text-center text-xl font-semibold uppercase tracking-widest", shake && "border-accent")} aria-label="Your answer" />
        <Button type="submit">Go</Button>
      </form>
      <div className="mt-3 text-center">
        <Button variant="ghost" size="sm" onClick={() => { setGuess(""); setI((x) => x + 1); }}><SkipForward className="h-4 w-4" />Skip</Button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <GameFrame game="scramble" color="blue" icon={<Shuffle className="h-10 w-10" />} howTo="Unscramble as many Christmas words as you can in 60 seconds. Stuck? Skip it.">
      {(finish) => <Jumble finish={finish} />}
    </GameFrame>
  );
}
