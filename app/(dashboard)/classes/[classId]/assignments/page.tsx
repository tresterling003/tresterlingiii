import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { Card, EmptyState, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function AssignmentsPage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const assignments = await prisma.assignment.findMany({
    where: { classId: params.classId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Grading</h2>
          <p className="text-sm text-muted">
            Snap a photo of a test, project, or worksheet and grade it against a rubric or answer key.
          </p>
        </div>
        <Link href={`/classes/${klass.id}/assignments/new`}>
          <Button>+ New assignment</Button>
        </Link>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No assignments yet"
          description="Create one with a rubric or answer key, then upload photos of student work to grade with AI."
          action={
            <Link href={`/classes/${klass.id}/assignments/new`}>
              <Button>Create your first assignment</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {assignments.map((a) => (
            <Link key={a.id} href={`/classes/${klass.id}/assignments/${a.id}`}>
              <Card className="flex items-center justify-between transition-colors hover:border-ink/30">
                <div>
                  <p className="font-semibold text-ink">{a.title}</p>
                  <p className="text-xs text-muted">{a.pointsPossible} pts</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={klass.color}>
                    {a._count.submissions} submission{a._count.submissions === 1 ? "" : "s"}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
