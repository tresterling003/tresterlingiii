import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/server/http";
import { markRead } from "@/lib/server/google/gmail";
import { googleErrorResponse } from "@/lib/server/google/errors";

export const dynamic = "force-dynamic";

/** Explicit "Mark as read" from the inbox. Never called automatically. */
export async function POST(req: NextRequest) {
  const body = z.object({ id: z.string().min(1).max(64) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Missing message id", 400);
  try {
    await markRead(body.data.id);
    return ok({ ok: true });
  } catch (e) {
    return googleErrorResponse(e);
  }
}
