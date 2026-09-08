import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createAssignmentSchema } from "@/lib/validation/assignment";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId },
    orderBy: { createdAt: "desc" },
    include: {
      unit: { select: { id: true, title: true } },
      _count: { select: { submissions: true } },
    },
  });
  return NextResponse.json({ assignments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.assignment.create({
    data: {
      classId: params.classId,
      title: parsed.data.title,
      type: parsed.data.type ?? "TEST",
      unitId: parsed.data.unitId ?? undefined,
      pointsPossible: parsed.data.pointsPossible ?? 100,
      instructions: parsed.data.instructions ?? undefined,
      rubric: parsed.data.rubric ?? undefined,
      answerKey: parsed.data.answerKey ?? undefined,
    },
  });
  return NextResponse.json({ assignment: created }, { status: 201 });
}
