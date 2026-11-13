import type { RequestContext } from "./types";

export class RateLimitError extends Error {
  constructor(
    public readonly api: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(
      retryAfterSeconds
        ? `HTTP 429 from ${api}; Retry-After=${retryAfterSeconds}s. Stopping this API for the run.`
        : `HTTP 429 from ${api}. Stopping this API for the run.`
    );
    this.name = "RateLimitError";
  }
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

/**
 * Shared fetch wrapper. Stops a run's remaining calls to the same API on 429.
 * Does not rotate User-Agent and does not retry 429 in the same run.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
  ctx: RequestContext,
  api: string
): Promise<{ status: number; body: unknown; headers: Headers }> {
  void url;
  void init;
  void ctx;
  void api;
  throw new Error("TODO: implement rate-limited fetch (see design.md, Requirement 11)");
}
