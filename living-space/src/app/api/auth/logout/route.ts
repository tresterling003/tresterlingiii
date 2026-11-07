import { NextResponse } from "next/server";
import { readSession, clearSession } from "@/lib/server/session";
import { revoke } from "@/lib/server/google/oauth";

export const dynamic = "force-dynamic";

/** Disconnect Google: revoke the grant at Google and drop the cookie. */
export async function POST() {
  const s = readSession();
  if (s) await revoke(s.refreshToken);
  clearSession();
  return NextResponse.json({ ok: true });
}
