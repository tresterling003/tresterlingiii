import type { MailMessage } from "./types";

export type PileTier = 0 | 1 | 2 | 3;

/** 0 → clean floor · 1–5 → a few envelopes · 6–20 → a stack · 21+ → overflowing. */
export function pileTier(unread: number): PileTier {
  if (unread <= 0) return 0;
  if (unread <= 5) return 1;
  if (unread <= 20) return 2;
  return 3;
}

/** Number of envelope sprites to draw for a count (bounded so the pile never covers the room). */
export function envelopeCount(unread: number): number {
  if (unread <= 0) return 0;
  if (unread <= 5) return unread;
  if (unread <= 20) return 6 + Math.round(((unread - 6) / 14) * 8);
  return Math.min(26, 15 + Math.round(Math.log2(unread - 19) * 3));
}

export interface MailSyncState {
  /** Stable Gmail message ids we have already shown. */
  seen: string[];
  /** Highest internalDate observed. Older messages are never treated as "deliveries". */
  highWater: number;
  initialised: boolean;
}

export const EMPTY_SYNC: MailSyncState = { seen: [], highWater: 0, initialised: false };

/**
 * Work out which unread messages are *newly delivered* versus merely still unread.
 *
 * - On the very first sync everything is treated as existing backlog (no delivery animation).
 * - Afterwards a message counts as new only if we have never seen its id AND it is newer than
 *   the high-water mark, so marking an old email unread again doesn't fake a delivery.
 */
export function diffArrivals(state: MailSyncState, messages: MailMessage[]): { arrivals: MailMessage[]; next: MailSyncState } {
  const seen = new Set(state.seen);
  const maxDate = messages.reduce((m, x) => Math.max(m, x.receivedAt), state.highWater);
  const arrivals = state.initialised
    ? messages.filter((m) => !seen.has(m.id) && m.receivedAt > state.highWater).sort((a, b) => a.receivedAt - b.receivedAt)
    : [];
  for (const m of messages) seen.add(m.id);
  // Keep the seen list bounded; ids older than the window can't reappear as "new" because of highWater.
  const keep = Array.from(seen).slice(-500);
  return { arrivals, next: { seen: keep, highWater: maxDate, initialised: true } };
}

/** "Ana Ruiz <ana@x.com>" → { name: "Ana Ruiz", email: "ana@x.com" } */
export function parseFrom(raw: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}
