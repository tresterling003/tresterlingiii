"use client";
import { useWorld, world } from "@/engine/store";
import { closePanel, openPanel } from "@/engine/actions";
import { Panel } from "../Panel";
import { useInstall } from "../useInstall";

export function WelcomePanel() {
  const g = useWorld((s) => s.status?.google);
  const name = useWorld((s) => s.pet.name);
  const install = useInstall();
  const choose = (mode: "demo" | "live") => {
    world.set({ mode, onboarded: true });
    if (mode === "live") openPanel("settings");
    else closePanel();
  };
  return (
    <Panel title="Welcome home" skin="letter" width={520}>
      <p className="text-[17px] leading-7 mb-3">
        This is {name}'s room, and yours. Letters arrive at the door, today's plans hang on the board, and the window shows the sky outside.
      </p>
      <p className="text-[15px] text-ink-soft mb-5">Click or tap anything in the room. On a phone, swipe to look around.</p>
      <div className="flex flex-col gap-3">
        <button type="button" className="btn btn-primary justify-start !min-h-[56px] text-left" onClick={() => choose("live")} data-autofocus>
          <span>
            <span className="block">Set up my real day</span>
            <span className="block text-sm font-normal opacity-90">{g?.configured ? "Connect Google & choose your location" : "Choose your location (Google needs server setup)"}</span>
          </span>
        </button>
        <button type="button" className="btn justify-start !min-h-[56px] text-left" onClick={() => choose("demo")}>
          <span>
            <span className="block">Look around with sample data</span>
            <span className="block text-sm font-normal text-ink-soft">Everything is marked “Sample”. Switch any time in Settings.</span>
          </span>
        </button>
      </div>
      {install.platform !== "desktop" && !install.installed && !install.localOnly && (
        <button type="button" className="btn btn-sm btn-ghost mt-4 -ml-2" onClick={() => { world.set({ onboarded: true }); openPanel("settings"); }}>
          Add Living Space to your home screen →
        </button>
      )}
    </Panel>
  );
}
