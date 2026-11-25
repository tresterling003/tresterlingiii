import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { httpsUrl } from "@/lib/schemas";
import { notFound } from "@/lib/errors";

type Ctx = { params: { id: string } };
const Patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  price_cents: z.number().int().min(0).max(10_000_000).optional(),
  status: z.enum(["planned", "bought", "wrapped", "given"]).optional(),
  link: httpsUrl.optional(),
  notes: z.string().trim().max(400).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const uid = await requireUser();
  const b = await body(req, Patch);
  const sets: string[] = [];
  const vals: unknown[] = [params.id, uid];
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return json({ ok: true });
  const r = await db.one(`update gifts set ${sets.join(", ")} where id = $1 and giver_id = $2 returning id`, vals);
  if (!r) throw notFound("That gift");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const uid = await requireUser();
  const r = await db.one("delete from gifts where id = $1 and giver_id = $2 returning id", [params.id, uid]);
  if (!r) throw notFound("That gift");
  return json({ ok: true });
});

export const dynamic = "force-dynamic";
