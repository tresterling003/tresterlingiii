import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/api/guard";
import { createClassSchema } from "@/lib/validation/class";
import { CLASS_COLOR_PRESETS } from "@/lib/utils/color";

export async function GET() {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const classes = await prisma.class.findMany({
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { units: true, resources: true, assignments: true, students: true } },
    },
  });
  return NextResponse.json({ classes });
}

export async function POST(request: NextRequest) {
  const unauthed = await unauthorized();
  if (unauthed) return unauthed;

  const body = await request.json().catch(() => null);
  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.class.count();
  const color = parsed.data.color ?? CLASS_COLOR_PRESETS[count % CLASS_COLOR_PRESETS.length];

  const created = await prisma.class.create({
    data: { ...parsed.data, color, sortOrder: count },
  });
  return NextResponse.json({ class: created }, { status: 201 });
}
