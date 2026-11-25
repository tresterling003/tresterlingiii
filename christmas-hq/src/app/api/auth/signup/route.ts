import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { hashPassword, rateLimit, recordAttempt, startSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { joinByCode } from "@/lib/families";

const Schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(40),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
  code: z.string().trim().toUpperCase().optional(),
});

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  await rateLimit(`signup:${ip}`, 20, 60);
  const b = await body(req, Schema);
  const hash = await hashPassword(b.password);
  const user = await tx(async (db) => {
    const exists = await db.one("select 1 from users where email = $1", [b.email]);
    if (exists) throw new AppError("email_taken", "An account with that email already exists. Sign in instead.", 409);
    const u = await db.one<{ id: string }>("insert into users (email, name, pw_hash) values ($1, $2, $3) returning id", [b.email, b.name, hash]);
    return u!;
  });
  await recordAttempt(`signup:${ip}`);
  await startSession(user.id);
  let family: string | null = null;
  if (b.code) family = await tx((db) => joinByCode(db, user.id, b.code!)).catch(() => null);
  return json({ ok: true, family });
});

export const dynamic = "force-dynamic";
