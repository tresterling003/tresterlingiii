import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { buildSnapshot } from "@/lib/league";
import { leagueUpdateSchema } from "@/lib/validation";

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
