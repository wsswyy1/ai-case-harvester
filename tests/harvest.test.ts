import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyCollectResult } from "@/collectors/shared";
import type { Database } from "@/lib/db";
import { loadEnv } from "@/lib/env";
import { runHarvest } from "@/lib/harvest";
import { RateLimitError } from "@/lib/http";
import type { CollectResult, LlmClient, RawCandidate, SourceCollector, SourceName } from "@/lib/types";
import { fakeHttp, json } from "./helpers/fake-http";
import { tempDb } from "./helpers/temp-db";

const NOW = new Date("2026-11-13T00:00:00.000Z");

function raw(source: SourceName, id: string, partial: Partial<RawCandidate> = {}): RawCandidate {
  return {
    source,
    sourceId: id,
    sourceUrl: source === "hn" ? `https://news.ycombinator.com/item?id=${id}` : `https://www.reddit.com/r/x/comments/${id}/t/`,
    title: `Show HN: project ${id}`,
    author: `author${id}`,
    excerpt: `I built project ${id} with Claude.`,
    discoveredUrls: [`https://github.com/someone/project-${id}`],
    createdAt: "2026-11-12T00:00:00.000Z",
    raw: null,
    ...partial
  };
}

function collector(source: SourceName, result: Partial<CollectResult>): SourceCollector {
  return { source, collect: async () => ({ ...emptyCollectResult(), ...result }) };
}

function registry(over: Partial<Record<SourceName, SourceCollector>>): Record<SourceName, SourceCollector> {
  return {
    hn: collector("hn", {}),
    github: collector("github", {}),
    reddit: collector("reddit", {}),
    ...over
  };
}

const realCase = {
  isRealCase: true,
  confidence: 0.9,
  category: "工作与效率",
  tools: ["Claude"],
  summaryZh: "开发者用 Claude 做了一个工具。",
  rationale: "Shipped repo."
};

function llm(respond: (user: string, n: number) => unknown): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async completeJson({ user }: { system: string; user: string }) {
      client.calls += 1;
      return respond(user, client.calls);
    }
  };
  return client;
}

