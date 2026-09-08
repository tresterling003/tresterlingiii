import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createLogEntrySchema } from "@/lib/validation/class";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const logEntries = await prisma.logEntry.findMany({
    where: { classId: params.classId },
    orderBy: { date: "desc" },
    include: { unit: { select: { id: true, title: true } } },
  });
  return NextResponse.json({ logEntries });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createLogEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.logEntry.create({
    data: {
      classId: params.classId,
      date: new Date(parsed.data.date),
      summary: parsed.data.summary,
      details: parsed.data.details ?? undefined,
      unitId: parsed.data.unitId ?? undefined,
    },
  });
  return NextResponse.json({ logEntry: created }, { status: 201 });
}
