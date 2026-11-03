import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { planSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, planSchema);
  await withUser(uid, (tx) => tx.query("select set_plan($1, $2, $3)", [b.date, b.category, b.targetMinutes]));
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const uid = await requireUserId();
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("invalid", "Invalid date.");
  await withUser(uid, (tx) => tx.query("select delete_plan($1)", [date]));
  return json({ ok: true });
});
