import { beforeEach, vi } from "vitest";

/**
 * Tests must never reach a live API or LLM. Any code path that falls back to
 * the global fetch fails loudly. Tests inject fakes through HttpClient.
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      throw new Error(`Live network access is not allowed in tests: ${String(input)}`);
    })
  );
});
