import { z } from "zod";
import { CaseNotFoundError, type CaseFilter, type Database } from "./db";
import {
  CaseStatusSchema,
  SourceNameSchema,
  UsecasecnCategorySchema,
  type CaseRecord,
  type CaseStatus,
  type ReviewDecision
} from "./types";

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

const confidence = z.coerce.number().min(0).max(1);

/** Query string contract for GET /api/cases. `status` may be comma-separated. */
export const CaseQuerySchema = z
  .object({
    status: z
      .string()
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(CaseStatusSchema).min(1))
      .optional(),
    source: SourceNameSchema.optional(),
    category: UsecasecnCategorySchema.optional(),
    minConfidence: confidence.optional(),
    maxConfidence: confidence.optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional()
  })
  .strict();

export function parseCaseQuery(params: URLSearchParams): ReturnType<typeof CaseQuerySchema.safeParse> {
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) if (v !== "") obj[k] = v;
  return CaseQuerySchema.safeParse(obj);
}

export function listCases(db: Database, filter: CaseFilter): CaseRecord[] {
  return db.listCases(filter);
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type ReviewOutcome =
  | { ok: true; record: CaseRecord }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "invalid_state"; message: string; currentStatus: CaseStatus };

/**
 * Approve or reject a `needs_review` case. Records the review timestamp and an
 * optional reason. This is a local decision only: it never publishes to
 * usecasecn and never calls any approval API.
 */
export function reviewCase(db: Database, id: string, decision: ReviewDecision, now: Date = new Date()): ReviewOutcome {
  try {
    return db.transaction((): ReviewOutcome => {
      const current = db.getCase(id);
      if (!current) throw new CaseNotFoundError(id);
      if (current.status !== "needs_review") {
        return {
          ok: false,
          code: "invalid_state",
          currentStatus: current.status,
          message: `Case is "${current.status}"; only needs_review cases can be approved or rejected.`
        };
      }
      const record = db.transition(id, decision.decision, {
        reviewedAt: now.toISOString(),
        rejectReason: decision.decision === "rejected" ? decision.reason || null : null
      });
      return { ok: true, record };
    });
  } catch (err) {
    if (err instanceof CaseNotFoundError) return { ok: false, code: "not_found", message: err.message };
    throw err;
  }
}
