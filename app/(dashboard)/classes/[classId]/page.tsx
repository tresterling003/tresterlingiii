import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { Card, EmptyState, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export default async function ClassOverviewPage({
  params,
}: {
  params: { classId: string };
}) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const [units, recentLogs, counts] = await Promise.all([
    prisma.unit.findMany({ where: { classId: params.classId }, orderBy: { order: "asc" } }),
    prisma.logEntry.findMany({
      where: { classId: params.classId },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.$transaction([
      prisma.resource.count({ where: { classId: params.classId } }),
      prisma.assignment.count({ where: { classId: params.classId } }),
      prisma.student.count({ where: { classId: params.classId } }),
    ]),
  ]);

  const currentUnit = units.find((u) => u.status === "IN_PROGRESS") ?? units[0];
  const [resourceCount, assignmentCount, studentCount] = counts;

  return (
    <div className="mx-auto max-w-5xl">
      {units.length === 0 && (
        <Card className="mb-6 flex items-center justify-between gap-4 border-dashed">
          <div>
            <p className="text-sm font-semibold text-ink">Nothing set up yet</p>
            <p className="text-sm text-muted">
              Paste your planning notes from your chat export and we&rsquo;ll turn them into a curriculum and timeline automatically.
            </p>
          </div>
          <Link href={`/classes/${klass.id}/import`}>
            <Button>Import notes</Button>
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-2xl font-bold text-ink">{resourceCount}</p>
          <p className="text-sm text-muted">Resources drafted</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-ink">{assignmentCount}</p>
          <p className="text-sm text-muted">Assignments</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-ink">{studentCount}</p>
          <p className="text-sm text-muted">Students</p>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Where you are
            </h2>
            <Link href={`/classes/${klass.id}/curriculum`} className="text-xs font-medium text-muted hover:text-ink">
              View curriculum →
            </Link>
          </div>
          {currentUnit ? (
            <Card>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{currentUnit.title}</p>
                <Badge color={klass.color}>{STATUS_LABEL[currentUnit.status]}</Badge>
              </div>
              {currentUnit.summary && (
                <p className="mt-2 text-sm text-muted">{currentUnit.summary}</p>
              )}
              <div className="mt-4 flex gap-2">
                <Link href={`/classes/${klass.id}/resources/new?unitId=${currentUnit.id}`}>
                  <Button variant="secondary">Draft a lesson for this unit</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <EmptyState title="No units yet" description="Add units from the Curriculum tab or import your notes." />
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recent timeline
            </h2>
            <Link href={`/classes/${klass.id}/timeline`} className="text-xs font-medium text-muted hover:text-ink">
              View all →
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <EmptyState title="Nothing logged yet" description="Log what you cover each day to keep pacing accurate." />
          ) : (
            <div className="flex flex-col gap-2">
              {recentLogs.map((log) => (
                <Card key={log.id} className="py-3">
                  <p className="text-sm font-medium text-ink">{log.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">{new Date(log.date).toLocaleDateString()}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/classes/${klass.id}/resources/new`}>
          <Button>✨ Generate a resource</Button>
        </Link>
        <Link href={`/classes/${klass.id}/assignments/new`}>
          <Button variant="secondary">+ New assignment to grade</Button>
        </Link>
      </div>
    </div>
  );
}
