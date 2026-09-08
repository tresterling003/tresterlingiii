import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createSubmissionSchema } from "@/lib/validation/assignment";

export async function GET(
  _request: NextRequest,
  { params }: { params: { assignmentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: params.assignmentId },
    orderBy: { createdAt: "asc" },
    include: { student: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ submissions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { assignmentId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.submission.create({
    data: {
      assignmentId: params.assignmentId,
      studentId: parsed.data.studentId ?? undefined,
      studentNameFallback: parsed.data.studentNameFallback ?? undefined,
      photoUrls: parsed.data.photoUrls,
      status: "PENDING",
    },
  });
  return NextResponse.json({ submission: created }, { status: 201 });
}
