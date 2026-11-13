import type { AppEnv } from "./env";
import { redact } from "./log";

/** Stable, descriptive client identity. Never rotated. */
export const USER_AGENT = "ai-case-harvester/0.1 (+https://github.com/wsswyy1/ai-case-harvester)";

/** Logical API names. Each has its own delay and its own 429 stop flag. */
export type ApiName = "hn" | "github" | "reddit" | "usecasecn" | "llm";

/**
 * Conservative defaults, in milliseconds between requests to the same API.
 * GitHub Search allows 10 req/min unauthenticated; Reddit's public JSON is
 * similarly strict for anonymous clients.
 */
export const DEFAULT_DELAYS_MS: Record<ApiName, number> = {
  hn: 1000,
  github: 6500,
  reddit: 6500,
  usecasecn: 1000,
  llm: 0
};

export class RateLimitError extends Error {
  constructor(
    public readonly api: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(
      retryAfterSeconds !== undefined
        ? `HTTP 429 from ${api}; Retry-After=${retryAfterSeconds}s. Stopping this API for the run.`
        : `HTTP 429 from ${api}. Stopping this API for the run.`
    );
    this.name = "RateLimitError";
  }
}

/** 401, 403, or a login wall. The request is skipped; no authentication is attempted. */
export class AccessDeniedError extends Error {
  constructor(
    public readonly api: string,
    public readonly status: number,
    detail: string
  ) {
    super(`${api} refused access (HTTP ${status}): ${detail}. Skipping this request.`);
    this.name = "AccessDeniedError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    public readonly api: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`${api} returned HTTP ${status}.`);
    this.name = "HttpStatusError";
  }
}

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (trimmed === "") return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - now) / 1000));
  }
  return undefined;
}

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface HttpClientOptions {
  userAgent?: string;
  delaysMs?: Partial<Record<ApiName, number>>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /**
   * Status codes the caller handles itself (returned instead of thrown).
   * 429 is never in this set: it always stops the API.
   */
  acceptStatuses?: number[];
}

export interface StopInfo {
  stoppedAt: string;
  retryAfterSeconds?: number;
}

/**
 * Shared fetch wrapper for one run. Spaces requests per API, sends a fixed
 * User-Agent, and on HTTP 429 records Retry-After and refuses any further
 * call to that API for the lifetime of this client. It never retries a 429.
 */
export class HttpClient {
  readonly userAgent: string;
  private readonly delays: Record<ApiName, number>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly lastRequestAt = new Map<ApiName, number>();
  private readonly stopped = new Map<ApiName, StopInfo>();
  private readonly queues = new Map<ApiName, Promise<unknown>>();

  constructor(options: HttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.delays = { ...DEFAULT_DELAYS_MS, ...options.delaysMs };
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  isStopped(api: ApiName): boolean {
    return this.stopped.has(api);
  }

  stopInfo(api: ApiName): StopInfo | undefined {
    return this.stopped.get(api);
  }

  delayFor(api: ApiName): number {
    return this.delays[api];
  }

  async getJson<T = unknown>(api: ApiName, url: string, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(api, url, { ...options, method: "GET" });
  }

  /** Requests to one API are serialized so the delay holds even with concurrent callers. */
  request<T = unknown>(api: ApiName, url: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    const previous = this.queues.get(api) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.send<T>(api, url, options));
    this.queues.set(api, next);
    return next;
  }

  private async send<T>(api: ApiName, url: string, options: RequestOptions): Promise<HttpResponse<T>> {
    const stop = this.stopped.get(api);
    if (stop) throw new RateLimitError(api, stop.retryAfterSeconds);

    const last = this.lastRequestAt.get(api);
    const delay = this.delays[api];
    if (last !== undefined && delay > 0) {
      const wait = last + delay - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAt.set(api, this.now());

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
      // Set last so callers cannot override or rotate it.
      "User-Agent": this.userAgent
    };

    const response = await this.fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (response.status === 429 || isGithubRateLimit(api, response)) {
      const retryAfterSeconds =
        parseRetryAfter(response.headers.get("retry-after"), this.now()) ??
        parseResetEpoch(response.headers.get("x-ratelimit-reset"), this.now());
      this.stopped.set(api, { stoppedAt: new Date(this.now()).toISOString(), retryAfterSeconds });
      await drain(response);
      throw new RateLimitError(api, retryAfterSeconds);
    }

    const body = await readBody(response);
    const accepted = options.acceptStatuses ?? [];

    if (accepted.includes(response.status)) {
      return { status: response.status, body: body as T, headers: response.headers };
    }

    if (response.status === 401 || response.status === 403) {
      throw new AccessDeniedError(api, response.status, "authentication or permission required");
    }

    if (!response.ok) {
      throw new HttpStatusError(api, response.status, sanitizeBody(body));
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || typeof body === "string") {
      // A JSON API that answers with HTML is almost always a login wall or block page.
      throw new AccessDeniedError(api, response.status, "expected JSON but received a non-JSON page (possible login wall)");
    }

    return { status: response.status, body: body as T, headers: response.headers };
  }
}

/** New per-run client with delay overrides from the environment. */
export function createHttpClient(env: AppEnv, options: Omit<HttpClientOptions, "delaysMs"> = {}): HttpClient {
  return new HttpClient({ ...options, delaysMs: env.delaysMs });
}

/** GitHub signals primary rate limits with 403 + x-ratelimit-remaining: 0. */
function isGithubRateLimit(api: ApiName, response: Response): boolean {
  return (
    api === "github" &&
    response.status === 403 &&
    response.headers.get("x-ratelimit-remaining") === "0"
  );
}

function parseResetEpoch(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const epoch = Number(header);
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined;
  return Math.max(0, Math.ceil(epoch - now / 1000));
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function drain(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // ignore
  }
}

/** Short, redacted body text for error messages. */
export function sanitizeBody(body: unknown, max = 500): string {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? null);
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  return redact(clipped);
}
