// Family-only queries. This module must never be imported from
// app/admin/** or app/api/admin/** (enforced by the ESLint import-boundary
// rule) — it is the only place that reads or writes purchase/claim data.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export async function getClaimsForGifts(
  giftIds: string[],
): Promise<Map<string, string>> {
  const claims = await prisma.claim.findMany({
    where: { giftId: { in: giftIds } },
    orderBy: { claimedAt: "asc" },
  });
  const byGiftId = new Map<string, string>();
  for (const claim of claims) {
    if (!byGiftId.has(claim.giftId)) {
      byGiftId.set(claim.giftId, claim.claimerName);
    }
  }
  return byGiftId;
}

export async function claimGift(
  giftId: string,
  claimerName: string,
): Promise<{ ok: true } | { ok: false; reason: "already_claimed" }> {
  try {
    // The unique constraint on Claim.giftId makes this atomic: if two
    // family members submit a claim for the same gift at once, only one
    // insert succeeds and the other hits the constraint below.
    await prisma.claim.create({ data: { giftId, claimerName } });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, reason: "already_claimed" };
    }
    throw err;
  }
}
