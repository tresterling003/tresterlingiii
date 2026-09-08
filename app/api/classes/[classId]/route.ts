import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateClassSchema } from "@/lib/validation/class";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const klass = await prisma.class.findUnique({
    where: { id: params.classId },
    include: {
      units: { orderBy: { order: "asc" } },
      _count: { select: { resources: true, assignments: true, students: true, logEntries: true } },
    },
  });
  if (!klass) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ class: klass });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.class.update({
    where: { id: params.classId },
    data: parsed.data,
  });
  return NextResponse.json({ class: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.class.delete({ where: { id: params.classId } });
  return NextResponse.json({ ok: true });
}
