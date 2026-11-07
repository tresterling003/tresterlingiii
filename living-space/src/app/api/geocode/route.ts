import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/server/http";
import { geocode } from "@/lib/server/weather";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) return apiError("bad_request", "Type at least two letters", 400);
  try {
    return ok({ results: await geocode(q) });
  } catch (e) {
    return apiError("upstream_error", e instanceof Error ? e.message : "Search unavailable", 502);
  }
}
