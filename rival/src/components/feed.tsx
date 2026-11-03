"use client";
import { TeamAvatar } from "./team-avatar";
import { ACTIVITY } from "@/lib/activity-meta";
import { relativeDay, timeAgo } from "@/lib/dates";
import { memberMap } from "@/lib/snapshot";
import type { LeagueSnapshot } from "@/lib/types";
import { EmptyState } from "./ui/states";
import { Activity } from "lucide-react";

export function LeagueFeed({ s, limit = 8 }: { s: LeagueSnapshot; limit?: number }) {
  const members = memberMap(s);
  const items = s.feed.slice(0, limit);
  if (items.length === 0)
    return <EmptyState icon={<Activity className="h-5 w-5" />} title="Quiet in here" body="When anyone in the league logs activity it shows up here instantly." />;
  return (
    <ul className="divide-y divide-ink-700">
      {items.map((f) => {
        const m = members.get(f.userId);
        if (!m) return null;
        const A = ACTIVITY[f.label] ?? Object.values(ACTIVITY).find((a) => a.label === f.label);
        const Icon = A?.icon;
        return (
          <li key={f.id} className="flex items-center gap-3 px-4 py-3">
            <TeamAvatar abbr={m.teamAbbr} color={m.teamColor} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold">{f.userId === s.me ? "You" : m.teamName}</span>
                <span className="text-fg-muted"> logged {f.label.toLowerCase()}</span>
                {f.durationMin ? <span className="text-fg-muted"> · {f.durationMin} min</span> : null}
              </p>
              <p className="text-xs text-fg-faint">{relativeDay(f.activityDate, s.league.today)} · {timeAgo(f.createdAt)} · self-reported</p>
            </div>
            {Icon && <Icon className="h-4 w-4 shrink-0 text-fg-faint" />}
          </li>
        );
      })}
    </ul>
  );
}
