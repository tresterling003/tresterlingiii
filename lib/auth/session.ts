// Edge-runtime safe: no bcrypt/Node-only APIs here, so middleware.ts (which
// runs on the Edge runtime) can import this without pulling in bcryptjs.
// Password hashing lives in lib/auth/password.ts instead.
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "gift_admin_session";
const SESSION_DURATION = "7d";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function signSessionToken(adminId: string): Promise<string> {
  return new SignJWT({ sub: adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
