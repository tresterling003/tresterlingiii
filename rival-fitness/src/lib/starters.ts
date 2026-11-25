/** Starter programs. Everything is editable after it's added. */
export type StarterExercise = { name: string; sets?: number; reps?: string; minutes?: number; notes?: string };
export type StarterTemplate = { key: string; name: string; kind: "strength" | "cardio" | "mobility"; est_minutes: number; exercises: StarterExercise[] };
export type Starter = { key: string; name: string; blurb: string; days: string; templates: StarterTemplate[]; schedule: (string | null)[] };

const cardio: StarterTemplate = {
  key: "cardio", name: "Cardio 30", kind: "cardio", est_minutes: 30,
  exercises: [{ name: "Run, bike, row or brisk walk", minutes: 30, notes: "Conversational pace" }],
};
const mobility: StarterTemplate = {
  key: "mobility", name: "Mobility 20", kind: "mobility", est_minutes: 20,
  exercises: [
    { name: "Foam roll", minutes: 5 },
    { name: "Hip flexor + hamstring stretch", minutes: 5 },
    { name: "Thoracic spine + shoulder mobility", minutes: 5 },
    { name: "Deep squat hold", minutes: 5 },
  ],
};

export const STARTERS: Starter[] = [
  {
    key: "ppl", name: "Push / Pull / Legs", blurb: "Classic 3-day lifting split plus two cardio days and a mobility day.",
    days: "Lift M·W·F · Cardio T·Th · Mobility Sat",
    templates: [
      { key: "push", name: "Push Day", kind: "strength", est_minutes: 55, exercises: [
        { name: "Bench Press", sets: 4, reps: "6-8" }, { name: "Overhead Press", sets: 3, reps: "8-10" },
        { name: "Incline Dumbbell Press", sets: 3, reps: "10" }, { name: "Lateral Raise", sets: 3, reps: "12-15" },
        { name: "Triceps Pushdown", sets: 3, reps: "12" },
      ] },
      { key: "pull", name: "Pull Day", kind: "strength", est_minutes: 55, exercises: [
        { name: "Deadlift", sets: 3, reps: "5" }, { name: "Pull-Up", sets: 3, reps: "6-10" },
        { name: "Barbell Row", sets: 3, reps: "8-10" }, { name: "Face Pull", sets: 3, reps: "15" },
        { name: "Biceps Curl", sets: 3, reps: "12" },
      ] },
      { key: "legs", name: "Leg Day", kind: "strength", est_minutes: 60, exercises: [
        { name: "Back Squat", sets: 4, reps: "6-8" }, { name: "Romanian Deadlift", sets: 3, reps: "8-10" },
        { name: "Walking Lunge", sets: 3, reps: "10/leg" }, { name: "Leg Curl", sets: 3, reps: "12" },
        { name: "Calf Raise", sets: 4, reps: "15" },
      ] },
      cardio, mobility,
    ],
    schedule: ["push", "cardio", "pull", "cardio", "legs", "mobility", null],
  },
  {
    key: "ul", name: "Upper / Lower", blurb: "Four lifting days, one cardio day, one mobility day.",
    days: "Lift M·T·Th·F · Cardio W · Mobility Sat",
    templates: [
      { key: "upper", name: "Upper Body", kind: "strength", est_minutes: 55, exercises: [
        { name: "Bench Press", sets: 4, reps: "6-8" }, { name: "Barbell Row", sets: 4, reps: "8" },
        { name: "Overhead Press", sets: 3, reps: "8-10" }, { name: "Lat Pulldown", sets: 3, reps: "10-12" },
        { name: "Dumbbell Curl", sets: 2, reps: "12" }, { name: "Triceps Extension", sets: 2, reps: "12" },
      ] },
      { key: "lower", name: "Lower Body", kind: "strength", est_minutes: 55, exercises: [
        { name: "Back Squat", sets: 4, reps: "6-8" }, { name: "Romanian Deadlift", sets: 3, reps: "8" },
        { name: "Leg Press", sets: 3, reps: "10-12" }, { name: "Leg Curl", sets: 3, reps: "12" },
        { name: "Plank", sets: 3, reps: "45s" },
      ] },
      cardio, mobility,
    ],
    schedule: ["upper", "lower", "cardio", "upper", "lower", "mobility", null],
  },
  {
    key: "fb", name: "Full Body 3×", blurb: "Three full-body sessions with walks in between. Great for getting started.",
    days: "Lift M·W·F · Cardio T·Th",
    templates: [
      { key: "full", name: "Full Body", kind: "strength", est_minutes: 50, exercises: [
        { name: "Goblet Squat", sets: 3, reps: "10" }, { name: "Push-Up", sets: 3, reps: "8-15" },
        { name: "Dumbbell Row", sets: 3, reps: "10/side" }, { name: "Romanian Deadlift", sets: 3, reps: "10" },
        { name: "Dumbbell Shoulder Press", sets: 3, reps: "10" }, { name: "Plank", sets: 3, reps: "30s" },
      ] },
      cardio,
    ],
    schedule: ["full", "cardio", "full", "cardio", "full", null, null],
  },
];
