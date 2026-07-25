import { z } from "zod";

export const ANIMATION_PACKS = [
  "none",
  "confetti",
  "snow",
  "fireworks",
  "paw-prints",
  "team",
] as const;

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex color");

export const themeUpdateSchema = z.object({
  primaryColor: hexColor,
  accentColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  backgroundImageUrl: z.string().url().nullable().optional(),
  animationPack: z.enum(ANIMATION_PACKS),
});
