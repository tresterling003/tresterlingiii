import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { rateLimit, recordAttempt, requireUser } from "@/lib/auth";
import { joinByCode } from "@/lib/families";
import { AppError } from "@/lib/errors";

export const POST = route(async (req) => {
  const uid = await requireUser();
  await rateLimit(`join:${uid}`, 10, 15);
  const b = await body(req, z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Codes are 6 letters and numbers.") }));
  try {
    const id = await tx((db) => joinByCode(db, uid, b.code));
    return json({ id });
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") await recordAttempt(`join:${uid}`);
    throw e;
  }
});

export const dynamic = "force-dynamic";
