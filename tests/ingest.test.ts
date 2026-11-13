import { describe, expect, it } from "vitest";
import { sanitizeAuthor } from "@/ingest/usecasecn";

describe("sanitizeAuthor", () => {
  it("trims whitespace and trailing hyphens that have caused ingest 422s", () => {
    expect(sanitizeAuthor("  ada-  ")).toBe("ada");
    expect(sanitizeAuthor("ada")).toBe("ada");
  });
});
