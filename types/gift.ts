import type { Gift } from "@prisma/client";

// The admin (gift recipient) must NEVER see claim/purchase data. This DTO
// is what every admin-facing API route and component is allowed to touch —
// it has no `claimed` / `claimedBy` fields to accidentally render.
export type AdminGiftDTO = Pick<
  Gift,
  | "id"
  | "title"
  | "link"
  | "imageUrl"
  | "price"
  | "notes"
  | "occasion"
  | "sortOrder"
  | "createdAt"
  | "updatedAt"
>;

// Only ever produced by lib/db/family-gifts.ts for the public family route.
export type FamilyGiftDTO = AdminGiftDTO & {
  claimed: boolean;
  claimedBy: string | null;
};

export function toAdminGiftDTO(gift: Gift): AdminGiftDTO {
  return {
    id: gift.id,
    title: gift.title,
    link: gift.link,
    imageUrl: gift.imageUrl,
    price: gift.price,
    notes: gift.notes,
    occasion: gift.occasion,
    sortOrder: gift.sortOrder,
    createdAt: gift.createdAt,
    updatedAt: gift.updatedAt,
  };
}
