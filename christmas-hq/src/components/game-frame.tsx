"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { mutate } from "swr";
import { ChevronLeft, Coins, Play, RotateCcw, Trophy } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { GAMES, type GameKey } from "@/lib/catalog";
import { Button } from "./ui";

type Result = { coins: number; total: number; best: number; capped: boolean; todayLeft: number };

/**
 * Wraps a game: intro card → play → result card that submits the score and shows coins earned.
 * `children(finish)` renders the live game; call finish(score) when it ends.
 */
export function GameFrame({ game, color, icon, howTo, children }: {
  game: GameKey; color: string; icon: ReactNode; howTo: string;
  children: (finish: (score: number) => void) => ReactNode;
}) {
  const g = GAMES[game];
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const started = useRef(0);

  function start() {
    started.current = Date.now();
    setResult(null);
    setErr("");
    setRound((r) => r + 1);
    setPhase("play");
  }

  const finish = useCallback((s: number) => {
    const ms = Date.now() - started.current;
    setScore(s);
    setPhase("done");
    api<Result>("POST", "/api/games", { game, score: Math.min(s, g.maxScore), ms: Math.min(ms, g.maxMs) })
      .then((r) => { setResult(r); mutate("/api/me"); })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Couldn't save your score."));
  }, [game, g.maxScore, g.maxMs]);

  return (
    <div>
      <Link href="/games" className="mb-3 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><ChevronLeft className="h-5 w-5" />Games</Link>
      <div className="mx-auto max-w-3xl">
        {phase === "play" ? (
          <div key={round} className="anim-fade">{children(finish)}</div>
        ) : (
          <div className="anim-pop overflow-hidden rounded-xl3 bg-card shadow-pop">
            <div className="grid place-items-center gap-3 px-6 py-10 text-center" style={{ background: `var(--c-${color}-bg)`, color: `var(--c-${color}-fg)` }}>
              <span className="grid h-20 w-20 place-items-center rounded-[26px] bg-white/60 shadow-tile">{icon}</span>
              <h1 className="text-[34px] font-semibold leading-tight">{g.name}</h1>
              {phase === "intro" && <p className="max-w-md text-[17px] font-medium opacity-90">{howTo}</p>}
              {phase === "done" && <p className="text-[56px] font-semibold leading-none tabular-nums">{score}</p>}
            </div>
            <div className="grid gap-4 p-6 text-center">
              {phase === "intro" && <p className="text-muted">Earn up to {g.cap} coins a round. Daily limit applies across all games.</p>}
              {phase === "done" && (
                err ? <p className="font-medium text-accent">{err}</p> : !result ? <p className="text-muted">Saving your score…</p> : (
                  <div className="grid gap-2">
                    <p className="flex items-center justify-center gap-2 text-2xl font-semibold">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F7D774] text-[#8A6400]"><Coins className="h-5 w-5" /></span>
                      +{result.coins} coins
                    </p>
                    <p className="text-muted">
                      <Trophy className="mr-1 inline h-4 w-4" />Your best: <b className="text-ink">{result.best}</b> · You have <b className="text-ink">{result.total}</b> coins
                    </p>
                    {result.todayLeft <= 0 && <p className="text-[14px] text-muted">You've hit today's coin limit. Come back tomorrow for more!</p>}
                  </div>
                )
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="lg" onClick={start}>{phase === "intro" ? <><Play className="h-5 w-5" />Play</> : <><RotateCcw className="h-5 w-5" />Play again</>}</Button>
                {phase === "done" && <Link href="/shop" className="inline-flex h-14 items-center rounded-full bg-card px-7 text-lg font-medium shadow-soft transition hover:shadow-pop">Shop</Link>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Countdown hook: seconds left, calls onEnd once at zero. */
export function useCountdown(seconds: number, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const l = Math.max(0, seconds - Math.floor((Date.now() - t0) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        end.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}
