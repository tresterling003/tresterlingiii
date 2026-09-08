import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

// Returns the authenticated teacher id, or null. Use in route handlers as a
// defense-in-depth check alongside middleware.ts.
export async function requireTeacher(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
