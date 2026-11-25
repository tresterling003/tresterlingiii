import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertShares } from "@/lib/access";

export const PUT = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, z.object({ recipient_id: z.string().uuid(), cents: z.number().int().min(0).max(10_000_000) }));
  await tx(async (db) => {
    await assertShares(db, uid, b.recipient_id);
    await db.query(
      `insert into person_budgets (giver_id, recipient_id, cents) values ($1,$2,$3)
       on conflict (giver_id, recipient_id) do update set cents = excluded.cents`,
      [uid, b.recipient_id, b.cents],
    );
  });
  return json({ ok: true });
});

export const dynamic = "force-dynamic";
