import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    water: z.number().int().min(0).max(60), protein: z.number().int().min(0).max(1000),
  }));
  await withUser(uid, (tx) => tx.query("select log_habits($1, $2, $3)", [b.date, b.water, b.protein]));
  return json({ ok: true });
});
