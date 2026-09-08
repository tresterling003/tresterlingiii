import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { UnitsBoard } from "./UnitsBoard";

export default async function CurriculumPage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const units = await prisma.unit.findMany({
    where: { classId: params.classId },
    orderBy: { order: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Curriculum &amp; pacing</h2>
      </div>
      <p className="mb-6 text-sm text-muted">
        The year&rsquo;s scope and sequence for {klass.name}. Mark a unit &ldquo;In progress&rdquo; to have it show up on the
        class overview and be suggested by default when generating resources.
      </p>
      <UnitsBoard classId={klass.id} color={klass.color} initialUnits={units} />
    </div>
  );
}
