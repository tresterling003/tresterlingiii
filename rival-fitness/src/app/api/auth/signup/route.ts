import { route, json, parseBody } from "@/lib/api";
import { hashPassword, startSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const b = await parseBody(req, signUpSchema);
  const hash = await hashPassword(b.password);
  const row = await withUser(null, (tx) =>
    tx.one<{ id: string }>("select auth_signup($1, $2, $3, $4, $5, $6, $7) as id", [
      b.email, hash, b.displayName, b.teamName, b.teamAbbr, b.teamColor, b.timezone,
    ]),
  );
  await startSession(row!.id);
  return json({ ok: true }, 201);
});
