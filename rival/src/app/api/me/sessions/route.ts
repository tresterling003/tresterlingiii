import { route, json } from "@/lib/api";
import { currentTokenHash, requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

/** Sign out every other device. */
export const DELETE = route(async () => {
  const uid = await requireUserId();
  const keep = currentTokenHash()!;
  const r = await withUser(uid, (tx) => tx.one<{ n: number }>("select auth_end_other_sessions($1) as n", [keep]));
  return json({ ended: r?.n ?? 0 });
});
