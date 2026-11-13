import { afterEach, describe, expect, it, vi } from "vitest";
import * as log from "@/lib/log";
import { redact, safeErrorMessage } from "@/lib/log";
import { loadEnv } from "@/lib/env";

// Obviously fake, test-only values.
const INGEST = "fake-ingest-token-for-tests";
const LLM = "fake-llm-key-abc-123";
const GH = "ghp_" + "A".repeat(36);
const env = { USECASECN_INGEST_TOKEN: INGEST, LLM_API_KEY: LLM, GITHUB_TOKEN: GH };

afterEach(() => vi.restoreAllMocks());

describe("redact", () => {
  it("removes values of known secret env variables", () => {
    const out = redact(`token=${INGEST} key ${LLM} gh ${GH}`, env);
    for (const secret of [INGEST, LLM, GH]) expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it.each([
    ["Authorization: Bearer abcdefghijklmnop", "Authorization: [redacted]"],
    ["authorization=Basic dXNlcjpwYXNz", "authorization=[redacted]"],
    ["sending Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig now", "sending Bearer [redacted] now"],
    ["key sk-proj-abcdefghijklmnop1234", "key [redacted]"],
    ["gh github_pat_11ABCDEFGHIJKLMNOPQRSTUV_xyz", "gh [redacted]"],
    [`gh ${"gho_" + "b".repeat(30)}`, "gh [redacted]"],
    ["https://api.test/x?api_key=supersecret&q=1", "https://api.test/x?api_key=[redacted]&q=1"],
    ['{"access_token":"abc123def"}', '{"access_token":"abc123def"}'.replace("abc123def", "[redacted]")],
    ["password: hunter22", "password: [redacted]"]
  ])("%s", (input, expected) => {
    expect(redact(input, {})).toBe(expected);
  });

  it("leaves ordinary text alone, including env var names", () => {
    const text = "Missing: USECASECN_API_URL, USECASECN_INGEST_TOKEN. JSON export is still available.";
    expect(redact(text, {})).toBe(text);
    expect(redact("Show HN: tokenizer for LLMs", {})).toBe("Show HN: tokenizer for LLMs");
  });

  it("ignores very short env values to avoid shredding text", () => {
    expect(redact("a b c", { LLM_API_KEY: "a" })).toBe("a b c");
  });
});

describe("log helpers", () => {
  it("redact messages and structured details before printing", () => {
    vi.stubEnv("USECASECN_INGEST_TOKEN", INGEST);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    log.info(`pushing with ${INGEST}`, { headers: { Authorization: `Bearer ${INGEST}` } });
    log.error("failed", new Error(`HTTP 401 for token ${INGEST}`));

    const printed = [...info.mock.calls, ...error.mock.calls].flat().join("\n");
    expect(printed).not.toContain(INGEST);
    expect(printed).toContain("[redacted]");
    vi.unstubAllEnvs();
  });

  it("safeErrorMessage redacts thrown values", () => {
    expect(safeErrorMessage(new Error("Bearer abcdefghijklmnop rejected"))).toBe("Bearer [redacted] rejected");
    expect(safeErrorMessage("sk-abcdefghijklmnopqrst")).toBe("[redacted]");
  });
});

describe("env validation errors", () => {
  it("never echo secret values", () => {
    let message = "";
    try {
      loadEnv({ LLM_API_KEY: LLM, LLM_BASE_URL: `not a url ${LLM}` });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/LLM_BASE_URL/);
    expect(message).not.toContain(LLM);
  });
});
