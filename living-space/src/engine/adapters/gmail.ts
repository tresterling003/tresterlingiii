"use client";
import type { MailSnapshot } from "@/domain/types";
import { diffArrivals, EMPTY_SYNC, type MailSyncState } from "@/domain/mail";
import { api, ApiError, poll, type PollHandle } from "../poll";
import { world } from "../store";
import { cue, pushActivity, toast } from "../actions";
import { load, save } from "../persist";
import type { SourceAdapter } from "./types";

/** Live Gmail: polls the server route; detects genuine deliveries by stable message id. */
export function gmailAdapter(): SourceAdapter {
  let h: PollHandle | null = null;
  const fetchOnce = async (signal?: AbortSignal) => {
    const prev = world.get().mail;
    world.set({ mail: { ...prev, status: prev.data ? "ready" : "loading" } });
    try {
      const data = await api<MailSnapshot>("/api/gmail", { signal });
      const sync = load<MailSyncState>("mailSync", EMPTY_SYNC);
      const { arrivals, next } = diffArrivals(sync, data.messages);
      save("mailSync", next);
      world.set({ mail: { status: "ready", data, error: null, updatedAt: Date.now() } });
      if (arrivals.length) announceDelivery(arrivals.length, arrivals[arrivals.length - 1].from, false);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      const err = e instanceof ApiError ? { code: e.code, message: e.message, missing: e.extra.missing as string[] | undefined } : { code: "network", message: "Couldn't reach the server." };
      world.set((s) => ({ mail: { ...s.mail, status: "error", error: err } }));
      if (e instanceof ApiError && e.code === "rate_limited") return 120_000;
      if (e instanceof ApiError && (e.code === "not_connected" || e.code === "not_configured" || e.code === "reauth_required")) return 10 * 60_000;
      throw e;
    }
  };
  return {
    id: "gmail",
    label: "Gmail",
    channels: ["computer"],
    start() {
      h = poll(fetchOnce, 60_000);
      return () => h?.stop();
    },
    refresh: () => (h ? h.now() : fetchOnce().then(() => undefined)),
  };
}

/** Shared by live + demo: door animation, pile update, resident reaction, quiet toast. */
export function announceDelivery(n: number, from: string, sample: boolean) {
  world.set((s) => ({ pulses: { ...s.pulses, door: Date.now(), doorCount: n } }));
  cue("mail");
  toast({
    title: n === 1 ? `A letter from ${from}` : `${n} new letters`,
    body: sample ? "Sample mail" : "Gmail",
    panel: "inbox",
    tone: "mail",
  });
  pushActivity([{ source: "gmail", sourceLabel: sample ? "Gmail (sample)" : "Gmail", channel: "computer", title: n === 1 ? `New email from ${from}` : `${n} new emails`, at: Date.now(), sample }]);
}
