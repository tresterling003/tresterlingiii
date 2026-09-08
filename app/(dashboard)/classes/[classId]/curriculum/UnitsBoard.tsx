"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { withAlpha } from "@/lib/utils/color";

type UnitStatus = "UPCOMING" | "IN_PROGRESS" | "DONE";

interface UnitData {
  id: string;
  title: string;
  summary: string | null;
  order: number;
  status: UnitStatus;
}

const STATUS_LABEL: Record<UnitStatus, string> = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function UnitsBoard({
  classId,
  color,
  initialUnits,
}: {
  classId: string;
  color: string;
  initialUnits: UnitData[];
}) {
  const [units, setUnits] = useState(initialUnits);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch(`/api/classes/${classId}/units`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, summary: summary || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      setUnits((prev) => [...prev, data.unit]);
      setTitle("");
      setSummary("");
      setAdding(false);
    }
  }

  async function updateStatus(id: string, status: UnitStatus) {
    setBusyId(id);
    const res = await fetch(`/api/classes/${classId}/units/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    }
    setBusyId(null);
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = units.findIndex((u) => u.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= units.length) return;
    const a = units[idx];
    const b = units[swapIdx];
    setBusyId(id);
    await Promise.all([
      fetch(`/api/classes/${classId}/units/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      }),
      fetch(`/api/classes/${classId}/units/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      }),
    ]);
    const next = [...units];
    [next[idx], next[swapIdx]] = [
      { ...next[swapIdx], order: a.order },
      { ...next[idx], order: b.order },
    ];
    setUnits(next);
    setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this unit? Resources and log entries linked to it will stay, just unlinked.")) return;
    setBusyId(id);
    const res = await fetch(`/api/classes/${classId}/units/${id}`, { method: "DELETE" });
    if (res.ok) setUnits((prev) => prev.filter((u) => u.id !== id));
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {units.map((unit, i) => (
        <Card key={unit.id} className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted">{i + 1}.</span>
              <p className="font-semibold text-ink">{unit.title}</p>
            </div>
            {unit.summary && <p className="mt-1 text-sm text-muted">{unit.summary}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <select
              value={unit.status}
              disabled={busyId === unit.id}
              onChange={(e) => updateStatus(unit.id, e.target.value as UnitStatus)}
              className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium"
              style={{ color: unit.status === "IN_PROGRESS" ? color : undefined }}
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              disabled={busyId === unit.id || i === 0}
              onClick={() => move(unit.id, -1)}
              className="rounded-lg border border-border px-2 py-1.5 text-xs disabled:opacity-30"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              disabled={busyId === unit.id || i === units.length - 1}
              onClick={() => move(unit.id, 1)}
              className="rounded-lg border border-border px-2 py-1.5 text-xs disabled:opacity-30"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              disabled={busyId === unit.id}
              onClick={() => remove(unit.id)}
              className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </Card>
      ))}

      {adding ? (
        <Card style={{ borderColor: withAlpha(color, "55") }}>
          <form onSubmit={addUnit} className="flex flex-col gap-3">
            <div>
              <Label>Unit title</Label>
              <Input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Summary (optional)</Label>
              <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Add unit</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
          + Add unit
        </Button>
      )}
    </div>
  );
}
