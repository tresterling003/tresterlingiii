import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { leagueActionSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

export const POST = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  const b = await parseBody(req, leagueActionSchema);
  const id = params.id;
  const result = await withUser(uid, async (tx) => {
    switch (b.action) {
      case "start":
        return tx.query("select start_season($1, $2)", [id, b.when]);
      case "new_season":
        return tx.query("select new_season($1)", [id]);
      case "regenerate_invite":
        return tx.one("select regenerate_invite($1) as code", [id]);
      case "leave":
        return tx.query("select leave_league($1)", [id]);
      case "remove":
        return tx.query("select remove_member($1, $2)", [id, b.userId]);
      case "transfer":
        return tx.query("select transfer_commissioner($1, $2)", [id, b.userId]);
    }
  });
  return json({ ok: true, result: Array.isArray(result) ? null : result });
});
