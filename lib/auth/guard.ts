import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

// Returns the authenticated admin id, or null. Use in admin route handlers
// as a defense-in-depth check alongside middleware.ts.
export async function requireAdmin(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
