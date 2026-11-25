"use client";
import useSWR from "swr";
import { fetcher } from "./client";
import type { DayScore, MeResponse, Workout } from "./types";
import type { ProgramResponse, ProgressResponse, TodayResponse } from "./solo-types";

export function useMe() {
  return useSWR<MeResponse>("/api/me", fetcher, { revalidateOnFocus: true });
}

export type ActivityResponse = {
  today: string;
  workouts: Workout[];
  days: DayScore[];
  types: { type: string; label: string; category: string; needs_duration: boolean; needs_steps: boolean }[];
};

export function useActivity() {
  return useSWR<ActivityResponse>("/api/activity", fetcher);
}

export function useToday() {
  return useSWR<TodayResponse>("/api/today", fetcher, { revalidateOnFocus: true });
}

export function useProgram() {
  return useSWR<ProgramResponse>("/api/program", fetcher);
}

export function useProgress() {
  return useSWR<ProgressResponse>("/api/progress", fetcher);
}

/** Revalidate everything that depends on logged activity. */
export const ACTIVITY_KEYS = (k: unknown) =>
  typeof k === "string" && ["/api/today", "/api/activity", "/api/progress", "/api/me", "/api/program"].some((p) => k.startsWith(p));
