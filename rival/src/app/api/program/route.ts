import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { getProgram } from "@/lib/solo";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getProgram(await requireUserId())));
