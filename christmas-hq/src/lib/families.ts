import "server-only";
import { randomInt } from "node:crypto";
import type { Db } from "./db";
import { AppError } from "./errors";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join("");

/** Adds the user to the family with this invite code. Returns the family id. */
export async function joinByCode(db: Db, uid: string, code: string): Promise<string> {
  const f = await db.one<{ id: string }>("select id from families where code = $1", [code.trim().toUpperCase()]);
  if (!f) throw new AppError("not_found", "No family has that code. Check it and try again.", 404);
  const count = await db.one<{ n: number }>("select count(*)::int as n from members where family_id = $1", [f.id]);
  if ((count?.n ?? 0) >= 60) throw new AppError("full", "That family is full.", 400);
  await db.query("insert into members (family_id, user_id) values ($1, $2) on conflict do nothing", [f.id, uid]);
  return f.id;
}
