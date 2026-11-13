import { z } from "zod";
import { DEFAULT_SUBREDDITS, loadEnv } from "@/lib/env";
import type { CollectResult, HarvestQuery, RawCandidate, RequestContext, SourceCollector } from "@/lib/types";
import {
  clip,
  decodeEntities,
  emptyCollectResult,
  extractUrlsFromText,
  isAfter,
  recordRequestError,
  uniqueHttpUrls
} from "./shared";

export const REDDIT_BASE_URL = "https://www.reddit.com";

const MAX_LIMIT = 100;
const SUBREDDIT_NAME = /^[A-Za-z0-9_]{2,21}$/;

const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullish(),
  selftext: z.string().nullish(),
  url: z.string().nullish(),
  permalink: z.string(),
  created_utc: z.number(),
  subreddit: z.string().optional(),
  is_self: z.boolean().optional(),
  over_18: z.boolean().optional(),
  stickied: z.boolean().optional(),
  removed_by_category: z.string().nullish()
});

const ListingSchema = z.object({
  kind: z.literal("Listing"),
  data: z.object({
    children: z.array(z.object({ kind: z.string(), data: z.unknown() }))
  })
});

export interface RedditCollectorOptions {
  /** Read at collect time. Defaults to REDDIT_SUBREDDITS from the environment. */
  getSubreddits?: () => string[];
  baseUrl?: string;
}

export function isRedditHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "redd.it" || host.endsWith(".redd.it") || host === "reddit.com" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

export function postToCandidate(post: z.infer<typeof PostSchema>, raw: unknown, baseUrl = REDDIT_BASE_URL): RawCandidate {
  const permalink = new URL(post.permalink, baseUrl).toString();
  const selftext = decodeEntities(post.selftext ?? "");
  // Link posts point at the project directly; reddit-hosted media and self links are not project links.
  const linkTarget = post.url && !post.is_self && !isRedditHost(post.url) ? post.url : null;
  return {
    source: "reddit",
    sourceId: post.id,
    sourceUrl: permalink,
    title: decodeEntities(post.title).trim(),
    author: post.author?.trim() ?? "",
    excerpt: clip(selftext || post.title),
    discoveredUrls: uniqueHttpUrls([linkTarget, ...extractUrlsFromText(selftext)]).filter(
      (u) => !isRedditHost(u)
    ),
    createdAt: new Date(post.created_utc * 1000).toISOString(),
    raw
  };
}

export function createRedditCollector(options: RedditCollectorOptions = {}): SourceCollector {
  const baseUrl = options.baseUrl ?? REDDIT_BASE_URL;
  const getSubreddits = options.getSubreddits ?? (() => loadEnv().redditSubreddits ?? DEFAULT_SUBREDDITS);

  return {
    source: "reddit",
    async collect(query: HarvestQuery, ctx: RequestContext): Promise<CollectResult> {
      const result = emptyCollectResult();
      const subreddits = getSubreddits().filter((s) => SUBREDDIT_NAME.test(s));
      const perRequest = Math.max(1, Math.min(query.limit, MAX_LIMIT));
      const needle = query.query?.toLowerCase();

      for (const sub of subreddits) {
        if (result.items.length >= query.limit) break;
        // Public listing JSON. No OAuth app, no login, no cookies.
        const url = new URL(`/r/${sub}/new.json`, baseUrl);
        url.searchParams.set("limit", String(perRequest));
        url.searchParams.set("raw_json", "1");

        let body: unknown;
        try {
          body = (await ctx.http.getJson("reddit", url.toString())).body;
        } catch (err) {
          if (recordRequestError(result, err)) break;
          continue;
        }

        const listing = ListingSchema.safeParse(body);
        if (!listing.success) {
          result.failed += 1;
          result.errors.push(`Reddit r/${sub} returned an unexpected response shape.`);
          continue;
        }

        for (const child of listing.data.data.children) {
          result.fetched += 1;
          if (child.kind !== "t3") {
            result.skipped += 1;
            continue;
          }
          const post = PostSchema.safeParse(child.data);
          if (
            !post.success ||
            post.data.over_18 ||
            post.data.stickied ||
            post.data.removed_by_category ||
            !post.data.author ||
            post.data.author === "[deleted]"
          ) {
            result.skipped += 1;
            continue;
          }
          const candidate = postToCandidate(post.data, child.data, baseUrl);
          const matches =
            !needle || `${candidate.title}\n${candidate.excerpt}`.toLowerCase().includes(needle);
          if (!matches || !isAfter(candidate.createdAt, query.since) || result.items.length >= query.limit) {
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

export const redditCollector: SourceCollector = createRedditCollector();
