import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/server/env";
import { unseal } from "@/lib/server/crypto";
import { emailFromIdToken, exchangeCode } from "@/lib/server/google/oauth";
import { writeSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (reason: string) => NextResponse.redirect(`${env.appUrl}/?connect=${reason}`);
  const url = req.nextUrl;
  const pending = unseal<{ state: string; verifier: string; at: number }>(cookies().get("ls_oauth")?.value, "oauth-v1");
  cookies().delete({ name: "ls_oauth", path: "/api/auth" });
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!pending || !code || url.searchParams.get("state") !== pending.state || Date.now() - pending.at > 600_000) return back("state_mismatch");
  try {
    const t = await exchangeCode(code, pending.verifier);
    const email = emailFromIdToken(t.id_token);
    if (!email) return back("no_email");
    if (env.ownerEmail && email.toLowerCase() !== env.ownerEmail) return back("wrong_account");
    if (!t.refresh_token) return back("no_refresh");
    writeSession({
      email,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      scopes: t.scope.split(" "),
    });
    return back("ok");
  } catch {
    return back("exchange_failed");
  }
}
