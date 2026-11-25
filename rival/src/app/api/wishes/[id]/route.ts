import { body, json, route } from "@/lib/api";
import { db, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Wish } from "@/lib/schemas";
import { notFound } from "@/lib/errors";

type Ctx = { params: { id: string } };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const uid = await requireUser();
  const w = await body(req, Wish);
  await tx(async (db) => {
    if (w.image_id) {
      const img = await db.one("select 1 from images where id = $1 and user_id = $2", [w.image_id, uid]);
      if (!img) throw notFound("That photo");
    }
    const r = await db.one(
      `update wishes set kind=$3, top=$4, title=$5, brand=$6, category=$7, price=$8, size=$9, color=$10, links=$11, notes=$12,
              image_id=$13, updated_at=now() where id=$1 and user_id=$2 returning id`,
      [params.id, uid, w.kind, w.top, w.title, w.brand, w.category, w.price, w.size, w.color, w.links, w.notes, w.image_id],
    );
    if (!r) throw notFound("That wish");
  });
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const uid = await requireUser();
  const r = await db.one("delete from wishes where id = $1 and user_id = $2 returning id", [params.id, uid]);
  if (!r) throw notFound("That wish");
  return json({ ok: true });
});

export const dynamic = "force-dynamic";
