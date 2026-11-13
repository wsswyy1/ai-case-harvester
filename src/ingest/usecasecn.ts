import type { CaseRecord } from "@/lib/types";

export interface UsecasecnSubmission {
  schema_version: 1;
  title: string;
  summary: string;
  author: string;
  source_url: string;
  project_url?: string;
  tools: string[];
  category: string;
  evidence: {
    original_excerpt: string;
    checked_at: string;
    limitations: string;
  };
  batch_id?: string;
  one_liner?: string;
}

export function sanitizeAuthor(author: string): string {
  return author.trim().replace(/[-–—._/\s]+$/u, "").trim();
}

/**
 * Map a local approved case to the usecasecn v1 pending submission.
 * Reddit threads are evidence, not source_url, when the schema does not list Reddit.
 */
export function toUsecasecnSubmission(_record: CaseRecord): UsecasecnSubmission | { skip: true; reason: string } {
  throw new Error("TODO: map CaseRecord to usecasecn v1 payload (Requirement 10)");
}

export interface PushResult {
  id: string;
  ok: boolean;
  status: number;
  receiptId?: string;
  error?: string;
}

export async function pushPending(_records: CaseRecord[]): Promise<PushResult[]> {
  // TODO: read USECASECN_API_URL and USECASECN_INGEST_TOKEN.
  // POST with bearer, Idempotency-Key, User-Agent. Never log the token.
  // Stop the batch on 429. Treat 409 as already present. Pending only.
  throw new Error("TODO: implement usecasecn pending ingest client");
}
