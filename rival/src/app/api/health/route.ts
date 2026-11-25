import { json, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async () => {
  try {
    await db.one("select 1");
    return json({ ok: true, db: "connected" });
  } catch {
    return json({ ok: false, db: "unreachable" }, 503);
  }
});

export const dynamic = "force-dynamic";
