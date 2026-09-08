"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export function ImportForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ unitsCreated: number; logEntriesCreated: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/classes/${classId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Import failed — try again.");
        return;
      }
      setResult(data);
      setRawText("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Textarea
          required
          rows={16}
          placeholder="Paste your chat export here…"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="font-mono text-xs"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <p className="text-sm text-emerald-700">
            Added {result.unitsCreated} unit{result.unitsCreated === 1 ? "" : "s"} and {result.logEntriesCreated} timeline
            entr{result.logEntriesCreated === 1 ? "y" : "ies"}. Check the Curriculum and Timeline tabs.
          </p>
        )}
        <Button type="submit" disabled={loading || rawText.trim().length < 20} className="self-start">
          {loading ? "Reading through it…" : "Import"}
        </Button>
      </form>
    </Card>
  );
}
