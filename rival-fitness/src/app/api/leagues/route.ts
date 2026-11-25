import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { leagueCreateSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, leagueCreateSchema);
  const r = await withUser(uid, (tx) =>
    tx.one<{ id: string }>("select create_league($1, $2, $3, $4, $5) as id", [
      b.name, b.maxMembers, b.seasonWeeks, b.playoffTeams, b.timezone,
    ]),
  );
  return json({ id: r!.id }, 201);
});
