import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateUnitSchema } from "@/lib/validation/class";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string; unitId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { startDate, endDate, ...rest } = parsed.data;
  const updated = await prisma.unit.update({
    where: { id: params.unitId },
    data: {
      ...rest,
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
  });
  return NextResponse.json({ unit: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string; unitId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.unit.delete({ where: { id: params.unitId } });
  return NextResponse.json({ ok: true });
}
