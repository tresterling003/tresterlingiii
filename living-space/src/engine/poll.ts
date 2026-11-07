"use client";

export interface PollHandle {
  stop(): void;
  now(): Promise<void>;
}

/**
 * Visibility- and network-aware polling with backoff.
 * `fn` returns an optional delay override (ms), e.g. a server-provided retry-after.
 */
export function poll(fn: (signal: AbortSignal) => Promise<number | void>, intervalMs: number): PollHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ctrl: AbortController | null = null;
  let stopped = false;
  let failures = 0;
  let running: Promise<void> | null = null;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(run, ms);
  };

  async function run(): Promise<void> {
    if (stopped) return;
    if (document.hidden || !navigator.onLine) return; // resumed by listeners below
    if (running) return running;
    ctrl?.abort();
    ctrl = new AbortController();
    running = (async () => {
      try {
        const override = await fn(ctrl!.signal);
        failures = 0;
        schedule(typeof override === "number" ? override : intervalMs);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        failures++;
        schedule(Math.min(intervalMs * 2 ** failures, 15 * 60_000));
      } finally {
        running = null;
      }
    })();
    return running;
  }

  const wake = () => {
    if (!document.hidden && navigator.onLine) run();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  run();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    },
    now: () => run(),
  };
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "same-origin", headers: { Accept: "application/json", ...(init?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string } }).error;
    throw new ApiError(e?.code ?? "upstream_error", e?.message ?? `Request failed (${res.status})`, res.status, (json as { error?: Record<string, unknown> }).error ?? {});
  }
  return json as T;
}
