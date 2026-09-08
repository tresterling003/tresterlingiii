import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return cached;
}

export const MODEL = env.anthropicModel;
