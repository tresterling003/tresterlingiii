import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { withAlpha } from "@/lib/utils/color";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const [classes, recentLogs, needsReview] = await Promise.all([
    prisma.class.findMany({
      where: { archived: false },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { resources: true, assignments: true, students: true } },
      },
    }),
    prisma.logEntry.findMany({
      orderBy: { date: "desc" },
      take: 6,
      include: { class: { select: { id: true, name: true, color: true, emoji: true } } },
    }),
    prisma.submission.findMany({
      where: { status: "GRADED" },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { name: true } },
        assignment: {
          select: { id: true, title: true, classId: true, class: { select: { name: true, color: true } } },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting()} 👋</h1>
          <p className="mt-1 text-sm text-muted">Here&rsquo;s what&rsquo;s going on across your classes.</p>
        </div>
        <Link href="/classes/new">
          <Button>+ New class</Button>
        </Link>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon="🎒"
          title="No classes yet"
          description="Add your first class to start building lessons, tracking your pacing, and grading with AI."
          action={
            <Link href="/classes/new">
              <Button>Create your first class</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {classes.map((c) => (
            <Link key={c.id} href={`/classes/${c.id}`}>
              <Card
                className="h-full transition-transform hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(c.color, "14")}, white 60%)`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
                    style={{ backgroundColor: withAlpha(c.color, "26") }}
                  >
                    {c.emoji}
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: withAlpha(c.color, "1f"), color: c.color }}
                  >
                    {c.period ?? c.gradeLevel ?? c.subject ?? "Class"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-ink">{c.name}</h3>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>
                )}
                <div className="mt-4 flex gap-4 text-xs text-muted">
                  <span>{c._count.resources} resources</span>
                  <span>{c._count.assignments} assignments</span>
                  <span>{c._count.students} students</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Recent activity
          </h2>
          {recentLogs.length === 0 ? (
            <Card className="text-sm text-muted">
              Nothing logged yet. Paste in your class notes on a class&rsquo;s Import page, or add a log entry from its Timeline tab.
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {recentLogs.map((log) => (
                <Card key={log.id} className="flex items-start gap-3 py-3">
                  <span
                    className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm"
                    style={{ backgroundColor: withAlpha(log.class.color, "26") }}
                  >
                    {log.class.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{log.summary}</p>
                    <p className="text-xs text-muted">
                      {log.class.name} · {new Date(log.date).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            AI grades awaiting your review
          </h2>
          {needsReview.length === 0 ? (
            <Card className="text-sm text-muted">
              Nothing waiting on you right now.
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {needsReview.map((s) => (
                <Link
                  key={s.id}
                  href={`/classes/${s.assignment.classId}/assignments/${s.assignment.id}`}
                >
                  <Card className="flex items-center justify-between gap-3 py-3 transition-colors hover:border-ink/30">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {s.student?.name ?? s.studentNameFallback ?? "Unnamed student"}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {s.assignment.title} · {s.assignment.class.name}
                      </p>
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: withAlpha(s.assignment.class.color, "1f"), color: s.assignment.class.color }}
                    >
                      {s.aiScore ?? "—"} pts
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
