import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { seal, unseal } from "./crypto";

/**
 * The Google session lives entirely in an encrypted, httpOnly cookie.
 * The browser can't read it, and the access/refresh tokens never reach client JS.
 */
export interface GoogleSession {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

const COOKIE = "ls_google";
const PURPOSE = "google-session-v1";

export function readSession(): GoogleSession | null {
  return unseal<GoogleSession>(cookies().get(COOKIE)?.value, PURPOSE);
}

export function writeSession(s: GoogleSession) {
  cookies().set(COOKIE, seal(s, PURPOSE), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

/** Device pairing cookie for reading phone alerts (set after proving knowledge of the ingest token). */
const DEVICE = "ls_device";
export function readDevicePaired(): boolean {
  const v = unseal<{ paired: true; tokenHash: string }>(cookies().get(DEVICE)?.value, "device-v1");
  return Boolean(v?.paired && v.tokenHash === hashToken(env.alertsToken));
}
export function writeDevicePaired() {
  cookies().set(DEVICE, seal({ paired: true, tokenHash: hashToken(env.alertsToken) }, "device-v1"), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
export function clearDevicePaired() {
  cookies().delete(DEVICE);
}

// Short, non-reversible fingerprint so rotating ALERTS_INGEST_TOKEN unpairs every device.
function hashToken(t: string) {
  return createHash("sha256").update(`pair:${t}`).digest("base64url").slice(0, 16);
}
