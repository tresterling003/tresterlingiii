"use client";
import clsx from "clsx";
import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";
import { TeamAvatar } from "./team-avatar";
import { Badge, LiveDot } from "./ui/states";
import { fmtPts } from "@/lib/client";
import { rangeLabel } from "@/lib/dates";
import { memberMap, orient, recordOf } from "@/lib/snapshot";
import type { LeagueSnapshot, MatchupView, WeekStatus } from "@/lib/types";

export function StatusBadge({ status, daysLeft }: { status: WeekStatus; daysLeft?: number }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-2 text-2xs font-bold uppercase text-lime">
        <LiveDot /> Live{typeof daysLeft === "number" && ` · ${daysLeft <= 0.5 ? "Final day" : `${Math.ceil(daysLeft)} days left`}`}
      </span>
    );
  if (status === "pending") return <Badge tone="warn">Final Tuesday</Badge>;
  if (status === "final") return <Badge>Final</Badge>;
  return <Badge tone="info">Upcoming</Badge>;
}

function Side({
  s, uid, score, proj, align, leading, isMe, seed, winner,
}: {
  s: LeagueSnapshot; uid: string | null; score: number | null; proj: number | null; align: "left" | "right";
  leading: boolean; isMe: boolean; seed: number | null; winner: boolean;
}) {
  const members = memberMap(s);
  const m = uid ? members.get(uid) : null;
  const right = align === "right";
  if (!m) {
    return (
      <div className={clsx("flex flex-1 flex-col gap-4", right && "items-end text-right")}>
        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-ink-600 text-xs font-bold text-fg-faint">BYE</div>
        <div>
          <p className="font-display text-xl font-bold italic text-fg-muted">Bye week</p>
          <p className="text-xs text-fg-faint">Points still count toward PF</p>
        </div>
      </div>
    );
  }
  return (
    <div className={clsx("flex min-w-0 flex-1 flex-col gap-4", right && "items-end text-right")}>
      <div className={clsx("flex items-center gap-3", right && "flex-row-reverse")}>
        <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} size="lg" ring={isMe} />
        {winner && <Crown className="h-5 w-5 text-lime" aria-label="Winner" />}
      </div>
      <div className="min-w-0 max-w-full">
        <p className="truncate font-display text-xl font-bold uppercase italic leading-6 tracking-wide sm:text-2xl">{m.teamName}</p>
        <p className="mt-1 truncate text-xs text-fg-muted">
          {seed ? <span className="font-semibold text-fg">#{seed} · </span> : null}
          {recordOf(s, m.id)} · {m.displayName}{!m.active && " · left league"}
        </p>
      </div>
      <div>
        <p className={clsx("tnum font-display text-score font-bold sm:text-score-lg", leading ? "text-fg" : "text-fg-muted")}
          data-testid={isMe ? "my-score" : "opp-score"}>
          {fmtPts(score)}
        </p>
        <div className={clsx("mt-2 h-1 w-12 rounded-full", isMe ? "bg-lime" : "bg-transparent", right && "ml-auto")} />
        {proj !== null && (
          <p className="tnum mt-2 text-xs text-fg-faint">Proj <span className="font-semibold text-fg-muted">{fmtPts(proj)}</span></p>
        )}
      </div>
    </div>
  );
}

