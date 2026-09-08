import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateSubmissionSchema } from "@/lib/validation/assignment";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isFinalizing = parsed.data.finalScore !== undefined;
  const updated = await prisma.submission.update({
    where: { id: params.submissionId },
    data: {
      ...parsed.data,
      ...(isFinalizing ? { status: "REVIEWED", gradedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ submission: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.submission.delete({ where: { id: params.submissionId } });
  return NextResponse.json({ ok: true });
}
