// The only module allowed to combine Gift and Claim data. Used solely by
// the public family-facing route — never imported from app/admin/** or
// app/api/admin/** (enforced by the ESLint import-boundary rule).
import { prisma } from "@/lib/db/client";
import { getClaimsForGifts } from "@/lib/db/claims";
import { toAdminGiftDTO } from "@/types/gift";
import type { FamilyGiftDTO } from "@/types/gift";

export async function listGiftsForFamily(): Promise<FamilyGiftDTO[]> {
  const gifts = await prisma.gift.findMany({ orderBy: { sortOrder: "asc" } });
  const claimsByGiftId = await getClaimsForGifts(gifts.map((g) => g.id));

  return gifts.map((gift) => {
    const claimedBy = claimsByGiftId.get(gift.id) ?? null;
    return {
      ...toAdminGiftDTO(gift),
      claimed: claimedBy !== null,
      claimedBy,
    };
  });
}
