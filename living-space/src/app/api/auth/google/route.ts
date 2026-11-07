import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { authUrl } from "@/lib/server/google/oauth";
import { env, googleConfigured } from "@/lib/server/env";
import { randomToken, seal } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

/** Starts Google OAuth (authorization code + PKCE + state). */
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${env.appUrl}/?connect=not_configured`);
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  cookies().set("ls_oauth", seal({ state, verifier, at: Date.now() }, "oauth-v1"), {
    httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return NextResponse.redirect(authUrl(state, challenge));
}
