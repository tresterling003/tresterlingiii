import { ok } from "@/lib/server/http";
import { fetchInbox } from "@/lib/server/google/gmail";
import { googleErrorResponse } from "@/lib/server/google/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await fetchInbox());
  } catch (e) {
    return googleErrorResponse(e);
  }
}
