import "server-only";
import { withUser } from "./db";
import type { MeResponse } from "./types";

export async function getMe(uid: string): Promise<MeResponse | null> {
  return withUser(uid, async (tx) => {
    const account = await tx.one<MeResponse["account"]>("select * from my_account()");
    if (!account) return null;
    const { today } = (await tx.one<{ today: string }>("select rival_user_today($1)::text as today", [uid]))!;
    const leagues = await tx.query<MeResponse["leagues"][number]>(
      `select l.id, l.name, l.status, m.role,
              (select count(*)::int from league_members x where x.league_id = l.id and x.active) as members
       from league_members m join leagues l on l.id = m.league_id
       where m.user_id = $1 and m.active order by m.joined_at`,
      [uid],
    );
    const goals = await tx.query<{ active_minutes: number; steps: number; effective_from: string }>(
      "select active_minutes, steps, effective_from from goals order by effective_from desc limit 5",
    );
    const current = goals.find((g) => g.effective_from <= today);
    const pending = goals.find((g) => g.effective_from > today) ?? null;
    const plans = await tx.query<MeResponse["plans"][number]>(
      "select plan_date, category, target_minutes from planned_workouts where plan_date >= $1 order by plan_date",
      [today],
    );
    return {
      account, today, leagues,
      goal: current ?? { active_minutes: 30, steps: 8000, effective_from: null },
      pendingGoal: pending, plans,
    };
  });
}
