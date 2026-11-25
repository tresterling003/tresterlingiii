"use client";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("offline", "You appear to be offline. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
      window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(err.code ?? "error", err.message ?? "Something went wrong.", res.status);
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>("GET", url);

export function uuid(): string {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // RFC4122 v4 fallback for browsers without randomUUID (e.g. non-secure contexts)
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x: number) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function fmtPts(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  return n.toFixed(1);
}
