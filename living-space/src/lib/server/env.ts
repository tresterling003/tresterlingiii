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
  // Redis over REST (Upstash, or Vercel's Upstash/KV integration). Used for alerts when set.
  redisUrl: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/$/, ""),
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
  /** Serverless hosts have a read-only/ephemeral filesystem, so the file store can't be used there. */
  ephemeralFs: Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME),
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

export function alertsStorageReady(): boolean {
  return Boolean(env.redisUrl && env.redisToken) || !env.ephemeralFs;
}

export function alertsConfigured(): boolean {
  return env.alertsToken.length >= 24 && env.sessionSecret.length >= 32 && alertsStorageReady();
}
