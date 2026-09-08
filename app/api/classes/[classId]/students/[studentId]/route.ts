import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createStudentSchema } from "@/lib/validation/class";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string; studentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await prisma.student.update({
    where: { id: params.studentId },
    data: { name: parsed.data.name },
  });
  return NextResponse.json({ student: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string; studentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.student.delete({ where: { id: params.studentId } });
  return NextResponse.json({ ok: true });
}
