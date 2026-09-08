import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/guard";

// Defense-in-depth alongside middleware.ts. Returns a 401 response to return
// early from a route handler, or null if the request is authenticated.
export async function unauthorized(): Promise<NextResponse | null> {
  const teacherId = await requireTeacher();
  if (!teacherId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
