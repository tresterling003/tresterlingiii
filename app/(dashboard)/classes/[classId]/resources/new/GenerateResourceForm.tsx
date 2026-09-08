"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";

const TYPES: { value: string; label: string; icon: string }[] = [
  { value: "LESSON_PLAN", label: "Lesson plan", icon: "📋" },
  { value: "SLIDES", label: "Slide outline", icon: "🖥️" },
  { value: "NOTES", label: "Notes page", icon: "📝" },
  { value: "WORKSHEET", label: "Worksheet", icon: "📄" },
  { value: "QUIZ", label: "Quiz", icon: "❓" },
  { value: "TEST", label: "Test", icon: "🧾" },
  { value: "PROJECT", label: "Project", icon: "🛠️" },
];

export function GenerateResourceForm({
  classId,
  units,
  defaultUnitId,
}: {
  classId: string;
  units: { id: string; title: string }[];
  defaultUnitId?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState("LESSON_PLAN");
  const [topic, setTopic] = useState("");
  const [unitId, setUnitId] = useState(defaultUnitId ?? "");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          topic,
          unitId: unitId || undefined,
          extraInstructions: extraInstructions || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Generation failed — try again.");
        return;
      }
      router.push(`/classes/${classId}/resources/${data.resource.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label>Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                  type === t.value ? "border-ink bg-black/5 text-ink" : "border-border text-muted"
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Topic / focus</Label>
          <Input
            required
            autoFocus
            placeholder="e.g. Photosynthesis: light-dependent reactions"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <Label>Unit (optional)</Label>
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">No specific unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Extra instructions (optional)</Label>
          <Textarea
            rows={3}
            placeholder="Anything specific — reading level, must-include vocabulary, time limit, format tweaks…"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading || !topic.trim()}>
          {loading ? "Drafting…" : "✨ Generate"}
        </Button>
      </form>
    </Card>
  );
}
