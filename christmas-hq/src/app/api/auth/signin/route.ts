import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { DUMMY_HASH, rateLimit, recordAttempt, startSession, verifyPassword } from "@/lib/auth";
import { AppError } from "@/lib/errors";

const Schema = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

export const POST = route(async (req) => {
  const b = await body(req, Schema);
  await rateLimit(`signin:${b.email}`, 8, 15);
  const u = await db.one<{ id: string; pw_hash: string }>("select id, pw_hash from users where email = $1", [b.email]);
  const ok = await verifyPassword(b.password, u?.pw_hash ?? DUMMY_HASH);
  if (!u || !ok) {
    await recordAttempt(`signin:${b.email}`);
    throw new AppError("bad_login", "That email and password don't match.", 401);
  }
  await startSession(u.id);
  return json({ ok: true });
});

export const dynamic = "force-dynamic";
