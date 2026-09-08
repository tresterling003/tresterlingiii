import { anthropic, MODEL } from "./client";
import type { ResourceType } from "@prisma/client";

const TYPE_GUIDANCE: Record<ResourceType, string> = {
  LESSON_PLAN:
    "a full class-period lesson plan with an objective, standards-aligned focus, a warm-up/hook, direct instruction steps, guided + independent practice, a formative check, and a closing/exit ticket. Include rough timing for each section.",
  SLIDES:
    "a slide-by-slide outline for a presentation. Number each slide, give it a short title, then bullet the content that would appear on it plus a one-line speaker note. Aim for 8-14 slides.",
  NOTES:
    "a clean, student-facing notes page: clear headings, key vocabulary in bold with short definitions, worked examples where relevant, and a brief summary at the end.",
  WORKSHEET:
    "a printable practice worksheet with clear instructions, a mix of question types appropriate to the topic, and an answer key at the very end under a '## Answer Key' heading.",
  QUIZ:
    "a short formative quiz (8-12 questions, mixed multiple choice / short answer) that checks understanding of the topic, with an answer key at the end under a '## Answer Key' heading.",
  TEST:
    "a formal summative test (15-25 questions across multiple formats — multiple choice, short answer, and at least one extended-response question) with clear point values per question and an answer key at the end under a '## Answer Key' heading.",
  PROJECT:
    "a project brief: an overview/purpose, deliverables, milestones/timeline, and a grading rubric written as a Markdown table (criteria as rows, performance levels as columns).",
  OTHER: "the requested teaching material, using clear headings and structure.",
};

export interface GenerateResourceInput {
  type: ResourceType;
  className: string;
  subject?: string | null;
  gradeLevel?: string | null;
  unitTitle?: string | null;
  topic: string;
  extraInstructions?: string;
  recentContext?: string;
}

export async function generateResourceContent(
  input: GenerateResourceInput,
): Promise<string> {
  const {
    type,
    className,
    subject,
    gradeLevel,
    unitTitle,
    topic,
    extraInstructions,
    recentContext,
  } = input;

  const contextLines = [
    `Class: ${className}${subject ? ` (${subject})` : ""}${gradeLevel ? `, ${gradeLevel}` : ""}`,
    unitTitle ? `Current unit: ${unitTitle}` : null,
    `Topic / focus for this material: ${topic}`,
    extraInstructions ? `Extra instructions from the teacher: ${extraInstructions}` : null,
    recentContext ? `What the class has covered recently (for continuity, don't repeat it verbatim):\n${recentContext}` : null,
  ].filter(Boolean);

  const system = `You are an expert high school teacher and instructional designer helping a real classroom teacher who is juggling multiple subjects. You write practical, classroom-ready materials — never generic filler. Match the reading level and tone to the grade level given. Output clean Markdown only (no code fences around the whole response, no meta-commentary before or after). Be concrete: real examples, real numbers, real questions — not placeholders like "[insert example here]".`;

  const user = `Create ${TYPE_GUIDANCE[type]}\n\n${contextLines.join("\n")}`;

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no text content");
  }
  return textBlock.text.trim();
}

export function defaultResourceTitle(type: ResourceType, topic: string): string {
  const label = type
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return `${label}: ${topic}`.slice(0, 160);
}
