import "server-only";
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "not_configured"
  | "not_connected"
  | "reauth_required"
  | "rate_limited"
  | "upstream_error"
  | "bad_request"
  | "unauthorized"
  | "forbidden";

export function apiError(code: ApiErrorCode, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function ok<T>(data: T, init?: { maxAge?: number }) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": init?.maxAge ? `private, max-age=${init.maxAge}` : "no-store" },
  });
}

/** Fetch with timeout + one retry with backoff on 429/5xx. */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
      if ((res.status === 429 || res.status >= 500) && attempt < 1) {
        attempt++;
        const ra = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) * 1000 : 800));
        continue;
      }
      return res;
    } finally {
      clearTimeout(t);
    }
  }
}
