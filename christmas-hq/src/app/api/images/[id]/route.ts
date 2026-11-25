import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sharesFamily } from "@/lib/access";
import { notFound } from "@/lib/errors";

export const GET = route<{ params: { id: string } }>(async (_req, { params }) => {
  const uid = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw notFound("That photo");
  const img = await tx(async (db) => {
    const r = await db.one<{ user_id: string; mime: string; data: Buffer }>("select user_id, mime, data from images where id = $1", [params.id]);
    if (!r || !(await sharesFamily(db, uid, r.user_id))) throw notFound("That photo");
    return r;
  });
  return new NextResponse(new Uint8Array(img.data), {
    headers: { "content-type": img.mime, "cache-control": "private, max-age=86400, immutable", "x-content-type-options": "nosniff" },
  });
});

export const dynamic = "force-dynamic";
