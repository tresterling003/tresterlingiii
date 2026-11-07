import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/server/http";
import { alertsConfigured, env } from "@/lib/server/env";
import { randomToken, safeEqual } from "@/lib/server/crypto";
import { alertsStore, rateLimit } from "@/lib/server/alerts-store";
import { readDevicePaired } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const Alert = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(1000).optional(),
  url: z.string().url().max(500).refine((u) => /^https?:/i.test(u), "http(s) only").optional(),
  source: z.string().trim().max(40).optional(),
});

/**
 * POST — authorised senders (e.g. an Apple Shortcut) push a personal alert.
 *   Authorization: Bearer <ALERTS_INGEST_TOKEN>
 *   { "title": "Leave for the dentist", "body": "...", "source": "Shortcuts" }
 */
export async function POST(req: NextRequest) {
  if (!alertsConfigured()) return apiError("not_configured", "ALERTS_INGEST_TOKEN is not set on the server.", 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`alerts:${ip}`, 30, 60_000)) return apiError("rate_limited", "Too many alerts; slow down.", 429);
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, env.alertsToken)) return apiError("unauthorized", "Invalid token", 401);
  const parsed = Alert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.issues[0]?.message ?? "Invalid alert", 400);
  const a = { id: randomToken(9), title: parsed.data.title, body: parsed.data.body ?? null, url: parsed.data.url ?? null, source: parsed.data.source || "Shortcuts", at: Date.now() };
  await alertsStore().add(a);
  return ok({ ok: true, id: a.id });
}

/** GET — this browser reads alerts, only after it has been paired. */
export async function GET(req: NextRequest) {
  if (!alertsConfigured()) return apiError("not_configured", "Alerts ingest isn't configured.", 503);
  if (!readDevicePaired()) return apiError("unauthorized", "Pair this device to read alerts.", 401);
  const since = Number(req.nextUrl.searchParams.get("since") || 0);
  return ok({ alerts: await alertsStore().list(Number.isFinite(since) ? since : 0) });
}

export async function DELETE(req: NextRequest) {
  if (!alertsConfigured() || !readDevicePaired()) return apiError("unauthorized", "Not paired", 401);
  const id = req.nextUrl.searchParams.get("id");
  if (id) await alertsStore().remove(id);
  else await alertsStore().clear();
  return ok({ ok: true });
}
