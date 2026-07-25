import { notFound } from "next/navigation";
import { getGiftForAdmin } from "@/lib/db/gifts";
import { GiftForm } from "@/components/admin/GiftForm";

export const dynamic = "force-dynamic";

export default async function EditGiftPage({
  params,
}: {
  params: { id: string };
}) {
  const gift = await getGiftForAdmin(params.id);
  if (!gift) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit gift</h1>
      <GiftForm gift={gift} />
    </div>
  );
}
