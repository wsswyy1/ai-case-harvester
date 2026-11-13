import { z } from "zod";
import { assertClassifierConfig, loadEnv, type AppEnv } from "@/lib/env";
import { HttpClient, HttpStatusError, sanitizeBody } from "@/lib/http";
import type { LlmClient } from "@/lib/types";

export class LlmResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmResponseError";
  }
}

const ChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() })
      })
    )
    .min(1)
});

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

/** Strip Markdown code fences some providers wrap around JSON. */
export function extractJsonText(content: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
  return (fenced ? fenced[1] : content).trim();
}

export interface OpenAiCompatibleClientOptions {
  env?: AppEnv;
  http?: HttpClient;
  temperature?: number;
}

/**
 * Any OpenAI-compatible chat completions endpoint, configured only by
 * LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL. The key is sent as a bearer header
 * and never appears in URLs, logs, or error messages.
 */
export class OpenAiCompatibleClient implements LlmClient {
  private readonly env: AppEnv & { llmBaseUrl: string; llmApiKey: string; llmModel: string };
  private readonly http: HttpClient;
  private readonly temperature: number;
  private jsonModeSupported = true;

  constructor(options: OpenAiCompatibleClientOptions = {}) {
    const env = options.env ?? loadEnv();
    // Fails with a ConfigError naming the missing variables; never invents a result.
    assertClassifierConfig(env);
    this.env = env;
    this.http = options.http ?? new HttpClient();
    this.temperature = options.temperature ?? 0;
  }

  get model(): string {
    return this.env.llmModel;
  }

  async completeJson(input: { system: string; user: string }): Promise<unknown> {
    const content = await this.chat(input);
    const text = extractJsonText(content);
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmResponseError(`Model returned invalid JSON: ${sanitizeBody(text, 200)}`);
    }
  }

  private async chat(input: { system: string; user: string }): Promise<string> {
    const url = chatCompletionsUrl(this.env.llmBaseUrl);
    const send = (jsonMode: boolean) =>
      this.http.request("llm", url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.llmApiKey}`
        },
        body: JSON.stringify({
          model: this.env.llmModel,
          temperature: this.temperature,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ],
          ...(jsonMode ? { response_format: { type: "json_object" } } : {})
        })
      });

    let response;
    try {
      response = await send(this.jsonModeSupported);
    } catch (err) {
      // Some OpenAI-compatible providers reject response_format. Retry once
      // without it and remember the answer for this client.
      if (err instanceof HttpStatusError && err.status === 400 && this.jsonModeSupported) {
        this.jsonModeSupported = false;
        response = await send(false);
      } else {
        throw err;
      }
    }

    const parsed = ChatResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new LlmResponseError("Chat completions response did not include choices[0].message.");
    }
    const content = parsed.data.choices[0].message.content;
    if (!content) throw new LlmResponseError("Model returned an empty message.");
    return content;
  }
}
