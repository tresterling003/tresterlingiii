import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const PUT = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({ weekday: z.number().int().min(1).max(7), templateId: z.string().uuid().nullable() }));
  await withUser(uid, (tx) => tx.query("select set_program_day($1, $2)", [b.weekday, b.templateId]));
  return json({ ok: true });
});
