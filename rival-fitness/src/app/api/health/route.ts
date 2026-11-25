import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await withUser(null, (tx) => tx.one<{ now: string }>("select rival_now() as now"));
    return Response.json({ ok: true, db: "connected", serverTime: r?.now });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
