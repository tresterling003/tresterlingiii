"use client";
import { api } from "../poll";
import { world, type ConnectionStatus } from "../store";

export async function loadStatus(): Promise<ConnectionStatus | null> {
  try {
    const s = await api<ConnectionStatus>("/api/status");
    world.set({ status: s });
    return s;
  } catch {
    world.set({ status: null });
    return null;
  }
}
