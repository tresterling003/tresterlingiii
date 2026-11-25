import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newCode } from "@/lib/families";
import { AppError } from "@/lib/errors";

export const POST = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, z.object({ name: z.string().trim().min(1, "Name your family.").max(40) }));
  const fam = await tx(async (db) => {
    const n = await db.one<{ n: number }>("select count(*)::int as n from members where user_id = $1", [uid]);
    if ((n?.n ?? 0) >= 10) throw new AppError("limit", "You can be in up to 10 families.");
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const f = await db.one<{ id: string }>(
        "insert into families (name, code, created_by) values ($1, $2, $3) on conflict (code) do nothing returning id",
        [b.name, code, uid],
      );
      if (f) {
        await db.query("insert into members (family_id, user_id) values ($1, $2)", [f.id, uid]);
        return { id: f.id, code };
      }
    }
    throw new Error("could not allocate family code");
  });
  return json(fam);
});

export const dynamic = "force-dynamic";
