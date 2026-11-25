import { z } from "zod";
import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

type Ctx = { params: { id: string } };

export const POST = route<Ctx>(async (req, { params }) => {
  const uid = await requireUserId();
  const { body } = await parseBody(req, z.object({ body: z.string().max(280, "Keep it under 280 characters.") }));
  const r = await withUser(uid, (tx) => tx.one<{ id: string }>("select post_message($1, $2) as id", [params.id, body]));
  return json({ id: r!.id }, 201);
});
