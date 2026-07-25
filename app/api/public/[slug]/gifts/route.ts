import { NextResponse } from "next/server";
import { isValidFamilySlug } from "@/lib/auth/family-slug";
import { listGiftsForFamily } from "@/lib/db/family-gifts";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } },
) {
  if (!isValidFamilySlug(params.slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const gifts = await listGiftsForFamily();
  return NextResponse.json({ gifts });
}
