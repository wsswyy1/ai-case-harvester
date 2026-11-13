import { randomUUID } from "node:crypto";
import { classifyCandidate } from "@/classifier/index";
import { OpenAiCompatibleClient } from "@/classifier/provider";
import { collectAll } from "@/collectors/index";
import { getDatabase, newCaseRecord, type Database } from "./db";
import { canonicalKeyFor, findPrimary, linkDuplicate } from "./dedupe";
import { evaluateEligibility, type EligibleCandidate } from "./eligibility";
import { ConfigError, loadEnv, type AppEnv } from "./env";
import { createHttpClient, RateLimitError, type HttpClient } from "./http";
import * as log from "./log";
import {
  SOURCE_NAMES,
  type CaseRecord,
  type HarvestQuery,
  type HarvestRun,
  type LlmClient,
  type RawCandidate,
  type SourceCollector,
  type SourceName
} from "./types";

export const DEFAULT_SINCE_HOURS = 24 * 7;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export interface HarvestOptions {
  /** Restrict to these sources (intersected with HARVEST_SOURCES). */
  sources?: SourceName[];
  since?: Date;
  limit?: number;
  query?: string;
}

export interface HarvestDeps {
  db?: Database;
  env?: AppEnv;
  http?: HttpClient;
  /** `null` forces "no classifier" (e.g. tests). Undefined builds one from env. */
  llm?: LlmClient | null;
  registry?: Record<SourceName, SourceCollector>;
  now?: () => Date;
}

export interface HarvestResult {
  run: HarvestRun;
  /** Redacted per-source notes (HTTP failures, 429, login walls). */
  errors: Partial<Record<SourceName | "classifier", string[]>>;
}

/**
 * collect → normalize/eligibility → dedupe → persist → classify.
 *
 * Dedupe runs before the LLM so duplicates never cost a model call; the
 * stored result is the same as deduping afterwards. Every kept candidate is
 * persisted as `harvested` before classification, so an interrupted or
 * rate-limited run leaves its work in SQLite.
 *
 * Shared by POST /api/harvest and `npm run harvest`.
 */
