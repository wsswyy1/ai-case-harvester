import { describe, expect, it } from "vitest";
import { chatCompletionsUrl, extractJsonText, LlmResponseError, OpenAiCompatibleClient } from "@/classifier/provider";
import { ConfigError, loadEnv } from "@/lib/env";
import { fakeHttp, headerOf, json } from "./helpers/fake-http";

const FAKE_KEY = "fake-llm-key-for-tests-0000";
const env = loadEnv({ LLM_BASE_URL: "https://llm.example.test/v1/", LLM_API_KEY: FAKE_KEY, LLM_MODEL: "test-model" });

function chat(content: string | null) {
  return json({ choices: [{ message: { role: "assistant", content } }] });
}

describe("OpenAiCompatibleClient", () => {
  it("fails clearly when configuration is missing", () => {
    expect(() => new OpenAiCompatibleClient({ env: loadEnv({}) })).toThrow(ConfigError);
    expect(() => new OpenAiCompatibleClient({ env: loadEnv({ LLM_BASE_URL: "https://x.test" }) })).toThrow(
      /LLM_API_KEY, LLM_MODEL/
    );
  });

  it("posts to {LLM_BASE_URL}/chat/completions with bearer auth and JSON mode", async () => {
    const { http, calls } = fakeHttp(() => chat('{"ok":true}'));
    const client = new OpenAiCompatibleClient({ env, http });

    await expect(client.completeJson({ system: "sys", user: "usr" })).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://llm.example.test/v1/chat/completions");
    expect(calls[0].url).not.toContain(FAKE_KEY);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Authorization")).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" }
      ]
    });
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it("retries once without response_format when the provider rejects it", async () => {
    let n = 0;
    const { http, calls } = fakeHttp(() => (n++ === 0 ? json({ error: "unknown field response_format" }, 400) : chat("{}")));
    const client = new OpenAiCompatibleClient({ env, http });

    await client.completeJson({ system: "s", user: "u" });
    await client.completeJson({ system: "s", user: "u" });

    expect(calls).toHaveLength(3);
    expect(JSON.parse(String(calls[1].init.body)).response_format).toBeUndefined();
    expect(JSON.parse(String(calls[2].init.body)).response_format).toBeUndefined();
  });

  it("accepts fenced JSON and rejects invalid JSON without leaking the key", async () => {
    const { http } = fakeHttp(() => chat("```json\n{\"a\":1}\n```"));
    await expect(new OpenAiCompatibleClient({ env, http }).completeJson({ system: "", user: "" })).resolves.toEqual({ a: 1 });

    const bad = fakeHttp(() => chat(`not json, Bearer ${FAKE_KEY}`));
    const err = await new OpenAiCompatibleClient({ env, http: bad.http })
      .completeJson({ system: "", user: "" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmResponseError);
    expect((err as Error).message).not.toContain(FAKE_KEY);
  });

  it("works with a different provider by changing env only", async () => {
    const other = loadEnv({ LLM_BASE_URL: "https://other.example.test/api/openai", LLM_API_KEY: "k-other-0000", LLM_MODEL: "m2" });
    const { http, calls } = fakeHttp(() => chat("{}"));
    await new OpenAiCompatibleClient({ env: other, http }).completeJson({ system: "", user: "" });
    expect(calls[0].url).toBe("https://other.example.test/api/openai/chat/completions");
    expect(JSON.parse(String(calls[0].init.body)).model).toBe("m2");
  });
});

describe("helpers", () => {
  it("builds the endpoint URL", () => {
    expect(chatCompletionsUrl("https://a.test/v1")).toBe("https://a.test/v1/chat/completions");
    expect(chatCompletionsUrl("https://a.test/v1/chat/completions")).toBe("https://a.test/v1/chat/completions");
  });

  it("strips code fences", () => {
    expect(extractJsonText("```\n{}\n```")).toBe("{}");
    expect(extractJsonText(" {} ")).toBe("{}");
  });
});
