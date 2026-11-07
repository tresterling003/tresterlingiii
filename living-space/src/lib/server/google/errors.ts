import "server-only";
import { apiError } from "../http";
import { NotConnected, ReauthRequired } from "./oauth";
import { googleConfigured, missingGoogleConfig } from "../env";

export class UpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Uniform error mapping for every Google-backed route. */
export function googleErrorResponse(e: unknown) {
  if (!googleConfigured()) return apiError("not_configured", "Google credentials are not configured on the server.", 503, { missing: missingGoogleConfig() });
  if (e instanceof NotConnected) return apiError("not_connected", "Connect your Google account to see live data.", 401);
  if (e instanceof ReauthRequired) return apiError("reauth_required", "Google access expired. Reconnect to continue.", 401);
  if (e instanceof UpstreamError) {
    if (e.status === 429) return apiError("rate_limited", "Google is rate-limiting requests. Trying again shortly.", 429, { retryAfter: 60 });
    if (e.status === 401) return apiError("reauth_required", "Google rejected the saved credentials. Reconnect to continue.", 401);
    if (e.status === 403) return apiError("forbidden", "Permission for this data wasn't granted, or the API isn't enabled for this Google Cloud project.", 403);
    return apiError("upstream_error", e.message, 502);
  }
  return apiError("upstream_error", e instanceof Error ? e.message : "Unexpected error", 502);
}
