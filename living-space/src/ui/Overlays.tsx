"use client";
import { useWorld } from "@/engine/store";
import { InboxPanel } from "./panels/InboxPanel";
import { AgendaPanel } from "./panels/AgendaPanel";
import { WeatherPanel } from "./panels/WeatherPanel";
import { ComputerPanel } from "./panels/ComputerPanel";
import { PhonePanel } from "./panels/PhonePanel";
import { TasksPanel } from "./panels/TasksPanel";
import { PetPanel } from "./panels/PetPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { WelcomePanel } from "./panels/WelcomePanel";
import { DevPanel } from "./panels/DevPanel";

export function Overlays() {
  const open = useWorld((s) => s.ui.open);
  switch (open) {
    case "inbox": return <InboxPanel />;
    case "agenda": return <AgendaPanel />;
    case "weather": return <WeatherPanel />;
    case "computer": return <ComputerPanel />;
    case "phone": return <PhonePanel />;
    case "tasks": return <TasksPanel />;
    case "pet": return <PetPanel />;
    case "settings": return <SettingsPanel />;
    case "welcome": return <WelcomePanel />;
    case "dev": return <DevPanel />;
    default: return null;
  }
}
