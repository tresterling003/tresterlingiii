import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, ok } from "@/lib/server/http";
import { env } from "@/lib/server/env";
import { readSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Hand the signed-in Google session to the user's own Living Space desktop app.
 *
 * Google blocks sign-in inside embedded app browsers, so the desktop app can't run the OAuth
 * flow itself. Instead, while signed in on the website, the user generates a one-time code here
 * and pastes it into the desktop app, which stores the same *encrypted* session cookie for this
 * site. The code contains no readable token: it's the sealed cookie, which only this server can
 * open. "Disconnect" revokes the Google grant, which stops every linked copy.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== env.appUrl && origin !== req.nextUrl.origin) return apiError("forbidden", "Cross-site request", 403);
  if (!readSession()) return apiError("not_connected", "Connect Google on this site first.", 401);
  const jar = cookies();
  const payload = {
    v: 1,
    origin: env.appUrl || req.nextUrl.origin,
    g: jar.get("ls_google")?.value ?? null,
    d: jar.get("ls_device")?.value ?? null,
  };
  return ok({ code: "lsdesk1." + Buffer.from(JSON.stringify(payload)).toString("base64url") });
}
