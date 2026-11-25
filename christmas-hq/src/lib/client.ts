"use client";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown, raw?: Blob): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: raw ? { "content-type": raw.type } : body !== undefined ? { "content-type": "application/json" } : undefined,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("offline", "You seem to be offline. Check your connection.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && !url.startsWith("/api/auth")) {
      window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(err.code ?? "error", err.message ?? "Something went wrong.", res.status);
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>("GET", url);

/** Resizes an image in the browser to fit within `max` px and returns a JPEG. */
export async function shrinkImage(file: File, max = 900, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => bad(new Error("That file couldn't be read as an image."));
      el.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob) throw new Error("Your browser couldn't process the image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const centsFrom = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "store";
  }
};
