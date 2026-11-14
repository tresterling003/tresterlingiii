import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { getProgress } from "@/lib/solo";

export const dynamic = "force-dynamic";

export const GET = route(async () => json(await getProgress(await requireUserId())));
