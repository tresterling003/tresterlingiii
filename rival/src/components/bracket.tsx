"use client";
import clsx from "clsx";
import { Crown } from "lucide-react";
import { TeamAvatar } from "./team-avatar";
import { fmtPts } from "@/lib/client";
import { memberMap } from "@/lib/snapshot";
import type { LeagueSnapshot, Matchup } from "@/lib/types";

export function Bracket({ s }: { s: LeagueSnapshot }) {
  const members = memberMap(s);
  const po = s.schedule.filter((m) => m.kind !== "regular");
  const rounds = Array.from(new Set(po.map((m) => m.round ?? 1))).sort((a, b) => a - b);
  const champ = s.history.find((h) => h.season === s.league.season);

  if (po.length === 0) {
    const n = Math.min(s.league.playoffTeams, s.members.filter((m) => m.active).length);
    return (
      <div className="px-4 py-6 text-sm text-fg-muted">
        {s.league.playoffTeams === 0
          ? "This league has no playoffs — the regular-season leader is crowned champion."
          : <>The top <span className="font-semibold text-fg">{n}</span> teams after Week {s.league.seasonWeeks} make the playoffs. Seeding is set when the regular season ends{s.league.seasonStart ? "" : " (season not started yet)"}.</>}
        <ol className="mt-4 flex flex-col gap-2">
          {s.standings.slice(0, n).map((r) => {
            const m = members.get(r.userId)!;
            return (
              <li key={r.userId} className="flex items-center gap-3">
                <span className="tnum w-6 font-display font-bold text-fg-faint">{r.rank}</span>
                <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} src={m.avatarUrl} size="xs" />
                <span className="text-sm">{m.teamName}</span>
                <span className="ml-auto text-xs text-fg-faint">projected seed</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const Slot = ({ id, seed, score, win, m }: { id: string | null; seed: number | null; score: number | null; win: boolean; m: Matchup }) => {
    const mem = id ? members.get(id) : null;
    return (
      <div className={clsx("flex h-10 items-center gap-2 px-3", win && "bg-lime-soft/50")}>
        <span className="tnum w-4 text-xs font-bold text-fg-faint">{seed ?? ""}</span>
        {mem ? <TeamAvatar abbr={mem.teamAbbr} color={mem.teamColor} src={mem.avatarUrl} size="xs" /> : null}
        <span className={clsx("min-w-0 flex-1 truncate text-xs", mem ? "font-semibold" : "text-fg-faint", id === s.me && "text-lime")}>
          {mem?.teamName ?? "Bye"}
        </span>
        {mem && m.awayId && <span className="tnum text-xs font-bold text-fg-muted">{m.final || m.weekStart <= s.league.today ? fmtPts(score) : ""}</span>}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto px-4 py-4">
      <div className="flex min-w-max gap-6">
        {rounds.map((r) => {
          const ms = po.filter((m) => (m.round ?? 1) === r);
          const isFinal = ms.some((m) => m.kind === "championship");
          return (
            <div key={r} className="flex w-56 flex-col justify-around gap-4">
              <p className="eyebrow">{isFinal ? "Championship" : `Round ${r}`} · Wk {ms[0]?.week}</p>
              {ms.map((m) => (
                <div key={m.id} className={clsx("overflow-hidden rounded-md border divide-y divide-ink-700", isFinal ? "border-lime/40" : "border-ink-700")}>
                  <Slot id={m.homeId} seed={m.homeSeed} score={m.homeScore} win={m.final && m.winnerId === m.homeId} m={m} />
                  <Slot id={m.awayId} seed={m.awaySeed} score={m.awayScore} win={m.final && !!m.awayId && m.winnerId === m.awayId} m={m} />
                </div>
              ))}
            </div>
          );
        })}
        {champ && (
          <div className="flex w-48 flex-col justify-center">
            <p className="eyebrow mb-2">Champion</p>
            <div className="flex items-center gap-2 rounded-md border border-lime/40 bg-lime-soft px-3 py-3">
              <Crown className="h-5 w-5 text-lime" />
              <span className="truncate text-sm font-bold">{champ.championTeam}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
