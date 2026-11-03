import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const POST = route(async () => {
  const uid = await requireUserId();
  const r = await withUser(uid, (tx) => tx.one<{ ts: string }>("select take_pledge() as ts"));
  return json({ pledgedAt: r!.ts });
});
