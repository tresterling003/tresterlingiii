import {
  Bike, Dumbbell, Flame, Flower2, Footprints, HeartPulse, Mountain, Move, Volleyball, Waves, Zap, PersonStanding,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "./types";

export const ACTIVITY: Record<string, { label: string; icon: LucideIcon; category: Category; hint: string }> = {
  steps: { label: "Daily steps", icon: Footprints, category: "steps", hint: "Your phone or watch total" },
  walk: { label: "Walk", icon: PersonStanding, category: "steps", hint: "A walk with a step count" },
  run: { label: "Run", icon: Flame, category: "cardio", hint: "Runs, jogs, treadmill" },
  cycle: { label: "Cycling", icon: Bike, category: "cardio", hint: "Road, trail or indoor" },
  swim: { label: "Swim", icon: Waves, category: "cardio", hint: "Pool or open water" },
  hiit: { label: "HIIT", icon: Zap, category: "cardio", hint: "Intervals, circuits" },
  cardio: { label: "Cardio", icon: HeartPulse, category: "cardio", hint: "Elliptical, rower, class" },
  sport: { label: "Sport", icon: Volleyball, category: "cardio", hint: "Pickup games, matches" },
  hike: { label: "Hike", icon: Mountain, category: "cardio", hint: "Trails and climbs" },
  strength: { label: "Strength", icon: Dumbbell, category: "strength", hint: "Weights, bodyweight" },
  yoga: { label: "Yoga", icon: Flower2, category: "mobility", hint: "Any style" },
  mobility: { label: "Mobility", icon: Move, category: "mobility", hint: "Stretching, foam rolling" },
};

export const ACTIVITY_ORDER = ["steps", "walk", "run", "cycle", "swim", "hiit", "cardio", "sport", "hike", "strength", "yoga", "mobility"];

export const CATEGORY: Record<Category | "plan" | "goal" | "bonus", { label: string; color: string }> = {
  steps: { label: "Steps", color: "#7AB8FF" },
  cardio: { label: "Cardio", color: "#C8FF3D" },
  strength: { label: "Strength", color: "#F4F5F7" },
  mobility: { label: "Mobility", color: "#B79CFF" },
  plan: { label: "Planned workout", color: "#FFB547" },
  goal: { label: "Daily goal", color: "#FFB547" },
  bonus: { label: "Consistency", color: "#FFB547" },
};

export const KM_PER_MI = 1.609344;
