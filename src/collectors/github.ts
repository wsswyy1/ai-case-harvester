import { z } from "zod";
import { loadEnv } from "@/lib/env";
import type { CollectResult, HarvestQuery, RawCandidate, RequestContext, SourceCollector } from "@/lib/types";
import { clip, emptyCollectResult, isAfter, recordRequestError, uniqueHttpUrls } from "./shared";

/** Official public Search API. The optional token is only ever sent here. */
export const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";

export const DEFAULT_GITHUB_TERMS = ["llm", "gpt", "claude"];

const MAX_PER_PAGE = 50;

const RepoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  html_url: z.string(),
  description: z.string().nullish(),
  homepage: z.string().nullish(),
  created_at: z.string(),
  private: z.boolean().optional(),
  fork: z.boolean().optional(),
  archived: z.boolean().optional(),
  topics: z.array(z.string()).optional(),
  owner: z.object({ login: z.string() }).nullish()
});

const ResponseSchema = z.object({
  items: z.array(z.unknown())
});

export interface GithubCollectorOptions {
  terms?: string[];
  searchUrl?: string;
  /** Read at collect time so the env can change without a restart. */
  getToken?: () => string | undefined;
}

export function githubSearchQuery(term: string, since: Date): string {
  const day = since.toISOString().slice(0, 10);
  return `${term} in:name,description created:>=${day} fork:false archived:false`;
}

export function repoToCandidate(repo: z.infer<typeof RepoSchema>, raw: unknown): RawCandidate {
  const description = repo.description?.trim() ?? "";
  const topics = repo.topics?.length ? `\nTopics: ${repo.topics.join(", ")}` : "";
  return {
    source: "github",
    sourceId: String(repo.id),
    sourceUrl: repo.html_url,
    title: repo.full_name,
    author: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
    excerpt: clip(`${description}${topics}`.trim() || repo.full_name),
    discoveredUrls: uniqueHttpUrls([repo.html_url, repo.homepage]),
    createdAt: new Date(repo.created_at).toISOString(),
    raw
  };
}

export function createGithubCollector(options: GithubCollectorOptions = {}): SourceCollector {
  const searchUrl = options.searchUrl ?? GITHUB_SEARCH_URL;
  const defaultTerms = options.terms ?? DEFAULT_GITHUB_TERMS;
  const getToken = options.getToken ?? (() => loadEnv().githubToken);

  return {
    source: "github",
    async collect(query: HarvestQuery, ctx: RequestContext): Promise<CollectResult> {
      const result = emptyCollectResult();
      const seen = new Set<string>();
      const terms = query.query ? [query.query] : defaultTerms;
      const perPage = Math.max(1, Math.min(query.limit, MAX_PER_PAGE));
      const token = getToken();

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      };
      // Only to raise public Search API rate limits. Never used for private repos.
      if (token) headers.Authorization = `Bearer ${token}`;

      for (const term of terms) {
        if (result.items.length >= query.limit) break;
        const url = new URL(searchUrl);
        url.searchParams.set("q", githubSearchQuery(term, query.since));
        url.searchParams.set("sort", "stars");
        url.searchParams.set("order", "desc");
        url.searchParams.set("per_page", String(perPage));

        let body: unknown;
        try {
          body = (await ctx.http.getJson("github", url.toString(), { headers })).body;
        } catch (err) {
          if (recordRequestError(result, err)) break;
          continue;
        }

        const parsed = ResponseSchema.safeParse(body);
        if (!parsed.success) {
          result.failed += 1;
          result.errors.push("GitHub Search returned an unexpected response shape.");
          continue;
        }

        for (const rawRepo of parsed.data.items) {
          result.fetched += 1;
          const repo = RepoSchema.safeParse(rawRepo);
          if (!repo.success || repo.data.private || repo.data.fork || repo.data.archived) {
            result.skipped += 1;
            continue;
          }
          const key = String(repo.data.id);
          if (seen.has(key)) {
            result.skipped += 1;
            continue;
          }
          seen.add(key);
          const candidate = repoToCandidate(repo.data, rawRepo);
          if (!isAfter(candidate.createdAt, query.since) || result.items.length >= query.limit) {
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

export const githubCollector: SourceCollector = createGithubCollector();
