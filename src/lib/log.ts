import { SECRET_ENV_NAMES } from "./env";

const REDACTED = "[redacted]";

/**
 * Secret-shaped patterns. Order matters: header forms first so the whole
 * credential after the scheme is removed.
 */
const SECRET_PATTERNS: RegExp[] = [
  // Authorization: Bearer xxx / Basic xxx / token xxx
  /\b(authorization\s*[:=]\s*)(?:bearer|basic|token)?\s*[^\s"',;}]+/gi,
  // Bare "Bearer xxx"
  /\b(bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi,
  // OpenAI-style and similar provider keys: sk-..., sk-proj-...
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_, github_pat_
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})/g,
  // key=value pairs in query strings or text for common secret names
  /\b((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[=:]\s*)[^\s&"',;}]+/gi
];

/**
 * Remove known secret env values and secret-shaped substrings.
 * Values shorter than 4 characters are not used for literal replacement to
 * avoid shredding unrelated text.
 */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name]?.trim();
    if (value && value.length >= 4) {
      out = out.split(value).join(REDACTED);
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" && match.startsWith(prefix) ? `${prefix}${REDACTED}` : REDACTED
    );
  }
  return out;
}

function format(message: string, details?: unknown): string {
  if (details === undefined) return message;
  if (details instanceof Error) return `${message} ${details.name}: ${details.message}`;
  try {
    return `${message} ${JSON.stringify(details)}`;
  } catch {
    return `${message} ${String(details)}`;
  }
}

export function info(message: string, details?: unknown): void {
  console.info(redact(format(message, details)));
}

export function warn(message: string, details?: unknown): void {
  console.warn(redact(format(message, details)));
}

export function error(message: string, details?: unknown): void {
  console.error(redact(format(message, details)));
}

/** Safe message for an unknown thrown value, redacted for logs, API errors, and the UI. */
export function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redact(raw);
}
