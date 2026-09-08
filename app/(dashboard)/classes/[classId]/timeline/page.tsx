import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { TimelineBoard } from "./TimelineBoard";

export default async function TimelinePage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const [logEntries, units] = await Promise.all([
    prisma.logEntry.findMany({
      where: { classId: params.classId },
      orderBy: { date: "desc" },
      include: { unit: { select: { id: true, title: true } } },
    }),
    prisma.unit.findMany({
      where: { classId: params.classId },
      orderBy: { order: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-bold text-ink">Timeline</h2>
      <p className="mb-6 text-sm text-muted">
        The day-by-day record of what actually happened in {klass.name}. Keeping this current is what lets AI-generated
        lessons build on what students already know instead of repeating it.
      </p>
      <TimelineBoard classId={klass.id} initialLogEntries={logEntries} units={units} />
    </div>
  );
}
