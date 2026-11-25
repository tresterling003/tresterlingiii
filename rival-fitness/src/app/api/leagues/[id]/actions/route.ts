import { route, json, parseBody } from "@/lib/api";
import { randomBytes } from "node:crypto";
import { hashToken, requireUserId } from "@/lib/auth";
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
      case "reset_link": {
        // Raw token only ever exists in this response; the DB stores its hash.
        const token = randomBytes(24).toString("base64url");
        const row = await tx.one<{ exp: string }>("select create_reset_link($1, $2, $3) as exp", [id, b.userId, hashToken(token)]);
        return { url: `${req.nextUrl.origin}/reset/${token}`, expiresAt: row!.exp };
      }
    }
  });
  return json({ ok: true, result: Array.isArray(result) ? null : result });
});
