import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertShares, people } from "@/lib/access";
import { Gift } from "@/lib/schemas";
import { AppError, notFound } from "@/lib/errors";

/** The signed-in person's gift plan: only ever the giver's own rows. */
export const GET = route(async () => {
  const uid = await requireUser();
  return json(
    await tx(async (db) => {
      const gifts = await db.query(
        `select g.id, g.recipient_id, g.wish_id, g.title, g.price_cents, g.status, g.link, g.notes, g.created_at
           from gifts g where g.giver_id = $1 order by g.created_at`,
        [uid],
      );
      const ppl = await people(db, uid);
      const budgets = await db.query<{ recipient_id: string; cents: number }>(
        "select recipient_id, cents from person_budgets where giver_id = $1",
        [uid],
      );
      const me = await db.one<{ budget_cents: number }>("select budget_cents from users where id = $1", [uid]);
      return { gifts, people: ppl, budgets, budget_cents: me?.budget_cents ?? 0 };
    }),
  );
});

export const POST = route(async (req) => {
  const uid = await requireUser();
  const g = await body(req, Gift);
  const row = await tx(async (db) => {
    let recipient = g.recipient_id;
    if (g.wish_id) {
      const w = await db.one<{ user_id: string }>("select user_id from wishes where id = $1", [g.wish_id]);
      if (!w) throw notFound("That wish");
      recipient = w.user_id;
      const taken = await db.one("select 1 from gifts where wish_id = $1", [g.wish_id]);
      if (taken) throw new AppError("claimed", "Someone is already getting this one.", 409);
    }
    if (recipient === uid) throw new AppError("invalid", "You can't plan a gift for yourself.");
    await assertShares(db, uid, recipient);
    const n = await db.one<{ n: number }>("select count(*)::int as n from gifts where giver_id = $1", [uid]);
    if ((n?.n ?? 0) >= 300) throw new AppError("limit", "Your gift list is full.");
    return db.one(
      `insert into gifts (giver_id, recipient_id, wish_id, title, price_cents, status, link, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [uid, recipient, g.wish_id, g.title, g.price_cents, g.status, g.link, g.notes],
    );
  });
  return json(row);
});

export const dynamic = "force-dynamic";
