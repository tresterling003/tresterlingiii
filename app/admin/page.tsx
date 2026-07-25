import Link from "next/link";
import { listGiftsForAdmin } from "@/lib/db/gifts";
import { GiftList } from "@/components/admin/GiftList";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const gifts = await listGiftsForAdmin();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your gift list</h1>
          <p className="text-sm text-white/50">
            Purchases are always hidden from you — this list never shows
            what&apos;s been claimed.
          </p>
        </div>
        <Link href="/admin/gifts/new">
          <Button>Add gift</Button>
        </Link>
      </div>
      <GiftList initialGifts={gifts} />
    </div>
  );
}
