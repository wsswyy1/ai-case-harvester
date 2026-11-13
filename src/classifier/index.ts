import type { Classification, LlmClient } from "@/lib/types";
import { CLASSIFIER_SYSTEM_PROMPT, userPromptForCandidate } from "./prompt";

export type ClassifierInput = {
  title: string;
  author: string;
  excerpt: string;
  sourceUrl: string;
  projectUrl: string;
};

export async function classify(
  client: LlmClient,
  candidate: ClassifierInput
): Promise<Classification | null> {
  void CLASSIFIER_SYSTEM_PROMPT;
  void userPromptForCandidate;
  void client;
  void candidate;
  // TODO: call client, parse with Zod, return Classification or null on invalid JSON.
  return null;
}
