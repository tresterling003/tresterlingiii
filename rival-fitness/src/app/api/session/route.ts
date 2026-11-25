import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { logSchema } from "@/lib/validation";

/** Autosave of an in-progress workout (checklist, weights, reps). */
export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), templateId: z.string().uuid(), exercises: logSchema }));
  await withUser(uid, (tx) => tx.query("select save_session($1, $2, $3)", [b.date, b.templateId, JSON.stringify(b.exercises)]));
  return json({ ok: true });
});
