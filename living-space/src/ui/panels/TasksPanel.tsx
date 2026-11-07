"use client";
import { useState } from "react";
import { useWorld } from "@/engine/store";
import { addTask, clearDoneTasks, deleteTask, toggleTask } from "@/engine/actions";
import { dateKey } from "@/domain/time";
import { Panel } from "../Panel";

export function TasksPanel() {
  const tasks = useWorld((s) => s.tasks);
  const now = useWorld((s) => s.now);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const today = dateKey(new Date(now));
  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || b.createdAt - a.createdAt);
  const done = tasks.filter((t) => t.done);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addTask(text.slice(0, 120), due || null);
    setText("");
    setDue("");
  };

  return (
    <Panel title="Sticky notes" skin="note" width={480}>
      <form onSubmit={submit} className="flex flex-col gap-2 mb-4">
        <label htmlFor="task" className="sr-only">New note</label>
        <input id="task" data-autofocus className="field !bg-[#fffbea]" placeholder="Write a note…" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2 items-center">
          <label htmlFor="due" className="text-sm font-semibold shrink-0">Due</label>
          <input id="due" type="date" className="field !bg-[#fffbea] flex-1" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="btn btn-primary shrink-0" disabled={!text.trim()}>Pin it</button>
        </div>
      </form>
      {open.length === 0 && <p className="text-center py-4 font-display">No notes pinned. A clear board.</p>}
      <ul className="flex flex-col gap-2">
        {open.map((t) => (
          <TaskRow key={t.id} id={t.id} text={t.text} due={t.due} done={false} overdue={!!t.due && t.due < today} today={t.due === today} />
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <div className="flex items-center mt-5 mb-2">
            <h3 className="font-display flex-1">Done</h3>
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearDoneTasks}>Clear done</button>
          </div>
          <ul className="flex flex-col gap-2">
            {done.slice(0, 20).map((t) => (
              <TaskRow key={t.id} id={t.id} text={t.text} due={t.due} done overdue={false} today={false} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function TaskRow({ id, text, due, done, overdue, today }: { id: string; text: string; due: string | null; done: boolean; overdue: boolean; today: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-lg bg-[#fffbea] border-2 border-ink/70 px-3 py-2 ${done ? "opacity-60" : ""}`}>
      <input id={`t-${id}`} type="checkbox" checked={done} onChange={() => toggleTask(id)} className="w-6 h-6 accent-[#4f8c8c] shrink-0" />
      <label htmlFor={`t-${id}`} className="flex-1 min-w-0 cursor-pointer">
        <span className={`block text-[16px] ${done ? "line-through" : ""}`}>{text}</span>
        {due && (
          <span className={`block text-xs ${today ? "text-teal font-bold" : overdue ? "text-tomato-dark font-bold" : "text-ink-soft"}`}>
            {today ? "Due today" : overdue ? `Was due ${new Date(due + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : `Due ${new Date(due + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`}
          </span>
        )}
      </label>
      <button type="button" className="btn btn-sm btn-ghost !min-w-[40px]" aria-label={`Delete note: ${text}`} onClick={() => deleteTask(id)}>×</button>
    </li>
  );
}
