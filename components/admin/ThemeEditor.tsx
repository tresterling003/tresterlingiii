"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ColorField } from "@/components/ui/ColorField";
import { ANIMATION_PACKS } from "@/lib/validation/theme";
import type { ThemeSettings } from "@prisma/client";

const PACK_LABELS: Record<(typeof ANIMATION_PACKS)[number], string> = {
  none: "None",
  confetti: "Confetti",
  snow: "Snow",
  fireworks: "Fireworks",
  "paw-prints": "Paw prints",
  team: "Team spirit",
};

export function ThemeEditor({ theme }: { theme: ThemeSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    primaryColor: theme.primaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    backgroundImageUrl: theme.backgroundImageUrl ?? "",
    animationPack: theme.animationPack,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/theme/upload", {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    if (res.ok) {
      const data = await res.json();
      update("backgroundImageUrl", data.url);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        backgroundImageUrl: form.backgroundImageUrl || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to save theme");
      return;
    }
    router.refresh();
  }

  const previewStyle = {
    "--color-primary": form.primaryColor,
    "--color-accent": form.accentColor,
    "--color-bg": form.backgroundColor,
    "--color-text": form.textColor,
  } as React.CSSProperties;

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-4">
        <ColorField
          label="Primary color (buttons)"
          value={form.primaryColor}
          onChange={(v) => update("primaryColor", v)}
        />
        <ColorField
          label="Accent color (claimed badge)"
          value={form.accentColor}
          onChange={(v) => update("accentColor", v)}
        />
        <ColorField
          label="Background color"
          value={form.backgroundColor}
          onChange={(v) => update("backgroundColor", v)}
        />
        <ColorField
          label="Text color"
          value={form.textColor}
          onChange={(v) => update("textColor", v)}
        />

        <div>
          <label className="mb-1 block text-sm text-neutral-600">
            Background image
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            className="text-sm text-neutral-600"
          />
          {uploading && (
            <p className="mt-1 text-xs text-neutral-400">Uploading…</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-neutral-600">
            Animation pack
          </label>
          <select
            value={form.animationPack}
            onChange={(e) => update("animationPack", e.target.value)}
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2.5 text-sm"
          >
            {ANIMATION_PACKS.map((pack) => (
              <option key={pack} value={pack}>
                {PACK_LABELS[pack]}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save theme"}
        </Button>
      </div>

      <div style={previewStyle} className="border border-neutral-200 p-6">
        <p className="mb-4 text-xs uppercase tracking-wide text-neutral-400">
          Live preview
        </p>
        <div
          className="p-6"
          style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          <div className="relative w-48 border" style={{ borderColor: "var(--color-text)", borderOpacity: 0.1 } as React.CSSProperties}>
            <div
              className="absolute left-2 top-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
              style={{ background: "var(--color-accent)" }}
            >
              Claimed
            </div>
            <div className="aspect-square w-full bg-neutral-100" />
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">
                Birthday
              </p>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Example gift card
              </p>
              <button
                className="mt-3 w-full px-3 py-2 text-xs font-medium tracking-wide text-white"
                style={{ background: "var(--color-primary)" }}
              >
                I&apos;ll get this
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