export async function runHarvest(options: HarvestOptions = {}, deps: HarvestDeps = {}): Promise<HarvestResult> {
  const env = deps.env ?? loadEnv();
  const db = deps.db ?? getDatabase();
  const http = deps.http ?? createHttpClient(env);
  const now = deps.now ?? (() => new Date());

  const enabled = SOURCE_NAMES.filter(
    (s) => env.harvestSources.includes(s) && (!options.sources || options.sources.includes(s))
  );
  const query: HarvestQuery = {
    since: options.since ?? new Date(now().getTime() - DEFAULT_SINCE_HOURS * 3600_000),
    limit: Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
    query: options.query?.trim() || undefined
  };

  const run: HarvestRun = {
    id: randomUUID(),
    startedAt: now().toISOString(),
    finishedAt: null,
    perSource: Object.fromEntries(
      SOURCE_NAMES.map((s) => [
        s,
        { fetched: 0, kept: 0, skipped: 0, failed: 0, stoppedOnRateLimit: false, enabled: enabled.includes(s) }
      ])
    ) as HarvestRun["perSource"],
    totals: { prefiltered: 0, classified: 0, queued: 0, duplicates: 0, classifyFailed: 0, unclassified: 0 },
    partial: false,
    error: null
  };
  db.saveRun(run);
  const errors: HarvestResult["errors"] = {};
  const runErrors: string[] = [];

  // Classifier. Missing config is not fatal: candidates stay `harvested`.
  let llm: LlmClient | null = null;
  if (deps.llm !== undefined) {
    llm = deps.llm;
  } else {
    try {
      llm = new OpenAiCompatibleClient({ env, http });
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      runErrors.push(err.message);
    }
  }

  try {
    const collected = await collectAll(query, { http }, { enabled, registry: deps.registry });
    for (const s of SOURCE_NAMES) {
      run.perSource[s] = { ...collected.perSource[s], kept: 0 };
    }
    Object.assign(errors, collected.errors);

    let llmStopped = false;
    for (const raw of collected.items) {
      const stats = run.perSource[raw.source];
      const outcome = ingestCandidate(db, raw, now);

      if (outcome.kind === "known") {
        stats.skipped += 1;
        if (outcome.record.status !== "harvested") continue;
        // Previously stored but never classified: try again this run.
      } else if (outcome.kind === "prefiltered") {
        stats.skipped += 1;
        run.totals.prefiltered += 1;
        continue;
      } else if (outcome.kind === "duplicate") {
        stats.skipped += 1;
        run.totals.duplicates += 1;
        continue;
      } else {
        stats.kept += 1;
      }

      if (llmStopped || !llm) {
        run.totals.unclassified += 1;
        continue;
      }
      try {
        const result = await classifyCandidate(llm, {
          title: outcome.record.title,
          author: outcome.record.author,
          excerpt: outcome.record.excerpt,
          sourceUrl: outcome.record.sourceUrl,
          projectUrl: outcome.record.projectUrl ?? ""
        });
        if (!result.ok) {
          run.totals.classifyFailed += 1;
          db.patchCase(outcome.record.id, { note: log.redact(result.error) });
          continue;
        }
        const c = result.classification;
        const next = db.transition(outcome.record.id, c.isRealCase ? "needs_review" : "classified", {
          isRealCase: c.isRealCase,
          confidence: c.confidence,
          lowConfidence: c.lowConfidence,
          category: c.category,
          tools: c.tools,
          summaryZh: c.summaryZh || null,
          rationale: c.rationale || null,
          note: null
        });
        run.totals.classified += 1;
        if (next.status === "needs_review") run.totals.queued += 1;
      } catch (err) {
        if (err instanceof RateLimitError) {
          // Stop calling the LLM for this run; the rest stay `harvested`.
          llmStopped = true;
          run.totals.unclassified += 1;
          runErrors.push(err.message);
          continue;
        }
        // Per-item LLM failures (timeouts, 5xx, auth) never stop the run.
        run.totals.classifyFailed += 1;
        const message = log.safeErrorMessage(err);
        db.patchCase(outcome.record.id, { note: `Classification failed: ${message}` });
        (errors.classifier ??= []).push(message);
      }
    }

    if (!llm && run.totals.unclassified > 0 && runErrors.length === 0) {
      runErrors.push("Classifier unavailable; candidates were stored as harvested.");
    }
    run.partial =
      SOURCE_NAMES.some((s) => run.perSource[s].stoppedOnRateLimit) ||
      run.totals.classifyFailed > 0 ||
      run.totals.unclassified > 0;
  } catch (err) {
    run.partial = true;
    runErrors.push(log.safeErrorMessage(err));
  } finally {
    run.error = runErrors.length ? runErrors.join(" ") : null;
    run.finishedAt = now().toISOString();
    db.saveRun(run);
  }

  log.info(
    `Harvest ${run.id} finished${run.partial ? " (partial)" : ""}: ` +
      SOURCE_NAMES.filter((s) => run.perSource[s].enabled)
        .map((s) => {
          const p = run.perSource[s];
          return `${s} fetched=${p.fetched} kept=${p.kept} skipped=${p.skipped} failed=${p.failed}${
            p.stoppedOnRateLimit ? ` 429(retry-after=${p.retryAfterSeconds ?? "?"}s)` : ""
          }`;
        })
        .join("; ") +
      `; queued=${run.totals.queued} duplicates=${run.totals.duplicates} prefiltered=${run.totals.prefiltered}` +
      (run.error ? `; note: ${run.error}` : "")
  );

  return { run, errors };
}

type IngestOutcome =
  | { kind: "known"; record: CaseRecord }
  | { kind: "prefiltered"; record: CaseRecord }
  | { kind: "duplicate"; record: CaseRecord }
  | { kind: "stored"; record: CaseRecord };

/** Persist one raw candidate as prefiltered, duplicate, or harvested. */
function ingestCandidate(db: Database, raw: RawCandidate, now: () => Date): IngestOutcome {
  return db.transaction((): IngestOutcome => {
    const existing = db.findBySourceId(raw.source, raw.sourceId);
    if (existing) return { kind: "known", record: existing };

    const stamp = now().toISOString();
    const base = newCaseRecord({
      id: randomUUID(),
      source: raw.source,
      sourceId: raw.sourceId,
      sourceUrl: raw.sourceUrl,
      title: raw.title,
      author: raw.author,
      excerpt: raw.excerpt,
      discoveredUrls: raw.discoveredUrls,
      sourceCreatedAt: raw.createdAt,
      createdAt: stamp,
      updatedAt: stamp
    });

    const eligibility = evaluateEligibility(raw);
    if (!eligibility.ok) {
      const record: CaseRecord = { ...base, status: "rejected_prefilter", isRealCase: false, note: eligibility.detail };
      db.upsertCase(record);
      return { kind: "prefiltered", record };
    }

    const candidate: EligibleCandidate = eligibility.candidate;
    const withProject: CaseRecord = {
      ...base,
      projectUrl: candidate.projectUrl,
      canonicalKey: canonicalKeyFor(candidate.projectUrl)
    };

    const primary = findPrimary(db, withProject.canonicalKey);
    if (primary) {
      const dup = linkDuplicate(db, primary, withProject);
      db.upsertCase(dup);
      return { kind: "duplicate", record: dup };
    }

    db.upsertCase(withProject);
    return { kind: "stored", record: withProject };
  });
}
