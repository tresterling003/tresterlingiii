import { json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Recent wishlist activity from family. Never includes gift claims. */
export const GET = route(async () => {
  const uid = await requireUser();
  const rows = await db.query(
    `select w.id, w.title, w.kind, w.created_at, u.id as user_id, u.name, u.avatar, u.color
       from wishes w join users u on u.id = w.user_id
      where w.user_id in (select m.user_id from members me join members m on m.family_id = me.family_id where me.user_id = $1)
        and w.user_id <> $1 and w.created_at > now() - interval '30 days'
      order by w.created_at desc limit 12`,
    [uid],
  );
  return json({ items: rows });
});

export const dynamic = "force-dynamic";
