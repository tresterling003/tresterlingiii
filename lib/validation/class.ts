import { z } from "zod";

export const createClassSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().max(120).optional().nullable(),
  gradeLevel: z.string().max(60).optional().nullable(),
  period: z.string().max(60).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emoji: z.string().max(8).optional(),
  description: z.string().max(2000).optional().nullable(),
});

export const updateClassSchema = createClassSchema.partial().extend({
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export const createUnitSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).optional().nullable(),
  order: z.number().int().optional(),
  status: z.enum(["UPCOMING", "IN_PROGRESS", "DONE"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export const updateUnitSchema = createUnitSchema.partial();

export const createLogEntrySchema = z.object({
  date: z.string().datetime(),
  summary: z.string().min(1).max(2000),
  details: z.string().max(8000).optional().nullable(),
  unitId: z.string().optional().nullable(),
});

export const updateLogEntrySchema = createLogEntrySchema.partial();

export const createStudentSchema = z.object({
  name: z.string().min(1).max(200),
});

export const importDumpSchema = z.object({
  rawText: z.string().min(20).max(200_000),
});
