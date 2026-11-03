"use client";
import useSWR, { useSWRConfig } from "swr";
import { useEffect, useRef, useState } from "react";
import { fetcher } from "./client";
import type { DayScore, LeagueSnapshot, MeResponse, Workout } from "./types";

export function useMe() {
  return useSWR<MeResponse>("/api/me", fetcher, { revalidateOnFocus: true });
}

export function useLeague(id: string | null | undefined, week?: number) {
  const key = id ? `/api/leagues/${id}${week ? `?week=${week}` : ""}` : null;
  return useSWR<LeagueSnapshot>(key, fetcher, { keepPreviousData: true, revalidateOnFocus: true });
}

export type ActivityResponse = {
  today: string;
  workouts: Workout[];
  days: DayScore[];
  types: { type: string; label: string; category: string; needs_duration: boolean; needs_steps: boolean }[];
};

export function useActivity(leagueId: string | null | undefined) {
  return useSWR<ActivityResponse>(`/api/activity${leagueId ? `?league=${leagueId}` : ""}`, fetcher);
}

export type SyncState = "connecting" | "live" | "offline";

/**
 * Subscribes to the league's live stream. When any member logs activity (or
 * the league changes), every open device revalidates its league, activity and
 * profile data within ~2 seconds.
 */
export function useLiveSync(leagueId: string | null | undefined): SyncState {
  const { mutate } = useSWRConfig();
  const [state, setState] = useState<SyncState>("connecting");
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!leagueId || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let disposed = false;

    const refresh = () =>
      mutate((key) => typeof key === "string" && (key.startsWith(`/api/leagues/${leagueId}`) || key.startsWith("/api/activity") || key === "/api/me"));

    const connect = () => {
      if (disposed) return;
      es = new EventSource(`/api/leagues/${leagueId}/stream`);
      es.addEventListener("version", (e) => {
        attempts = 0;
        setState("live");
        const v = (e as MessageEvent).data as string;
        if (last.current !== null && last.current !== v) refresh();
        last.current = v;
      });
      es.addEventListener("gone", () => {
        es?.close();
        mutate("/api/me");
      });
      es.onerror = () => {
        // Server closes every ~55s; EventSource reconnects on its own. If the
        // connection is actually down, back off and show "offline".
        if (es?.readyState === EventSource.CLOSED) {
          attempts += 1;
          setState(attempts > 2 ? "offline" : "connecting");
          retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempts));
        } else {
          setState(navigator.onLine ? "connecting" : "offline");
        }
      };
    };
    connect();

    const onOnline = () => { refresh(); if (es?.readyState === EventSource.CLOSED) connect(); };
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearTimeout(retry);
      es?.close();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [leagueId, mutate]);

  return state;
}
