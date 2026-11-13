import { z } from "zod";
import type { HttpClient } from "./http";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SOURCE_NAMES = ["hn", "github", "reddit"] as const;
export const SourceNameSchema = z.enum(SOURCE_NAMES);
export type SourceName = z.infer<typeof SourceNameSchema>;

/**
 * Case lifecycle.
 *
 * - harvested           stored raw candidate; not yet classified (or classification failed)
 * - rejected_prefilter  dropped by eligibility rules before the LLM (no project link, job post, ...)
 * - classified          LLM verdict says "not a real case"; kept for audit, never queued
 * - needs_review        LLM verdict says "real case"; waiting for the curator
 * - duplicate           same canonical key as an earlier primary record
 * - approved / rejected curator decision
 * - exported            approved and included in a marked JSON export
 * - pushed              accepted by the usecasecn pending intake (receipt recorded)
 */
export const CASE_STATUSES = [
  "harvested",
  "rejected_prefilter",
  "classified",
  "needs_review",
  "duplicate",
  "approved",
  "rejected",
  "exported",
  "pushed"
] as const;
export const CaseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

/** Official usecasecn domain categories. */
export const USECASECN_CATEGORIES = [
  "生活与旅行",
  "兴趣与娱乐",
  "个人创作",
  "学习与成长",
  "工作与效率",
  "其他"
] as const;
export const UsecasecnCategorySchema = z.enum(USECASECN_CATEGORIES);
export type UsecasecnCategory = z.infer<typeof UsecasecnCategorySchema>;

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export const STATUS_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  harvested: ["harvested", "rejected_prefilter", "classified", "needs_review", "duplicate"],
  rejected_prefilter: [],
  classified: [],
  needs_review: ["approved", "rejected"],
  duplicate: [],
  approved: ["exported", "pushed"],
  rejected: [],
  exported: ["pushed"],
  pushed: []
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: CaseStatus,
    public readonly to: CaseStatus
  ) {
    super(`Cannot change case status from "${from}" to "${to}".`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Statuses that may be exported or pushed. */
export const SHIPPABLE_STATUSES: readonly CaseStatus[] = ["approved", "exported"];

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const IsoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO 8601 date");

export const CaseRecordSchema = z.object({
  id: z.string().min(1),
  source: SourceNameSchema,
  sourceId: z.string().min(1),
  sourceUrl: z.url(),
  projectUrl: z.url().nullable(),
  canonicalKey: z.string().min(1).nullable(),
  title: z.string(),
  author: z.string(),
  excerpt: z.string(),
  discoveredUrls: z.array(z.string()),
  sourceCreatedAt: IsoDate,
  isRealCase: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  lowConfidence: z.boolean(),
  category: UsecasecnCategorySchema.nullable(),
  tools: z.array(z.string()),
  summaryZh: z.string().nullable(),
  rationale: z.string().nullable(),
  status: CaseStatusSchema,
  /** Pipeline note: prefilter reason, classifier error, etc. Never contains secrets. */
  note: z.string().nullable(),
  duplicateOfId: z.string().nullable(),
  relatedSources: z.array(z.string()),
  reviewedAt: IsoDate.nullable(),
  rejectReason: z.string().nullable(),
  exportedAt: IsoDate.nullable(),
  ingestReceiptId: z.string().nullable(),
  ingestStatus: z.string().nullable(),
  ingestError: z.string().nullable(),
  createdAt: IsoDate,
  updatedAt: IsoDate
});
export type CaseRecord = z.infer<typeof CaseRecordSchema>;

export const SourceRunStatsSchema = z.object({
  fetched: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  stoppedOnRateLimit: z.boolean(),
  retryAfterSeconds: z.number().nonnegative().optional(),
  enabled: z.boolean()
});
export type SourceRunStats = z.infer<typeof SourceRunStatsSchema>;

export const HarvestRunSchema = z.object({
  id: z.string().min(1),
  startedAt: IsoDate,
  finishedAt: IsoDate.nullable(),
  perSource: z.record(SourceNameSchema, SourceRunStatsSchema),
  /** Counts across sources for the pipeline stages after collection. */
  totals: z.object({
    prefiltered: z.number().int().nonnegative(),
    classified: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    classifyFailed: z.number().int().nonnegative()
  }),
  /** True when a 429, config error, or per-item failure left the run incomplete. */
  partial: z.boolean(),
  error: z.string().nullable()
});
export type HarvestRun = z.infer<typeof HarvestRunSchema>;

export function emptySourceStats(enabled = true): SourceRunStats {
  return { fetched: 0, kept: 0, skipped: 0, failed: 0, stoppedOnRateLimit: false, enabled };
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

export interface HarvestQuery {
  /** Only items created at or after this instant. */
  since: Date;
  /** Upper bound on items returned per source. */
  limit: number;
  /** Optional source-specific search override. */
  query?: string;
}

/** A source post as fetched, before eligibility and classification. */
export interface RawCandidate {
  source: SourceName;
  /** Source-native id (HN objectID, GitHub full_name, Reddit t3 id). */
  sourceId: string;
  /** Canonical public URL of the post or repository on the source site. */
  sourceUrl: string;
  title: string;
  author: string;
  /** Plain-text excerpt, HTML stripped, clipped. */
  excerpt: string;
  /** Absolute http(s) links found in the post, in discovery order, de-duplicated. */
  discoveredUrls: string[];
  /** ISO 8601 creation time on the source. */
  createdAt: string;
  /** Original source payload for debugging. Not persisted. */
  raw: unknown;
}

export interface CollectResult {
  items: RawCandidate[];
  stoppedOnRateLimit: boolean;
  retryAfterSeconds?: number;
  /** Items returned by the source API (before any local filtering). */
  fetched: number;
  /** Fetched items dropped by the collector (too old, malformed, deleted). */
  skipped: number;
  /** Requests or items that failed (HTTP errors, access denied). */
  failed: number;
  /** Redacted, human-readable failure notes. */
  errors: string[];
}

export interface RequestContext {
  /** Shared per-run client: User-Agent, per-source delay, 429 stop rule. */
  http: HttpClient;
}

export interface SourceCollector {
  readonly source: SourceName;
  collect(query: HarvestQuery, ctx: RequestContext): Promise<CollectResult>;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export const ClassificationSchema = z.object({
  isRealCase: z.boolean(),
  confidence: z.number().min(0).max(1),
  category: UsecasecnCategorySchema,
  tools: z.array(z.string().min(1)),
  summaryZh: z.string(),
  rationale: z.string(),
  lowConfidence: z.boolean()
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface LlmClient {
  completeJson(input: { system: string; user: string }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const ReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2000).optional()
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
