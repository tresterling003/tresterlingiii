import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { workoutSchema } from "@/lib/validation";
import type { DayScore } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Log a workout. The body carries raw activity data only — the server never
 * accepts points. `requestId` makes retries/double-taps idempotent.
 * Responds with the freshly computed score for that day.
 */
export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, workoutSchema);
  const leagueId = req.nextUrl.searchParams.get("league");
  const result = await withUser(uid, async (tx) => {
    const row = await tx.one<{ id: string }>("select log_workout($1, $2, $3, $4, $5, $6, $7) as id", [
      b.requestId, b.type, b.date, b.durationMin ?? null, b.steps ?? null, b.distanceKm ?? null, b.notes ?? null,
    ]);
    const day = await tx.one<DayScore>("select * from my_day_scores($1, $1, $2)", [
      b.date, leagueId && /^[0-9a-f-]{36}$/i.test(leagueId) ? leagueId : null,
    ]);
    return { id: row!.id, day };
  });
  return json(result, 201);
});
