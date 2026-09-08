import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { AssignmentDetail } from "./AssignmentDetail";
import type { AssignmentData } from "./types";

export default async function AssignmentDetailPage({
  params,
}: {
  params: { classId: string; assignmentId: string };
}) {
  const [assignment, students, klass] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id: params.assignmentId },
      include: {
        submissions: {
          orderBy: { createdAt: "asc" },
          include: { student: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.student.findMany({
      where: { classId: params.classId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.class.findUnique({ where: { id: params.classId }, select: { color: true } }),
  ]);

  if (!assignment || assignment.classId !== params.classId) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <AssignmentDetail
        classId={params.classId}
        assignment={assignment as unknown as AssignmentData}
        students={students}
        color={klass?.color ?? "#6366f1"}
      />
    </div>
  );
}
