import { route, json, parseBody } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getMe } from "@/lib/me";
import { profileSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const uid = await requireUserId();
  return json(await getMe(uid));
});

export const PATCH = route(async (req) => {
  const uid = await requireUserId();
  const b = await parseBody(req, profileSchema);
  await withUser(uid, (tx) => tx.query("select update_profile($1)", [JSON.stringify(b)]));
  return json(await getMe(uid));
});
