"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { withAlpha } from "@/lib/utils/color";
import type { SubmissionData } from "./types";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Not graded", color: "#6b6b7b" },
  GRADING: { label: "Grading…", color: "#f59e0b" },
  GRADED: { label: "Needs review", color: "#6366f1" },
  REVIEWED: { label: "Reviewed", color: "#10b981" },
  FAILED: { label: "Grading failed", color: "#ef4444" },
};

export function SubmissionCard({
  classId,
  assignmentId,
  pointsPossible,
  color,
  submission,
  onChange,
  onDelete,
}: {
  classId: string;
  assignmentId: string;
  pointsPossible: number;
  color: string;
  submission: SubmissionData;
  onChange: (s: SubmissionData) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [grading, setGrading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalScore, setFinalScore] = useState(String(submission.finalScore ?? ""));
  const [teacherNotes, setTeacherNotes] = useState(submission.teacherNotes ?? "");

  const name = submission.student?.name ?? submission.studentNameFallback ?? "Unnamed student";
  const status = STATUS_STYLE[submission.status];

  async function gradeWithAI() {
    setGrading(true);
    try {
      const res = await fetch(
        `/api/classes/${classId}/assignments/${assignmentId}/submissions/${submission.id}/grade`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onChange(data.submission);
        setFinalScore(String(data.submission.finalScore ?? ""));
        setExpanded(true);
      }
    } finally {
      setGrading(false);
    }
  }

  async function saveReview() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/classes/${classId}/assignments/${assignmentId}/submissions/${submission.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finalScore: finalScore === "" ? null : Number(finalScore),
            teacherNotes: teacherNotes || null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) onChange(data.submission);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${name}'s submission?`)) return;
    const res = await fetch(
      `/api/classes/${classId}/assignments/${assignmentId}/submissions/${submission.id}`,
      { method: "DELETE" },
    );
    if (res.ok) onDelete(submission.id);
  }

  const feedback = submission.aiFeedback;

  return (
    <div className="rounded-2xl border border-border bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {submission.photoUrls[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={submission.photoUrls[0]}
            alt=""
            className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs" style={{ color: status.color }}>
            {status.label}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold text-ink">
            {submission.finalScore ?? submission.aiScore ?? "—"}
            <span className="text-xs font-normal text-muted"> / {pointsPossible}</span>
          </p>
        </div>
        <span className="flex-shrink-0 text-muted">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {submission.photoUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Page ${i + 1}`} className="h-24 w-24 rounded-lg object-cover" />
              </a>
            ))}
          </div>

          {submission.status === "PENDING" && (
            <Button onClick={gradeWithAI} disabled={grading}>
              {grading ? "Grading…" : "✨ Grade with AI"}
            </Button>
          )}

          {submission.status === "FAILED" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-600">Grading failed — the photos may be unclear, or there was a network issue.</p>
              <Button onClick={gradeWithAI} disabled={grading} className="self-start">
                {grading ? "Retrying…" : "Retry grading"}
              </Button>
            </div>
          )}

          {submission.status === "GRADING" && (
            <p className="text-sm text-muted">Reading through the work and grading against your rubric…</p>
          )}

          {feedback && (submission.status === "GRADED" || submission.status === "REVIEWED") && (
            <div className="flex flex-col gap-4">
              {feedback.confidence === "low" && (
                <p
                  className="rounded-lg px-3 py-2 text-xs font-medium"
                  style={{ backgroundColor: withAlpha("#f59e0b", "1f"), color: "#b45309" }}
                >
                  ⚠️ Low confidence — the photo may be unclear or hard to read. Double-check this one.
                </p>
              )}

              <p className="text-sm text-ink">{feedback.overallFeedback}</p>

              {feedback.criteria.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <tbody>
                      {feedback.criteria.map((c, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-medium text-ink">{c.name}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                            {c.pointsEarned}/{c.pointsPossible}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted">{c.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {feedback.strengths.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Strengths</p>
                    <ul className="list-disc pl-4 text-sm text-ink">
                      {feedback.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.improvements.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">To improve</p>
                    <ul className="list-disc pl-4 text-sm text-ink">
                      {feedback.improvements.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <details className="text-xs text-muted">
                <summary className="cursor-pointer font-medium">What the AI read from the photo</summary>
                <p className="mt-1 whitespace-pre-wrap">{feedback.transcription}</p>
              </details>

              <div className="flex items-end gap-3 border-t border-border pt-4">
                <div className="w-28">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Final score
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={finalScore}
                    onChange={(e) => setFinalScore(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Notes to yourself (optional)
                  </label>
                  <Textarea rows={1} value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} />
                </div>
                <Button
                  onClick={saveReview}
                  disabled={saving}
                  style={{ backgroundColor: color }}
                  className="text-white"
                >
                  {saving ? "Saving…" : submission.status === "REVIEWED" ? "Update" : "Mark reviewed"}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-border pt-3">
            <button onClick={remove} className="text-xs text-muted hover:text-red-600">
              Delete submission
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
