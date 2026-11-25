import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { hashPassword, hashToken, startSession } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const POST = route(async (req) => {
  const b = await parseBody(req, z.object({
    token: z.string().min(20).max(100),
    password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
  }));
  const hash = await hashPassword(b.password);
  const r = await withUser(null, (tx) =>
    tx.one<{ uid: string }>("select auth_use_reset($1, $2) as uid", [hashToken(b.token), hash]),
  );
  await startSession(r!.uid);
  return json({ ok: true });
});
