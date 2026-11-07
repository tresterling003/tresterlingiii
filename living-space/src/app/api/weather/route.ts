import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/server/http";
import { getWeather } from "@/lib/server/weather";

export const dynamic = "force-dynamic";

const Q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

export async function GET(req: NextRequest) {
  const q = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return apiError("bad_request", "Invalid coordinates", 400);
  try {
    const { data } = await getWeather(q.data.lat, q.data.lon, q.data.units);
    return ok(data, { maxAge: 300 });
  } catch (e) {
    return apiError("upstream_error", e instanceof Error ? e.message : "Weather unavailable", 502);
  }
}
