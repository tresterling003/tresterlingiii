import { NextRequest, NextResponse } from "next/server";
import { scrapeGiftLink } from "@/lib/scrape/og";
import { scrapeInputSchema } from "@/lib/validation/gift";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = scrapeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const data = await scrapeGiftLink(parsed.data.url);
  if (!data) {
    return NextResponse.json({ ok: false, scraped: false });
  }

  return NextResponse.json({ ok: true, scraped: true, data });
}
