import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./client";

const unitSchema = z.object({
  title: z.string(),
  summary: z.string(),
  order: z.number().int(),
  status: z.enum(["UPCOMING", "IN_PROGRESS", "DONE"]),
});

const logEntrySchema = z.object({
  date: z.string().describe("ISO 8601 date, e.g. 2026-08-25. Estimate if only relative timing is given."),
  summary: z.string(),
  unitTitle: z.string().nullable().describe("Title of the matching unit from the units list, or null if it doesn't map to one."),
});

export const importResultSchema = z.object({
  className: z.string().nullable().describe("The class/course name if mentioned, else null."),
  subject: z.string().nullable(),
  gradeLevel: z.string().nullable(),
  units: z.array(unitSchema).describe("The full year's scope-and-sequence, in teaching order, covering both what's been taught and what's planned."),
  logEntries: z.array(logEntrySchema).describe("A day-by-day (or class-by-class) log of what's actually happened so far."),
});

export type ImportResult = z.infer<typeof importResultSchema>;

export async function importClassDump(rawText: string): Promise<ImportResult> {
  const system = `You are helping a high school teacher migrate a month's worth of planning notes (originally kept in a chat conversation) into a structured curriculum tracker. Read the dump carefully and extract: (1) the full year's unit/topic sequence — including units already taught, the current unit, and units still planned — in teaching order, and (2) a day-by-day log of what actually happened in class so far. Infer reasonable dates when only relative references are given ("week 3", "last Tuesday"), anchored to a school year that started in mid-to-late August of the current year. Do not invent content that isn't supported by the dump — it's fine for a field to be sparse.`;

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [
      {
        role: "user",
        content: `Here is the raw planning dump to extract from:\n\n${rawText}`,
      },
    ],
    output_config: { format: zodOutputFormat(importResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Could not parse the import — the model's output didn't match the expected structure.");
  }
  return response.parsed_output;
}
