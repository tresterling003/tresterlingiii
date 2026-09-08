"use client";

import { useRef, useState } from "react";
import { Card, Badge, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { SubmissionCard } from "./SubmissionCard";
import type { AssignmentData, SubmissionData } from "./types";

export function AssignmentDetail({
  classId,
  assignment,
  students,
  color,
}: {
  classId: string;
  assignment: AssignmentData;
  students: { id: string; name: string }[];
  color: string;
}) {
  const [submissions, setSubmissions] = useState(assignment.submissions);
  const [studentId, setStudentId] = useState("");
  const [otherName, setOtherName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateSubmission(updated: SubmissionData) {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function deleteSubmission(id: string) {
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  async function uploadSubmission() {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const photoUrls: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        photoUrls.push(data.url);
      }

      const res = await fetch(
        `/api/classes/${classId}/assignments/${assignment.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: studentId || undefined,
            studentNameFallback: studentId ? undefined : otherName || undefined,
            photoUrls,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create submission");

      const student = students.find((s) => s.id === studentId) ?? null;
      setSubmissions((prev) => [...prev, { ...data.submission, student }]);
      setFiles([]);
      setOtherName("");
      setStudentId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">{assignment.title}</h2>
          <p className="text-sm text-muted">{assignment.pointsPossible} points possible</p>
        </div>
        <Badge color={color}>{assignment.type[0] + assignment.type.slice(1).toLowerCase()}</Badge>
      </div>

      {(assignment.rubric || assignment.answerKey || assignment.instructions) && (
        <details className="mb-6 rounded-2xl border border-border bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Rubric &amp; answer key
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            {assignment.instructions && (
              <p className="text-muted">{assignment.instructions}</p>
            )}
            {assignment.rubric && (
              <ul className="list-disc pl-4 text-ink">
                {assignment.rubric.criteria.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span> — {c.points} pts
                    {c.description && <span className="text-muted"> · {c.description}</span>}
                  </li>
                ))}
              </ul>
            )}
            {assignment.answerKey && (
              <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-xs text-ink">
                {assignment.answerKey}
              </pre>
            )}
          </div>
        </details>
      )}

      <Card className="mb-6">
        <p className="mb-3 text-sm font-semibold text-ink">Add a submission</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Student
            </label>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Type a name instead…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          {!studentId && (
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Name
              </label>
              <input
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder="Student name"
                className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink/40"
              />
            </div>
          )}
        </div>
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Photo(s) of the work
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-black/5 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-muted">{files.length} photo(s) selected</p>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <Button
          onClick={uploadSubmission}
          disabled={uploading || files.length === 0}
          className="mt-3"
        >
          {uploading ? "Uploading…" : "Add submission"}
        </Button>
      </Card>

      {submissions.length === 0 ? (
        <EmptyState
          icon="📸"
          title="No submissions yet"
          description="Upload a photo above to get started — you can grade it with AI right after."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id}
              classId={classId}
              assignmentId={assignment.id}
              pointsPossible={assignment.pointsPossible}
              color={color}
              submission={s}
              onChange={updateSubmission}
              onDelete={deleteSubmission}
            />
          ))}
        </div>
      )}
    </div>
  );
}
