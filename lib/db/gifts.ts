// Admin-only queries. This module only ever touches the Gift table — it
// must never import lib/db/claims or lib/db/family-gifts (enforced by the
// no-restricted-imports ESLint rule for app/admin/** and app/api/admin/**).
import { prisma } from "@/lib/db/client";
import type { AdminGiftDTO } from "@/types/gift";
import { toAdminGiftDTO } from "@/types/gift";

export async function listGiftsForAdmin(): Promise<AdminGiftDTO[]> {
  const gifts = await prisma.gift.findMany({ orderBy: { sortOrder: "asc" } });
  return gifts.map(toAdminGiftDTO);
}

export async function getGiftForAdmin(
  id: string,
): Promise<AdminGiftDTO | null> {
  const gift = await prisma.gift.findUnique({ where: { id } });
  return gift ? toAdminGiftDTO(gift) : null;
}

export async function createGift(input: {
  title: string;
  link: string;
  imageUrl?: string | null;
  price?: string | null;
  notes?: string | null;
  occasion: string;
}): Promise<AdminGiftDTO> {
  const maxOrder = await prisma.gift.aggregate({ _max: { sortOrder: true } });
  const gift = await prisma.gift.create({
    data: {
      ...input,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  return toAdminGiftDTO(gift);
}

export async function updateGift(
  id: string,
  input: Partial<{
    title: string;
    link: string;
    imageUrl: string | null;
    price: string | null;
    notes: string | null;
    occasion: string;
  }>,
): Promise<AdminGiftDTO> {
  const gift = await prisma.gift.update({ where: { id }, data: input });
  return toAdminGiftDTO(gift);
}

export async function deleteGift(id: string): Promise<void> {
  // Claim rows for this gift are removed by the database's ON DELETE
  // CASCADE foreign key (see prisma/migrations/20260725000000_init) — this
  // module never reads or writes the Claim table directly.
  await prisma.gift.delete({ where: { id } });
}

export async function reorderGifts(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.gift.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
}
