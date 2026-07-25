import { NextRequest, NextResponse } from "next/server";
import { getThemeSettings, updateThemeSettings } from "@/lib/db/theme";
import { themeUpdateSchema } from "@/lib/validation/theme";

export async function GET() {
  const theme = await getThemeSettings();
  return NextResponse.json({ theme });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = themeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const theme = await updateThemeSettings(parsed.data);
  return NextResponse.json({ theme });
}
