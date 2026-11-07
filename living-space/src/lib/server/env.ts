import "server-only";

/** Server-only configuration. Nothing in this module is ever bundled for the browser. */
export const env = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  allowMarkRead: process.env.GOOGLE_ALLOW_MARK_READ === "true",
  ownerEmail: (process.env.APP_OWNER_EMAIL || "").trim().toLowerCase(),
  alertsToken: process.env.ALERTS_INGEST_TOKEN || "",
  dataDir: process.env.DATA_DIR || "./data",
  isProd: process.env.NODE_ENV === "production",
};

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret && env.sessionSecret.length >= 32);
}

export function missingGoogleConfig(): string[] {
  const missing: string[] = [];
  if (!env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!env.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (env.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ chars)");
  return missing;
}

export function alertsConfigured(): boolean {
  return env.alertsToken.length >= 24 && env.sessionSecret.length >= 32;
}
