import { SECRET_ENV_NAMES } from "./env";

const TOKENISH = /(?:bearer\s+)?[a-z0-9_\-]{8,}(?:sk-|ghp_|github_pat_)/gi;

export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (value && value.length > 0) {
      out = out.split(value).join("[redacted]");
    }
  }
  return out.replace(TOKENISH, "[redacted]");
}

export function info(message: string): void {
  console.info(redact(message));
}

export function warn(message: string): void {
  console.warn(redact(message));
}

export function error(message: string): void {
  console.error(redact(message));
}
