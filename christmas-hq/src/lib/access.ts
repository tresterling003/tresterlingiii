import "server-only";
import type { Db } from "./db";
import { forbidden } from "./errors";

/** True when the two users are the same person or share at least one family. */
export async function sharesFamily(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const row = await db.one(
    "select 1 from members m1 join members m2 on m1.family_id = m2.family_id where m1.user_id = $1 and m2.user_id = $2 limit 1",
    [a, b],
  );
  return Boolean(row);
}

export async function assertShares(db: Db, a: string, b: string) {
  if (!(await sharesFamily(db, a, b))) throw forbidden();
}

/** Everyone who shares a family with the user (excluding the user). */
export async function people(db: Db, uid: string) {
  return db.query<{ id: string; name: string; avatar: string; color: string }>(
    `select distinct u.id, u.name, u.avatar, u.color
       from members me join members m on m.family_id = me.family_id join users u on u.id = m.user_id
      where me.user_id = $1 and u.id <> $1 order by u.name`,
    [uid],
  );
}
