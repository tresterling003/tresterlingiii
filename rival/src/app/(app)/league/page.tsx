"use client";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Crown, Settings2, Trophy } from "lucide-react";
import { useApp } from "@/components/league-context";
import { PageError, PageHeader, PageSkeleton } from "@/components/page";
import { StandingsTable } from "@/components/standings";
import { Bracket } from "@/components/bracket";
import { InviteCard } from "@/components/invite-card";
import { TeamAvatar } from "@/components/team-avatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/states";
import { useLeague } from "@/lib/hooks";
import { fmtPts } from "@/lib/client";
import { addDays, rangeLabel } from "@/lib/dates";
import { memberMap } from "@/lib/snapshot";
import type { LeagueSnapshot } from "@/lib/types";

type Tab = "standings" | "schedule" | "playoffs" | "members" | "history";

function Schedule({ s }: { s: LeagueSnapshot }) {
  const [mine, setMine] = useState(true);
  const members = memberMap(s);
  const weeks = Array.from(new Set(s.schedule.map((m) => m.week))).sort((a, b) => a - b);
  if (weeks.length === 0) return <EmptyState title="No schedule yet" body="The schedule is generated when the commissioner starts the season." />;
  return (
    <div>
      <div className="px-4 py-4 sm:px-6">
        <Segmented size="sm" value={mine ? "mine" : "all"} onChange={(v) => setMine(v === "mine")} label="Filter"
          options={[{ value: "mine", label: "My games" }, { value: "all", label: "All games" }]} />
      </div>
      <ol>
        {weeks.map((w) => {
          const ms = s.schedule.filter((m) => m.week === w && (!mine || m.homeId === s.me || m.awayId === s.me));
          if (ms.length === 0) return null;
          const start = ms[0].weekStart;
          const current = w === s.league.currentWeek;
          return (
            <li key={w} className={clsx("border-t border-ink-700 px-4 py-4 sm:px-6", current && "bg-ink-800/60")}>
              <div className="mb-2 flex items-center gap-2">
                <p className="eyebrow">{w > s.league.seasonWeeks ? (ms[0].kind === "championship" ? "Championship" : `Playoffs R${ms[0].round}`) : `Week ${w}`} · {rangeLabel(start, addDays(start, 6))}</p>
                {current && <Badge tone="lime">Now</Badge>}
              </div>
              <ul className="flex flex-col gap-2">
                {ms.map((m) => {
                  const h = members.get(m.homeId), a = m.awayId ? members.get(m.awayId) : null;
                  const mineRow = m.homeId === s.me || m.awayId === s.me;
                  const result = m.final ? (m.isTie ? "T" : m.winnerId === s.me ? "W" : mineRow && m.awayId ? "L" : null) : null;
                  return (
                    <li key={m.id}>
                      <Link href={`/matchup?week=${w}&id=${m.id}`} className="focus-ring -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-ink-800">
                        <span className={clsx("min-w-0 flex-1 truncate", m.homeId === s.me && "font-bold")}>{h?.teamName}</span>
                        <span className="tnum w-24 shrink-0 text-center text-xs text-fg-muted">
                          {m.final ? `${fmtPts(m.homeScore)} – ${m.awayId ? fmtPts(m.awayScore) : "BYE"}` : m.awayId ? "vs" : "bye"}
                        </span>
                        <span className={clsx("min-w-0 flex-1 truncate text-right", m.awayId === s.me && "font-bold", !a && "text-fg-faint")}>{a?.teamName ?? "—"}</span>
                        {mine && <span className={clsx("w-5 text-right text-xs font-bold", result === "W" ? "text-lime" : result === "L" ? "text-danger" : "text-fg-muted")}>{result ?? ""}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Members({ s }: { s: LeagueSnapshot }) {
  const active = s.members.filter((m) => m.active);
  return (
    <ul className="divide-y divide-ink-700">
      {active.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{m.teamName}</p>
            <p className="truncate text-xs text-fg-muted">{m.displayName} · joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
          </div>
          {m.role === "commissioner" && <Badge tone="lime">Commish</Badge>}
          {m.id === s.me && m.role !== "commissioner" && <Badge>You</Badge>}
        </li>
      ))}
    </ul>
  );
}

function History({ s }: { s: LeagueSnapshot }) {
  if (s.history.length === 0)
    return <EmptyState icon={<Trophy className="h-5 w-5" />} title="No champions yet" body="Every season's champion is recorded here for bragging rights." />;
  return (
    <ul className="divide-y divide-ink-700">
      {s.history.map((h) => (
        <li key={h.season} className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <Crown className="h-6 w-6 shrink-0 text-lime" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Season {h.season}</p>
            <p className="truncate font-display text-xl font-bold uppercase italic">{h.championTeam ?? "—"}</p>
            {h.runnerUpTeam && <p className="text-xs text-fg-muted">def. {h.runnerUpTeam}{h.championScore !== null && h.runnerUpScore !== null ? ` · ${fmtPts(h.championScore)}–${fmtPts(h.runnerUpScore)}` : ""}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LeaguePage() {
  const { leagueId } = useApp();
  const { data: s, error, isLoading, mutate } = useLeague(leagueId);
  const [tab, setTab] = useState<Tab>("standings");
  if (isLoading && !s) return <PageSkeleton />;
  if (error) return <PageError error={error} retry={() => mutate()} />;
  if (!s) return <PageSkeleton />;
  const isComm = s.league.commissionerId === s.me;
  const statusLabel = { preseason: "Preseason", regular: `Regular season · ${s.league.seasonWeeks} weeks`, playoffs: "Playoffs", complete: "Season complete" }[s.league.status];
  const tabs: { value: Tab; label: string }[] = [
    { value: "standings", label: "Standings" }, { value: "schedule", label: "Schedule" },
    { value: "playoffs", label: "Playoffs" }, { value: "members", label: "Members" }, { value: "history", label: "History" },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow={`Season ${s.league.season} · ${statusLabel}`} title={s.league.name}
        action={isComm && (
          <Link href="/league/manage"><Button variant="outline" size="sm" icon={<Settings2 className="h-4 w-4" />}>Manage</Button></Link>
        )} />
      <div className="mb-6"><InviteCard code={s.league.code} leagueName={s.league.name} /></div>
      <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="League sections">
        <div className="flex gap-1 border-b border-ink-700">
          {tabs.map((t) => (
            <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
              className={clsx("focus-ring -mb-px h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors",
                tab === t.value ? "border-lime text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <section className="panel overflow-hidden" role="tabpanel">
        {tab === "standings" && (s.standings.length ? <StandingsTable s={s} /> : <EmptyState title="No teams yet" />)}
        {tab === "schedule" && <Schedule s={s} />}
        {tab === "playoffs" && <Bracket s={s} />}
        {tab === "members" && <Members s={s} />}
        {tab === "history" && <History s={s} />}
      </section>
      <p className="mt-4 text-xs text-fg-faint">Weeks run Monday–Sunday ({s.league.timezone}). Results lock at 12:00 AM Tuesday so late Sunday entries count.</p>
    </div>
  );
}
