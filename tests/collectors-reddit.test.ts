import { describe, expect, it } from "vitest";
import { createRedditCollector } from "@/collectors/reddit";
import { loadEnv } from "@/lib/env";
import { USER_AGENT } from "@/lib/http";
import { fakeHttp, headerOf, json, loadFixture } from "./helpers/fake-http";

const fixture = loadFixture("reddit-new.json");
const since = new Date("2026-11-01T00:00:00Z");

describe("Reddit public JSON collector", () => {
  it("reads only the configured public subreddits with no auth", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    const collector = createRedditCollector({ getSubreddits: () => ["LocalLLaMA", "SideProject"] });

    await collector.collect({ since, limit: 50 }, { http });

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/r/LocalLLaMA/new.json",
      "/r/SideProject/new.json"
    ]);
    for (const call of calls) {
      expect(new URL(call.url).host).toBe("www.reddit.com");
      expect(headerOf(call, "User-Agent")).toBe(USER_AGENT);
      expect(headerOf(call, "Authorization")).toBeUndefined();
      expect(headerOf(call, "Cookie")).toBeUndefined();
    }
  });

  it("maps posts and keeps only non-Reddit project links", async () => {
    const { http } = fakeHttp(() => json(fixture));
    const result = await createRedditCollector({ getSubreddits: () => ["LocalLLaMA"] }).collect(
      { since, limit: 50 },
      { http }
    );

    expect(result.fetched).toBe(7);
    expect(result.items.map((i) => i.sourceId)).toEqual(["fx0001", "fx0002", "fx0004"]);
    // stickied, removed/deleted, too old, and non-t3 children are skipped
    expect(result.skipped).toBe(4);

    const selfPost = result.items[0];
    expect(selfPost).toMatchObject({
      source: "reddit",
      sourceUrl: "https://www.reddit.com/r/LocalLLaMA/comments/fx0001/i_built_a_local_meeting_summarizer/",
      author: "fixture_builder_one",
      createdAt: new Date(1794480000 * 1000).toISOString(),
      discoveredUrls: [
        "https://github.com/fixture-one/meeting-scribe",
        "https://fixture-one.example.org/demo"
      ]
    });
    expect(selfPost.title).toContain("whisper.cpp & it runs");

    expect(result.items[1].discoveredUrls).toEqual(["https://github.com/fixture-cook/meal-planner"]);
    // i.redd.it media is not a project link
    expect(result.items[2].discoveredUrls).toEqual([]);
  });

  it("ignores invalid subreddit names instead of building arbitrary URLs", async () => {
    const { http, calls } = fakeHttp(() => json(fixture));
    await createRedditCollector({ getSubreddits: () => ["../api/v1/me", "LocalLLaMA"] }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/r/LocalLLaMA/new.json"]);
  });

  it("records a 403 or login wall as a failure and moves on", async () => {
    let n = 0;
    const { http, calls } = fakeHttp(() =>
      n++ === 0
        ? new Response("<html>please log in</html>", { status: 200, headers: { "content-type": "text/html" } })
        : json({ message: "Forbidden" }, 403)
    );
    const result = await createRedditCollector({ getSubreddits: () => ["LocalLLaMA", "SideProject"] }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(calls).toHaveLength(2);
    expect(result.failed).toBe(2);
    expect(result.stoppedOnRateLimit).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("stops on 429", async () => {
    const { http, calls } = fakeHttp(() => json({}, 429, { "retry-after": "600" }));
    const result = await createRedditCollector({ getSubreddits: () => ["a_sub", "b_sub"] }).collect(
      { since, limit: 50 },
      { http }
    );
    expect(calls).toHaveLength(1);
    expect(result.stoppedOnRateLimit).toBe(true);
    expect(result.retryAfterSeconds).toBe(600);
  });

  it("parses REDDIT_SUBREDDITS from the environment", () => {
    expect(loadEnv({ REDDIT_SUBREDDITS: "r/LocalLLaMA, SideProject" }).redditSubreddits).toEqual([
      "LocalLLaMA",
      "SideProject"
    ]);
    expect(loadEnv({}).redditSubreddits.length).toBeGreaterThan(0);
    expect(() => loadEnv({ REDDIT_SUBREDDITS: "ok,../bad" })).toThrow(/REDDIT_SUBREDDITS/);
  });
});
