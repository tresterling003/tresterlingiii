import { ok } from "@/lib/server/http";
import { alertsConfigured, alertsStorageReady, googleConfigured, missingGoogleConfig } from "@/lib/server/env";
import { readDevicePaired, readSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** What's connected. Never returns tokens. */
export async function GET() {
  const s = readSession();
  return ok({
    google: {
      configured: googleConfigured(),
      missing: missingGoogleConfig(),
      connected: Boolean(s),
      email: s?.email ?? null,
      canMarkRead: s?.scopes.includes("https://www.googleapis.com/auth/gmail.modify") ?? false,
    },
    alerts: { configured: alertsConfigured(), needsStorage: !alertsStorageReady(), paired: alertsConfigured() && readDevicePaired() },
  });
}
