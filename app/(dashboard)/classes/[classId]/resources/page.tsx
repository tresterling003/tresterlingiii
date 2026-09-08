import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { Card, EmptyState, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TYPE_LABEL: Record<string, string> = {
  LESSON_PLAN: "Lesson plan",
  SLIDES: "Slides",
  NOTES: "Notes",
  WORKSHEET: "Worksheet",
  QUIZ: "Quiz",
  TEST: "Test",
  PROJECT: "Project",
  OTHER: "Other",
};

const TYPE_ICON: Record<string, string> = {
  LESSON_PLAN: "📋",
  SLIDES: "🖥️",
  NOTES: "📝",
  WORKSHEET: "📄",
  QUIZ: "❓",
  TEST: "🧾",
  PROJECT: "🛠️",
  OTHER: "📎",
};

export default async function ResourcesPage({ params }: { params: { classId: string } }) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  const resources = await prisma.resource.findMany({
    where: { classId: params.classId },
    orderBy: { createdAt: "desc" },
    include: { unit: { select: { title: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Resources</h2>
          <p className="text-sm text-muted">Lesson plans, slides, notes, worksheets, quizzes, tests, and projects.</p>
        </div>
        <Link href={`/classes/${klass.id}/resources/new`}>
          <Button>✨ Generate</Button>
        </Link>
      </div>

      {resources.length === 0 ? (
        <EmptyState
          icon="✨"
          title="Nothing generated yet"
          description="Tell it a topic and pick a type — it'll draft something ready to teach from, fully editable."
          action={
            <Link href={`/classes/${klass.id}/resources/new`}>
              <Button>Generate your first resource</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resources.map((r) => (
            <Link key={r.id} href={`/classes/${klass.id}/resources/${r.id}`}>
              <Card className="h-full transition-colors hover:border-ink/30">
                <div className="flex items-start justify-between">
                  <span className="text-xl">{TYPE_ICON[r.type]}</span>
                  <Badge color={klass.color}>{TYPE_LABEL[r.type]}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 font-semibold text-ink">{r.title}</p>
                {r.unit && <p className="mt-1 text-xs text-muted">{r.unit.title}</p>}
                <p className="mt-2 text-xs text-muted">{new Date(r.updatedAt).toLocaleDateString()}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
