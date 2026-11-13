import { z } from "zod";
import type { CollectResult, HarvestQuery, RawCandidate, RequestContext, SourceCollector } from "@/lib/types";
import {
  clip,
  emptyCollectResult,
  extractHrefs,
  extractUrlsFromText,
  htmlToText,
  isAfter,
  recordRequestError,
  uniqueHttpUrls
} from "./shared";

export const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";

/**
 * Show HN is where people post things they built. These terms are run as
 * separate Algolia queries (Algolia ANDs words in one query).
 */
export const DEFAULT_HN_QUERIES = ["LLM", "AI", "GPT", "Claude"];

const MAX_HITS_PER_PAGE = 50;

const HitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  author: z.string().nullish(),
  created_at: z.string(),
  story_text: z.string().nullish()
});

const ResponseSchema = z.object({
  hits: z.array(z.unknown())
});

export interface HnCollectorOptions {
  queries?: string[];
  searchUrl?: string;
  /** Algolia tag filter. Defaults to Show HN stories. */
  tags?: string;
}

export function hnItemUrl(objectId: string): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(objectId)}`;
}

export function hitToCandidate(hit: z.infer<typeof HitSchema>, raw: unknown): RawCandidate | null {
  const title = hit.title?.trim();
  if (!title) return null;
  const storyHtml = hit.story_text ?? "";
  const text = htmlToText(storyHtml);
  return {
    source: "hn",
    sourceId: hit.objectID,
    sourceUrl: hnItemUrl(hit.objectID),
    title,
    author: hit.author?.trim() ?? "",
    excerpt: clip(text || title),
    discoveredUrls: uniqueHttpUrls([hit.url, ...extractHrefs(storyHtml), ...extractUrlsFromText(text)]),
    createdAt: new Date(hit.created_at).toISOString(),
    raw
  };
}

export function createHnCollector(options: HnCollectorOptions = {}): SourceCollector {
  const searchUrl = options.searchUrl ?? HN_SEARCH_URL;
  const tags = options.tags ?? "show_hn";
  const defaultQueries = options.queries ?? DEFAULT_HN_QUERIES;

  return {
    source: "hn",
    async collect(query: HarvestQuery, ctx: RequestContext): Promise<CollectResult> {
      const result = emptyCollectResult();
      const seen = new Set<string>();
      const queries = query.query ? [query.query] : defaultQueries;
      const sinceEpoch = Math.floor(query.since.getTime() / 1000);
      const hitsPerPage = Math.max(1, Math.min(query.limit, MAX_HITS_PER_PAGE));

      for (const q of queries) {
        if (result.items.length >= query.limit) break;
        const url = new URL(searchUrl);
        url.searchParams.set("query", q);
        url.searchParams.set("tags", tags);
        url.searchParams.set("numericFilters", `created_at_i>=${sinceEpoch}`);
        url.searchParams.set("hitsPerPage", String(hitsPerPage));

        let body: unknown;
        try {
          body = (await ctx.http.getJson("hn", url.toString())).body;
        } catch (err) {
          if (recordRequestError(result, err)) break;
          continue;
        }

        const parsed = ResponseSchema.safeParse(body);
        if (!parsed.success) {
          result.failed += 1;
          result.errors.push("HN Algolia returned an unexpected response shape.");
          continue;
        }

        for (const rawHit of parsed.data.hits) {
          result.fetched += 1;
          const hit = HitSchema.safeParse(rawHit);
          if (!hit.success) {
            result.skipped += 1;
            continue;
          }
          if (seen.has(hit.data.objectID)) {
            result.skipped += 1;
            continue;
          }
          seen.add(hit.data.objectID);
          const candidate = hitToCandidate(hit.data, rawHit);
          if (!candidate || !isAfter(candidate.createdAt, query.since) || result.items.length >= query.limit) {
            result.skipped += 1;
            continue;
          }
          result.items.push(candidate);
        }
      }
      return result;
    }
  };
}

export const hnCollector: SourceCollector = createHnCollector();
