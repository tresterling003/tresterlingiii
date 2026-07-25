import { NextRequest, NextResponse } from "next/server";
import { deleteGift, updateGift } from "@/lib/db/gifts";
import { giftUpdateSchema } from "@/lib/validation/gift";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json().catch(() => null);
  const parsed = giftUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const gift = await updateGift(params.id, parsed.data);
  return NextResponse.json({ gift });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  await deleteGift(params.id);
  return NextResponse.json({ ok: true });
}
