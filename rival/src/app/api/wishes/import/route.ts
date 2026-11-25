import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

/** Turns pasted lines from Notes into wishes. Lines starting with "idea:" become gift ideas. */
export const POST = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, z.object({ text: z.string().max(20_000) }));
  const lines = b.text
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*·◦▪☐☑✓✔\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!lines.length) throw new AppError("invalid", "Paste at least one line.");
  const n = await tx(async (db) => {
    const have = await db.one<{ n: number }>("select count(*)::int as n from wishes where user_id = $1", [uid]);
    const room = Math.max(0, 200 - (have?.n ?? 0));
    const take = lines.slice(0, room);
    for (const l of take) {
      const idea = /^idea\s*[:\-]\s*/i.test(l);
      const title = l.replace(/^idea\s*[:\-]\s*/i, "").slice(0, 120) || "Untitled";
      await db.query("insert into wishes (user_id, kind, title) values ($1, $2, $3)", [uid, idea ? "idea" : "exact", title]);
    }
    return take.length;
  });
  return json({ added: n });
});

export const dynamic = "force-dynamic";
