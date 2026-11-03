"use client";
import clsx from "clsx";
import { TeamAvatar } from "./team-avatar";
import { fmtPts } from "@/lib/client";
import { memberMap } from "@/lib/snapshot";
import type { LeagueSnapshot } from "@/lib/types";

export function StandingsTable({ s, compact }: { s: LeagueSnapshot; compact?: boolean }) {
  const members = memberMap(s);
  const cut = Math.min(s.league.playoffTeams, s.standings.length);
  const rows = compact ? s.standings.slice(0, 5) : s.standings;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="text-left text-2xs font-bold uppercase text-fg-faint">
            <th className="w-8 py-2 pl-4 font-bold">#</th>
            <th className="py-2 font-bold">Team</th>
            <th className="py-2 text-right font-bold">W-L{s.standings.some((r) => r.ties) ? "-T" : ""}</th>
            <th className="py-2 pl-4 text-right font-bold">PF</th>
            {!compact && <th className="hidden py-2 pl-4 text-right font-bold sm:table-cell">PA</th>}
            <th className="w-4 pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const m = members.get(r.userId);
            if (!m) return null;
            const me = r.userId === s.me;
            return (
              <tr key={r.userId}
                className={clsx("border-t border-ink-700", me && "bg-ink-800", cut > 0 && i === cut - 1 && !compact && "border-b-2 border-b-ink-600")}>
                <td className={clsx("tnum border-l-2 py-3 pl-4 font-display text-base font-bold", me ? "border-lime text-lime" : "border-transparent text-fg-muted")}>{r.rank}</td>
                <td className="py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} src={m.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className={clsx("truncate", me ? "font-bold" : "font-semibold")}>{m.teamName}</p>
                      {!compact && <p className="truncate text-xs text-fg-faint">{m.displayName}</p>}
                    </div>
                  </div>
                </td>
                <td className="tnum py-3 text-right font-semibold">
                  {r.wins}-{r.losses}{s.standings.some((x) => x.ties) ? `-${r.ties}` : ""}
                </td>
                <td className="tnum py-3 pl-4 text-right text-fg-muted">{fmtPts(r.pointsFor)}</td>
                {!compact && <td className="tnum hidden py-3 pl-4 text-right text-fg-muted sm:table-cell">{fmtPts(r.pointsAgainst)}</td>}
                <td className="pr-4">
                  {cut > 0 && i < cut && <span className="ml-2 block h-1.5 w-1.5 rounded-full bg-lime" title="Playoff position" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!compact && cut > 0 && (
        <p className="flex items-center gap-2 px-4 py-3 text-xs text-fg-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-lime" /> Playoff position · top {cut} after Week {s.league.seasonWeeks}. Ties break on points for.
        </p>
      )}
    </div>
  );
}
