import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { NewAssignmentForm } from "./NewAssignmentForm";

export default async function NewAssignmentPage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const units = await prisma.unit.findMany({
    where: { classId: params.classId },
    orderBy: { order: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-bold text-ink">New assignment</h2>
      <p className="mb-6 text-sm text-muted">
        Add a rubric, an answer key, or both — the more detail you give it, the more precisely AI can grade against
        it. You can always edit this later.
      </p>
      <NewAssignmentForm classId={klass.id} units={units} />
    </div>
  );
}
