/**
 * The resident's simple, gentle needs model.
 *
 * Mood and energy are only affected by the resident's own life (rest, play, attention).
 * Unread mail, busy calendars, or overdue tasks deliberately have NO effect.
 */

export interface PetVitals {
  mood: number; // 0..100
  energy: number; // 0..100
  updatedAt: number;
}

export const DEFAULT_VITALS: PetVitals = { mood: 72, energy: 80, updatedAt: 0 };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Advance vitals by elapsed time. Mood drifts toward a content baseline of 65, never below 40 from neglect. */
export function tickVitals(v: PetVitals, now: number, sleeping: boolean): PetVitals {
  if (!v.updatedAt) return { ...v, updatedAt: now };
  const hours = Math.min(48, Math.max(0, (now - v.updatedAt) / 3_600_000));
  const energy = sleeping ? clamp(v.energy + hours * 18) : clamp(v.energy - hours * 6);
  const baseline = 65;
  const pull = 1 - Math.pow(0.5, hours / 6); // half-way to baseline every 6h
  let mood = v.mood + (baseline - v.mood) * pull;
  if (mood < 40 && v.mood >= 40) mood = 40;
  return { mood: clamp(mood), energy, updatedAt: now };
}

export type PetAction = "pet" | "play" | "snack" | "rest";

export function applyAction(v: PetVitals, action: PetAction, now: number): PetVitals {
  switch (action) {
    case "pet":
      return { ...v, mood: clamp(v.mood + 6), updatedAt: now };
    case "play":
      return { ...v, mood: clamp(v.mood + 12), energy: clamp(v.energy - 8), updatedAt: now };
    case "snack":
      return { ...v, mood: clamp(v.mood + 4), energy: clamp(v.energy + 10), updatedAt: now };
    case "rest":
      return { ...v, energy: clamp(v.energy + 4), updatedAt: now };
  }
}

export function moodWord(v: PetVitals): string {
  if (v.energy < 22) return "sleepy";
  if (v.mood >= 85) return "delighted";
  if (v.mood >= 65) return "content";
  if (v.mood >= 45) return "calm";
  return "a little quiet";
}
