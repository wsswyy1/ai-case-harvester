import { safeErrorMessage } from "@/lib/log";
import {
  emptySourceStats,
  SOURCE_NAMES,
  type HarvestQuery,
  type RawCandidate,
  type RequestContext,
  type SourceCollector,
  type SourceName,
  type SourceRunStats
} from "@/lib/types";
import { githubCollector } from "./github";
import { hnCollector } from "./hn";
import { redditCollector } from "./reddit";

export const collectors: Record<SourceName, SourceCollector> = {
  hn: hnCollector,
  github: githubCollector,
  reddit: redditCollector
};

export function enabledCollectors(
  enabled: readonly SourceName[] = SOURCE_NAMES,
  registry: Record<SourceName, SourceCollector> = collectors
): SourceCollector[] {
  return SOURCE_NAMES.filter((name) => enabled.includes(name)).map((name) => registry[name]);
}

export interface CollectAllResult {
  items: RawCandidate[];
  perSource: Record<SourceName, SourceRunStats>;
  errors: Partial<Record<SourceName, string[]>>;
}

/**
 * Run every enabled collector. Disabled sources are skipped and reported with
 * enabled=false. One collector failing or hitting 429 never stops the others.
 * `kept` here counts items the collector returned; the harvest pipeline
 * adjusts it after eligibility filtering.
 */
export async function collectAll(
  query: HarvestQuery,
  ctx: RequestContext,
  options: { enabled?: readonly SourceName[]; registry?: Record<SourceName, SourceCollector> } = {}
): Promise<CollectAllResult> {
  const enabled = options.enabled ?? SOURCE_NAMES;
  const registry = options.registry ?? collectors;

  const perSource = Object.fromEntries(
    SOURCE_NAMES.map((name) => [name, emptySourceStats(enabled.includes(name))])
  ) as Record<SourceName, SourceRunStats>;
  const errors: CollectAllResult["errors"] = {};

  const active = enabledCollectors(enabled, registry);
  const results = await Promise.all(
    active.map(async (collector) => {
      try {
        return { collector, result: await collector.collect(query, ctx), thrown: null };
      } catch (err) {
        return { collector, result: null, thrown: err };
      }
    })
  );

  const items: RawCandidate[] = [];
  for (const { collector, result, thrown } of results) {
    const stats = perSource[collector.source];
    if (!result) {
      stats.failed += 1;
      errors[collector.source] = [safeErrorMessage(thrown)];
      continue;
    }
    stats.fetched = result.fetched;
    stats.kept = result.items.length;
    stats.skipped = result.skipped;
    stats.failed = result.failed;
    stats.stoppedOnRateLimit = result.stoppedOnRateLimit;
    if (result.retryAfterSeconds !== undefined) stats.retryAfterSeconds = result.retryAfterSeconds;
    if (result.errors.length) errors[collector.source] = result.errors;
    items.push(...result.items);
  }

  return { items, perSource, errors };
}
