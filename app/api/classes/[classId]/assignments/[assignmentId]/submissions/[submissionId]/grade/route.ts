import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { gradeSubmission } from "@/lib/ai/grade";

export async function POST(
  _request: NextRequest,
  { params }: { params: { submissionId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const submission = await prisma.submission.findUnique({
    where: { id: params.submissionId },
    include: { assignment: true },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: "GRADING" },
  });

  try {
    const result = await gradeSubmission({
      assignmentTitle: submission.assignment.title,
      assignmentType: submission.assignment.type,
      pointsPossible: submission.assignment.pointsPossible,
      instructions: submission.assignment.instructions,
      rubric: submission.assignment.rubric,
      answerKey: submission.assignment.answerKey,
      photoUrls: submission.photoUrls,
    });

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: "GRADED",
        aiScore: result.overallScore,
        finalScore: result.overallScore,
        aiFeedback: result,
        gradedAt: new Date(),
      },
    });
    return NextResponse.json({ submission: updated });
  } catch (err) {
    console.error("Grading failed", err);
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Grading failed" },
      { status: 502 },
    );
  }
}
