import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { STARTERS } from "@/lib/starters";

/** Adds a starter program's workouts and fills the weekly schedule. */
export const POST = route(async (req) => {
  const uid = await requireUserId();
  const { key } = await parseBody(req, z.object({ key: z.string().max(20) }));
  const starter = STARTERS.find((s) => s.key === key);
  if (!starter) throw new AppError("not_found", "Unknown starter program.", 404);
  await withUser(uid, async (tx) => {
    const ids: Record<string, string> = {};
    for (const t of starter.templates) {
      const r = await tx.one<{ id: string }>("select save_template($1) as id", [JSON.stringify(t)]);
      ids[t.key] = r!.id;
    }
    for (let d = 0; d < 7; d++) {
      const k = starter.schedule[d];
      await tx.query("select set_program_day($1, $2)", [d + 1, k ? ids[k] : null]);
    }
  });
  return json({ ok: true });
});
