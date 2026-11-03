import { route, json, parseBody } from "@/lib/api";
import { hashPassword, requireUserId, verifyPassword } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { passwordSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, passwordSchema);
  const row = await withUser(uid, (tx) => tx.one<{ h: string }>("select auth_get_password_hash() as h"));
  if (!row?.h || !(await verifyPassword(b.current, row.h))) {
    throw new AppError("invalid_credentials", "Your current password is incorrect.", 400);
  }
  const hash = await hashPassword(b.next);
  await withUser(uid, (tx) => tx.query("select auth_set_password($1)", [hash]));
  return json({ ok: true });
});
