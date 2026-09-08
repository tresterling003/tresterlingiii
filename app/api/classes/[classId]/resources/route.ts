import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createResourceSchema, generateResourceSchema } from "@/lib/validation/resource";
import { defaultResourceTitle, generateResourceContent } from "@/lib/ai/generate";

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const type = request.nextUrl.searchParams.get("type");
  const unitId = request.nextUrl.searchParams.get("unitId");

  const resources = await prisma.resource.findMany({
    where: {
      classId: params.classId,
      ...(type ? { type: type as never } : {}),
      ...(unitId ? { unitId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { unit: { select: { id: true, title: true } } },
  });
  return NextResponse.json({ resources });
}

// Two ways to create a resource:
// - { type, topic, ... } -> AI drafts the content (see generateResourceSchema)
// - { type, title, content, ... } -> saved as-is (see createResourceSchema)
export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);

  const manual = createResourceSchema.safeParse(body);
  if (manual.success) {
    const created = await prisma.resource.create({
      data: { classId: params.classId, ...manual.data },
    });
    return NextResponse.json({ resource: created }, { status: 201 });
  }

  const generate = generateResourceSchema.safeParse(body);
  if (!generate.success) {
    return NextResponse.json({ error: generate.error.flatten() }, { status: 400 });
  }

  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) return NextResponse.json({ error: "Class not found" }, { status: 404 });

  const unit = generate.data.unitId
    ? await prisma.unit.findUnique({ where: { id: generate.data.unitId } })
    : null;

  const recentLogs = await prisma.logEntry.findMany({
    where: { classId: params.classId },
    orderBy: { date: "desc" },
    take: 5,
  });

  let content: string;
  try {
    content = await generateResourceContent({
      type: generate.data.type,
      className: klass.name,
      subject: klass.subject,
      gradeLevel: klass.gradeLevel,
      unitTitle: unit?.title,
      topic: generate.data.topic,
      extraInstructions: generate.data.extraInstructions,
      recentContext: recentLogs.map((l) => `- ${l.summary}`).join("\n") || undefined,
    });
  } catch (err) {
    console.error("Resource generation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 502 },
    );
  }

  const created = await prisma.resource.create({
    data: {
      classId: params.classId,
      unitId: generate.data.unitId ?? undefined,
      type: generate.data.type,
      title: generate.data.title || defaultResourceTitle(generate.data.type, generate.data.topic),
      prompt: generate.data.topic,
      content,
    },
  });
  return NextResponse.json({ resource: created }, { status: 201 });
}
