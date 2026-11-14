import type { DayScore } from "./types";

export type Exercise = {
  id: string; position: number; name: string; sets: number | null; reps: string | null;
  weight: number | null; minutes: number | null; notes: string | null;
};
export type Template = { id: string; name: string; kind: "strength" | "cardio" | "mobility"; est_minutes: number; position: number; exercises: Exercise[] };
export type ExerciseLog = { exercise_id: string | null; name: string; done: boolean; sets_done: number | null; reps: string | null; weight: number | null };
export type Session = { id: string; template_id: string | null; template_name: string; session_date: string; scheduled: boolean;
  duration_min: number | null; completed_at: string | null; logs: ExerciseLog[] };
export type HabitSettings = { water_enabled: boolean; water_target: number; protein_enabled: boolean; protein_target: number };

export type TodayResponse = {
  today: string;
  weekday: number;
  weekStart: string;
  scheduled: Template | null;
  templates: { id: string; name: string; kind: Template["kind"] }[];
  sessions: Session[];
  lastUsed: Record<string, { weight: number | null; reps: string | null; date: string }>;
  habits: { settings: HabitSettings; today: { water: number; protein: number } };
  days: DayScore[];
  hasProgram: boolean;
};

export type ProgramResponse = { templates: Template[]; schedule: (string | null)[] };

export type ProgressResponse = {
  weeks: { week_start: string; points: number; active_days: number; bonus: number }[];
  lifetime: number;
  prs: { name: string; weight: number; reps: string | null; date: string }[];
  sessions: { id: string; template_name: string; session_date: string; duration_min: number | null; done: number; total: number }[];
};

