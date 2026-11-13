import type { CollectResult, HarvestQuery, RequestContext, SourceCollector } from "@/lib/types";

export const redditCollector: SourceCollector = {
  source: "reddit",
  async collect(_query: HarvestQuery, _ctx: RequestContext): Promise<CollectResult> {
    // TODO: public listing JSON for a configured set of subreddits.
    // No login, no API app flow, no User-Agent rotation.
    throw new Error("TODO: implement Reddit public JSON collector");
  }
};
