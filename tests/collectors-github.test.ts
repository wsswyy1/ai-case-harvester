import { describe, expect, it } from "vitest";
import { createGithubCollector } from "@/collectors/github";
import { USER_AGENT } from "@/lib/http";
import { fakeHttp, headerOf, json, loadFixture } from "./helpers/fake-http";

const fixture = loadFixture<{ items: Record<string, unknown>[] }>("github-search-repositories.json");
const since = new Date("2026-11-01T00:00:00Z");
const FAKE_TOKEN = "test-token-not-real-0000";

describe("GitHub Search collector", () => {
  it("queries the official Search API and maps repositories", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    const collector = createGithubCollector({ terms: ["llm"], getToken: () => undefined });

    const result = await collector.collect({ since, limit: 50 }, { http });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://api.github.com/search/repositories");
    expect(url.searchParams.get("q")).toBe("llm in:name,description created:>=2026-11-01 fork:false archived:false");
    expect(headerOf(calls[0], "User-Agent")).toBe(USER_AGENT);
    expect(headerOf(calls[0], "Accept")).toBe("application/vnd.github+json");

    expect(result.fetched).toBe(fixture.items.length);
    expect(result.items).toHaveLength(fixture.items.length);

    const sand3d = result.items.find((i) => i.title === "Sandflow-ai/sand3d");
    expect(sand3d).toMatchObject({
      source: "github",
      sourceId: "1444005452",
      sourceUrl: "https://github.com/Sandflow-ai/sand3d",
      author: "Sandflow-ai",
      createdAt: "2026-11-03T08:23:03.000Z",
      discoveredUrls: ["https://github.com/Sandflow-ai/sand3d", "https://sandflow.ai/sand3d/"]
    });
    expect(sand3d?.excerpt).toContain("3D modeling in Python");
  });

  it("sends no Authorization header when GITHUB_TOKEN is absent", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    await createGithubCollector({ terms: ["llm"], getToken: () => undefined }).collect({ since, limit: 5 }, { http });
    expect(headerOf(calls[0], "Authorization")).toBeUndefined();
  });

  it("uses the token only as a bearer header on the public Search API", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    await createGithubCollector({ terms: ["llm", "gpt"], getToken: () => FAKE_TOKEN }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(new URL(call.url).host).toBe("api.github.com");
      expect(new URL(call.url).pathname).toBe("/search/repositories");
      expect(call.url).not.toContain(FAKE_TOKEN);
      expect(headerOf(call, "Authorization")).toBe(`Bearer ${FAKE_TOKEN}`);
    }
  });

  it("skips private, forked, and archived repositories", async () => {
    const [first, second, third, ...rest] = fixture.items;
    const body = {
      items: [{ ...first, private: true }, { ...second, fork: true }, { ...third, archived: true }, ...rest]
    };
    const { http } = fakeHttp(() => json(body));
    const result = await createGithubCollector({ terms: ["llm"], getToken: () => undefined }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(result.items).toHaveLength(rest.length);
    expect(result.skipped).toBe(3);
  });

  it("treats a 403 with exhausted rate limit as a stop, and plain 403 as a skipped failure", async () => {
    const limited = fakeHttp(() =>
      json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "retry-after": "60" })
    );
    const stopped = await createGithubCollector({ terms: ["llm", "gpt"], getToken: () => undefined }).collect(
      { since, limit: 50 },
      { http: limited.http }
    );
    expect(limited.calls).toHaveLength(1);
    expect(stopped.stoppedOnRateLimit).toBe(true);
    expect(stopped.retryAfterSeconds).toBe(60);

    const denied = fakeHttp(() => json({ message: "Forbidden" }, 403));
    const skipped = await createGithubCollector({ terms: ["llm", "gpt"], getToken: () => undefined }).collect(
      { since, limit: 50 },
      { http: denied.http }
    );
    expect(denied.calls).toHaveLength(2);
    expect(skipped.stoppedOnRateLimit).toBe(false);
    expect(skipped.failed).toBe(2);
  });

  it("stops on 429 without retrying", async () => {
    const { http, calls } = fakeHttp(() => json({}, 429, { "retry-after": "30" }));
    const result = await createGithubCollector({ terms: ["llm", "gpt", "claude"], getToken: () => undefined }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(calls).toHaveLength(1);
    expect(result.stoppedOnRateLimit).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });
});
