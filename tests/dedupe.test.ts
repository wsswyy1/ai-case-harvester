import { describe, expect, it } from "vitest";
import { canonicalKeyFor, canonicalProjectUrl, canonicalRepoKey } from "@/lib/dedupe";

describe("canonicalRepoKey (stub)", () => {
  it("is not implemented yet — replace these once task 6 is done", () => {
    expect(canonicalRepoKey("https://github.com/Acme/Widget.git")).toBeNull();
    expect(canonicalProjectUrl("https://Example.com/app/?utm_source=hn")).toBeNull();
    expect(canonicalKeyFor(null)).toBeNull();
  });
});
