"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";

interface UnitOption {
  id: string;
  title: string;
}

interface LogEntryData {
  id: string;
  date: string | Date;
  summary: string;
  details: string | null;
  unit: UnitOption | null;
}

export function TimelineBoard({
  classId,
  initialLogEntries,
  units,
}: {
  classId: string;
  initialLogEntries: LogEntryData[];
  units: UnitOption[];
}) {
  const [entries, setEntries] = useState(initialLogEntries);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [unitId, setUnitId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    const res = await fetch(`/api/classes/${classId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date(date).toISOString(),
        summary,
        details: details || undefined,
        unitId: unitId || undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const unit = units.find((u) => u.id === unitId) ?? null;
      setEntries((prev) => [{ ...data.logEntry, unit }, ...prev]);
      setSummary("");
      setDetails("");
      setUnitId("");
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this log entry?")) return;
    setBusyId(id);
    const res = await fetch(`/api/classes/${classId}/log/${id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {adding ? (
        <Card>
          <form onSubmit={addEntry} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
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
              <Label>What happened</Label>
              <Input
                required
                autoFocus
                placeholder="e.g. Lab: titration practice"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Add entry</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
          + Log what you did today
        </Button>
      )}

      {entries.length === 0 && !adding && (
        <p className="py-8 text-center text-sm text-muted">No timeline entries yet.</p>
      )}

      {entries.map((entry) => (
        <Card key={entry.id} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              {new Date(entry.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {entry.unit && <span> · {entry.unit.title}</span>}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">{entry.summary}</p>
            {entry.details && <p className="mt-1 text-sm text-muted">{entry.details}</p>}
          </div>
          <button
            disabled={busyId === entry.id}
            onClick={() => remove(entry.id)}
            className="flex-shrink-0 text-xs text-muted hover:text-red-600"
          >
            Delete
          </button>
        </Card>
      ))}
    </div>
  );
}
