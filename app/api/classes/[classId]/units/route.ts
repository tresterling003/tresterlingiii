import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createUnitSchema } from "@/lib/validation/class";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const units = await prisma.unit.findMany({
    where: { classId: params.classId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ units });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const maxOrder = await prisma.unit.aggregate({
    where: { classId: params.classId },
    _max: { order: true },
  });

  const created = await prisma.unit.create({
    data: {
      classId: params.classId,
      title: parsed.data.title,
      summary: parsed.data.summary ?? undefined,
      order: parsed.data.order ?? (maxOrder._max.order ?? -1) + 1,
      status: parsed.data.status ?? "UPCOMING",
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
  });
  return NextResponse.json({ unit: created }, { status: 201 });
}
