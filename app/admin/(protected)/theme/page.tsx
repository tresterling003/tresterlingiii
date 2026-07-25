import { getThemeSettings } from "@/lib/db/theme";
import { ThemeEditor } from "@/components/admin/ThemeEditor";

export const dynamic = "force-dynamic";

export default async function AdminThemePage() {
  const theme = await getThemeSettings();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Theme</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Changes apply to the family page instantly — no redeploy needed.
      </p>
      <ThemeEditor theme={theme} />
    </div>
  );
}
