import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { updateResourceSchema } from "@/lib/validation/resource";

export async function GET(
  _request: NextRequest,
  { params }: { params: { classId: string; resourceId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const resource = await prisma.resource.findUnique({ where: { id: params.resourceId } });
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ resource });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { classId: string; resourceId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = updateResourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.resource.update({
    where: { id: params.resourceId },
    data: parsed.data,
  });
  return NextResponse.json({ resource: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { classId: string; resourceId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  await prisma.resource.delete({ where: { id: params.resourceId } });
  return NextResponse.json({ ok: true });
}
