import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushPending, submissionsEndpoint } from "@/ingest/client";
import { idempotencyKey, sanitizeAuthor, sourceUrlKind, toUsecasecnSubmission } from "@/ingest/usecasecn";
import { newCaseRecord, type Database } from "@/lib/db";
import { ConfigError, loadEnv } from "@/lib/env";
import { USER_AGENT } from "@/lib/http";
import type { CaseRecord } from "@/lib/types";
import { fakeHttp, headerOf, json, type FakeCall } from "./helpers/fake-http";
import { tempDb } from "./helpers/temp-db";

const TOKEN = "fake-ingest-token-for-tests";
const env = loadEnv({ USECASECN_API_URL: "https://intake.example.test/api/v1", USECASECN_INGEST_TOKEN: TOKEN });

function approved(id: string, partial: Partial<CaseRecord> = {}): CaseRecord {
  return newCaseRecord({
    id,
    source: "hn",
    sourceId: id,
    sourceUrl: `https://news.ycombinator.com/item?id=${id}`,
    title: `Show HN: Project ${id}`,
    author: "ada",
    excerpt: `I built project ${id} with Claude.`,
    sourceCreatedAt: "2026-11-12T00:00:00.000Z",
    projectUrl: `https://github.com/Ada/project-${id}`,
    canonicalKey: `github.com/ada/project-${id}`,
    status: "approved",
    category: "工作与效率",
    tools: ["Claude"],
    summaryZh: `开发者 ada 用 Claude 做了项目 ${id}。`,
    confidence: 0.9,
    reviewedAt: "2026-11-12T10:00:00.000Z",
    createdAt: `2026-11-12T00:00:${id.padStart(2, "0")}.000Z`,
    ...partial
  });
}

describe("sanitizeAuthor", () => {
  it.each([
    ["  ada-  ", "ada"],
    ["ada", "ada"],
    ["ada--", "ada"],
    ["ada —", "ada"],
    ["ada_lovelace.", "ada_lovelace"],
    ["a-da", "a-da"],
    ["---", ""],
    ["   ", ""]
  ])("%j → %j", (input, out) => {
    expect(sanitizeAuthor(input)).toBe(out);
  });
});

describe("sourceUrlKind", () => {
  it.each([
    ["https://news.ycombinator.com/item?id=123", "hn_item"],
    ["https://github.com/a/b", "github_repo"],
    ["https://github.com/a/b/tree/main", "github_repo"],
    ["https://www.reddit.com/r/x/comments/1/", null],
    ["https://gitlab.com/a/b", null],
    ["http://news.ycombinator.com/item?id=1", null],
    ["https://news.ycombinator.com/item?id=abc", null],
    [null, null]
  ])("%s → %s", (url, kind) => {
    expect(sourceUrlKind(url)).toBe(kind);
  });
});

