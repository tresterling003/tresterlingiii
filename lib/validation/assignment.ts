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

export const rubricCriterionSchema = z.object({
  name: z.string().min(1).max(200),
  points: z.number().min(0),
  description: z.string().max(1000).optional(),
});

export const rubricSchema = z.object({
  criteria: z.array(rubricCriterionSchema).min(1),
});

export const createAssignmentSchema = z.object({
  title: z.string().min(1).max(200),
  type: resourceType.optional(),
  unitId: z.string().optional().nullable(),
  pointsPossible: z.number().min(0).max(1000).optional(),
  instructions: z.string().max(4000).optional().nullable(),
  rubric: rubricSchema.optional().nullable(),
  answerKey: z.string().max(20000).optional().nullable(),
});

export const updateAssignmentSchema = createAssignmentSchema.partial();

export const createSubmissionSchema = z.object({
  studentId: z.string().optional().nullable(),
  studentNameFallback: z.string().max(200).optional().nullable(),
  photoUrls: z.array(z.string().url()).min(1).max(10),
});

export const updateSubmissionSchema = z.object({
  finalScore: z.number().min(0).optional().nullable(),
  teacherNotes: z.string().max(4000).optional().nullable(),
  studentId: z.string().optional().nullable(),
  status: z.enum(["PENDING", "GRADING", "GRADED", "REVIEWED", "FAILED"]).optional(),
});
