import { body, json, route } from "@/lib/api";
import { db, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertShares } from "@/lib/access";
import { Wish } from "@/lib/schemas";
import { AppError, notFound } from "@/lib/errors";

/** A person's wishlist. Claims are shown to everyone except the list owner. */
export const GET = route(async (req) => {
  const uid = await requireUser();
  const target = req.nextUrl.searchParams.get("user") || uid;
  if (!/^[0-9a-f-]{36}$/i.test(target)) throw notFound("That person");
  return json(
    await tx(async (db) => {
      await assertShares(db, uid, target);
      const owner = await db.one("select id, name, avatar, color, about from users where id = $1", [target]);
      if (!owner) throw notFound("That person");
      const mine = target === uid;
      const wishes = await db.query(
        `select w.id, w.kind, w.top, w.title, w.brand, w.category, w.price, w.size, w.color, w.links, w.notes, w.image_id, w.created_at,
                case when $2 then null else (
                  select json_build_object('mine', g.giver_id = $3, 'status', g.status, 'gift_id', g.id,
                    'by', case when exists (select 1 from members a join members b on a.family_id = b.family_id
                                             where a.user_id = $3 and b.user_id = g.giver_id) then u.name else null end)
                    from gifts g join users u on u.id = g.giver_id where g.wish_id = w.id) end as claim
           from wishes w where w.user_id = $1
          order by w.top desc, w.created_at desc`,
        [target, mine, uid],
      );
      return { owner, mine, wishes };
    }),
  );
});

export const POST = route(async (req) => {
  const uid = await requireUser();
  const w = await body(req, Wish);
  const row = await tx(async (db) => {
    const n = await db.one<{ n: number }>("select count(*)::int as n from wishes where user_id = $1", [uid]);
    if ((n?.n ?? 0) >= 200) throw new AppError("limit", "Your list is full (200 wishes).");
    if (w.image_id) {
      const img = await db.one("select 1 from images where id = $1 and user_id = $2", [w.image_id, uid]);
      if (!img) throw notFound("That photo");
    }
    return db.one(
      `insert into wishes (user_id, kind, top, title, brand, category, price, size, color, links, notes, image_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [uid, w.kind, w.top, w.title, w.brand, w.category, w.price, w.size, w.color, w.links, w.notes, w.image_id],
    );
  });
  return json(row);
});

export const dynamic = "force-dynamic";
