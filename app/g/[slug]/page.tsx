import { listGiftsForFamily } from "@/lib/db/family-gifts";
import { getThemeSettings } from "@/lib/db/theme";
import { GiftGrid } from "@/components/family/GiftGrid";

export const dynamic = "force-dynamic";

export default async function FamilyGiftPage({
  params,
}: {
  params: { slug: string };
}) {
  const [gifts, theme] = await Promise.all([
    listGiftsForFamily(),
    getThemeSettings(),
  ]);

  return (
    <GiftGrid
      slug={params.slug}
      initialGifts={gifts}
      animationPack={theme.animationPack}
    />
  );
}
