"use client";
import type { ActivityItem, Task } from "@/domain/types";
import { applyAction, type PetAction } from "@/domain/pet";
import { world, type CueKind, type PanelId, type Toast } from "./store";

let seq = 0;
export const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function openPanel(id: PanelId, origin?: { x: number; y: number }, focusObject?: string) {
  world.set({ ui: { open: id, origin: origin ?? null, focusObject: focusObject ?? null } });
}
export function closePanel() {
  world.set((s) => ({ ui: { ...s.ui, open: null, focusObject: null } }));
}

export function toast(t: Omit<Toast, "id">) {
  const id = uid("t");
  world.set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  setTimeout(() => dismissToast(id), 6000);
}
export function dismissToast(id: string) {
  world.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function cue(kind: CueKind) {
  world.set({ cue: { kind, at: Date.now() } });
}

/** The single entry point every adapter uses to report something that happened. */
export function pushActivity(items: Omit<ActivityItem, "id" | "read">[]) {
  if (!items.length) return;
  const full = items.map((i) => ({ ...i, id: uid("a"), read: false }));
  world.set((s) => {
    const pulses = { ...s.pulses };
    if (full.some((i) => i.channel === "computer")) pulses.computer = Date.now();
    if (full.some((i) => i.channel === "phone")) pulses.phone = Date.now();
    return { activity: [...full, ...s.activity].slice(0, 100), pulses };
  });
  const phone = full.find((i) => i.channel === "phone");
  const comp = full.find((i) => i.channel === "computer");
  if (phone) {
    cue("phone");
    toast({ title: phone.title, body: phone.sourceLabel, panel: "phone", tone: "phone" });
  } else if (comp) {
    cue("computer");
  }
}

export function markActivityRead(channel: "computer" | "phone") {
  world.set((s) => ({ activity: s.activity.map((a) => (a.channel === channel ? { ...a, read: true } : a)) }));
}
export function removeActivity(id: string) {
  world.set((s) => ({ activity: s.activity.filter((a) => a.id !== id) }));
}

export function addTask(text: string, due: string | null) {
  const t: Task = { id: uid("task"), text: text.trim(), due, done: false, createdAt: Date.now(), doneAt: null };
  world.set((s) => ({ tasks: [t, ...s.tasks] }));
}
export function toggleTask(id: string) {
  world.set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : Date.now() } : t)) }));
}
export function deleteTask(id: string) {
  world.set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
}
export function clearDoneTasks() {
  world.set((s) => ({ tasks: s.tasks.filter((t) => !t.done) }));
}

export function petAction(a: PetAction) {
  world.set((s) => ({ pet: { ...s.pet, vitals: applyAction(s.pet.vitals, a, Date.now()) } }));
}
export function renamePet(name: string) {
  const n = name.trim().slice(0, 18);
  if (n) world.set((s) => ({ pet: { ...s.pet, name: n } }));
}
