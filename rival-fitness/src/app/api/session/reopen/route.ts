import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), templateId: z.string().uuid() }));
  await withUser(uid, (tx) => tx.query("select reopen_session($1, $2)", [b.date, b.templateId]));
  return json({ ok: true });
});
