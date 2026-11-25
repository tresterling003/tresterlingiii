import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AppError } from "./errors";

export const SESSION_COOKIE = "hq_session";
const SESSION_DAYS = 90;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
// Compared against when the email is unknown, so timing doesn't reveal which emails exist.
export const DUMMY_HASH = "$2a$11$p/0fmMmHFs/3XFNF.roJHueCdlpJdI4HH0FdAJGv7xsikBd7zthLC";

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [hashToken(token), userId, SESSION_DAYS],
  );
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await db.query("delete from sessions where token_hash = $1", [hashToken(token)]);
  cookies().delete(SESSION_COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await db.one<{ user_id: string }>(
    "select user_id from sessions where token_hash = $1 and expires_at > now()",
    [hashToken(token)],
  );
  return row?.user_id ?? null;
}

export async function requireUser(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new AppError("unauthenticated", "Please sign in again.", 401);
  return id;
}

/** Allows `limit` failures per `minutes` for a key; throws when exceeded. */
export async function rateLimit(key: string, limit: number, minutes: number) {
  const row = await db.one<{ n: number }>(
    "select count(*)::int as n from attempts where key = $1 and at > now() - make_interval(mins => $2)",
    [key, minutes],
  );
  if ((row?.n ?? 0) >= limit) throw new AppError("rate_limited", "Too many tries. Wait a few minutes and try again.", 429);
}
export const recordAttempt = (key: string) => db.query("insert into attempts (key) values ($1)", [key]);