describe("runHarvest", () => {
  let db: Database;
  let cleanup: () => void;
  const env = loadEnv({});
  const { http } = fakeHttp(() => json({}));

  beforeEach(() => {
    ({ db, cleanup } = tempDb());
  });
  afterEach(() => cleanup());

  it("collects, prefilters, dedupes, classifies, and persists", async () => {
    const items = [
      raw("hn", "1"),
      raw("hn", "2", { title: "[Hiring] ML engineer", discoveredUrls: ["https://jobs.example.org/1"] }),
      raw("hn", "3", { discoveredUrls: ["https://openai.com/"] }),
      raw("hn", "4", { title: "Show HN: a CSV tool", excerpt: "No AI here." }),
      raw("reddit", "r1", { discoveredUrls: ["https://github.com/SomeOne/Project-1.git"] })
    ];
    const client = llm((user) =>
      user.includes("CSV tool")
        ? { isRealCase: false, confidence: 0.8, category: "其他", tools: [], summaryZh: "", rationale: "No AI." }
        : realCase
    );

    const { run } = await runHarvest(
      { limit: 10 },
      {
        db,
        env,
        http,
        llm: client,
        now: () => NOW,
        registry: registry({
          hn: collector("hn", { items: items.filter((i) => i.source === "hn"), fetched: 4 }),
          reddit: collector("reddit", { items: items.filter((i) => i.source === "reddit"), fetched: 1 })
        })
      }
    );

    expect(client.calls).toBe(2);
    expect(run.partial).toBe(false);
    expect(run.error).toBeNull();
    expect(run.totals).toMatchObject({ prefiltered: 2, duplicates: 1, classified: 2, queued: 1, classifyFailed: 0 });
    expect(run.perSource.hn).toMatchObject({ fetched: 4, kept: 2, skipped: 2 });
    expect(run.perSource.reddit).toMatchObject({ fetched: 1, kept: 0, skipped: 1 });

    const queued = db.listCases({ status: "needs_review" });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      sourceId: "1",
      projectUrl: "https://github.com/someone/project-1",
      canonicalKey: "github.com/someone/project-1",
      category: "工作与效率",
      tools: ["Claude"],
      summaryZh: "开发者用 Claude 做了一个工具。",
      relatedSources: ["https://www.reddit.com/r/x/comments/r1/t/"]
    });
    expect(db.listCases({ status: "duplicate" })[0]).toMatchObject({ sourceId: "r1", duplicateOfId: queued[0].id });
    expect(db.listCases({ status: "classified" })[0]).toMatchObject({ sourceId: "4", isRealCase: false });
    expect(db.listCases({ status: "rejected_prefilter" }).map((c) => c.sourceId).sort()).toEqual(["2", "3"]);

    expect(db.getRun(run.id)).toMatchObject({ id: run.id, partial: false });
  });

  it("continues past invalid model output and leaves that item harvested", async () => {
    const client = llm((_u, n) => (n === 1 ? { nope: true } : realCase));
    const { run } = await runHarvest(
      {},
      {
        db,
        env,
        http,
        llm: client,
        now: () => NOW,
        registry: registry({ hn: collector("hn", { items: [raw("hn", "1"), raw("hn", "2")], fetched: 2 }) })
      }
    );
    expect(run.totals).toMatchObject({ classifyFailed: 1, queued: 1 });
    expect(run.partial).toBe(true);
    const harvested = db.listCases({ status: "harvested" });
    expect(harvested).toHaveLength(1);
    expect(harvested[0].note).toMatch(/schema/);
  });

  it("stops calling the LLM after a 429 and keeps the rest as harvested", async () => {
    const client = llm((_u, n) => {
      if (n === 2) throw new RateLimitError("llm", 20);
      return realCase;
    });
    const { run } = await runHarvest(
      {},
      {
        db,
        env,
        http,
        llm: client,
        now: () => NOW,
        registry: registry({
          hn: collector("hn", { items: [raw("hn", "1"), raw("hn", "2"), raw("hn", "3")], fetched: 3 })
        })
      }
    );
    expect(client.calls).toBe(2);
    expect(run.partial).toBe(true);
    expect(run.error).toMatch(/429/);
    expect(run.totals).toMatchObject({ queued: 1, unclassified: 2 });
    expect(db.listCases({ status: "harvested" })).toHaveLength(2);
  });

  it("records a source 429 and still processes other sources", async () => {
    const { run } = await runHarvest(
      {},
      {
        db,
        env,
        http,
        llm: llm(() => realCase),
        now: () => NOW,
        registry: registry({
          hn: collector("hn", { stoppedOnRateLimit: true, retryAfterSeconds: 120, errors: ["HTTP 429 from hn"] }),
          github: collector("github", { items: [raw("github", "g1")], fetched: 1 })
        })
      }
    );
    expect(run.partial).toBe(true);
    expect(run.perSource.hn).toMatchObject({ stoppedOnRateLimit: true, retryAfterSeconds: 120 });
    expect(run.totals.queued).toBe(1);
  });

  it("stores candidates as harvested when the classifier is not configured", async () => {
    const { run } = await runHarvest(
      {},
      {
        db,
        env, // no LLM_* values
        http,
        now: () => NOW,
        registry: registry({ hn: collector("hn", { items: [raw("hn", "1")], fetched: 1 }) })
      }
    );
    expect(run.partial).toBe(true);
    expect(run.error).toMatch(/LLM_BASE_URL/);
    expect(db.listCases({ status: "harvested" })).toHaveLength(1);
  });

  it("skips disabled sources and does not re-ingest known items", async () => {
    const hn = collector("hn", { items: [raw("hn", "1")], fetched: 1 });
    let redditCalled = false;
    const reddit: SourceCollector = {
      source: "reddit",
      collect: async () => {
        redditCalled = true;
        return emptyCollectResult();
      }
    };
    const deps = { db, env: loadEnv({ HARVEST_SOURCES: "hn" }), http, llm: llm(() => realCase), now: () => NOW, registry: registry({ hn, reddit }) };

    await runHarvest({}, deps);
    const second = await runHarvest({}, deps);

    expect(redditCalled).toBe(false);
    expect(second.run.perSource.reddit.enabled).toBe(false);
    expect(second.run.perSource.hn).toMatchObject({ kept: 0, skipped: 1 });
    expect(db.listCases({})).toHaveLength(1);
  });
});
