"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

interface ResourceData {
  id: string;
  type: string;
  title: string;
  content: string;
}

export function ResourceEditor({ classId, resource }: { classId: string; resource: ResourceData }) {
  const router = useRouter();
  const [title, setTitle] = useState(resource.title);
  const [content, setContent] = useState(resource.content);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/classes/${classId}/resources/${resource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this resource? This can't be undone.")) return;
    const res = await fetch(`/api/classes/${classId}/resources/${resource.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/classes/${classId}/resources`);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-base font-bold"
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-white p-1">
          <button
            onClick={() => setMode("preview")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "preview" ? "bg-ink text-white" : "text-muted"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setMode("edit")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "edit" ? "bg-ink text-white" : "text-muted"
            }`}
          >
            Edit
          </button>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && <span className="text-xs text-muted">Saved</span>}
          <Button variant="secondary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      <Card>
        {mode === "edit" ? (
          <Textarea
            rows={28}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
        ) : (
          <div
            className="prose-lesson"
            dangerouslySetInnerHTML={{ __html: marked.parse(content, { async: false }) as string }}
          />
        )}
      </Card>
    </div>
  );
}
