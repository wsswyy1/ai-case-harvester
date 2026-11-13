import { describe, expect, it } from "vitest";
import { collectors } from "@/collectors/index";

describe("collectors barrel", () => {
  it("exposes hn, github, and reddit collectors", () => {
    expect(collectors.hn.source).toBe("hn");
    expect(collectors.github.source).toBe("github");
    expect(collectors.reddit.source).toBe("reddit");
  });
});
