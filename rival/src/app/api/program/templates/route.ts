import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { templateSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, templateSchema);
  const r = await withUser(uid, (tx) => tx.one<{ id: string }>("select save_template($1) as id", [JSON.stringify(b)]));
  return json({ id: r!.id });
});
