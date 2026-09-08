import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ResourceEditor } from "./ResourceEditor";

export default async function ResourceDetailPage({
  params,
}: {
  params: { classId: string; resourceId: string };
}) {
  const resource = await prisma.resource.findUnique({ where: { id: params.resourceId } });
  if (!resource || resource.classId !== params.classId) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <ResourceEditor classId={params.classId} resource={resource} />
    </div>
  );
}
