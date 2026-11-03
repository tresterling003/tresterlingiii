"use client";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { CalendarDays, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Segmented } from "./ui/form";
import { useToast } from "./ui/toast";
import { InviteCard } from "./invite-card";
import { TeamAvatar } from "./team-avatar";
import { api, ApiError } from "@/lib/client";
import type { LeagueSnapshot } from "@/lib/types";

export function PreseasonPanel({ s }: { s: LeagueSnapshot }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [when, setWhen] = useState<"this_week" | "next_week">("this_week");
  const [busy, setBusy] = useState(false);
  const isComm = s.league.commissionerId === s.me;
  const active = s.members.filter((m) => m.active);

  async function start() {
    setBusy(true);
    try {
      await api("POST", `/api/leagues/${s.league.id}/actions`, { action: "start", when });
      await mutate((k) => typeof k === "string" && k.startsWith(`/api/leagues/${s.league.id}`));
      toast({ kind: "success", title: "Season started", body: "Matchups are set. Good luck." });
    } catch (e) {
      toast({ kind: "error", title: "Couldn't start the season", body: e instanceof ApiError ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="panel overflow-hidden">
        <div className="border-b border-ink-700 px-4 py-4 sm:px-6">
          <p className="eyebrow mb-1">Season {s.league.season} · Preseason</p>
          <p className="text-sm text-fg-muted">Send the code to friends and family. When everyone&rsquo;s in, the commissioner starts the season and matchups are generated automatically.</p>
        </div>
        <div className="px-4 py-6 sm:px-6"><InviteCard code={s.league.code} leagueName={s.league.name} compact /></div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-4 sm:px-6">
          <p className="eyebrow flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Teams</p>
          <p className="tnum text-xs font-semibold text-fg-muted" data-testid="member-count">{active.length} / {s.league.maxMembers}</p>
        </div>
        <ul className="divide-y divide-ink-700">
          {active.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.teamName}{m.id === s.me && <span className="ml-2 text-2xs font-bold uppercase text-lime">You</span>}</p>
                <p className="truncate text-xs text-fg-muted">{m.displayName}{m.role === "commissioner" && " · Commissioner"}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isComm ? (
        <section className="panel p-4 sm:p-6">
          <p className="eyebrow mb-4 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Start the season</p>
          <Segmented className="w-full" value={when} onChange={setWhen} label="Season start"
            options={[{ value: "this_week", label: "This week" }, { value: "next_week", label: "Next Monday" }]} />
          <p className="mt-4 text-xs text-fg-faint">
            {when === "this_week"
              ? "Week 1 is the current Monday–Sunday. Activity already logged this week counts."
              : "Week 1 begins next Monday."} {s.league.seasonWeeks} regular-season weeks{s.league.playoffTeams ? `, then a ${s.league.playoffTeams}-team playoff` : ""}.
          </p>
          <Button className="mt-6" size="lg" block loading={busy} disabled={active.length < 2} onClick={start} data-testid="start-season">
            {active.length < 2 ? "Waiting for a rival to join" : "Start season"}
          </Button>
        </section>
      ) : (
        <p className="text-center text-sm text-fg-muted">Waiting for the commissioner to start the season. Log activity anytime — it counts once Week 1 begins.</p>
      )}
    </div>
  );
}
