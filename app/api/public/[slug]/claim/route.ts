import { NextRequest, NextResponse } from "next/server";
import { isValidFamilySlug } from "@/lib/auth/family-slug";
import { claimGift } from "@/lib/db/claims";
import { claimInputSchema } from "@/lib/validation/claim";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!isValidFamilySlug(params.slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = claimInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await claimGift(parsed.data.giftId, parsed.data.claimerName);
  if (!result.ok) {
    return NextResponse.json(
      { error: "This gift was just claimed by someone else." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
