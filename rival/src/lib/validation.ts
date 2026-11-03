import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.");
const tz = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a team color.");

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(120),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
  displayName: z.string().trim().min(1, "Enter your name.").max(40),
  teamName: z.string().trim().min(2, "Team names need at least 2 characters.").max(32),
  teamAbbr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/, "Abbreviation must be 2–4 letters or numbers."),
  teamColor: color,
  timezone: tz,
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const workoutSchema = z.object({
  requestId: z.string().uuid(),
  type: z.string().min(1).max(20),
  date,
  durationMin: z.number().int().nullable().optional(),
  steps: z.number().int().nullable().optional(),
  distanceKm: z.number().positive().max(300).nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});

export const workoutUpdateSchema = workoutSchema.omit({ requestId: true });

export const leagueCreateSchema = z.object({
  name: z.string().trim().min(3, "League names need at least 3 characters.").max(40),
  maxMembers: z.number().int().min(4).max(20),
  seasonWeeks: z.number().int().min(1).max(26),
  playoffTeams: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]),
  timezone: tz,
});

const rule = z.object({ per: z.number(), points: z.number(), daily_cap: z.number() });
export const scoringSchema = z.object({
  steps: rule,
  cardio: rule,
  strength: rule,
  mobility: rule,
  planned_workout: z.number(),
  daily_goal: z.number(),
  active_day: z.object({ minutes: z.number(), steps: z.number() }),
  consistency: z.object({ days: z.number(), points: z.number() }),
  daily_cap: z.number(),
});

export const leagueUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(40),
    max_members: z.number().int().min(4).max(20),
    season_weeks: z.number().int().min(1).max(26),
    playoff_teams: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]),
    timezone: tz,
    scoring: scoringSchema,
  })
  .partial();

export const leagueActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), when: z.enum(["this_week", "next_week"]) }),
  z.object({ action: z.literal("new_season") }),
  z.object({ action: z.literal("regenerate_invite") }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
  z.object({ action: z.literal("transfer"), userId: z.string().uuid() }),
  z.object({ action: z.literal("reset_link"), userId: z.string().uuid() }),
]);

export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(40),
    team_name: z.string().trim().min(2).max(32),
    team_abbr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/, "Abbreviation must be 2–4 letters or numbers."),
    team_color: color,
    timezone: tz,
    share_details: z.boolean(),
  })
  .partial();

export const goalSchema = z.object({
  activeMinutes: z.number().int().min(10).max(180),
  steps: z.number().int().min(1000).max(40000),
});

export const planSchema = z.object({
  date,
  category: z.enum(["cardio", "strength", "mobility"]),
  targetMinutes: z.number().int().min(10).max(120),
});

export const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, "Use at least 8 characters.").max(200),
});
