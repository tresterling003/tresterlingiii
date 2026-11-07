"use client";
import { api, ApiError, poll, type PollHandle } from "../poll";
import { world } from "../store";
import { pushActivity } from "../actions";
import { load, save } from "../persist";
import type { SourceAdapter } from "./types";

interface StoredAlert {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  source: string;
  at: number;
}

/**
 * Personal alerts pushed by authorised senders (Apple Shortcuts, automations) into
 * POST /api/alerts. This browser only reads them after being paired.
 * It does NOT and cannot read iOS notifications, messages or calls.
 */
export function alertsAdapter(): SourceAdapter {
  let h: PollHandle | null = null;
  const fetchOnce = async (signal?: AbortSignal) => {
    const st = world.get().status?.alerts;
    if (!st?.configured || !st.paired) {
      world.set({ alertsRes: { status: "idle", data: null, error: { code: st?.configured ? "not_paired" : "not_configured", message: "" }, updatedAt: 0 } });
      return 5 * 60_000;
    }
    const since = load<number>("alertsSince", 0);
    try {
      const { alerts } = await api<{ alerts: StoredAlert[] }>(`/api/alerts?since=${since}`, { signal });
      world.set({ alertsRes: { status: "ready", data: true, error: null, updatedAt: Date.now() } });
      // First ever sync: import history quietly (no buzz) so old alerts don't flood the room.
      const quiet = !load<boolean>("alertsSynced", false);
      save("alertsSynced", true);
      if (alerts.length) {
        save("alertsSince", Math.max(...alerts.map((a) => a.at)));
        const items = alerts.reverse().map((a) => ({ source: "shortcuts", sourceLabel: a.source, channel: "phone" as const, title: a.title, body: a.body ?? undefined, url: a.url ?? undefined, at: a.at }));
        if (quiet) world.set((s) => ({ activity: [...items.map((i) => ({ ...i, id: `al_${i.at}`, read: true })), ...s.activity].slice(0, 100) }));
        else pushActivity(items);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      world.set({ alertsRes: { status: "error", data: null, error: { code: e instanceof ApiError ? e.code : "network", message: e instanceof Error ? e.message : "" }, updatedAt: 0 } });
      throw e;
    }
  };
  return {
    id: "shortcuts",
    label: "Shortcuts & automations",
    channels: ["phone"],
    start() {
      h = poll(fetchOnce, 30_000);
      return () => h?.stop();
    },
    refresh: () => (h ? h.now() : fetchOnce().then(() => undefined)),
  };
}
