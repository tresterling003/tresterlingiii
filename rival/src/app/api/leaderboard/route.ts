import { json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Coins earned from games by you and everyone you share a family with: this week and all-time. */
export const GET = route(async () => {
  const uid = await requireUser();
  const rows = await db.query(
    `with people as (
       select $1::uuid as id
       union select m.user_id from members me join members m on m.family_id = me.family_id where me.user_id = $1)
     select u.id, u.name, u.avatar, u.color,
            coalesce(sum(p.coins) filter (where p.created_at > date_trunc('week', now())), 0)::int as week,
            coalesce(sum(p.coins), 0)::int as total
       from people x join users u on u.id = x.id left join plays p on p.user_id = u.id
      group by u.id order by week desc, total desc, u.name limit 50`,
    [uid],
  );
  return json({ rows, me: uid });
});

export const dynamic = "force-dynamic";
