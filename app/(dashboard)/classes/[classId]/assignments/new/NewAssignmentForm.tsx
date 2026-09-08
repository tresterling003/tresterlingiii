"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";

const TYPES = ["TEST", "QUIZ", "WORKSHEET", "PROJECT", "OTHER"];

interface Criterion {
  name: string;
  points: string;
  description: string;
}

export function NewAssignmentForm({
  classId,
  units,
}: {
  classId: string;
  units: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("TEST");
  const [unitId, setUnitId] = useState("");
  const [pointsPossible, setPointsPossible] = useState("100");
  const [instructions, setInstructions] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [useRubric, setUseRubric] = useState(true);
  const [criteria, setCriteria] = useState<Criterion[]>([
    { name: "", points: "", description: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCriterion(i: number, field: keyof Criterion, value: string) {
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const cleanCriteria = criteria
        .filter((c) => c.name.trim() && c.points.trim())
        .map((c) => ({
          name: c.name.trim(),
          points: Number(c.points),
          description: c.description.trim() || undefined,
        }));

      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          unitId: unitId || undefined,
          pointsPossible: Number(pointsPossible) || 100,
          instructions: instructions || undefined,
          answerKey: answerKey || undefined,
          rubric: useRubric && cleanCriteria.length > 0 ? { criteria: cleanCriteria } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not create assignment");
        return;
      }
      router.push(`/classes/${classId}/assignments/${data.assignment.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label>Title</Label>
          <Input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0] + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Points possible</Label>
            <Input
              type="number"
              min={0}
              value={pointsPossible}
              onChange={(e) => setPointsPossible(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit (optional)</Label>
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Instructions given to students (optional)</Label>
          <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>

        <div className="rounded-xl border border-border p-3">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={useRubric} onChange={(e) => setUseRubric(e.target.checked)} />
            Grade against a rubric
          </label>
          {useRubric && (
            <div className="flex flex-col gap-2">
              {criteria.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_1fr_auto] items-start gap-2">
                  <Input
                    placeholder="Criterion (e.g. Thesis clarity)"
                    value={c.name}
                    onChange={(e) => updateCriterion(i, "name", e.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Pts"
                    value={c.points}
                    onChange={(e) => updateCriterion(i, "points", e.target.value)}
                  />
                  <Input
                    placeholder="What earns full credit (optional)"
                    value={c.description}
                    onChange={(e) => updateCriterion(i, "description", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setCriteria((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded-lg border border-border px-2 py-2.5 text-xs text-muted hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() => setCriteria((prev) => [...prev, { name: "", points: "", description: "" }])}
              >
                + Add criterion
              </Button>
            </div>
          )}
        </div>

        <div>
          <Label>Answer key (optional, works alongside or instead of a rubric)</Label>
          <Textarea
            rows={5}
            placeholder={"1. B\n2. Free response — accept any answer that cites two of the three causes…"}
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading || !title.trim()}>
          {loading ? "Creating…" : "Create assignment"}
        </Button>
      </form>
    </Card>
  );
}
