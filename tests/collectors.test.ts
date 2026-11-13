import { describe, expect, it } from "vitest";
import { collectAll, collectors, enabledCollectors } from "@/collectors/index";
import { emptyCollectResult } from "@/collectors/shared";
import { loadEnv } from "@/lib/env";
import type { CollectResult, RawCandidate, SourceCollector, SourceName } from "@/lib/types";
import { fakeHttp, json } from "./helpers/fake-http";

function candidate(source: SourceName, id: string): RawCandidate {
  return {
    source,
    sourceId: id,
    sourceUrl: `https://example.org/${source}/${id}`,
    title: id,
    author: "a",
    excerpt: "",
    discoveredUrls: [],
    createdAt: new Date().toISOString(),
    raw: null
  };
}

function stub(source: SourceName, result: Partial<CollectResult> | Error): SourceCollector & { calls: number } {
  const s = {
    source,
    calls: 0,
    async collect() {
      s.calls += 1;
      if (result instanceof Error) throw result;
      return { ...emptyCollectResult(), ...result };
    }
  };
  return s;
}

describe("collectors barrel", () => {
  it("exposes hn, github, and reddit collectors", () => {
    expect(collectors.hn.source).toBe("hn");
    expect(collectors.github.source).toBe("github");
    expect(collectors.reddit.source).toBe("reddit");
  });

  it("returns only enabled collectors in a stable order", () => {
    expect(enabledCollectors(["reddit", "hn"]).map((c) => c.source)).toEqual(["hn", "reddit"]);
    expect(enabledCollectors([])).toEqual([]);
  });
});

describe("collectAll", () => {
  const { http } = fakeHttp(() => json({}));
  const query = { since: new Date(0), limit: 10 };

  it("skips disabled sources and tallies per-source counts", async () => {
    const registry = {
      hn: stub("hn", { items: [candidate("hn", "1"), candidate("hn", "2")], fetched: 5, skipped: 3 }),
      github: stub("github", { items: [candidate("github", "g")], fetched: 1 }),
      reddit: stub("reddit", { items: [candidate("reddit", "r")], fetched: 1 })
    };

    const out = await collectAll(query, { http }, { enabled: ["hn", "github"], registry });

    expect(registry.reddit.calls).toBe(0);
    expect(out.items.map((i) => i.sourceId)).toEqual(["1", "2", "g"]);
    expect(out.perSource.hn).toMatchObject({ enabled: true, fetched: 5, kept: 2, skipped: 3, failed: 0 });
    expect(out.perSource.github).toMatchObject({ enabled: true, fetched: 1, kept: 1 });
    expect(out.perSource.reddit).toMatchObject({ enabled: false, fetched: 0, kept: 0, skipped: 0, failed: 0 });
  });

  it("continues when one source throws or is rate limited", async () => {
    const registry = {
      hn: stub("hn", new Error("boom with Bearer abcdefghijklmnop")),
      github: stub("github", { stoppedOnRateLimit: true, retryAfterSeconds: 60, errors: ["HTTP 429"] }),
      reddit: stub("reddit", { items: [candidate("reddit", "r")], fetched: 1, failed: 1, errors: ["403"] })
    };

    const out = await collectAll(query, { http }, { registry });

    expect(out.items.map((i) => i.sourceId)).toEqual(["r"]);
    expect(out.perSource.hn.failed).toBe(1);
    expect(out.errors.hn?.[0]).not.toContain("abcdefghijklmnop");
    expect(out.perSource.github).toMatchObject({ stoppedOnRateLimit: true, retryAfterSeconds: 60 });
    expect(out.perSource.reddit).toMatchObject({ kept: 1, failed: 1 });
  });

  it("reads HARVEST_SOURCES from the environment", () => {
    expect(loadEnv({}).harvestSources).toEqual(["hn", "github", "reddit"]);
    expect(loadEnv({ HARVEST_SOURCES: "HN, reddit" }).harvestSources).toEqual(["hn", "reddit"]);
    expect(() => loadEnv({ HARVEST_SOURCES: "hn,twitter" })).toThrow(/HARVEST_SOURCES/);
  });
});
