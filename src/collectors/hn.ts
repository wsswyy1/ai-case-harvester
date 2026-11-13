import type { CollectResult, HarvestQuery, RequestContext, SourceCollector } from "@/lib/types";

export const hnCollector: SourceCollector = {
  source: "hn",
  async collect(_query: HarvestQuery, _ctx: RequestContext): Promise<CollectResult> {
    // TODO: GET https://hn.algolia.com/api/v1/search_by_date
    // Public search only. Stop this source on 429.
    throw new Error("TODO: implement HN Algolia collector");
  }
};
