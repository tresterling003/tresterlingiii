import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const PUT = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({
    water_enabled: z.boolean(), water_target: z.number().int().min(1).max(30),
    protein_enabled: z.boolean(), protein_target: z.number().int().min(20).max(400),
  }));
  await withUser(uid, (tx) => tx.query("select set_habit_settings($1, $2, $3, $4)", [b.water_enabled, b.water_target, b.protein_enabled, b.protein_target]));
  return json({ ok: true });
});
