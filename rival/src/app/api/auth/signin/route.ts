import bcrypt from "bcryptjs";
import { route, json, parseBody } from "@/lib/api";
import { startSession, verifyPassword } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { signInSchema } from "@/lib/validation";

// Compare against a real hash for unknown emails so response time doesn't
// reveal whether an account exists.
let dummy: string | undefined;
const dummyHash = () => (dummy ??= bcrypt.hashSync("rival-timing-equalizer", 11));

export const POST = route(async (req) => {
  const { email, password } = await parseBody(req, signInSchema);
  const result = await withUser(null, async (tx) => {
    const failures = (await tx.one<{ n: number }>("select auth_failure_count($1) as n", [email]))!.n;
    if (failures >= 8) return { limited: true as const };
    const row = await tx.one<{ user_id: string; password_hash: string }>("select * from auth_lookup($1)", [email]);
    return { limited: false as const, row };
  });
  if (result.limited) throw new AppError("rate_limited", "Too many attempts. Wait 15 minutes and try again.", 429);
  const ok = await verifyPassword(password, result.row?.password_hash ?? dummyHash());
  if (!result.row || !ok) {
    await withUser(null, (tx) => tx.query("select auth_note_failure($1)", [email]));
    throw new AppError("invalid_credentials", "That email and password don't match.", 401);
  }
  await startSession(result.row.user_id);
  return json({ ok: true });
});
