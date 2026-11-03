import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { addDays } from "@/lib/dates";
import type { DayScore, Workout } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The caller's own activity: last 28 days of workouts + daily scores. */
export const GET = route(async (req) => {
  const uid = await requireUserId();
  const leagueId = req.nextUrl.searchParams.get("league");
  const league = leagueId && /^[0-9a-f-]{36}$/i.test(leagueId) ? leagueId : null;
  const data = await withUser(uid, async (tx) => {
    const { today } = (await tx.one<{ today: string }>("select rival_user_today($1)::text as today", [uid]))!;
    const from = addDays(today, -27);
    const workouts = await tx.query<Workout>(
      `select id, activity_type, category, activity_date, duration_min, steps, distance_km::float as distance_km,
              notes, source, created_at, updated_at
       from workouts where activity_date >= $1 order by activity_date desc, created_at desc`,
      [from],
    );
    const days = await tx.query<DayScore>("select * from my_day_scores($1, $2, $3)", [from, today, league]);
    const types = await tx.query("select type, label, category, needs_duration, needs_steps from activity_types order by sort");
    return { today, workouts, days, types };
  });
  return json(data);
});
