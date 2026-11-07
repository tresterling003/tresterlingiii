import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/server/http";
import { alertsConfigured, env } from "@/lib/server/env";
import { safeEqual } from "@/lib/server/crypto";
import { rateLimit } from "@/lib/server/alerts-store";
import { clearDevicePaired, writeDevicePaired } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Pair this browser by proving knowledge of the ingest token once. The token itself is not stored client-side. */
export async function POST(req: NextRequest) {
  if (!alertsConfigured()) return apiError("not_configured", "ALERTS_INGEST_TOKEN is not set on the server.", 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`pair:${ip}`, 5, 10 * 60_000)) return apiError("rate_limited", "Too many attempts. Wait a few minutes.", 429);
  const body = z.object({ token: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !safeEqual(body.data.token, env.alertsToken)) return apiError("unauthorized", "That token doesn't match.", 401);
  writeDevicePaired();
  return ok({ ok: true });
}

export async function DELETE() {
  clearDevicePaired();
  return ok({ ok: true });
}