describe("toUsecasecnSubmission", () => {
  it("maps an HN case to the v1 payload", () => {
    const r = toUsecasecnSubmission(approved("1"), { batchId: "batch-1" });
    expect(r).toEqual({
      ok: true,
      payload: {
        schema_version: 1,
        title: "Project 1",
        summary: "开发者 ada 用 Claude 做了项目 1。",
        author: "ada",
        source_url: "https://news.ycombinator.com/item?id=1",
        project_url: "https://github.com/Ada/project-1",
        tools: ["Claude"],
        category: "工作与效率",
        evidence: {
          original_excerpt: "I built project 1 with Claude.",
          checked_at: "2026-11-12T10:00:00.000Z",
          limitations: expect.stringContaining("approved by a human curator") as unknown as string
        },
        batch_id: "batch-1",
        one_liner: "开发者 ada 用 Claude 做了项目 1。"
      }
    });
  });

  it("sanitizes a trailing-hyphen author before sending", () => {
    const r = toUsecasecnSubmission(approved("1", { author: " ada- " }));
    expect(r.ok && r.payload.author).toBe("ada");
  });

  it("skips when the author is empty after sanitization", () => {
    const r = toUsecasecnSubmission(approved("1", { author: " - " }));
    expect(r).toMatchObject({ ok: false, skip: true, reason: expect.stringMatching(/author/) });
  });

  it("uses a Reddit case's GitHub project as source_url and keeps the thread in evidence", () => {
    const thread = "https://www.reddit.com/r/LocalLLaMA/comments/abc/t/";
    const r = toUsecasecnSubmission(
      approved("1", { source: "reddit", sourceId: "abc", sourceUrl: thread, projectUrl: "https://github.com/Cook/Planner/tree/main" })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.source_url).toBe("https://github.com/Cook/Planner");
    expect(r.payload.evidence.limitations).toContain(thread);
    expect(JSON.stringify(r.payload)).not.toMatch(/"source_url":"https:\/\/www\.reddit/);
  });

  it("skips a Reddit case with no ingest-compatible URL", () => {
    const r = toUsecasecnSubmission(
      approved("1", { source: "reddit", sourceUrl: "https://www.reddit.com/r/x/comments/1/", projectUrl: "https://planner.example.org/" })
    );
    expect(r).toMatchObject({ ok: false, skip: true, reason: expect.stringMatching(/JSON export/) });
  });

  it.each<[string, Partial<CaseRecord>]>([
    ["missing tools", { tools: [] }],
    ["missing category", { category: null }],
    ["missing Chinese summary", { summaryZh: null }],
    ["not approved", { status: "needs_review" }]
  ])("validates required fields: %s", (_name, partial) => {
    expect(toUsecasecnSubmission(approved("1", partial)).ok).toBe(false);
  });

  it("derives a stable Idempotency-Key from the source identity", () => {
    const a = idempotencyKey({ source: "hn", sourceId: "1" });
    expect(a).toBe(idempotencyKey({ source: "hn", sourceId: "1" }));
    expect(a).not.toBe(idempotencyKey({ source: "reddit", sourceId: "1" }));
    expect(a).toMatch(/^ach-[0-9a-f]{40}$/);
  });
});

describe("submissionsEndpoint", () => {
  it("targets the pending submissions collection only", () => {
    expect(submissionsEndpoint("https://intake.example.test/api/v1/")).toBe("https://intake.example.test/api/v1/submissions");
    expect(submissionsEndpoint("https://intake.example.test/api/v1/submissions")).toBe(
      "https://intake.example.test/api/v1/submissions"
    );
    expect(() => submissionsEndpoint("https://x.test/api/admin")).toThrow(ConfigError);
    expect(() => submissionsEndpoint("https://x.test/api/publish")).toThrow(ConfigError);
    expect(() => submissionsEndpoint("http://x.test/api")).toThrow(/https/);
    expect(() => submissionsEndpoint("https://x.test/api?token=abc")).toThrow(/query/);
  });
});

describe("pushPending", () => {
  let db: Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = tempDb());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function bodies(calls: FakeCall[]) {
    return calls.map((c) => JSON.parse(String(c.init.body)) as Record<string, unknown>);
  }

  it("refuses to push when the URL or token is missing", async () => {
    db.upsertCase(approved("1"));
    await expect(pushPending({}, { db, env: loadEnv({}) })).rejects.toThrow(/JSON export is still available/);
    await expect(
      pushPending({}, { db, env: loadEnv({ USECASECN_API_URL: "https://intake.example.test/api/v1" }) })
    ).rejects.toThrow(/USECASECN_INGEST_TOKEN/);
    expect(db.getCase("1")?.status).toBe("approved");
  });

  it("sends bearer auth, Idempotency-Key, and User-Agent, and records the receipt", async () => {
    db.upsertCase(approved("1"));
    const { http, calls } = fakeHttp(() => json({ id: "rcpt-1", status: "pending" }, 201));

    const result = await pushPending({}, { db, env, http });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://intake.example.test/api/v1/submissions");
    expect(calls[0].url).not.toContain(TOKEN);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headerOf(calls[0], "Idempotency-Key")).toBe(idempotencyKey({ source: "hn", sourceId: "1" }));
    expect(headerOf(calls[0], "User-Agent")).toBe(USER_AGENT);
    expect(bodies(calls)[0]).toMatchObject({ schema_version: 1, source_url: "https://news.ycombinator.com/item?id=1" });
    expect(JSON.stringify(bodies(calls)[0])).not.toContain(TOKEN);

    expect(result.results).toEqual([{ id: "1", title: "Show HN: Project 1", outcome: "pushed", status: 201, receiptId: "rcpt-1" }]);
    expect(db.getCase("1")).toMatchObject({ status: "pushed", ingestReceiptId: "rcpt-1", ingestStatus: "pending" });
  });

  it("treats 409 as already present and never retries it", async () => {
    db.upsertCase(approved("1"));
    db.upsertCase(approved("2"));
    let n = 0;
    const { http, calls } = fakeHttp(() => (n++ === 0 ? json({ id: "old-1" }, 409) : json({ error: "conflict" }, 409)));

    const result = await pushPending({}, { db, env, http });

    expect(calls).toHaveLength(2);
    expect(result.results.map((r) => r.outcome)).toEqual(["duplicate", "conflict"]);
    expect(db.getCase("1")).toMatchObject({ status: "pushed", ingestReceiptId: "old-1", ingestStatus: "duplicate" });
    expect(db.getCase("2")).toMatchObject({ status: "approved", ingestStatus: "conflict" });
  });

  it("keeps a 422 case approved with a sanitized message", async () => {
    db.upsertCase(approved("1"));
    const { http } = fakeHttp(() => json({ error: "author invalid", echo: `Bearer ${TOKEN}` }, 422));

    const result = await pushPending({}, { db, env, http });

    expect(result.results[0]).toMatchObject({ outcome: "invalid", status: 422 });
    const stored = db.getCase("1");
    expect(stored?.status).toBe("approved");
    expect(stored?.ingestError).toMatch(/author invalid/);
    expect(stored?.ingestError).not.toContain(TOKEN);
    expect(result.results[0].message).not.toContain(TOKEN);
  });

  it("stops the batch on 429, records Retry-After, and keeps earlier pushes", async () => {
    for (const id of ["1", "2", "3", "4"]) db.upsertCase(approved(id));
    let n = 0;
    const { http, calls } = fakeHttp(() => (n++ === 0 ? json({ id: "r1" }, 201) : json({}, 429, { "retry-after": "120" })));

    const result = await pushPending({}, { db, env, http });

    expect(calls).toHaveLength(2);
    expect(result.stoppedOnRateLimit).toBe(true);
    expect(result.retryAfterSeconds).toBe(120);
    expect(result.results.map((r) => r.outcome)).toEqual(["pushed", "rate_limited", "not_attempted", "not_attempted"]);
    expect(db.getCase("1")?.status).toBe("pushed");
    expect(["2", "3", "4"].map((id) => db.getCase(id)?.status)).toEqual(["approved", "approved", "approved"]);
  });

  it("skips Reddit cases without a compatible URL and pushes the rest", async () => {
    db.upsertCase(
      approved("1", { source: "reddit", sourceUrl: "https://www.reddit.com/r/x/comments/1/", projectUrl: "https://planner.example.org/" })
    );
    db.upsertCase(approved("2"));
    const { http, calls } = fakeHttp(() => json({ id: "r2" }, 201));

    const result = await pushPending({}, { db, env, http });

    expect(calls).toHaveLength(1);
    expect(result.results.map((r) => [r.id, r.outcome])).toEqual([
      ["1", "skipped"],
      ["2", "pushed"]
    ]);
    expect(db.getCase("1")?.status).toBe("approved");
  });

  it("only pushes approved or exported cases and only the selected ids", async () => {
    db.upsertCase(approved("1"));
    db.upsertCase(approved("2", { status: "needs_review" }));
    db.upsertCase(approved("3", { status: "pushed" }));
    db.upsertCase(approved("4", { status: "exported" }));
    const { http, calls } = fakeHttp(() => json({ id: "r" }, 201));

    await pushPending({ ids: ["2", "3", "4"] }, { db, env, http });

    expect(calls).toHaveLength(1);
    expect(db.getCase("4")?.status).toBe("pushed");
    expect(db.getCase("1")?.status).toBe("approved");
  });

  it("never logs the token", async () => {
    db.upsertCase(approved("1"));
    const spies = (["info", "warn", "error", "log"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { http } = fakeHttp(() => json({ error: "nope" }, 500));

    await pushPending({}, { db, env, http });

    const printed = spies.flatMap((s) => s.mock.calls.flat()).join("\n");
    expect(printed).not.toContain(TOKEN);
  });
});
