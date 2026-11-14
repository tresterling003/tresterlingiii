import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Ctx = { params: { id: string } };

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const uid = await requireUserId();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new AppError("not_found", "Workout not found.", 404);
  await withUser(uid, (tx) => tx.query("select delete_template($1)", [params.id]));
  return json({ ok: true });
});
