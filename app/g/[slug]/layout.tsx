import { notFound } from "next/navigation";
import { isValidFamilySlug } from "@/lib/auth/family-slug";
import { getThemeSettings } from "@/lib/db/theme";

export const dynamic = "force-dynamic";

export default async function FamilyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  if (!isValidFamilySlug(params.slug)) {
    notFound();
  }

  const theme = await getThemeSettings();

  const themeCss = `
    :root {
      --color-primary: ${theme.primaryColor};
      --color-accent: ${theme.accentColor};
      --color-bg: ${theme.backgroundColor};
      --color-text: ${theme.textColor};
      --bg-image: ${theme.backgroundImageUrl ? `url(${JSON.stringify(theme.backgroundImageUrl)})` : "none"};
    }
  `;

  return (
    <div className="min-h-screen bg-theme-bg bg-cover bg-fixed bg-center">
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      {children}
    </div>
  );
}
