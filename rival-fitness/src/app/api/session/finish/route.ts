import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { newPrs } from "@/lib/solo";
import { logSchema } from "@/lib/validation";
import type { DayScore } from "@/lib/types";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), templateId: z.string().uuid(),
    durationMin: z.number().int().min(1).max(240), requestId: z.string().uuid(), exercises: logSchema,
  }));
  const r = await withUser(uid, async (tx) => {
    const s = await tx.one<{ id: string }>("select save_session($1, $2, $3) as id", [b.date, b.templateId, JSON.stringify(b.exercises)]);
    await tx.query("select finish_session($1, $2, $3, $4)", [b.date, b.templateId, b.durationMin, b.requestId]);
    const prs = await newPrs(tx, s!.id);
    const day = await tx.one<DayScore>("select * from my_day_scores($1, $1, null)", [b.date]);
    return { prs, day };
  });
  return json(r);
});
