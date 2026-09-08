import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createStudentSchema } from "@/lib/validation/class";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ students });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);

  if (Array.isArray(body?.names)) {
    const names: string[] = body.names
      .map((n: unknown) => String(n).trim())
      .filter((n: string) => n.length > 0)
      .slice(0, 200);
    const created = await prisma.$transaction(
      names.map((name) => prisma.student.create({ data: { classId: params.classId, name } })),
    );
    return NextResponse.json({ students: created }, { status: 201 });
  }

  const parsed = createStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const created = await prisma.student.create({
    data: { classId: params.classId, name: parsed.data.name },
  });
  return NextResponse.json({ student: created }, { status: 201 });
}
