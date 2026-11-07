import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/server/http";
import { fetchDay } from "@/lib/server/google/calendar";
import { googleErrorResponse } from "@/lib/server/google/errors";

export const dynamic = "force-dynamic";

const Q = z.object({
  timeMin: z.string().datetime({ offset: true }),
  timeMax: z.string().datetime({ offset: true }),
  tz: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest) {
  const q = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return apiError("bad_request", "Invalid day window", 400);
  try {
    Intl.DateTimeFormat("en-US", { timeZone: q.data.tz });
  } catch {
    return apiError("bad_request", "Unknown time zone", 400);
  }
  try {
    return ok(await fetchDay(q.data.timeMin, q.data.timeMax, q.data.tz, q.data.date));
  } catch (e) {
    return googleErrorResponse(e);
  }
}
