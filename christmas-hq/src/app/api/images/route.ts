import { json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

/** Upload a product photo (the browser resizes it first). Body is the raw image. */
export const POST = route(async (req) => {
  const uid = await requireUser();
  const mime = (req.headers.get("content-type") ?? "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new AppError("invalid", "Use a JPEG, PNG or WebP image.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > 800_000) throw new AppError("too_big", "That photo is too large. Try a screenshot.");
  const n = await db.one<{ n: number }>("select count(*)::int as n from images where user_id = $1", [uid]);
  if ((n?.n ?? 0) >= 400) throw new AppError("limit", "You've uploaded a lot of photos. Delete some wishes first.");
  const row = await db.one<{ id: string }>("insert into images (user_id, mime, data) values ($1, $2, $3) returning id", [uid, mime, buf]);
  return json({ id: row!.id });
});

export const dynamic = "force-dynamic";
