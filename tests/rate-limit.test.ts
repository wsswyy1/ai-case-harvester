import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "@/lib/http";

describe("parseRetryAfter", () => {
  it("parses a delay-seconds value", () => {
    expect(parseRetryAfter("30")).toBe(30);
  });

  it("returns undefined for a missing header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
