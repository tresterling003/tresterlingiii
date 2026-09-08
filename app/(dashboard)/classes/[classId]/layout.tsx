import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { ClassTabs } from "@/components/classes/ClassTabs";
import { withAlpha } from "@/lib/utils/color";

export default async function ClassLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { classId: string };
}) {
  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) notFound();

  return (
    <div>
      <div
        className="px-8 pb-5 pt-8"
        style={{ background: `linear-gradient(135deg, ${withAlpha(klass.color, "1a")}, transparent 70%)` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
            style={{ backgroundColor: withAlpha(klass.color, "26") }}
          >
            {klass.emoji}
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{klass.name}</h1>
            <p className="text-sm text-muted">
              {[klass.subject, klass.gradeLevel, klass.period].filter(Boolean).join(" · ") || "No details yet"}
            </p>
          </div>
        </div>
      </div>
      <ClassTabs classId={klass.id} color={klass.color} />
      <div className="px-8 py-8">{children}</div>
    </div>
  );
}
