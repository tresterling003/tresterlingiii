import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateAssignmentSchema } from "@/lib/validation/assignment";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string; assignmentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      unit: { select: { id: true, title: true } },
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { student: { select: { id: true, name: true } } },
      },
    },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assignment });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string; assignmentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { rubric, unitId, ...rest } = parsed.data;
  const updated = await prisma.assignment.update({
    where: { id: params.assignmentId },
    data: {
      ...rest,
      ...(unitId !== undefined ? { unitId } : {}),
      ...(rubric !== undefined ? { rubric: rubric === null ? Prisma.JsonNull : rubric } : {}),
    },
  });
  return NextResponse.json({ assignment: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string; assignmentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.assignment.delete({ where: { id: params.assignmentId } });
  return NextResponse.json({ ok: true });
}
