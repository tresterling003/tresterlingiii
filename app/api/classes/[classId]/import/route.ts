import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { importDumpSchema } from "@/lib/validation/class";
import { importClassDump } from "@/lib/ai/importChat";

// Parses a pasted chat-export dump into structured units + a timeline of log
// entries, then writes them straight into the class. Existing units/log
// entries are left alone — this only adds.
export async function POST(
  request: NextRequest,
  { params }: { params: { classId: string } },
) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const klass = await prisma.class.findUnique({ where: { id: params.classId } });
  if (!klass) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = importDumpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let result;
  try {
    result = await importClassDump(parsed.data.rawText);
  } catch (err) {
    console.error("Import parse failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse import" },
      { status: 502 },
    );
  }

  const existingUnitCount = await prisma.unit.count({ where: { classId: params.classId } });

  const createdUnits = await prisma.$transaction(
    result.units.map((unit, i) =>
      prisma.unit.create({
        data: {
          classId: params.classId,
          title: unit.title,
          summary: unit.summary,
          order: existingUnitCount + i,
          status: unit.status,
        },
      }),
    ),
  );
  const unitByTitle = new Map(createdUnits.map((u) => [u.title, u.id]));

  const logEntries = result.logEntries.filter((e) => !Number.isNaN(Date.parse(e.date)));
  if (logEntries.length > 0) {
    await prisma.logEntry.createMany({
      data: logEntries.map((entry) => ({
        classId: params.classId,
        date: new Date(entry.date),
        summary: entry.summary,
        unitId: entry.unitTitle ? unitByTitle.get(entry.unitTitle) ?? null : null,
      })),
    });
  }

  const classUpdates: Record<string, string> = {};
  if (!klass.subject && result.subject) classUpdates.subject = result.subject;
  if (!klass.gradeLevel && result.gradeLevel) classUpdates.gradeLevel = result.gradeLevel;
  if (Object.keys(classUpdates).length > 0) {
    await prisma.class.update({ where: { id: params.classId }, data: classUpdates });
  }

  return NextResponse.json({
    unitsCreated: createdUnits.length,
    logEntriesCreated: logEntries.length,
  });
}