export function WinProbBar({ left, leftLabel, rightLabel }: { left: number; leftLabel: string; rightLabel: string }) {
  const pct = Math.round(left * 100);
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="tnum font-semibold">{leftLabel} {pct}%</span>
        <span className="eyebrow">Win probability</span>
        <span className="tnum font-semibold text-fg-muted">{100 - pct}% {rightLabel}</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${leftLabel} ${pct}% to win`}>
        <div className="h-full rounded-l-full bg-lime transition-[width] duration-700" style={{ width: `${pct}%` }} />
        <div className="h-full flex-1 rounded-r-full bg-ink-600" />
      </div>
    </div>
  );
}

/** Full-size matchup scoreboard. */
export function Scoreboard({ s, m }: { s: LeagueSnapshot; m: MatchupView }) {
  const o = orient(m, s.me);
  const members = memberMap(s);
  const left = members.get(o.leftId);
  const right = o.rightId ? members.get(o.rightId) : null;
  const lScore = o.leftScore, rScore = o.rightScore ?? 0;
  const final = m.status === "final";
  return (
    <section className="panel overflow-hidden" aria-label="Matchup scoreboard">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3 sm:px-6">
        <p className="eyebrow">{s.week?.label} · {s.week && rangeLabel(s.week.start, s.week.end)}</p>
        <StatusBadge status={m.status} daysLeft={s.week?.daysLeft} />
      </div>
      <div className="flex items-start gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <Side s={s} uid={o.leftId} score={lScore} proj={o.leftProj} align="left" leading={lScore >= rScore}
          isMe={o.leftId === s.me} seed={o.leftSeed} winner={final && m.winnerId === o.leftId} />
        <div className="pt-16 font-display text-sm font-bold italic text-fg-faint sm:pt-20">VS</div>
        <Side s={s} uid={o.rightId} score={o.rightId ? rScore : null} proj={o.rightProj} align="right"
          leading={rScore >= lScore} isMe={o.rightId === s.me} seed={o.rightSeed} winner={final && !!o.rightId && m.winnerId === o.rightId} />
      </div>
      {(o.leftWin !== null || final || (m.status === "live" && o.rightId)) && (
        <div className="border-t border-ink-700 px-4 py-4 sm:px-6">
          {final ? (
            <p className="text-sm font-semibold">
              {m.isTie ? "Tie game." : m.winnerId ? `${members.get(m.winnerId)?.teamName} win${m.awayId ? ` by ${fmtPts(Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0)))}` : " (bye)"}.` : "Bye week complete."}
            </p>
          ) : o.leftWin !== null && left && right ? (
            <WinProbBar left={o.leftWin} leftLabel={left.teamAbbr} rightLabel={right.teamAbbr} />
          ) : (
            <p className="text-xs text-fg-faint">Projections and win probability appear after 3 days of league activity.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Compact row used in league-wide matchup lists and the home dashboard. */
export function MatchupRow({ s, m, href }: { s: LeagueSnapshot; m: MatchupView; href?: string }) {
  const members = memberMap(s);
  const o = orient(m, s.me);
  const rows = [
    { id: o.leftId, score: o.leftScore, seed: o.leftSeed },
    { id: o.rightId, score: o.rightScore, seed: o.rightSeed },
  ];
  const max = Math.max(o.leftScore, o.rightScore ?? 0);
  const body = (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {rows.map((r, i) => {
          const mem = r.id ? members.get(r.id) : null;
          const won = m.status === "final" && m.winnerId === r.id && !!r.id;
          return (
            <div key={i} className="flex items-center gap-3">
              {mem ? <TeamAvatar abbr={mem.teamAbbr} color={mem.teamColor} size="sm" />
                : <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-dashed border-ink-600 text-[10px] font-bold text-fg-faint">BYE</span>}
              <span className={clsx("min-w-0 flex-1 truncate text-sm", r.id === s.me ? "font-bold" : "font-medium", !mem && "text-fg-faint")}>
                {r.seed ? <span className="mr-1 text-fg-faint">{r.seed}</span> : null}
                {mem?.teamName ?? "Bye"}
                {r.id === s.me && <span className="ml-2 text-2xs font-bold uppercase text-lime">You</span>}
              </span>
              {mem && (
                <span className={clsx("tnum font-display text-xl font-bold", (r.score ?? 0) >= max ? "text-fg" : "text-fg-muted", won && "text-lime")}>
                  {fmtPts(r.score)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" />}
    </div>
  );
  return href ? (
    <Link href={href} className="focus-ring block rounded-md transition-colors hover:bg-ink-800">{body}</Link>
  ) : body;
}
