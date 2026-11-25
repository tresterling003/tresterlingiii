import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const uid = await requireUserId();
  const code = (req.nextUrl.searchParams.get("code") ?? "").slice(0, 20);
  const r = await withUser(uid, (tx) => tx.one("select * from league_preview($1)", [code]));
  if (!r) throw new AppError("invalid_code", "That invite code doesn't match any league.", 404);
  return json(r);
});
