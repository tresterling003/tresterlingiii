"use client";
import useSWR from "swr";
import { fetcher } from "./client";
import type { Me } from "./types";

export function useMe() {
  return useSWR<Me>("/api/me", fetcher, { revalidateOnFocus: true });
}
