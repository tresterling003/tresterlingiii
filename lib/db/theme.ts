import { prisma } from "@/lib/db/client";
import type { ThemeSettings } from "@prisma/client";

export async function getThemeSettings(): Promise<ThemeSettings> {
  const theme = await prisma.themeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return theme;
}

export async function updateThemeSettings(input: {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  backgroundImageUrl?: string | null;
  animationPack: string;
}): Promise<ThemeSettings> {
  return prisma.themeSettings.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, ...input },
  });
}
