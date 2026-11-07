"use client";
import type { SourceAdapter } from "./types";

const active = new Map<string, SourceAdapter>();
const stops = new Map<string, () => void>();

export function startAdapters(list: SourceAdapter[]) {
  stopAdapters();
  for (const a of list) {
    active.set(a.id, a);
    stops.set(a.id, a.start());
  }
}
export function stopAdapters() {
  stops.forEach((s) => s());
  stops.clear();
  active.clear();
}
export async function refreshSource(id?: string) {
  const targets = id ? [active.get(id)] : Array.from(active.values());
  await Promise.all(targets.map((a) => a?.refresh?.().catch(() => undefined)));
}
export function activeAdapters() {
  return Array.from(active.values()).map((a) => ({ id: a.id, label: a.label, channels: a.channels }));
}
