import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { newCaseRecord, type Database } from "@/lib/db";
import type { CaseRecord } from "@/lib/types";
import { tempDb } from "./helpers/temp-db";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDatabase: () => db };
});

const { GET } = await import("@/app/api/cases/route");
const { POST } = await import("@/app/api/cases/[id]/review/route");

function seed(id: string, partial: Partial<CaseRecord> = {}) {
  db.upsertCase(
    newCaseRecord({
      id,
      source: "hn",
      sourceId: id,
      sourceUrl: `https://news.ycombinator.com/item?id=${id}`,
      title: `Case ${id}`,
      author: "ada",
      excerpt: "",
      sourceCreatedAt: "2026-11-12T00:00:00.000Z",
      status: "needs_review",
      ...partial
    })
  );
}

function review(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/cases/${id}/review`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body)
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  ({ db, cleanup } = tempDb());
});
afterEach(() => cleanup());

describe("GET /api/cases", () => {
  it("filters by status, source, category, and confidence", async () => {
    seed("a", { category: "工作与效率", confidence: 0.9 });
    seed("b", { source: "reddit", sourceUrl: "https://www.reddit.com/r/x/comments/b/", category: "其他", confidence: 0.3 });
    seed("c", { status: "approved", category: "工作与效率", confidence: 0.8 });

    const ids = async (qs: string) => {
      const res = await GET(new NextRequest(`http://localhost/api/cases${qs}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { cases: { id: string }[] };
      return body.cases.map((c) => c.id).sort();
    };

    expect(await ids("")).toEqual(["a", "b", "c"]);
    expect(await ids("?status=needs_review")).toEqual(["a", "b"]);
    expect(await ids("?status=needs_review,approved&source=hn")).toEqual(["a", "c"]);
    expect(await ids(`?category=${encodeURIComponent("工作与效率")}`)).toEqual(["a", "c"]);
    expect(await ids("?minConfidence=0.5&status=needs_review")).toEqual(["a"]);
  });

  it("rejects unknown filters and values", async () => {
    expect((await GET(new NextRequest("http://localhost/api/cases?status=published"))).status).toBe(400);
    expect((await GET(new NextRequest("http://localhost/api/cases?source=twitter"))).status).toBe(400);
    expect((await GET(new NextRequest("http://localhost/api/cases?foo=1"))).status).toBe(400);
  });
});

describe("POST /api/cases/:id/review", () => {
  it("approves a needs_review case and records the timestamp", async () => {
    seed("a");
    const res = await review("a", { decision: "approved" });
    expect(res.status).toBe(200);
    const stored = db.getCase("a");
    expect(stored?.status).toBe("approved");
    expect(stored?.reviewedAt).toBeTruthy();
    expect(stored?.rejectReason).toBeNull();
  });

  it("rejects with an optional reason", async () => {
    seed("a");
    seed("b");
    expect((await review("a", { decision: "rejected", reason: "  Not AI  " })).status).toBe(200);
    expect(db.getCase("a")).toMatchObject({ status: "rejected", rejectReason: "Not AI" });
    expect((await review("b", { decision: "rejected" })).status).toBe(200);
    expect(db.getCase("b")).toMatchObject({ status: "rejected", rejectReason: null });
  });

  it("refuses cases that are not in needs_review and reports the current status", async () => {
    seed("a", { status: "approved" });
    const res = await review("a", { decision: "rejected" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ currentStatus: "approved" });
    expect(db.getCase("a")?.status).toBe("approved");
  });

  it("returns 404 for an unknown id and 400 for a bad body", async () => {
    expect((await review("missing", { decision: "approved" })).status).toBe(404);
    seed("a");
    expect((await review("a", { decision: "publish" })).status).toBe(400);
    expect((await review("a", "not json")).status).toBe(400);
    expect(db.getCase("a")?.status).toBe("needs_review");
  });

  it("never calls the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    seed("a");
    await review("a", { decision: "approved" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
