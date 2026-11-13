import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newCaseRecord, type Database } from "@/lib/db";
import { reviewCase } from "@/lib/review";
import {
  canTransition,
  CASE_STATUSES,
  InvalidTransitionError,
  STATUS_TRANSITIONS,
  type CaseStatus
} from "@/lib/types";
import { tempDb } from "./helpers/temp-db";

describe("status transitions", () => {
  it("only lets the curator move needs_review to approved or rejected", () => {
    expect(STATUS_TRANSITIONS.needs_review).toEqual(["approved", "rejected"]);
    for (const from of CASE_STATUSES) {
      for (const to of ["approved", "rejected"] as CaseStatus[]) {
        expect(canTransition(from, to)).toBe(from === "needs_review");
      }
    }
  });

  it("only reaches pushed from approved or exported", () => {
    const sources = CASE_STATUSES.filter((s) => canTransition(s, "pushed"));
    expect(sources.sort()).toEqual(["approved", "exported"]);
  });

  it("treats terminal statuses as terminal", () => {
    for (const s of ["rejected_prefilter", "classified", "duplicate", "rejected", "pushed"] as CaseStatus[]) {
      expect(STATUS_TRANSITIONS[s]).toEqual([]);
    }
  });
});

describe("reviewCase", () => {
  let db: Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = tempDb());
  });
  afterEach(() => cleanup());

  function seed(id: string, status: CaseStatus) {
    db.upsertCase(
      newCaseRecord({
        id,
        source: "hn",
        sourceId: id,
        sourceUrl: `https://news.ycombinator.com/item?id=${id}`,
        title: id,
        author: "ada",
        excerpt: "",
        sourceCreatedAt: "2026-11-12T00:00:00.000Z",
        status
      })
    );
  }

  it("approves and rejects needs_review cases with a timestamp", () => {
    seed("a", "needs_review");
    seed("b", "needs_review");
    const at = new Date("2026-11-13T08:00:00.000Z");

    expect(reviewCase(db, "a", { decision: "approved", reason: "ignored on approve" }, at)).toMatchObject({
      ok: true,
      record: { status: "approved", reviewedAt: at.toISOString(), rejectReason: null }
    });
    expect(reviewCase(db, "b", { decision: "rejected", reason: "No AI" }, at)).toMatchObject({
      ok: true,
      record: { status: "rejected", reviewedAt: at.toISOString(), rejectReason: "No AI" }
    });
  });

  it.each(CASE_STATUSES.filter((s) => s !== "needs_review"))("refuses a %s case and reports its status", (status) => {
    seed("x", status);
    for (const decision of ["approved", "rejected"] as const) {
      expect(reviewCase(db, "x", { decision })).toEqual({
        ok: false,
        code: "invalid_state",
        currentStatus: status,
        message: expect.stringContaining(status) as unknown as string
      });
    }
    expect(db.getCase("x")?.status).toBe(status);
    expect(db.getCase("x")?.reviewedAt).toBeNull();
  });

  it("cannot be decided twice", () => {
    seed("a", "needs_review");
    expect(reviewCase(db, "a", { decision: "approved" }).ok).toBe(true);
    expect(reviewCase(db, "a", { decision: "rejected" })).toMatchObject({ ok: false, currentStatus: "approved" });
  });

  it("reports unknown ids", () => {
    expect(reviewCase(db, "nope", { decision: "approved" })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("database transition also enforces the state machine", () => {
    seed("a", "rejected");
    expect(() => db.transition("a", "pushed")).toThrow(InvalidTransitionError);
  });
});
