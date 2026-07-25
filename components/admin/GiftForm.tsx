"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import type { AdminGiftDTO } from "@/types/gift";

type FormState = {
  title: string;
  link: string;
  imageUrl: string;
  price: string;
  notes: string;
  occasion: string;
};

function toFormState(gift?: AdminGiftDTO | null): FormState {
  return {
    title: gift?.title ?? "",
    link: gift?.link ?? "",
    imageUrl: gift?.imageUrl ?? "",
    price: gift?.price ?? "",
    notes: gift?.notes ?? "",
    occasion: gift?.occasion ?? "",
  };
}

export function GiftForm({ gift }: { gift?: AdminGiftDTO }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toFormState(gift));
  const [scraping, setScraping] = useState(false);
  const [scrapeNote, setScrapeNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFetchDetails() {
    if (!form.link) return;
    setScraping(true);
    setScrapeNote(null);
    try {
      const res = await fetch("/api/admin/gifts/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.link }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setForm((prev) => ({
          ...prev,
          title: prev.title || data.data.title || "",
          imageUrl: prev.imageUrl || data.data.imageUrl || "",
          price: prev.price || data.data.price || "",
        }));
        setScrapeNote("Pre-filled from the link. Review before saving.");
      } else {
        setScrapeNote(
          "Couldn't auto-fetch details from that link — fill in manually below.",
        );
      }
    } catch {
      setScrapeNote(
        "Couldn't auto-fetch details from that link — fill in manually below.",
      );
    } finally {
      setScraping(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      link: form.link,
      imageUrl: form.imageUrl || null,
      price: form.price || null,
      notes: form.notes || null,
      occasion: form.occasion,
    };

    const res = await fetch(
      gift ? `/api/admin/gifts/${gift.id}` : "/api/admin/gifts",
      {
        method: gift ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save gift");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div>
        <label className="mb-1 block text-sm text-neutral-600">Gift link</label>
        <div className="flex gap-2">
          <Input
            type="url"
            required
            placeholder="https://..."
            value={form.link}
            onChange={(e) => update("link", e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleFetchDetails}
            disabled={scraping || !form.link}
          >
            {scraping ? "Fetching…" : "Fetch details"}
          </Button>
        </div>
        {scrapeNote && (
          <p className="mt-2 text-xs text-neutral-500">{scrapeNote}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm text-neutral-600">Title</label>
        <Input
          required
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-neutral-600">
            Image URL
          </label>
          <Input
            type="url"
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-600">Price</label>
          <Input
            placeholder="~$40"
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-neutral-600">Occasion</label>
        <Input
          required
          placeholder="Birthday, Christmas, ..."
          value={form.occasion}
          onChange={(e) => update("occasion", e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-neutral-600">Notes</label>
        <Textarea
          rows={3}
          placeholder="Size, color, anything helpful"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : gift ? "Save changes" : "Add gift"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/admin")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
