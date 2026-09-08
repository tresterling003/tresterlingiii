"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { CLASS_COLOR_PRESETS } from "@/lib/utils/color";

const EMOJI_OPTIONS = ["📘", "🧪", "📐", "🎨", "📖", "🌍", "🎭", "💻", "🏛️", "🔬"];

export function NewClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [period, setPeriod] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(CLASS_COLOR_PRESETS[0]);
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject: subject || null,
          gradeLevel: gradeLevel || null,
          period: period || null,
          description: description || null,
          color,
          emoji,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create class");
        return;
      }
      const data = await res.json();
      router.push(`/classes/${data.class.id}/import`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label>Class name</Label>
          <Input
            required
            autoFocus
            placeholder="e.g. AP Biology, Period 3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Subject</Label>
            <Input placeholder="Biology" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Grade level</Label>
            <Input placeholder="10th grade" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Period / section (optional)</Label>
          <Input placeholder="Period 3" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div>
          <Label>Description (optional)</Label>
          <Textarea
            rows={2}
            placeholder="A quick note about this class"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {CLASS_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full ring-offset-2 transition-shadow"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : "none" }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div>
          <Label>Icon</Label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition-colors ${
                  emoji === e ? "border-ink bg-black/5" : "border-border"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading || !name.trim()} className="mt-1">
          {loading ? "Creating…" : "Create class"}
        </Button>
      </form>
    </Card>
  );
}
