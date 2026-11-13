import { describe, expect, it } from "vitest";
import { createHnCollector, hnItemUrl } from "@/collectors/hn";
import { USER_AGENT } from "@/lib/http";
import { fakeHttp, headerOf, json, loadFixture } from "./helpers/fake-http";

const fixture = loadFixture<{ hits: unknown[] }>("hn-search-by-date.json");
const since = new Date("2026-11-01T00:00:00Z");

describe("HN Algolia collector", () => {
  it("maps Show HN hits into raw candidates with source fields and links", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    const collector = createHnCollector({ queries: ["LLM"] });

    const result = await collector.collect({ since, limit: 50 }, { http });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://hn.algolia.com/api/v1/search_by_date");
    expect(url.searchParams.get("query")).toBe("LLM");
    expect(url.searchParams.get("tags")).toBe("show_hn");
    expect(url.searchParams.get("numericFilters")).toBe(`created_at_i>=${since.getTime() / 1000}`);
    expect(headerOf(calls[0], "User-Agent")).toBe(USER_AGENT);
    expect(headerOf(calls[0], "Authorization")).toBeUndefined();

    expect(result.fetched).toBe(fixture.hits.length);
    expect(result.items).toHaveLength(fixture.hits.length);
    expect(result.failed).toBe(0);
    expect(result.stoppedOnRateLimit).toBe(false);

    const agentLeak = result.items.find((i) => i.sourceId === "50476987");
    expect(agentLeak).toMatchObject({
      source: "hn",
      sourceUrl: hnItemUrl("50476987"),
      author: "yagobski",
      createdAt: "2026-11-13T01:36:36.000Z",
      discoveredUrls: ["https://github.com/Privatris/AgentLeak"]
    });
    expect(agentLeak?.title).toContain("AgentLeak");
  });

  it("extracts links from story_text HTML and strips tags from the excerpt", async () => {
    const { http } = fakeHttp(() => json(fixture));
    const result = await createHnCollector({ queries: ["LLM"] }).collect({ since, limit: 50 }, { http });

    const drs = result.items.find((i) => i.sourceId === "50472560");
    expect(drs?.discoveredUrls).toEqual([
      "https://github.com/ori-drs/drs-vpt",
      "https://huggingface.co/spaces/fulkast/drs-vpt-demo"
    ]);
    expect(drs?.excerpt).toContain("We built DRS-VPT");
    expect(drs?.excerpt).not.toMatch(/<[a-z]/i);

    const kapso = result.items.find((i) => i.sourceId === "50471281");
    expect(kapso).toBeDefined();
    expect(kapso?.discoveredUrls.every((u) => u.startsWith("http"))).toBe(true);
  });

  it("de-duplicates hits across queries and respects the limit", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    const collector = createHnCollector({ queries: ["LLM", "AI"] });

    const all = await collector.collect({ since, limit: 50 }, { http });
    expect(calls).toHaveLength(2);
    expect(all.items).toHaveLength(fixture.hits.length);
    expect(all.skipped).toBe(fixture.hits.length);

    const { http: http2 } = fakeHttp(() => json(fixture));
    const limited = await collector.collect({ since, limit: 3 }, { http: http2 });
    expect(limited.items).toHaveLength(3);
  });

  it("skips hits older than since", async () => {
    const { http } = fakeHttp(() => json(fixture));
    const result = await createHnCollector({ queries: ["LLM"] }).collect(
      { since: new Date("2026-11-13T00:00:00Z"), limit: 50 },
      { http }
    );
    expect(result.items.map((i) => i.sourceId).sort()).toEqual(["50476537", "50476987"]);
    expect(result.skipped).toBe(fixture.hits.length - 2);
  });

  it("stops the source on 429 and records Retry-After without retrying", async () => {
    const { http, calls } = fakeHttp(() => json({ message: "slow down" }, 429, { "retry-after": "90" }));
    const result = await createHnCollector({ queries: ["LLM", "AI", "GPT"] }).collect({ since, limit: 50 }, { http });

    expect(calls).toHaveLength(1);
    expect(result.stoppedOnRateLimit).toBe(true);
    expect(result.retryAfterSeconds).toBe(90);
    expect(result.items).toHaveLength(0);
  });

  it("records a failure and continues with the next query on an HTTP error", async () => {
    let n = 0;
    const { http, calls } = fakeHttp(() => (n++ === 0 ? json({ error: "boom" }, 500) : json(fixture)));
    const result = await createHnCollector({ queries: ["LLM", "AI"] }).collect({ since, limit: 50 }, { http });

    expect(calls).toHaveLength(2);
    expect(result.failed).toBe(1);
    expect(result.items).toHaveLength(fixture.hits.length);
  });
});
