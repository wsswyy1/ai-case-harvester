import { z } from "zod";
import {
  ClassificationSchema,
  USECASECN_CATEGORIES,
  type Classification,
  type LlmClient,
  type UsecasecnCategory
} from "@/lib/types";
import { CLASSIFIER_SYSTEM_PROMPT, userPromptForCandidate, type PromptCandidate } from "./prompt";
import { LlmResponseError } from "./provider";

export type ClassifierInput = PromptCandidate;

/** Below this confidence the reviewer sees a low-confidence flag. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export type ClassifyResult = { ok: true; classification: Classification } | { ok: false; error: string };

/** English and loose labels some models return instead of the official names. */
const CATEGORY_ALIASES: Record<string, UsecasecnCategory> = {
  "life & travel": "生活与旅行",
  "life and travel": "生活与旅行",
  life: "生活与旅行",
  travel: "生活与旅行",
  "hobbies & entertainment": "兴趣与娱乐",
  "hobby & entertainment": "兴趣与娱乐",
  "interests & entertainment": "兴趣与娱乐",
  entertainment: "兴趣与娱乐",
  hobbies: "兴趣与娱乐",
  "personal creation": "个人创作",
  "personal creativity": "个人创作",
  creative: "个人创作",
  creation: "个人创作",
  "learning & growth": "学习与成长",
  "learning and growth": "学习与成长",
  learning: "学习与成长",
  education: "学习与成长",
  "work & productivity": "工作与效率",
  "work and productivity": "工作与效率",
  work: "工作与效率",
  productivity: "工作与效率",
  other: "其他",
  others: "其他"
};

function mapCategory(value: unknown): { category: UsecasecnCategory; known: boolean } {
  if (typeof value === "string") {
    const v = value.trim();
    if ((USECASECN_CATEGORIES as readonly string[]).includes(v)) {
      return { category: v as UsecasecnCategory, known: v !== "其他" };
    }
    const alias = CATEGORY_ALIASES[v.toLowerCase()];
    if (alias) return { category: alias, known: alias !== "其他" };
  }
  return { category: "其他", known: false };
}

const LooseSchema = z.object({
  isRealCase: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]),
  confidence: z.union([z.number(), z.string().regex(/^\s*\d*\.?\d+\s*$/).transform(Number)]),
  category: z.unknown(),
  tools: z.union([z.array(z.unknown()), z.string()]).optional(),
  summaryZh: z.string().optional(),
  rationale: z.string().optional()
});

const HAS_CJK = /[\u3400-\u9fff]/;

/**
 * Validate and normalize model output. Returns an error string when the
 * object cannot be trusted; the caller leaves the candidate in `harvested`.
 */
export function parseClassification(output: unknown): ClassifyResult {
  const loose = LooseSchema.safeParse(output);
  if (!loose.success) {
    const fields = [...new Set(loose.error.issues.map((i) => i.path.join(".") || "root"))].join(", ");
    return { ok: false, error: `Model output did not match the classification schema (${fields}).` };
  }
  const o = loose.data;

  const confidence = Math.min(1, Math.max(0, Number.isFinite(o.confidence) ? o.confidence : 0));
  const { category, known } = mapCategory(o.category);
  const toolList = typeof o.tools === "string" ? o.tools.split(/[,，、]/) : (o.tools ?? []);
  const tools = [
    ...new Set(
      toolList
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 60)
    )
  ].slice(0, 12);
  const summaryZh = (o.summaryZh ?? "").replace(/\s+/g, " ").trim();
  const rationale = (o.rationale ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

  if (o.isRealCase && (!summaryZh || !HAS_CJK.test(summaryZh))) {
    return { ok: false, error: "Model accepted the case but did not return a Chinese one-line summary." };
  }

  const lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD || !known;

  const parsed = ClassificationSchema.safeParse({
    isRealCase: o.isRealCase,
    confidence,
    category,
    tools,
    summaryZh,
    rationale,
    lowConfidence
  });
  if (!parsed.success) return { ok: false, error: "Normalized classification failed validation." };
  return { ok: true, classification: parsed.data };
}

/**
 * Classify one eligible candidate. Invalid model output resolves to
 * `{ ok: false }`. Transport and configuration errors (429, auth, missing env)
 * are thrown so the orchestrator can stop or mark the run partial.
 */
export async function classifyCandidate(client: LlmClient, candidate: ClassifierInput): Promise<ClassifyResult> {
  let output: unknown;
  try {
    output = await client.completeJson({
      system: CLASSIFIER_SYSTEM_PROMPT,
      user: userPromptForCandidate(candidate)
    });
  } catch (err) {
    if (err instanceof LlmResponseError) return { ok: false, error: err.message };
    throw err;
  }
  return parseClassification(output);
}

/** Classification, or null when the model output was invalid. */
export async function classify(client: LlmClient, candidate: ClassifierInput): Promise<Classification | null> {
  const result = await classifyCandidate(client, candidate);
  return result.ok ? result.classification : null;
}
