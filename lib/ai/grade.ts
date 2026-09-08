import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "./client";

export const gradeResultSchema = z.object({
  overallScore: z.number().describe("Points earned out of pointsPossible, as a single number."),
  overallFeedback: z.string().describe("2-4 sentences of feedback written directly to the student."),
  criteria: z
    .array(
      z.object({
        name: z.string(),
        pointsEarned: z.number(),
        pointsPossible: z.number(),
        comment: z.string(),
      }),
    )
    .describe("Per-criterion or per-question breakdown. If no rubric/answer key structure was given, break the work into a few natural criteria yourself."),
  strengths: z.array(z.string()).describe("Short bullet points of what the student did well."),
  improvements: z.array(z.string()).describe("Short bullet points of what to work on."),
  transcription: z
    .string()
    .describe("A best-effort plain-text transcription/description of the work visible in the photo(s), for the teacher's reference."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How confident you are in this grade — 'low' if handwriting is illegible, photos are unclear, or the work doesn't match the assignment."),
});

export type GradeResult = z.infer<typeof gradeResultSchema>;

export interface GradeSubmissionInput {
  assignmentTitle: string;
  assignmentType: string;
  pointsPossible: number;
  instructions?: string | null;
  rubric?: unknown;
  answerKey?: string | null;
  photoUrls: string[];
}

export async function gradeSubmission(
  input: GradeSubmissionInput,
): Promise<GradeResult> {
  const {
    assignmentTitle,
    assignmentType,
    pointsPossible,
    instructions,
    rubric,
    answerKey,
    photoUrls,
  } = input;

  if (photoUrls.length === 0) {
    throw new Error("At least one photo is required to grade a submission.");
  }

  const system = `You are an experienced, fair high school teacher grading a student's photographed work. Read the photo(s) carefully — they may show handwriting, so do your best to read it and note in "transcription" anywhere you're unsure. Grade strictly against the rubric and/or answer key provided; if neither is detailed enough to fully judge a criterion, use sound academic judgment and say so in the comment for that criterion. Be firm but encouraging in tone, and never award points for work that isn't visible in the photo.`;

  const contextParts = [
    `Assignment: ${assignmentTitle} (${assignmentType})`,
    `Points possible: ${pointsPossible}`,
    instructions ? `Instructions given to students:\n${instructions}` : null,
    rubric ? `Rubric (JSON):\n${JSON.stringify(rubric, null, 2)}` : null,
    answerKey ? `Answer key:\n${answerKey}` : null,
    !rubric && !answerKey
      ? "No rubric or answer key was provided — grade holistically against grade-appropriate expectations for this assignment type."
      : null,
  ].filter(Boolean);

  const content: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [
    ...photoUrls.map(
      (url): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "url", url },
      }),
    ),
    {
      type: "text",
      text: `${contextParts.join("\n\n")}\n\nGrade the student's work shown in the photo(s) above.`,
    },
  ];

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(gradeResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Could not parse the grading result from the model's response.");
  }
  return response.parsed_output;
}
