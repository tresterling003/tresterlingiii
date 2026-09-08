import { prisma } from "@/lib/db/client";
import { Sidebar } from "@/components/layout/Sidebar";

// Always render fresh — this is a private, per-request dashboard, never
// something to statically cache or prerender.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const classes = await prisma.class.findMany({
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, emoji: true, color: true },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar classes={classes} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
