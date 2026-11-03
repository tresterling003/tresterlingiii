import type { NextRequest } from "next/server";
import { withUser } from "@/lib/db";

/**
 * Scheduled weekly processing (Vercel Cron, see vercel.json). Finalizes ended
 * weeks, seeds playoffs and crowns champions for every active league. The same
 * idempotent function also runs whenever a league is opened, so results are
 * correct even between cron runs.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const r = await withUser(null, (tx) => tx.one<{ n: number }>("select rival_advance_all() as n"));
  return Response.json({ advanced: r?.n ?? 0, at: new Date().toISOString() });
}
