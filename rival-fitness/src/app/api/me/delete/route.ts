import { z } from "zod";
import { cookies } from "next/headers";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Permanently erase the caller's account. Requires the current password. */
export const POST = route(async (req) => {
  const uid = await requireUserId();
  const { password } = await parseBody(req, z.object({ password: z.string().min(1, "Enter your password.").max(200) }));
  const row = await withUser(uid, (tx) => tx.one<{ h: string }>("select auth_get_password_hash() as h"));
  if (!row?.h || !(await verifyPassword(password, row.h))) {
    throw new AppError("invalid_credentials", "That password is incorrect.", 400);
  }
  await withUser(uid, (tx) => tx.query("select delete_account()"));
  cookies().delete(SESSION_COOKIE);
  return json({ ok: true });
});
