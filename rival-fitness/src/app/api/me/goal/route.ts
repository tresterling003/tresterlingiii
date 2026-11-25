import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { goalSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, goalSchema);
  const r = await withUser(uid, (tx) =>
    tx.one<{ eff: string }>("select set_goal($1, $2)::text as eff", [b.activeMinutes, b.steps]),
  );
  return json({ effectiveFrom: r!.eff });
});
