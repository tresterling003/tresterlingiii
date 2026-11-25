import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { withUser } from "./db";
import { AppError } from "./errors";

export const SESSION_COOKIE = "rival_session";
const SESSION_DAYS = 60;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Creates a DB session and sets the httpOnly cookie. Only the SHA-256 of the token is stored. */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const ua = headers().get("user-agent") ?? "";
  await withUser(null, (tx) =>
    tx.query("select auth_create_session($1, $2, $3)", [userId, hashToken(token), ua]),
  );
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await withUser(null, (tx) => tx.query("select auth_end_session($1)", [hashToken(token)]));
  }
  cookies().delete(SESSION_COOKIE);
}

export function currentTokenHash(): string | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Resolves the signed-in user id from the session cookie, or null. */
export async function getUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await withUser(null, (tx) =>
    tx.one<{ uid: string | null }>("select auth_session_user($1) as uid", [hashToken(token)]),
  );
  return row?.uid ?? null;
}

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new AppError("unauthenticated", "Your session has expired. Please sign in again.", 401);
  return id;
}
