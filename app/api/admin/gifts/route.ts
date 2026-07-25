import { NextRequest, NextResponse } from "next/server";
import { createGift, listGiftsForAdmin } from "@/lib/db/gifts";
import { giftInputSchema } from "@/lib/validation/gift";

export async function GET() {
  const gifts = await listGiftsForAdmin();
  return NextResponse.json({ gifts });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = giftInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const gift = await createGift(parsed.data);
  return NextResponse.json({ gift }, { status: 201 });
}
