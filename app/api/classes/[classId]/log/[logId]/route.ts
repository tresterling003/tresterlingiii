import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateLogEntrySchema } from "@/lib/validation/class";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string; logId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateLogEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, ...rest } = parsed.data;
  const updated = await prisma.logEntry.update({
    where: { id: params.logId },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
  });
  return NextResponse.json({ logEntry: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string; logId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.logEntry.delete({ where: { id: params.logId } });
  return NextResponse.json({ ok: true });
}
