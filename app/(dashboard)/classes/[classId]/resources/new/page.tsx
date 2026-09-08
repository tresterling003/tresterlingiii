import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { GenerateResourceForm } from "./GenerateResourceForm";

export default async function NewResourcePage({
  params,
  searchParams,
}: {
  params: { classId: string };
  searchParams: { unitId?: string };
}) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const units = await prisma.unit.findMany({
    where: { classId: params.classId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, status: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-bold text-ink">Generate a resource</h2>
      <p className="mb-6 text-sm text-muted">
        Pick what you need and give it a topic — it&rsquo;ll draft something classroom-ready, and you can edit every
        word afterward.
      </p>
      <GenerateResourceForm
        classId={klass.id}
        units={units}
        defaultUnitId={searchParams.unitId}
      />
    </div>
  );
}
