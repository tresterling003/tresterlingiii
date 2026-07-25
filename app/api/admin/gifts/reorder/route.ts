import { NextRequest, NextResponse } from "next/server";
import { reorderGifts } from "@/lib/db/gifts";
import { reorderSchema } from "@/lib/validation/gift";

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await reorderGifts(parsed.data.orderedIds);
  return NextResponse.json({ ok: true });
}
