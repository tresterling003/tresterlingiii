import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Serves a profile photo to its owner and league-mates only. URLs carry ?v=<timestamp>, so caching is safe. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const uid = await getUserId();
  if (!uid) return new Response("unauthenticated", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("not found", { status: 404 });
  const row = await withUser(uid, (tx) =>
    tx.one<{ image: Buffer; content_type: string }>("select image, content_type from get_avatar($1)", [params.id]),
  );
  if (!row) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(row.image), {
    headers: {
      "content-type": row.content_type,
      "cache-control": "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'",
    },
  });
}
