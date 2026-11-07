import "server-only";
import { env } from "../env";
import { fetchJson } from "../http";
import { readSession, writeSession, type GoogleSession } from "../session";

/** Minimum scopes: identify the account, read Gmail, read calendar events. */
export function requestedScopes(): string[] {
  return [
    "openid",
    "email",
    env.allowMarkRead ? "https://www.googleapis.com/auth/gmail.modify" : "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ];
}

export const redirectUri = () => `${env.appUrl}/api/auth/google/callback`;

export function authUrl(state: string, codeChallenge: string): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: requestedScopes().join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  const res = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(json.error || `token exchange failed (${res.status})`);
  return json;
}

/** Decode the email claim from the id_token we just received directly from Google over TLS. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return payload.email_verified === false ? null : (payload.email as string) ?? null;
  } catch {
    return null;
  }
}

export class ReauthRequired extends Error {}
export class NotConnected extends Error {}

/** Returns a valid access token, refreshing (and re-sealing the cookie) when needed. */
export async function accessToken(): Promise<{ token: string; session: GoogleSession }> {
  const s = readSession();
  if (!s) throw new NotConnected("Google is not connected");
  if (s.expiresAt - 60_000 > Date.now()) return { token: s.accessToken, session: s };
  const res = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: s.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new ReauthRequired("Google access was revoked or expired");
    throw new Error(`token refresh failed (${res.status})`);
  }
  const next: GoogleSession = { ...s, accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  writeSession(next);
  return { token: next.accessToken, session: next };
}

export async function revoke(token: string) {
  await fetchJson(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}
