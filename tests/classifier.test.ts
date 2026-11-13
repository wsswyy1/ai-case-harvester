import { describe, expect, it } from "vitest";
import { classify, type ClassifierInput } from "@/classifier/index";
import type { LlmClient } from "@/lib/types";

describe("classify (stub)", () => {
  it("returns null until the parser is implemented", async () => {
    const fake: LlmClient = {
      async completeJson() {
        return { isRealCase: true };
      }
    };
    const candidate: ClassifierInput = {
      title: "Example",
      author: "ada",
      excerpt: "Built a tool with an LLM.",
      sourceUrl: "https://news.ycombinator.com/item?id=1",
      projectUrl: "https://github.com/ada/example"
    };
    expect(await classify(fake, candidate)).toBeNull();
  });
});
