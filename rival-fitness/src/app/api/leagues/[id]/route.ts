import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { buildSnapshot } from "@/lib/league";
import { leagueUpdateSchema } from "@/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const GET = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  const w = Number(req.nextUrl.searchParams.get("week"));
  return json(await buildSnapshot(uid, params.id, Number.isInteger(w) && w > 0 ? w : undefined));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  const b = await parseBody(req, leagueUpdateSchema);
  await withUser(uid, (tx) => tx.query("select update_league($1, $2)", [params.id, JSON.stringify(b)]));
  return json({ ok: true });
});

/** Commissioner only: permanently delete the league. Body: { confirmName }. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  const { confirmName } = await parseBody(req, z.object({ confirmName: z.string().max(60) }));
  await withUser(uid, (tx) => tx.query("select delete_league($1, $2)", [params.id, confirmName]));
  return json({ ok: true });
});
