import { json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Leave a family. An empty family is deleted. */
export const DELETE = route<{ params: { id: string } }>(async (_req, { params }) => {
  const uid = await requireUser();
  await tx(async (db) => {
    await db.query("delete from members where family_id = $1 and user_id = $2", [params.id, uid]);
    await db.query("delete from families f where f.id = $1 and not exists (select 1 from members m where m.family_id = f.id)", [params.id]);
  });
  return json({ ok: true });
});

export const dynamic = "force-dynamic";
