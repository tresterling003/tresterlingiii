import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const { code } = await parseBody(req, z.object({ code: z.string().max(20) }));
  const r = await withUser(uid, (tx) => tx.one<{ id: string | null }>("select join_league($1) as id", [code]));
  if (!r?.id) throw new AppError("invalid_code", "That invite code doesn't match any league.", 404);
  return json({ id: r.id });
});
