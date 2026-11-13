import { z } from "zod";
import type { Database } from "@/lib/db";
import { assertIngestConfig, ConfigError, loadEnv, type AppEnv } from "@/lib/env";
import { AccessDeniedError, createHttpClient, HttpStatusError, RateLimitError, sanitizeBody, type HttpClient } from "@/lib/http";
import * as log from "@/lib/log";
import type { CaseRecord } from "@/lib/types";
import { idempotencyKey, toUsecasecnSubmission } from "./usecasecn";

/** Path segments that would mean something other than pending intake. */
const FORBIDDEN_PATH = /\/(admin|publish|approve|approval|moderat\w*|review)(\/|$)/i;

/** POST target: `{USECASECN_API_URL}/submissions` (or the URL itself if it already ends there). */
export function submissionsEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new ConfigError("USECASECN_API_URL must use https.");
  }
  if (url.search || url.hash) throw new ConfigError("USECASECN_API_URL must not contain a query string or fragment.");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/submissions") ? path : `${path}/submissions`;
  if (FORBIDDEN_PATH.test(url.pathname)) {
    throw new ConfigError("USECASECN_API_URL must point at the pending submissions API, not an admin or publish endpoint.");
  }
  return url.toString();
}

const ReceiptSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    receipt_id: z.union([z.string(), z.number()]).optional(),
    submission_id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional()
  })
  .passthrough();

function receiptOf(body: unknown): { receiptId: string | null; status: string | null } {
  const parsed = ReceiptSchema.safeParse(body);
  if (!parsed.success) return { receiptId: null, status: null };
  const raw = parsed.data.receipt_id ?? parsed.data.submission_id ?? parsed.data.id;
  return { receiptId: raw === undefined ? null : String(raw).slice(0, 200), status: parsed.data.status?.slice(0, 50) ?? null };
}

export type PushOutcome =
  | "pushed"
  | "duplicate"
  | "conflict"
  | "invalid"
  | "skipped"
  | "failed"
  | "rate_limited"
  | "not_attempted";

export interface PushResult {
  id: string;
  title: string;
  outcome: PushOutcome;
  status?: number;
  receiptId?: string;
  message?: string;
}

export interface PushBatchResult {
  results: PushResult[];
  stoppedOnRateLimit: boolean;
  retryAfterSeconds?: number;
  /** Set when the batch stopped early (429, auth failure). */
  stoppedReason?: string;
}

export interface PushOptions {
  /** Approved case ids to push. Omit for every approved/exported case not yet pushed. */
  ids?: string[];
  batchId?: string;
}

export interface PushDeps {
  db: Database;
  env?: AppEnv;
  http?: HttpClient;
  now?: () => Date;
}

/**
 * Push approved cases to the usecasecn pending intake. Never calls an endpoint
 * that publishes, approves, or edits public content. Stops the batch on 429
 * (and on 401/403), treats 409 as already present, keeps 422 cases approved
 * with the validation message. The token is only ever sent as a bearer header.
 */
export async function pushPending(options: PushOptions, deps: PushDeps): Promise<PushBatchResult> {
  const env = deps.env ?? loadEnv();
  assertIngestConfig(env); // refuses with "JSON export is still available"
  const endpoint = submissionsEndpoint(env.usecasecnApiUrl);
  const http = deps.http ?? createHttpClient(env);
  const now = deps.now ?? (() => new Date());
  const { db } = deps;

  const records = db
    .listCases({ status: ["approved", "exported"], ids: options.ids, limit: 5000 })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const batch: PushBatchResult = { results: [], stoppedOnRateLimit: false };

  for (const record of records) {
    if (batch.stoppedReason) {
      batch.results.push({ id: record.id, title: record.title, outcome: "not_attempted", message: batch.stoppedReason });
      continue;
    }
    batch.results.push(await pushOne(record));
  }

  log.info(
    `Push to usecasecn pending: ${summarize(batch.results)}${batch.stoppedReason ? `; stopped: ${batch.stoppedReason}` : ""}`
  );
  return batch;

  async function pushOne(record: CaseRecord): Promise<PushResult> {
    const base = { id: record.id, title: record.title };
    const mapped = toUsecasecnSubmission(record, { batchId: options.batchId, now: now() });
    if (!mapped.ok) {
      db.patchCase(record.id, { ingestError: mapped.reason });
      return { ...base, outcome: "skipped", message: mapped.reason };
    }

    let response;
    try {
      response = await http.request("usecasecn", endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.usecasecnIngestToken}`,
          "Idempotency-Key": idempotencyKey(record)
        },
        body: JSON.stringify(mapped.payload),
        acceptStatuses: [200, 201, 409, 422]
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        batch.stoppedOnRateLimit = true;
        batch.retryAfterSeconds = err.retryAfterSeconds;
        batch.stoppedReason = err.message;
        db.patchCase(record.id, { ingestError: err.message });
        return { ...base, outcome: "rate_limited", status: 429, message: err.message };
      }
      if (err instanceof AccessDeniedError) {
        batch.stoppedReason = `usecasecn intake refused the token (HTTP ${err.status}). Check USECASECN_INGEST_TOKEN.`;
        db.patchCase(record.id, { ingestError: batch.stoppedReason });
        return { ...base, outcome: "failed", status: err.status, message: batch.stoppedReason };
      }
      const message =
        err instanceof HttpStatusError
          ? `usecasecn intake returned HTTP ${err.status}: ${sanitizeBody(err.body, 300)}`
          : `Push failed: ${log.safeErrorMessage(err)}`;
      db.patchCase(record.id, { ingestError: message });
      return { ...base, outcome: "failed", status: err instanceof HttpStatusError ? err.status : undefined, message };
    }

    const { receiptId, status } = receiptOf(response.body);

    if (response.status === 200 || response.status === 201) {
      db.transition(record.id, "pushed", {
        ingestReceiptId: receiptId,
        ingestStatus: status ?? "pending",
        ingestError: null
      });
      return { ...base, outcome: "pushed", status: response.status, receiptId: receiptId ?? undefined };
    }

    if (response.status === 409) {
      // Already present on usecasecn. Never retried as a new item.
      if (receiptId) {
        db.transition(record.id, "pushed", { ingestReceiptId: receiptId, ingestStatus: "duplicate", ingestError: null });
        return { ...base, outcome: "duplicate", status: 409, receiptId, message: "Already present in usecasecn." };
      }
      const message = "usecasecn reported a conflict (already present) without a receipt id.";
      db.patchCase(record.id, { ingestStatus: "conflict", ingestError: message });
      return { ...base, outcome: "conflict", status: 409, message };
    }

    // 422: keep approved, store the sanitized validation message for a later retry.
    const message = `usecasecn rejected the payload (HTTP 422): ${sanitizeBody(response.body, 500)}`;
    db.patchCase(record.id, { ingestStatus: "invalid", ingestError: message });
    return { ...base, outcome: "invalid", status: 422, message };
  }
}

function summarize(results: PushResult[]): string {
  const counts = new Map<PushOutcome, number>();
  for (const r of results) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}=${v}`).join(" ") || "nothing to push";
}
