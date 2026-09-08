import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { StudentsBoard } from "./StudentsBoard";

export default async function StudentsPage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const students = await prisma.student.findMany({
    where: { classId: params.classId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-bold text-ink">Roster</h2>
      <p className="mb-6 text-sm text-muted">
        Used to attach names to graded submissions. Paste your full roster at once, one name per line.
      </p>
      <StudentsBoard classId={klass.id} initialStudents={students} />
    </div>
  );
}
