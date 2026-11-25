import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, z.object({
    kind: z.enum(["idea", "bug", "love"]),
    body: z.string().min(1, "Write a little something first.").max(2000),
    page: z.string().max(200).optional(),
  }));
  await withUser(uid, (tx) =>
    tx.query("select submit_feedback($1, $2, $3, $4)", [b.kind, b.body, b.page ?? null, req.headers.get("user-agent") ?? null]),
  );
  return json({ ok: true }, 201);
});
