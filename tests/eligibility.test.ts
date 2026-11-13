import { describe, expect, it } from "vitest";
import { classifyLink, evaluateEligibility, prefilter, selectProjectUrl } from "@/lib/eligibility";
import type { RawCandidate } from "@/lib/types";

function raw(partial: Partial<RawCandidate>): RawCandidate {
  return {
    source: "hn",
    sourceId: "1",
    sourceUrl: "https://news.ycombinator.com/item?id=1",
    title: "Show HN: a thing",
    author: "ada",
    excerpt: "",
    discoveredUrls: [],
    createdAt: "2026-11-12T00:00:00.000Z",
    raw: null,
    ...partial
  };
}

describe("classifyLink", () => {
  it.each([
    ["https://github.com/Acme/Widget", "repository"],
    ["https://github.com/Acme/Widget/tree/main/src", "repository"],
    ["https://gitlab.com/group/project", "repository"],
    ["https://gitee.com/a/b", "repository"],
    ["https://codeberg.org/a/b", "repository"],
    ["https://github.com/Acme", "generic"],
    ["https://github.com/features/copilot", "generic"],
    ["https://github.com/", "generic"],
    ["https://openai.com/", "generic"],
    ["https://openai.com/index/introducing-gpt-9/", "generic"],
    ["https://www.anthropic.com/claude", "generic"],
    ["https://huggingface.co/", "generic"],
    ["https://huggingface.co/docs/transformers", "generic"],
    ["https://huggingface.co/spaces/fulkast/drs-vpt-demo", "project"],
    ["https://chatgpt.com/g/g-abc123-trip-planner", "project"],
    ["https://docs.example.com/", "generic"],
    ["https://docs.example.com/my-tool/start", "project"],
    ["https://apron.chat/", "project"],
    ["https://news.ycombinator.com/item?id=5", "non_project"],
    ["https://www.reddit.com/r/LocalLLaMA/comments/x", "non_project"],
    ["https://youtu.be/abc", "non_project"],
    ["https://arxiv.org/abs/2501.00001", "non_project"],
    ["https://platform.openai.com/docs", "non_project"],
    ["http://localhost:3000/", "invalid"],
    ["mailto:a@b.c", "invalid"]
  ])("%s → %s", (url, kind) => {
    expect(classifyLink(url)).toBe(kind);
  });
});

describe("selectProjectUrl", () => {
  it("prefers a repository over an earlier product URL", () => {
    expect(selectProjectUrl(["https://myapp.example.org/", "https://github.com/me/myapp"])).toEqual({
      url: "https://github.com/me/myapp",
      kind: "repository"
    });
  });

  it("falls back to the first concrete project URL", () => {
    expect(
      selectProjectUrl(["https://openai.com/", "https://x.com/me/status/1", "https://myapp.example.org/"])
    ).toEqual({ url: "https://myapp.example.org/", kind: "project" });
  });

  it("returns null when only generic or social links exist", () => {
    expect(selectProjectUrl(["https://openai.com/", "https://youtube.com/watch?v=1"])).toBeNull();
  });
});

describe("prefilter heuristics", () => {
  it.each([
    ["[Hiring] Senior ML engineer, remote", "job_post"],
    ["Acme AI is hiring founding engineers", "job_post"],
    ["Looking for a technical co-founder for my AI startup", "job_post"],
    ["Acme raises $40M Series B to build AI agents", "funding_announcement"],
    ["Introducing Claude 9 Opus", "model_announcement"],
    ["Meta releases Llama 7 weights", "model_announcement"],
    ["500 best ChatGPT prompts for marketers", "prompt_pack"],
    ["The ultimate prompt cheat sheet", "prompt_pack"],
    ["someone/awesome-llm-agents", "prompt_pack"],
    ["What is your favorite local model?", "discussion_question"],
    ["Which LLM is best for coding?", "discussion_question"]
  ])("%s → %s", (title, reason) => {
    expect(prefilter({ title, excerpt: "" })?.reason).toBe(reason);
  });

  it("lets first-person build posts through the soft rules", () => {
    expect(prefilter({ title: "Show HN: I built a trip planner on Claude, launched today", excerpt: "" })).toBeNull();
    expect(prefilter({ title: "Show HN: 200 prompts I use daily, as a CLI", excerpt: "" })).toBeNull();
    expect(prefilter({ title: "How I built a meal planner with GPT?", excerpt: "I built it with GPT-4o" })).toBeNull();
  });

  it("still drops job posts even with build language", () => {
    expect(prefilter({ title: "We built an AI agent platform and we're hiring", excerpt: "" })?.reason).toBe("job_post");
  });
});

describe("evaluateEligibility", () => {
  it("keeps a real build post with a repository link", () => {
    const result = evaluateEligibility(
      raw({ title: "Show HN: AgentLeak", discoveredUrls: ["https://github.com/Privatris/AgentLeak"] })
    );
    expect(result).toMatchObject({
      ok: true,
      candidate: { projectUrl: "https://github.com/Privatris/AgentLeak", projectUrlKind: "repository" }
    });
  });

  it("drops a post with no link", () => {
    expect(evaluateEligibility(raw({ discoveredUrls: [] }))).toMatchObject({ ok: false, reason: "no_project_link" });
  });

  it("drops a post whose only link is a vendor homepage", () => {
    expect(evaluateEligibility(raw({ discoveredUrls: ["https://openai.com/"] }))).toMatchObject({
      ok: false,
      reason: "no_project_link"
    });
  });

  it("drops a model announcement before checking links", () => {
    expect(
      evaluateEligibility(raw({ title: "Introducing Gemini 5", discoveredUrls: ["https://blog.example.org/gemini"] }))
    ).toMatchObject({ ok: false, reason: "model_announcement" });
  });
});
