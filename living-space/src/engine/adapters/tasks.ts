"use client";
import { dateKey } from "@/domain/time";
import { world } from "../store";
import { pushActivity } from "../actions";
import { load, save } from "../persist";
import type { SourceAdapter } from "./types";

/** App-generated reminders: once per day, a gentle note on the phone about tasks due today. */
export function taskRemindersAdapter(): SourceAdapter {
  return {
    id: "tasks",
    label: "Sticky-note reminders",
    channels: ["phone"],
    start() {
      const check = () => {
        const today = dateKey(new Date());
        if (load("taskReminder", "") === today) return;
        if (new Date().getHours() < 8) return;
        const due = world.get().tasks.filter((t) => !t.done && t.due && t.due <= today);
        if (!due.length) return;
        save("taskReminder", today);
        pushActivity([{ source: "tasks", sourceLabel: "Sticky notes", channel: "phone", title: due.length === 1 ? `Due today: ${due[0].text}` : `${due.length} notes due today`, at: Date.now(), sample: world.get().mode === "demo" }]);
      };
      const id = setInterval(check, 60_000);
      const first = setTimeout(check, 4000);
      return () => {
        clearInterval(id);
        clearTimeout(first);
      };
    },
  };
}
