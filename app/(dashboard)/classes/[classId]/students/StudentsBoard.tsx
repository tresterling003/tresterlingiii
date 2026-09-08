"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

interface StudentData {
  id: string;
  name: string;
}

export function StudentsBoard({
  classId,
  initialStudents,
}: {
  classId: string;
  initialStudents: StudentData[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [bulkNames, setBulkNames] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addNames(e: React.FormEvent) {
    e.preventDefault();
    const names = bulkNames.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    const res = await fetch(`/api/classes/${classId}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    if (res.ok) {
      const data = await res.json();
      setStudents((prev) =>
        [...prev, ...data.students].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setBulkNames("");
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this student? Past submissions stay, just unlinked.")) return;
    setBusyId(id);
    const res = await fetch(`/api/classes/${classId}/students/${id}`, { method: "DELETE" });
    if (res.ok) setStudents((prev) => prev.filter((s) => s.id !== id));
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {adding ? (
        <Card>
          <form onSubmit={addNames} className="flex flex-col gap-3">
            <Textarea
              autoFocus
              rows={8}
              placeholder={"Jane Doe\nJohn Smith\n…"}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit">Add students</Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
          + Add students
        </Button>
      )}

      {students.length === 0 && !adding ? (
        <p className="py-8 text-center text-sm text-muted">No students added yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {students.map((s) => (
            <Card key={s.id} className="flex items-center justify-between py-2.5">
              <span className="truncate text-sm font-medium text-ink">{s.name}</span>
              <button
                disabled={busyId === s.id}
                onClick={() => remove(s.id)}
                className="ml-2 flex-shrink-0 text-xs text-muted hover:text-red-600"
              >
                ✕
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
