import { z } from "zod";

const resourceType = z.enum([
  "LESSON_PLAN",
  "SLIDES",
  "NOTES",
  "WORKSHEET",
  "QUIZ",
  "TEST",
  "PROJECT",
  "OTHER",
]);

export const generateResourceSchema = z.object({
  type: resourceType,
  topic: z.string().min(1).max(500),
  unitId: z.string().optional().nullable(),
  extraInstructions: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
});

export const createResourceSchema = z.object({
  type: resourceType,
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  unitId: z.string().optional().nullable(),
});

export const updateResourceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  unitId: z.string().optional().nullable(),
});
