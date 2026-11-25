import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { workoutUpdateSchema } from "@/lib/validation";

type Ctx = { params: { id: string } };

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("not_found", "Workout not found.", 404);
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  checkId(params.id);
  const b = await parseBody(req, workoutUpdateSchema);
  await withUser(uid, (tx) =>
    tx.query("select update_workout($1, $2, $3, $4, $5, $6, $7)", [
      params.id, b.type, b.date, b.durationMin ?? null, b.steps ?? null, b.distanceKm ?? null, b.notes ?? null,
    ]),
  );
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const uid = await requireUserId();
  checkId(params.id);
  await withUser(uid, (tx) => tx.query("select delete_workout($1)", [params.id]));
  return json({ ok: true });
});
