"use client";
import { useState } from "react";
import { useWorld, world } from "@/engine/store";
import { petAction, renamePet } from "@/engine/actions";
import { moodWord } from "@/domain/pet";
import type { ResidentController } from "@/engine/character";
import { RESIDENT_COLORS } from "@/scene/theme";
import { Panel } from "../Panel";

function resident(): ResidentController | null {
  return (window as unknown as { __resident?: ResidentController }).__resident ?? null;
}

export function PetPanel() {
  const pet = useWorld((s) => s.pet);
  const theme = useWorld((s) => s.settings.theme);
  const [name, setName] = useState(pet.name);
  const v = pet.vitals;
  const sleeping = resident()?.state.behavior === "sleep";

  const act = (a: "play" | "snack" | "rest") => {
    petAction(a);
    if (a === "play") resident()?.command("play");
    if (a === "rest") resident()?.command(sleeping ? "idle" : "sleep");
    if (a === "snack") resident()?.react("pet");
  };

  return (
    <Panel title={pet.name} skin="card" width={440}>
      <p className="text-[17px] mb-4">
        {pet.name} is feeling <b>{moodWord(v)}</b>{sleeping ? " and napping" : ""}.
      </p>
      <Meter label="Mood" value={v.mood} color="#D9694F" />
      <Meter label="Energy" value={v.energy} color="#4F8C8C" />
      <div className="grid grid-cols-3 gap-2 mt-4">
        <button type="button" className="btn" onClick={() => act("play")}>Play</button>
        <button type="button" className="btn" onClick={() => act("snack")}>Snack</button>
        <button type="button" className="btn" onClick={() => act("rest")}>{sleeping ? "Wake" : "Nap"}</button>
      </div>
      <form className="mt-5 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); renamePet(name); }}>
        <label className="flex-1 text-sm font-semibold">
          Name
          <input className="field mt-1" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={!name.trim() || name.trim() === pet.name}>Save</button>
      </form>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold mb-2">Colour</legend>
        <div className="flex gap-2">
          {RESIDENT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.name}
              aria-pressed={theme.residentBody === c.body}
              className={`w-11 h-11 rounded-full border-[3px] ${theme.residentBody === c.body ? "border-ink ring-4 ring-honey" : "border-ink/60"}`}
              style={{ background: c.body }}
              onClick={() => world.set((s) => ({ settings: { ...s.settings, theme: { ...s.settings.theme, residentBody: c.body, residentBelly: c.belly, residentSprout: c.sprout } } }))}
            />
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-soft mt-4">{pet.name}'s mood only depends on rest and play, never on your inbox or your schedule.</p>
    </Panel>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm font-semibold mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-4 rounded-full border-2 border-ink bg-paper-warm overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
