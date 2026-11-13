import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { newCaseRecord, type Database } from "@/lib/db";
import { exportCases } from "@/lib/export";
import type { CaseRecord } from "@/lib/types";
import { tempDb } from "./helpers/temp-db";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDatabase: () => db };
});

const { GET, POST } = await import("@/app/api/export/route");

function seed(id: string, partial: Partial<CaseRecord> = {}) {
  db.upsertCase(
    newCaseRecord({
      id,
      source: "hn",
      sourceId: id,
      sourceUrl: `https://news.ycombinator.com/item?id=${id}`,
      title: `Case ${id}`,
      author: "ada",
      excerpt: `Excerpt ${id}`,
      sourceCreatedAt: "2026-11-12T00:00:00.000Z",
      projectUrl: `https://github.com/ada/${id}`,
      canonicalKey: `github.com/ada/${id}`,
      status: "approved",
      category: "工作与效率",
      tools: ["Claude"],
      summaryZh: `开发者 ada 用 Claude 做了 ${id}。`,
      confidence: 0.9,
      reviewedAt: "2026-11-12T10:00:00.000Z",
      ...partial
    })
  );
}

beforeEach(() => {
  ({ db, cleanup } = tempDb());
  seed("a");
  seed("b");
  seed("q", { status: "needs_review" });
  seed("r", { status: "rejected" });
  seed("e", { status: "exported", exportedAt: "2026-11-12T11:00:00.000Z" });
});
afterEach(() => cleanup());

describe("exportCases", () => {
  it("exports approved cases with every required field", () => {
    const { items, markedIds } = exportCases(db);
    expect(items.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(markedIds).toEqual([]);
    expect(items.find((i) => i.id === "a")).toEqual({
      id: "a",
      title: "Case a",
      summary: "开发者 ada 用 Claude 做了 a。",
      author: "ada",
      source: "hn",
      sourceUrl: "https://news.ycombinator.com/item?id=a",
      projectUrl: "https://github.com/ada/a",
      tools: ["Claude"],
      category: "工作与效率",
      evidenceExcerpt: "Excerpt a",
      oneLinerZh: "开发者 ada 用 Claude 做了 a。",
      relatedSources: [],
      confidence: 0.9,
      lowConfidence: false,
      reviewedAt: "2026-11-12T10:00:00.000Z",
      status: "approved"
    });
  });

  it("exports a stated subset and ignores ids that are not approved", () => {
    const { items } = exportCases(db, { ids: ["b", "q", "r", "missing"] });
    expect(items.map((i) => i.id)).toEqual(["b"]);
  });

  it("marks approved cases as exported without deleting them", () => {
    const { markedIds, items } = exportCases(db, { markExported: true }, new Date("2026-11-13T00:00:00.000Z"));
    expect(markedIds.sort()).toEqual(["a", "b"]);
    expect(items.every((i) => i.status === "exported")).toBe(true);
    expect(db.getCase("a")).toMatchObject({ status: "exported", exportedAt: "2026-11-13T00:00:00.000Z" });
    expect(db.listCases({})).toHaveLength(5);
    // A second plain export has nothing new; includeExported brings them back.
    expect(exportCases(db).items).toEqual([]);
    expect(exportCases(db, { includeExported: true }).items).toHaveLength(3);
  });
});

describe("/api/export", () => {
  it("GET returns a JSON array and never changes status", async () => {
    const res = await GET(new NextRequest("http://localhost/api/export?status=approved&download=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="usecasecn-approved-/);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(db.getCase("a")?.status).toBe("approved");
  });

  it("GET rejects other statuses", async () => {
    expect((await GET(new NextRequest("http://localhost/api/export?status=needs_review"))).status).toBe(400);
  });

  it("POST can mark a subset as exported", async () => {
    const res = await POST(
      new Request("http://localhost/api/export", { method: "POST", body: JSON.stringify({ ids: ["a"], markExported: true }) })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ markedIds: ["a"] });
    expect(db.getCase("a")?.status).toBe("exported");
    expect(db.getCase("b")?.status).toBe("approved");
  });

  it("POST rejects unknown fields", async () => {
    const res = await POST(new Request("http://localhost/api/export", { method: "POST", body: JSON.stringify({ delete: true }) }));
    expect(res.status).toBe(400);
  });
});
