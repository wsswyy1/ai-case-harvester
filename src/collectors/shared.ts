import { AccessDeniedError, HttpStatusError, RateLimitError } from "@/lib/http";
import { safeErrorMessage } from "@/lib/log";
import type { CollectResult, RawCandidate } from "@/lib/types";

export const EXCERPT_MAX = 1200;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#x27": "'",
  "#x2F": "/",
  "#39": "'"
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const named = NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()];
    if (named !== undefined) return named;
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

/** Pull href targets out of HTML before tags are stripped. */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(decodeEntities(m[1] ?? m[2] ?? ""));
  return out;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|p)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`)\]]+/gi;

/** Absolute http(s) URLs found in plain or markdown text. */
export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_IN_TEXT) ?? [];
  return matches.map((u) => u.replace(/[.,;:!?*_]+$/u, ""));
}

/** Keep valid absolute http(s) URLs, de-duplicated, order preserved. */
export function uniqueHttpUrls(urls: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of urls) {
    if (!candidate) continue;
    let parsed: URL;
    try {
      parsed = new URL(candidate.trim());
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const href = parsed.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

export function clip(text: string, max = EXCERPT_MAX): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function emptyCollectResult(): CollectResult {
  return { items: [], stoppedOnRateLimit: false, fetched: 0, skipped: 0, failed: 0, errors: [] };
}

/**
 * Fold a thrown request error into the result. Returns true when the
 * collector must stop calling its API for the rest of the run.
 */
export function recordRequestError(result: CollectResult, err: unknown): boolean {
  if (err instanceof RateLimitError) {
    result.stoppedOnRateLimit = true;
    result.retryAfterSeconds = err.retryAfterSeconds;
    result.errors.push(err.message);
    return true;
  }
  result.failed += 1;
  if (err instanceof AccessDeniedError || err instanceof HttpStatusError) {
    result.errors.push(err.message);
    return false;
  }
  result.errors.push(safeErrorMessage(err));
  return false;
}

export function isAfter(createdAt: string, since: Date): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= since.getTime();
}

export function pushCandidate(result: CollectResult, candidate: RawCandidate, limit: number): boolean {
  if (result.items.length >= limit) return false;
  result.items.push(candidate);
  return true;
}
