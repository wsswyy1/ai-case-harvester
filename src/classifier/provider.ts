import type { LlmClient } from "@/lib/types";
import { assertClassifierConfig, loadEnv } from "@/lib/env";

export class OpenAiCompatibleClient implements LlmClient {
  async completeJson(_input: { system: string; user: string }): Promise<unknown> {
    const env = loadEnv();
    assertClassifierConfig(env);
    // TODO: POST {LLM_BASE_URL}/chat/completions with response_format json.
    // Never log LLM_API_KEY.
    throw new Error("TODO: implement OpenAI-compatible client");
  }
}
