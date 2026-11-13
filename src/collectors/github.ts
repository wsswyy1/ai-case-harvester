import type { CollectResult, HarvestQuery, RequestContext, SourceCollector } from "@/lib/types";

export const githubCollector: SourceCollector = {
  source: "github",
  async collect(_query: HarvestQuery, _ctx: RequestContext): Promise<CollectResult> {
    // TODO: official GitHub Search API.
    // Optional GITHUB_TOKEN is only for public rate limits, never private repos.
    throw new Error("TODO: implement GitHub Search collector");
  }
};
